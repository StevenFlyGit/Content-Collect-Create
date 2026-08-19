// 安全上下文判断：getUserMedia / MediaRecorder 仅在 HTTPS 或 localhost 可用。
export function isSecureContextSupported() {
  if (typeof window === 'undefined') return false
  return Boolean(window.isSecureContext) || window.location?.protocol === 'https:'
}
