import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { query, withTransaction } from '../db.js'
import { signedPutUrl, signedGetUrl, headObject, getObjectStream } from '../oss.js'
import { resolveAudioDurationMs } from '../mediaMetadata.js'
import { config } from '../config.js'
import { assetCompleteSchema, uuidSchema, validateAssetInput } from '../validators.js'
import { notFound, conflict } from '../errors.js'

const router = Router()
const extensionFor = (mime) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/mp3': 'mp3', 'audio/m4a': 'm4a', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg' }[mime] || 'bin')

export function validateCompletedObjectMetadata(asset, object) {
  const headers = object.res?.headers || object.headers || {}
  const actualBytes = Number(object.res?.contentLength ?? headers['content-length'] ?? object.contentLength ?? 0)
  const actualMime = String(headers['content-type'] || object.meta?.['content-type'] || '').split(';')[0].trim().toLowerCase()
  const etag = String(headers.etag || object.etag || '').replace(/^"|"$/g, '') || null
  const crc64 = String(headers['x-oss-hash-crc64ecma'] || object.res?.headers?.['x-oss-hash-crc64ecma'] || '') || null
  if (actualBytes !== Number(asset.bytes)) throw Object.assign(new Error('OSS 对象大小与声明不一致'), { status: 422, code: 'OBJECT_SIZE_MISMATCH' })
  if (!actualMime) throw Object.assign(new Error('OSS 对象缺少 Content-Type，无法完成类型核验'), { status: 422, code: 'OBJECT_MIME_MISSING' })
  if (actualMime !== asset.mime_type) throw Object.assign(new Error('OSS 对象类型与声明不一致'), { status: 422, code: 'OBJECT_MIME_MISMATCH' })
  if (!etag && !crc64) throw Object.assign(new Error('OSS 对象缺少 ETag/CRC64，无法完成完整性核验'), { status: 422, code: 'OBJECT_INTEGRITY_METADATA_MISSING' })
  return { actualBytes, actualMime, etag, crc64 }
}

router.post('/presign', async (req, res, next) => {
  try {
    const input = validateAssetInput(req.body)
    const inspirationId = req.body.inspiration_id ? uuidSchema.parse(req.body.inspiration_id) : null
    const requestedAssetId = req.body.asset_id ? uuidSchema.parse(req.body.asset_id) : null
    const result = await withTransaction(async (client) => {
      if (inspirationId) {
        const ref = await client.query('SELECT id FROM inspirations WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL', [inspirationId, req.workspaceId])
        if (!ref.rows[0]) throw notFound('灵感不存在')
      }

      if (requestedAssetId) {
        const existing = await client.query('SELECT * FROM assets WHERE id=$1 FOR UPDATE', [requestedAssetId])
        if (existing.rows[0]) {
          const asset = existing.rows[0]
          if (asset.workspace_id !== req.workspaceId || asset.inspiration_id !== inspirationId) throw notFound('附件不存在')
          if (asset.status === 'ready') return { asset, alreadyReady: true }
          if (['deleting', 'deleted'].includes(asset.status)) throw conflict('附件已进入删除流程，不能再次上传')
          if (asset.kind !== input.kind || asset.mime_type !== input.mime) throw conflict('同一附件重试时文件类型不能变化', 'ASSET_RETRY_MISMATCH')
          const updated = await client.query(`
            UPDATE assets
            SET bytes=$1,duration_ms=$2,status='pending',deleted_at=NULL
            WHERE id=$3 AND workspace_id=$4
            RETURNING *
          `, [input.bytes, input.durationMs, requestedAssetId, req.workspaceId])
          return { asset: updated.rows[0], alreadyReady: false }
        }
      }

      const id = requestedAssetId || randomUUID()
      const key = `${req.workspaceId}/${id}.${extensionFor(input.mime)}`
      const inserted = await client.query(`
        INSERT INTO assets(id,workspace_id,inspiration_id,kind,storage_key,mime_type,bytes,duration_ms,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending')
        RETURNING *
      `, [id, req.workspaceId, inspirationId, input.kind, key, input.mime, input.bytes, input.durationMs])
      return { asset: inserted.rows[0], alreadyReady: false }
    })

    const data = {
      asset_id: result.asset.id,
      storage_key: result.asset.storage_key,
      status: result.asset.status,
      already_ready: result.alreadyReady,
      expires_in: config.presignTtl,
    }
    if (!result.alreadyReady) data.put_url = signedPutUrl(result.asset.storage_key, result.asset.mime_type)
    res.status(result.alreadyReady ? 200 : 201).json({ data })
  } catch (error) { next(error) }
})

