import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { query, withTransaction } from '../db.js'
import { idempotencyKey } from '../auth.js'
import { inspirationCreateSchema, inspirationPatchSchema, dateSchema, uuidSchema } from '../validators.js'
import { signedGetUrl } from '../oss.js'
import { notFound } from '../errors.js'
import { businessDateRange, currentBusinessDate } from '../time.js'

const router = Router()
const TYPE_LABEL_TO_SLUG = { '先不分类': 'uncategorized', '想法': 'idea', '引用': 'quote', '随感': 'moment', '待办': 'task', '案例': 'case', '问题': 'question' }

async function resolveTypeId(client, workspaceId, input) {
  if (!input) return null
  if (input.type_id) {
    const { rows } = await client.query('SELECT id FROM inspiration_types WHERE id=$1 AND (workspace_id=$2 OR workspace_id IS NULL) AND archived_at IS NULL', [input.type_id, workspaceId])
    if (!rows[0]) throw Object.assign(new Error('灵感类型不存在'), { status: 422, code: 'TYPE_NOT_FOUND' })
    return rows[0].id
  }
  if (input.type_label) {
    const slug = TYPE_LABEL_TO_SLUG[input.type_label] || input.type_label
    const { rows } = await client.query('SELECT id FROM inspiration_types WHERE slug=$1 AND (workspace_id=$2 OR workspace_id IS NULL) AND archived_at IS NULL ORDER BY workspace_id NULLS LAST LIMIT 1', [slug, workspaceId])
    if (!rows[0]) throw Object.assign(new Error('灵感类型不存在'), { status: 422, code: 'TYPE_NOT_FOUND' })
    return rows[0].id
  }
  return null
}

function assetResponse(row) {
  return {
    id: row.id,
    asset_id: row.id,
    kind: row.kind,
    mime_type: row.mime_type,
    bytes: Number(row.bytes),
    duration_ms: row.duration_ms,
    width: row.width,
    height: row.height,
    status: row.status,
    storage_key: row.storage_key,
    preview_url: row.status === 'ready' ? signedGetUrl(row.storage_key) : null,
  }
}

function mapInspiration(row, assets = []) {
  const recorded = new Date(row.recorded_at)
  return {
    id: row.id,
    title: row.title,
    text_raw: row.text_raw,
    text: row.text_raw,
    recorded_at: row.recorded_at,
    time: recorded.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: process.env.APP_TIMEZONE || 'Asia/Shanghai' }),
    type_id: row.type_id,
    type: row.type_label || '先不分类',
    type_slug: row.type_slug || 'uncategorized',
    color_token: row.type_color_token || '--ink-muted',
    board_position_json: row.board_position_json,
    pos: row.board_position_json?.pos || null,
    user_tags: row.user_tags_json || [],
    ai_tags: row.ai_tags_json || [],
    aiTag: '',
    used: row.used_in_projects ? `用于 ${row.used_in_projects} 个项目` : '',
    quote: Boolean(row.is_quote),
    processing_status: row.processing_status,
    sync_status: row.sync_status,
    attachments: assets.map(assetResponse),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

async function fetchOne(workspaceId, id) {
  const { rows } = await query(`
    SELECT i.*, t.label AS type_label, t.slug AS type_slug, t.color_token AS type_color_token
    FROM inspirations i
    LEFT JOIN inspiration_types t ON t.id=i.type_id
    WHERE i.workspace_id=$1 AND i.id=$2 AND i.deleted_at IS NULL
  `, [workspaceId, id])
  if (!rows[0]) throw notFound('灵感不存在')
  const assets = await query('SELECT * FROM assets WHERE workspace_id=$1 AND inspiration_id=$2 AND deleted_at IS NULL AND status <> \'deleted\' ORDER BY created_at ASC', [workspaceId, id])
  return mapInspiration(rows[0], assets.rows)
}

