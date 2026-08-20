import { useEffect, useMemo, useRef, useState } from 'react'
import './TypeSelect.css'

const FALLBACK_TYPES = [
  { id: '', slug: 'uncategorized', label: '先不分类', color_token: '--ink-muted' },
  { id: '', slug: 'idea', label: '想法', color_token: '--nebula-violet' },
  { id: '', slug: 'quote', label: '引用', color_token: '--nebula-blue' },
  { id: '', slug: 'moment', label: '随感', color_token: '--nebula-rose' },
  { id: '', slug: 'task', label: '待办', color_token: '--nebula-mint' },
  { id: '', slug: 'case', label: '案例', color_token: '--nebula-amber' },
  { id: '', slug: 'question', label: '问题', color_token: '--danger' },
]

const colorValue = (type) => {
  const token = type?.color_token || '--ink-muted'
  return token.startsWith('--') ? `var(${token})` : token
}

export default function TypeSelect({ valueId = '', valueLabel = '想法', types = [], onChange, onCreate, pulse = false, disabled = false }) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [customLabel, setCustomLabel] = useState('')
  const [createError, setCreateError] = useState('')
  const [creatingType, setCreatingType] = useState(false)
  const ref = useRef(null)
  const options = useMemo(() => types.length ? types : FALLBACK_TYPES, [types])
  const current = options.find((type) => valueId && type.id === valueId) || options.find((type) => type.label === valueLabel) || options[0]

  useEffect(() => {
    const onDoc = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false) }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [])

  useEffect(() => {
    if (disabled) {
      setOpen(false)
      setCreating(false)
    }
  }, [disabled])

  const choose = (next) => {
    if (disabled) return
    onChange(next)
    setOpen(false)
    setCreating(false)
    setCreateError('')
  }

  const submitCustomType = async (event) => {
    event.preventDefault()
    event.stopPropagation()
    const label = customLabel.trim()
    if (!label) {
      setCreateError('请输入类型名称')
      return
    }
    if (!onCreate) return
    setCreatingType(true)
    setCreateError('')
    try {
      const created = await onCreate(label)
      setCustomLabel('')
      choose(created)
    } catch (error) {
      setCreateError(error.message || '创建类型失败')
    } finally {
      setCreatingType(false)
    }
  }

  return (
    <div className="type-select" ref={ref}>
      <button
        type="button"
        className={`type-trigger${pulse ? ' pulse' : ''}`}
        data-type={current?.label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="swatch" style={{ background: colorValue(current), color: colorValue(current) }} aria-hidden="true" />
        <span>类型：{current?.label || valueLabel}</span>
        <span className="caret" aria-hidden="true">▾</span>
      </button>

      <div className={`type-menu${open ? ' open' : ''}`} role="listbox">
        {options.map((type) => (
          <button
            key={type.id || type.slug}
            type="button"
            className="type-item"
            role="option"
            aria-selected={(valueId && type.id === valueId) || (!valueId && type.label === valueLabel)}
            data-type={type.label}
            disabled={disabled}
            onClick={() => choose(type)}
          >
            <span className="swatch" style={{ background: colorValue(type), color: colorValue(type) }} aria-hidden="true" />
            {type.label}
          </button>
        ))}
        {onCreate && <div className="type-custom">
          {!creating ? (
            <button type="button" className="type-create-toggle" onClick={() => setCreating(true)} disabled={disabled}>＋ 新建自定义类型</button>
          ) : (
            <form onSubmit={submitCustomType}>
              <input value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} maxLength={40} placeholder="类型名称" aria-label="自定义类型名称" autoFocus />
              <div className="type-create-actions">
                <button type="button" onClick={() => { setCreating(false); setCreateError('') }} disabled={creatingType}>取消</button>
                <button type="submit" disabled={creatingType}>{creatingType ? '创建中…' : '创建'}</button>
              </div>
              {createError && <span className="type-create-error" role="alert">{createError}</span>}
            </form>
          )}
        </div>}
      </div>
    </div>
  )
}
