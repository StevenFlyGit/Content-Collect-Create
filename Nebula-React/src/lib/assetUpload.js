// 拍摄/录音产出 Blob 的上传与关联：
// - 后端已配置（VITE_API_BASE）：走 06/08 文档约定的 presign → OSS 直传 → complete 流程
// - 后端未配置：Blob 存入 IndexedDB 草稿（离线兜底，对齐 03 §5.1），标记 synced=false
// 该模块是「纯客户端」与「服务端对象存储」之间唯一契约点，不引入额外功能。

import { putDraft } from './draftStore'

const API_BASE = import.meta.env.VITE_API_BASE || ''

async function uploadWithBackend({ blob, kind, mime, meta = {} }) {
  const bytes = blob.size
  const presignRes = await fetch(`${API_BASE}/api/assets/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind,
      mime_type: mime,
      bytes,
      inspiration_id: meta.inspiration_id || null,
    }),
  })
  if (!presignRes.ok) throw new Error(`presign 失败: ${presignRes.status}`)
  const { asset_id, put_url } = await presignRes.json()

  const putRes = await fetch(put_url, {
    method: 'PUT',
    headers: { 'Content-Type': mime },
    body: blob,
  })
  if (!putRes.ok) throw new Error(`OSS 上传失败: ${putRes.status}`)

  const completeRes = await fetch(`${API_BASE}/api/assets/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset_id, ...meta }),
  })
  if (!completeRes.ok) throw new Error(`complete 失败: ${completeRes.status}`)

  return { asset_id, synced: true }
}

async function uploadToDraft({ blob, kind, mime, meta = {} }) {
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await putDraft({
    id,
    kind,
    mime,
    blob,
    meta,
    created_at: new Date().toISOString(),
    synced: false,
  })
  return { asset_id: id, synced: false }
}

export async function uploadCapturedAsset({ blob, kind, mime, meta }) {
  if (API_BASE) return uploadWithBackend({ blob, kind, mime, meta })
  return uploadToDraft({ blob, kind, mime, meta })
}
