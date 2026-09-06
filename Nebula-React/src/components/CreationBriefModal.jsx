import { useEffect, useRef, useState } from 'react'
import { writeDefaultStyle } from '../storage/creationDb.js'
import { showToast } from '../lib/toast.js'
import './CreationBriefModal.css'

/**
 * CreationBriefModal —— 「这次想怎么写」弹窗（brief 阶段）
 * 创作篮点击「开始创作」后、以及 stage=brief 恢复时共用。
 * 输入停止 400ms 后经 onPersist 落盘（backend-design.md §5）；
 * 打开或取消不调用 LLM，点击「生成选题与大纲」才触发 onGenerate。
 */
export default function CreationBriefModal({ open, materialsCount = 0, brief, onPersist, onGenerate, onCancel, busy = false }) {
  const [supplement, setSupplement] = useState('')
  const [purpose, setPurpose] = useState('')
  const [style, setStyle] = useState('')
  const timerRef = useRef(null)

  // 仅在弹窗打开瞬间同步 IndexedDB 中的 brief；
  // 不随 onPersist 回传的 brief 对象重新同步，避免防抖落盘期间覆盖正在输入的内容
  useEffect(() => {
    if (!open) return
    setSupplement(brief?.supplement || '')
    setPurpose(brief?.purpose || '')
    setStyle(brief?.style_snapshot || '')
    if (timerRef.current) window.clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current) }, [])

  const schedulePersist = (patch) => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      onPersist?.(patch)
    }, 400)
  }

  const update = (key, value, setter) => {
    setter(value)
    schedulePersist({ [key]: value })
  }

  const flush = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
      onPersist?.({ supplement, purpose, style_snapshot: style })
    }
  }

  const handleSaveStyle = () => {
    if (!style.trim()) { showToast('先填写表达风格'); return }
    if (writeDefaultStyle(style.trim())) showToast('默认风格已保存')
    else showToast('默认风格保存失败')
  }

  const handleGenerate = () => {
    flush()
    onGenerate?.()
  }

  if (!open) return null

  return (
    <div className="cfm-mask" role="dialog" aria-modal="true" aria-label="这次想怎么写">
      <div className="cfm-card">
        <button type="button" className="cfm-close" aria-label="关闭弹窗" onClick={onCancel}>×</button>
        <p className="cfm-eyebrow">开始创作</p>
        <h2>这次想怎么写</h2>
        <p className="cfm-intro">已选 {materialsCount} 项素材。先补充必要要求，系统会整理一个选题与大纲。</p>

        <details className="cfm-optional" open>
          <summary>补充创作目的与表达风格（选填）</summary>
          <label className="cfm-label" htmlFor="cfm-purpose">创作目的</label>
          <textarea
            id="cfm-purpose"
            className="cfm-field"
            maxLength={500}
            placeholder="例如：分享方法，让读者愿意开始行动。"
            value={purpose}
            onChange={(e) => update('purpose', e.target.value, setPurpose)}
          />
          <label className="cfm-label" htmlFor="cfm-style">表达风格</label>
          <textarea
            id="cfm-style"
            className="cfm-field"
            maxLength={1000}
            placeholder="例如：自然直接、少术语，不夸张。"
            value={style}
            onChange={(e) => update('style_snapshot', e.target.value, setStyle)}
          />
          <div className="cfm-actions" style={{ marginTop: 10 }}>
            <span className="cfm-footnote" style={{ margin: 0 }}>只对本次生效</span>
            <button type="button" className="cfm-btn small ghost" onClick={handleSaveStyle}>设为默认风格</button>
          </div>
        </details>

        <label className="cfm-label" htmlFor="cfm-supplement">补充说明 <small>选填</small></label>
        <textarea
          id="cfm-supplement"
          className="cfm-field cfm-thought"
          maxLength={2000}
          placeholder="例如：希望从普通人的真实使用场景切入，保留自己的判断。"
          value={supplement}
          onChange={(e) => update('supplement', e.target.value, setSupplement)}
        />

        <div className="cfm-actions">
          <button type="button" className="cfm-btn ghost" onClick={onCancel} disabled={busy}>返回选择</button>
          <button type="button" className="cfm-btn primary" onClick={handleGenerate} disabled={busy}>
            {busy ? '生成中…' : '生成选题与大纲 →'}
          </button>
        </div>
        <p className="cfm-footnote">不填写时，直接根据已选素材生成。平台在大纲确认后选择。</p>
      </div>
    </div>
  )
}
