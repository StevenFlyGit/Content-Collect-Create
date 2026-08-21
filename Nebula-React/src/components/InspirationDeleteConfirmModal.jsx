import { useEffect } from 'react'
import './InspirationDeleteConfirmModal.css'

/** 删除确认文案备选（文艺感），文档 5.4.3 要求提供 3-4 个版本。 */
export const DELETE_MESSAGES = [
  '灵感来之不易，建议勿要丢弃。删除后将会消散在你的灵感星云之中。',
  '这条灵感曾在某一刻照亮过你，确定要让它熄灭吗？',
  '一旦删除，它将从列表、白板与搜索中隐去，像流星划过不再回头。',
  '你正把一段思绪放回宇宙。确认后，它将在星云深处慢慢消散。',
]

export default function InspirationDeleteConfirmModal({ message, onConfirm, onCancel, busy, error }) {
  const text = message || DELETE_MESSAGES[0]
  useEffect(() => {
    const handler = (event) => { if (event.key === 'Escape' && !busy) onCancel?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel, busy])

  return (
    <div
      className="delete-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="删除灵感确认"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel?.() }}
    >
      <div className="delete-card">
        <span className="delete-mark" aria-hidden="true">×</span>
        <p className="delete-text">{text}</p>
        {error && <p className="delete-error" role="alert">{error}</p>}
        <div className="delete-actions">
          <button type="button" className="delete-btn" onClick={onCancel} disabled={busy}>取消</button>
          <button type="button" className="delete-btn danger" onClick={onConfirm} disabled={busy}>{busy ? '删除中…' : '确认删除'}</button>
        </div>
      </div>
    </div>
  )
}