function parsePage(queryParams) {
  const page = Math.max(Number.parseInt(queryParams.page || '1', 10) || 1, 1)
  const pageSize = Math.min(Math.max(Number.parseInt(queryParams.page_size || '20', 10) || 20, 1), 100)
  return { page, pageSize, offset: (page - 1) * pageSize }
}

function addDateFilters(params, where, queryParams) {
  if (queryParams.date) {
    dateSchema.parse(queryParams.date)
    const range = businessDateRange(queryParams.date)
    params.push(range.start, range.end)
    where.push(`i.recorded_at >= $${params.length - 1} AND i.recorded_at < $${params.length}`)
  } else {
    if (queryParams.from) {
      dateSchema.parse(queryParams.from)
      params.push(businessDateRange(queryParams.from).start)
      where.push(`i.recorded_at >= $${params.length}`)
    }
    if (queryParams.to) {
      dateSchema.parse(queryParams.to)
      params.push(businessDateRange(queryParams.to).end)
      where.push(`i.recorded_at < $${params.length}`)
    }
  }
}

function addCommonFilters(params, where, queryParams) {
  if (queryParams.type_id) { params.push(uuidSchema.parse(queryParams.type_id)); where.push(`i.type_id=$${params.length}`) }
  if (queryParams.type_slug) { params.push(queryParams.type_slug); where.push(`t.slug=$${params.length}`) }
  if (queryParams.tag) { params.push(JSON.stringify([String(queryParams.tag)])); where.push(`i.user_tags_json @> $${params.length}::jsonb`) }
}

async function listRows(workspaceId, queryParams, { search = false } = {}) {
  const params = [workspaceId]
  const where = ['i.workspace_id=$1', "i.deleted_at IS NULL", "i.sync_status='synced'"]
  if (search) {
    params.push(`%${String(queryParams.q || '').trim()}%`)
    where.push(`(i.title ILIKE $${params.length} OR i.text_raw ILIKE $${params.length})`)
  }
  addDateFilters(params, where, queryParams)
  addCommonFilters(params, where, queryParams)
  const { page, pageSize, offset } = parsePage(queryParams)
  const limit = queryParams.recent ? Math.min(Math.max(Number(queryParams.recent) || 10, 1), 100) : pageSize
  const actualPage = queryParams.recent ? 1 : page
  const actualOffset = queryParams.recent ? 0 : offset
  const countResult = await query(`SELECT count(*)::int AS total FROM inspirations i LEFT JOIN inspiration_types t ON t.id=i.type_id WHERE ${where.join(' AND ')}`, params)
  const dataParams = [...params, limit, actualOffset]
  const { rows } = await query(`
    SELECT i.*, t.label AS type_label, t.slug AS type_slug, t.color_token AS type_color_token
    FROM inspirations i
    LEFT JOIN inspiration_types t ON t.id=i.type_id
    WHERE ${where.join(' AND ')}
    ORDER BY i.recorded_at DESC, i.id DESC
    LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
  `, dataParams)
  const data = await Promise.all(rows.map((row) => fetchOne(workspaceId, row.id)))
  return { data, page: actualPage, pageSize: limit, total: countResult.rows[0].total }
}

router.post('/', async (req, res, next) => {
  try {
    const input = inspirationCreateSchema.parse(req.body)
    const key = input.idempotency_key || idempotencyKey(req)
    const result = await withTransaction(async (client) => {
      const existing = await client.query('SELECT id FROM inspirations WHERE workspace_id=$1 AND idempotency_key=$2 AND deleted_at IS NULL', [req.workspaceId, key])
      if (existing.rows[0]) return existing.rows[0].id
      const typeId = await resolveTypeId(client, req.workspaceId, input)
      const id = input.id || randomUUID()
      const recordedAt = input.recorded_at || new Date().toISOString()
      await client.query(`
        INSERT INTO inspirations(id,workspace_id,recorded_at,title,text_raw,text_normalized,type_id,user_tags_json,board_position_json,processing_status,sync_status,is_quote,idempotency_key)
        VALUES($1,$2,$3,$4,$5,$5,$6,$7,$8,'draft','local',$9,$10)
      `, [id, req.workspaceId, recordedAt, input.title || null, input.text_raw || '', typeId, JSON.stringify(input.user_tags_json || []), input.board_position_json ? JSON.stringify(input.board_position_json) : null, Boolean(input.is_quote), key])
      return id
    })
    res.status(201).json({ data: await fetchOne(req.workspaceId, result) })
  } catch (error) { next(error) }
})

