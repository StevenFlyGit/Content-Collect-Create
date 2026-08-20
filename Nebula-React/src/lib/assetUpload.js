import { uploadAsset as uploadRemoteAsset } from './api.js'

export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
export const AUDIO_MIMES = ['audio/webm', 'audio/mp4', 'audio/mp3', 'audio/m4a', 'audio/mpeg', 'audio/ogg']
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
export const MAX_AUDIO_DURATION_MS = 60 * 1000
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024

export function validateLocalAsset({ kind, mime, bytes, durationMs = 0 }) {
  mime = String(mime || '').split(';')[0].trim()
  if (kind === 'image') {
    if (!IMAGE_MIMES.includes(mime)) throw new Error('图片仅支持 JPG、PNG、WEBP、GIF')
    if (bytes > MAX_IMAGE_BYTES) throw new Error('图片单个文件不得超过 20MB')
  } else if (kind === 'audio') {
    if (!AUDIO_MIMES.includes(mime)) throw new Error('音频格式不受支持')
    if (bytes > MAX_AUDIO_BYTES) throw new Error('音频文件不得超过 100MB')
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_AUDIO_DURATION_MS) throw new Error('音频时长必须可识别且不得超过 1 分钟')
  } else throw new Error('附件类型不受支持')
}

export async function uploadCapturedAsset({ blob, kind, mime, meta = {}, inspirationId }) {
  validateLocalAsset({ kind, mime, bytes: blob.size, durationMs: meta.duration_ms || 0 })
  return uploadRemoteAsset({ blob, kind, mime, durationMs: meta.duration_ms || 0, inspirationId })
}
