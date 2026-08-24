/**
 * 全局 Toast —— 极简、零依赖，单例挂载到 body。
 * 视觉沿用原型 .toast（base.css 中定义）。
 */
let toastEl = null
let timer = null

function ensureEl() {
  if (toastEl && document.body && document.body.contains(toastEl)) return toastEl
  toastEl = document.createElement('div')
  toastEl.className = 'toast'
  toastEl.setAttribute('role', 'status')
  toastEl.setAttribute('aria-live', 'polite')
  toastEl.innerHTML = '<span class="tick">✓</span><span class="toast-msg"></span>'
  document.body.appendChild(toastEl)
  return toastEl
}

/**
 * 展示一条 Toast。
 * @param {string} message 文案
 * @param {number} [duration=1800] 自动消失毫秒数
 */
export function showToast(message, duration = 1800) {
  const el = ensureEl()
  el.querySelector('.toast-msg').textContent = message
  // 强制 reflow，确保连续调用也能重启过渡动画
  void el.offsetWidth
  el.classList.add('show')
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => el.classList.remove('show'), duration)
}

export default showToast
