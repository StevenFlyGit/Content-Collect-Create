import { parseStream } from 'music-metadata'
import { MAX_AUDIO_DURATION_MS } from './validators.js'

const DURATION_TOLERANCE_MS = 1500

export function validationError(message, code) {
  return Object.assign(new Error(message), { status: 422, code })
}

/** webm/matroska 在 OSS 不可寻址流上流式解析易失败，需走声明时长回退。 */
export function isWebmMatroska(mimeType) {
  return /webm|matroska/i.test(String(mimeType || ''))
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

/**
 * 解析音频真实时长，并对 webm/matroska 做声明时长回退。
 * 这类格式在 OSS 不可寻址流上常因 End-Of-Stream 解析失败，但其声明时长
 * （录音计时 / <audio> 元数据，来自前端）可靠，故回退到声明值即可继续。
 * 非 webm 格式仍走严格的流式解析 + 声明交叉校验。
 */
export async function resolveAudioDurationMs({ stream, mimeType, size, declaredMs }) {
  try {
    const actualMs = await readAudioDurationMs(stream, mimeType, size)
    return validateAudioDuration({ actualMs, declaredMs })
  } catch (error) {
    // webm/matroska 在 OSS 不可寻址流上无法可靠解析真实时长，两类失败都回退到声明值：
    //  - AUDIO_METADATA_INVALID：parseStream 抛流错误（如 End-Of-Stream）
    //  - AUDIO_DURATION_UNREADABLE：解析成功但无可用时长
    if (isWebmMatroska(mimeType) && (error.code === 'AUDIO_METADATA_INVALID' || error.code === 'AUDIO_DURATION_UNREADABLE')) {
      if (declaredMs == null) throw validationError('webm 音频缺少声明时长且服务端无法解析', 'AUDIO_DURATION_UNREADABLE')
      // 回退到前端声明时长，仅做边界校验（不再与实际解析值交叉比对）。
      return validateAudioDuration({ actualMs: declaredMs, declaredMs: null })
    }
    throw error
  }
}