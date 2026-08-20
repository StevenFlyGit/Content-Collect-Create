const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '')
const WORKSPACE_ID = import.meta.env.VITE_WORKSPACE_ID || localStorage.getItem('nebula-workspace-id') || ''

export class ApiError extends Error {
  constructor(message, status, code, requestId = '') { super(message); this.status = status; this.code = code; this.requestId = requestId }
}

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {})
  headers.set('Accept', 'application/json')
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  if (WORKSPACE_ID) headers.set('X-Workspace-Id', WORKSPACE_ID)
  let response
  try { response = await fetch(`${API_BASE}${path}`, { ...options, headers }) } catch {
    throw new ApiError('网络不可用，请检查连接后重试', 0, 'NETWORK_ERROR')
  }
  const text = await response.text()
  let payload = {}
  try { payload = text ? JSON.parse(text) : {} } catch { payload = {} }
  if (!response.ok) throw new ApiError(payload.error || `请求失败（${response.status}）`, response.status, payload.code, payload.request_id)
  return payload
}

export const listInspirations = (params = {}) => {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''))
  return apiFetch(`/inspirations${query.toString() ? `?${query}` : ''}`)
}
export const searchInspirations = (params = {}) => apiFetch(`/inspirations/search?${new URLSearchParams(params)}`)
export const createInspiration = (data) => apiFetch('/inspirations', { method: 'POST', headers: { 'Idempotency-Key': data.idempotency_key || data.draft_id || '' }, body: JSON.stringify(data) })
export const updateInspiration = (id, data) => apiFetch(`/inspirations/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteInspiration = (id) => apiFetch(`/inspirations/${id}`, { method: 'DELETE' })
export const getInspirationTypes = () => apiFetch('/inspiration-types')
export const createInspirationType = (data) => apiFetch('/inspiration-types', { method: 'POST', body: JSON.stringify(data) })
export const saveDailyBoard = (data) => apiFetch('/daily-boards', { method: 'PATCH', body: JSON.stringify(data) })
export const requestAssetPresign = (data) => apiFetch('/assets/presign', { method: 'POST', body: JSON.stringify(data) })
export const completeAsset = (data) => apiFetch('/assets/complete', { method: 'POST', body: JSON.stringify(data) })
export const getAssetAccessUrl = (id) => apiFetch('/assets/' + id + '/access-url')
export const deleteAsset = (id) => apiFetch(`/assets/${id}`, { method: 'DELETE' })

export async function uploadAsset({ blob, kind, mime, durationMs, inspirationId, assetId, onPresigned, onProgress }) {
  const normalizedMime = String(mime || '').split(';')[0].trim().toLowerCase()
  const presign = await requestAssetPresign({
    asset_id: assetId,
    kind,
    mime_type: normalizedMime,
    bytes: blob.size,
    duration_ms: kind === 'audio' ? durationMs : undefined,
    inspiration_id: inspirationId,
  })
  await onPresigned?.(presign.data)
  if (presign.data.already_ready) return { asset_id: presign.data.asset_id, status: 'ready', idempotent: true }
  const response = await fetch(presign.data.put_url, { method: 'PUT', headers: { 'Content-Type': normalizedMime }, body: blob })
  if (!response.ok) throw new ApiError('附件上传失败', response.status, 'OSS_UPLOAD_FAILED')
  onProgress?.(1)
  const completed = await completeAsset({ asset_id: presign.data.asset_id, bytes: blob.size, duration_ms: kind === 'audio' ? durationMs : undefined })
  return completed.data
}

