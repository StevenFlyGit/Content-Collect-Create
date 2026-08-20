import { parseStream } from 'music-metadata'
import { MAX_AUDIO_DURATION_MS } from './validators.js'

const DURATION_TOLERANCE_MS = 1500

function validationError(message, code) {
  return Object.assign(new Error(message), { status: 422, code })
}

/**
 * 从 OSS 音频对象流中解析真实时长。
 * 解析过程使用流式读取，不把音频字节整体载入内存。
 */
export async function readAudioDurationMs(stream, mimeType, size) {
  try {
    const metadata = await parseStream(stream, { mimeType, size })
    const durationSeconds = Number(metadata.format?.duration)
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw validationError('无法从 OSS 音频对象解析出有效时长', 'AUDIO_DURATION_UNREADABLE')
    }
    return Math.round(durationSeconds * 1000)
  } catch (error) {
    if (error?.status) throw error
    throw Object.assign(new Error(`无法解析 OSS 音频对象时长：${error.message || '媒体元数据无效'}`), {
      status: 422,
      code: 'AUDIO_METADATA_INVALID',
    })
  } finally {
    stream.destroy?.()
  }
}

export function validateAudioDuration({ actualMs, declaredMs }) {
  if (!Number.isInteger(actualMs) || actualMs <= 0 || actualMs > MAX_AUDIO_DURATION_MS) {
    throw validationError('OSS 音频实际时长不可识别或超过 1 分钟', 'AUDIO_DURATION_EXCEEDED')
  }
  if (declaredMs != null) {
    const declared = Number(declaredMs)
    if (!Number.isInteger(declared) || declared <= 0 || Math.abs(actualMs - declared) > DURATION_TOLERANCE_MS) {
      throw validationError('OSS 音频实际时长与声明不一致', 'AUDIO_DURATION_MISMATCH')
    }
  }
  return actualMs
}