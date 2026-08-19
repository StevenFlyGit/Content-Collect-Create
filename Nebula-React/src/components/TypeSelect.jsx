import { useEffect, useRef, useState } from 'react'
import './TypeSelect.css'

const TYPES = [
  { key: '先不分类', color: 'var(--ink-muted)' },
  { key: '想法', color: 'var(--nebula-violet)' },
  { key: '引用', color: 'var(--nebula-blue)' },
  { key: '随感', color: 'var(--nebula-rose)' },
  { key: '待办', color: 'var(--nebula-mint)' },
  { key: '案例', color: 'var(--nebula-amber)' },
  { key: '问题', color: 'var(--danger)' },
]

export default function TypeSelect({ value, onChange, pulse = false }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = TYPES.find((t) => t.key === value) || TYPES[0]

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [])

  const choose = (next) => {
    onChange(next)
    setOpen(false)
  }

  return (
    <div className="type-select" ref={ref}>
      <button
        type="button"
        className={`type-trigger${pulse ? ' pulse' : ''}`}
        data-type={value}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="swatch" style={{ background: current.color, color: current.color }} aria-hidden="true" />
        <span>类型：{value}</span>
        <span className="caret" aria-hidden="true">▾</span>
      </button>

      <div className={`type-menu${open ? ' open' : ''}`} role="listbox">
        {TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            className="type-item"
            role="option"
            aria-selected={t.key === value}
            data-type={t.key}
            onClick={() => choose(t.key)}
          >
            <span className="swatch" style={{ background: t.color, color: t.color }} aria-hidden="true" />
            {t.key}
          </button>
        ))}
      </div>
    </div>
  )
}
