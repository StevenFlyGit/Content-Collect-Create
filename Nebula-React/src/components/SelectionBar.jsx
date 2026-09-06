import { useEffect, useRef, useState } from 'react'
import './SelectionBar.css'

/**
 * SelectionBar —— 底部多选操作栏（选中 ≥1 条时滑入）
 * 决策 1：按钮文案改为「加入创作篮」；点击后把所选灵感写入创作篮并跳转。
 * 创作篮页复用同一交互/视觉：通过 unitLabel / actionLabel / showFeedback 定制文案。
 */
export default function SelectionBar({
  count,
  selected,
  onClear,
  onAdd,
  unitLabel = '条灵感',
  actionLabel = '加入创作篮 →',
  showFeedback = true,
  regionLabel = '已选灵感操作栏',
}) {
  const [feedback, setFeedback] = useState(false)
  const [busy, setBusy] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (count === 0) setFeedback(false)
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [count])

  const handleCreate = async () => {
    if (busy || count === 0) return
    setBusy(true)
    try {
      const ids = selected && selected.size ? Array.from(selected) : []
      await onAdd(ids)
      if (showFeedback) {
        setFeedback(true)
        if (timerRef.current) window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => setFeedback(false), 1200)
      }
    } catch {
      // onAdd 内部已通过 Toast 提示错误
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={`selection-bar${count > 0 ? ' show' : ''}`}
      role="region"
      aria-label={regionLabel}
    >
      <div className="count" aria-live="polite">
        已选 <strong>{showFeedback && feedback ? '✓' : count}</strong> {unitLabel}
      </div>
      <div className="divider" />
      <button type="button" className="btn ghost" onClick={onClear}>清空</button>
      <button type="button" className="btn primary" onClick={handleCreate} disabled={busy}>
        {busy ? '处理中…' : actionLabel}
      </button>
    </div>
  )
}