router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim()
    if (!q) return res.json({ data: [], items: [], meta: { page: 1, page_size: 20, total: 0, has_more: false, date_count: 0 } })
    const result = await listRows(req.workspaceId, req.query, { search: true })
    const items = result.data.map((item) => ({ ...item, snippet: String(item.text_raw || '').slice(0, 240) }))
    res.json({ data: items, items, meta: { page: result.page, page_size: result.pageSize, total: result.total, has_more: result.page * result.pageSize < result.total } })
  } catch (error) { next(error) }
})

router.get('/', async (req, res, next) => {
  try {
    const result = await listRows(req.workspaceId, req.query)
    const todayRange = businessDateRange(currentBusinessDate())
    const count = await query(`
      SELECT count(*)::int AS count
      FROM inspirations
      WHERE workspace_id=$1 AND deleted_at IS NULL AND sync_status='synced'
        AND recorded_at >= $2 AND recorded_at < $3
    `, [req.workspaceId, todayRange.start, todayRange.end])
    let layoutVersion = null
    if (req.query.date) {
      const board = await query('SELECT layout_version FROM daily_boards WHERE workspace_id=$1 AND board_date=$2', [req.workspaceId, req.query.date])
      layoutVersion = board.rows[0]?.layout_version || 0
    }
    const dateCount = req.query.date ? result.total : count.rows[0].count
    res.json({ data: result.data, items: result.data, meta: { page: result.page, page_size: result.pageSize, total: result.total, has_more: result.page * result.pageSize < result.total, today_count: count.rows[0].count, date_count: dateCount, layout_version: layoutVersion }, date_count: dateCount })
  } catch (error) { next(error) }
})