router.post('/complete', async (req, res, next) => {
  let asset
  let input
  try {
    input = assetCompleteSchema.parse(req.body)
    const existing = await query('SELECT * FROM assets WHERE id=$1 AND workspace_id=$2', [input.asset_id, req.workspaceId])
    if (!existing.rows[0]) throw notFound('附件不存在')
    asset = existing.rows[0]
    if (asset.status === 'ready') return res.json({ data: { asset_id: asset.id, status: 'ready', idempotent: true } })
    if (['deleting', 'deleted'].includes(asset.status)) throw conflict('附件已进入删除流程，不能再次完成上传')
    if (input.bytes !== undefined && input.bytes !== Number(asset.bytes)) throw Object.assign(new Error('完成请求中的文件大小与预签名声明不一致'), { status: 422, code: 'DECLARED_SIZE_MISMATCH' })

    const durationMs = input.duration_ms ?? asset.duration_ms
    validateAssetInput({ kind: asset.kind, mime_type: asset.mime_type, bytes: asset.bytes, duration_ms: durationMs })
    if (!asset.storage_key.startsWith(`${req.workspaceId}/`)) throw Object.assign(new Error('附件对象路径不属于当前工作区'), { status: 422, code: 'OBJECT_KEY_SCOPE_MISMATCH' })
    const object = await headObject(asset.storage_key)
    const { etag, crc64 } = validateCompletedObjectMetadata(asset, object)
    let actualDurationMs = durationMs ?? null
    if (asset.kind === 'audio') {
      const stream = await getObjectStream(asset.storage_key)
      actualDurationMs = await resolveAudioDurationMs({
        stream,
        mimeType: asset.mime_type,
        size: Number(asset.bytes),
        declaredMs: durationMs,
      })
    }

    const updated = await query(`
      UPDATE assets
      SET sha256=$1,width=$2,height=$3,duration_ms=$4,etag=$5,crc64=$6,status='ready',deleted_at=NULL
      WHERE id=$7 AND workspace_id=$8 AND status IN ('pending','failed')
      RETURNING *
    `, [input.sha256 || null, input.width || null, input.height || null, actualDurationMs, etag, crc64, input.asset_id, req.workspaceId])
    if (!updated.rows[0]) {
      // 并发 complete 可能已由另一请求率先置为 ready；重新读取并按幂等成功返回，不能误改回 failed。
      const current = await query('SELECT id,status,etag,crc64 FROM assets WHERE id=$1 AND workspace_id=$2', [input.asset_id, req.workspaceId])
      if (current.rows[0]?.status === 'ready') {
        return res.json({ data: { asset_id: current.rows[0].id, status: 'ready', etag: current.rows[0].etag, crc64: current.rows[0].crc64, idempotent: true } })
      }
      throw conflict('附件当前状态不允许完成上传')
    }
    res.json({ data: { asset_id: updated.rows[0].id, status: updated.rows[0].status, etag, crc64 } })
  } catch (error) {
    if (asset && !['deleted', 'deleting', 'ready'].includes(asset.status)) {
      await query(`UPDATE assets SET status='failed' WHERE id=$1 AND workspace_id=$2 AND status IN ('pending','failed')`, [asset.id, req.workspaceId]).catch(() => {})
    }
    next(error)
  }
})

router.get('/:id/access-url', async (req, res, next) => {
  try {
    const assetId = uuidSchema.parse(req.params.id)
    const result = await query(`
      SELECT id,storage_key,status
      FROM assets
      WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL
    `, [assetId, req.workspaceId])
    const asset = result.rows[0]
    if (!asset) throw notFound('附件不存在')
    if (asset.status !== 'ready') throw conflict('附件尚未完成上传，不能获取访问地址', 'ASSET_NOT_READY')
    if (!asset.storage_key.startsWith(`${req.workspaceId}/`)) throw notFound('附件不存在')
    res.json({ data: { asset_id: asset.id, url: signedGetUrl(asset.storage_key), expires_in: config.presignTtl } })
  } catch (error) { next(error) }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const assetId = uuidSchema.parse(req.params.id)
    const result = await withTransaction(async (client) => {
      const existing = await client.query('SELECT id,storage_key,status FROM assets WHERE id=$1 AND workspace_id=$2 FOR UPDATE', [assetId, req.workspaceId])
      if (!existing.rows[0]) throw notFound('附件不存在')
      const asset = existing.rows[0]
      if (asset.status === 'deleted') return asset
      await client.query(`UPDATE assets SET status='deleting',deleted_at=COALESCE(deleted_at,now()) WHERE id=$1 AND workspace_id=$2`, [assetId, req.workspaceId])
      await client.query(`
        INSERT INTO asset_deletion_tasks(workspace_id,asset_id,storage_key,status,next_attempt_at)
        VALUES($1,$2,$3,'pending',now())
        ON CONFLICT(asset_id) DO UPDATE SET status='pending',next_attempt_at=now(),last_error=NULL,updated_at=now()
      `, [req.workspaceId, assetId, asset.storage_key])
      return asset
    })
    res.status(202).json({ data: { asset_id: result.id, status: result.status === 'deleted' ? 'deleted' : 'deleting' } })
  } catch (error) { next(error) }
})

export default router
