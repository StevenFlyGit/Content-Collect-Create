import { useEffect, useRef, useState } from 'react'
import './SelectionBar.css'

/**
 * SelectionBar —— 底部多选操作栏（选中 ≥1 条灵感时滑入）
 * 创作按钮遵循 scheme-B：点击后短暂显示完成反馈，不直接跳转页面。
 */
export default function SelectionBar({ count, onClear }) {
  const [feedback, setFeedback] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (count === 0) setFeedback(false)
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [count])

  const handleCreate = () => {
    setFeedback(true)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setFeedback(false), 1200)
  }

  return (
    <div
      className={`selection-bar${count > 0 ? ' show' : ''}`}
      role="region"
      aria-label="已选灵感操作栏"
    >
      <div className="count" aria-live="polite">
        已选 <strong>{feedback ? '✓' : count}</strong> 条灵感
      </div>
      <div className="divider" />
      <button type="button" className="btn ghost" onClick={onClear}>清空</button>
      <button type="button" className="btn primary" onClick={handleCreate}>用这些灵感创作 →</button>
    </div>
  )
}