router.get('/:id', async (req, res, next) => {
  try { const id = uuidSchema.parse(req.params.id); res.json({ data: await fetchOne(req.workspaceId, id) }) } catch (error) { next(error) }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const inspirationId = uuidSchema.parse(req.params.id)
    const input = inspirationPatchSchema.parse(req.body)
    await withTransaction(async (client) => {
      const exists = await client.query('SELECT id,title,text_raw FROM inspirations WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL', [inspirationId, req.workspaceId])
      if (!exists.rows[0]) throw notFound('灵感不存在')
      if (input.processing_status === 'synced' && input.sync_status !== 'synced') {
        throw Object.assign(new Error('远端同步状态未完成时，处理状态不能标记为已同步'), { status: 422, code: 'SYNC_STATUS_INCONSISTENT' })
      }
      if (input.sync_status === 'synced') {
        const activeAssets = await client.query(`
          SELECT id,status,storage_key
          FROM assets
          WHERE workspace_id=$1 AND inspiration_id=$2 AND deleted_at IS NULL
          FOR UPDATE
        `, [req.workspaceId, inspirationId])
        let readyAssetCount = 0
        if (Array.isArray(input.asset_ids)) {
          const expectedIds = [...new Set(input.asset_ids)]
          const byId = new Map(activeAssets.rows.map((asset) => [asset.id, asset]))
          const invalid = expectedIds.find((id) => !byId.has(id) || byId.get(id).status !== 'ready')
          if (invalid) throw Object.assign(new Error('提交清单中存在未完成上传校验的附件'), { status: 409, code: 'ATTACHMENTS_NOT_READY' })
          readyAssetCount = expectedIds.length
          const expectedSet = new Set(expectedIds)
          const staleAssets = activeAssets.rows.filter((asset) => !expectedSet.has(asset.id))
          for (const asset of staleAssets) {
            await client.query(
              `UPDATE assets
               SET status='deleting',
                   deleted_at=COALESCE(deleted_at,now())
               WHERE id=$1 AND workspace_id=$2`,
              [asset.id, req.workspaceId]
            )
            await client.query(`
              INSERT INTO asset_deletion_tasks(workspace_id,asset_id,storage_key,status,next_attempt_at)
              VALUES($1,$2,$3,'pending',now())
              ON CONFLICT(asset_id) DO UPDATE SET status='pending',next_attempt_at=now(),last_error=NULL,updated_at=now()
            `, [req.workspaceId, asset.id, asset.storage_key])
          }
        } else if (activeAssets.rows.some((asset) => asset.status !== 'ready')) {
          throw Object.assign(new Error('仍有附件未完成上传校验，不能提交灵感'), { status: 409, code: 'ATTACHMENTS_NOT_READY' })
        } else {
          readyAssetCount = activeAssets.rows.length
        }
        const finalTitle = input.title !== undefined ? input.title : exists.rows[0].title
        const finalText = input.text_raw !== undefined ? input.text_raw : exists.rows[0].text_raw
        if (!String(finalTitle || '').trim() && !String(finalText || '').trim() && readyAssetCount === 0) {
          throw Object.assign(new Error('请至少提供标题、正文或一个已完成上传的附件'), { status: 422, code: 'EMPTY_INSPIRATION' })
        }
      }
      const values = []
      const sets = []
      const fields = {
        title: input.title !== undefined ? input.title : undefined,
        text_raw: input.text_raw !== undefined ? input.text_raw : undefined,
        recorded_at: input.recorded_at ?? undefined,
        user_tags_json: input.user_tags_json ? JSON.stringify(input.user_tags_json) : undefined,
        board_position_json: input.board_position_json === null ? null : input.board_position_json ? JSON.stringify(input.board_position_json) : undefined,
        is_quote: input.is_quote ?? undefined,
        sync_status: input.sync_status ?? undefined,
        processing_status: input.sync_status === 'synced' ? 'synced' : input.processing_status ?? undefined,
      }
      if (input.type_id !== undefined || input.type_label !== undefined) fields.type_id = await resolveTypeId(client, req.workspaceId, input)
      for (const [field, value] of Object.entries(fields)) if (value !== undefined) { values.push(value); sets.push(`${field}=$${values.length}`) }
      if (sets.length) {
        values.push(inspirationId, req.workspaceId)
        await client.query(`UPDATE inspirations SET ${sets.join(',')} WHERE id=$${values.length - 1} AND workspace_id=$${values.length} AND deleted_at IS NULL`, values)
      }
    })
    res.json({ data: await fetchOne(req.workspaceId, inspirationId) })
  } catch (error) { next(error) }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const inspirationId = uuidSchema.parse(req.params.id)
    await withTransaction(async (client) => {
      const inspiration = await client.query('SELECT id FROM inspirations WHERE workspace_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE', [req.workspaceId, inspirationId])
      if (!inspiration.rows[0]) throw notFound('灵感不存在')
      await client.query('UPDATE inspirations SET deleted_at=now() WHERE workspace_id=$1 AND id=$2', [req.workspaceId, inspirationId])
      const assets = await client.query(`UPDATE assets SET status='deleting', deleted_at=COALESCE(deleted_at, now()) WHERE workspace_id=$1 AND inspiration_id=$2 AND status <> 'deleted' RETURNING id, storage_key`, [req.workspaceId, inspirationId])
      for (const asset of assets.rows) {
        await client.query(`
          INSERT INTO asset_deletion_tasks(workspace_id,asset_id,storage_key,status,next_attempt_at)
          VALUES($1,$2,$3,'pending',now())
          ON CONFLICT(asset_id) DO UPDATE SET status='pending', next_attempt_at=now(), last_error=NULL, updated_at=now()
        `, [req.workspaceId, asset.id, asset.storage_key])
      }
    })
    res.status(202).json({ data: { id: inspirationId, status: 'deleting' } })
  } catch (error) { next(error) }
})

export default router






