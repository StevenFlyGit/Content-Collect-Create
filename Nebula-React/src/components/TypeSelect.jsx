import { useEffect, useMemo, useRef, useState } from 'react'
import { archiveInspirationType, updateInspirationType } from '../lib/api.js'
import './TypeSelect.css'

const FALLBACK_TYPES = [
  { id: '', slug: 'uncategorized', label: '先不分类', color_token: '--ink-muted', is_system: true },
  { id: '', slug: 'idea', label: '想法', color_token: '--nebula-violet', is_system: true },
  { id: '', slug: 'quote', label: '引用', color_token: '--nebula-blue', is_system: true },
  { id: '', slug: 'moment', label: '随感', color_token: '--nebula-rose', is_system: true },
  { id: '', slug: 'task', label: '待办', color_token: '--nebula-mint', is_system: true },
  { id: '', slug: 'case', label: '案例', color_token: '--nebula-amber', is_system: true },
  { id: '', slug: 'question', label: '问题', color_token: '--danger', is_system: true },
]

const colorValue = (type) => {
  const token = type?.color_token || '--ink-muted'
  return token.startsWith('--') ? `var(${token})` : token
}

export default function TypeSelect({ valueId = '', valueLabel = '想法', types = [], onChange, onCreate, onTypesChange, onArchivedActive, pulse = false, disabled = false }) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [customLabel, setCustomLabel] = useState('')
  const [createError, setCreateError] = useState('')
  const [creatingType, setCreatingType] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [editLabel, setEditLabel] = useState('')
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState('')
  const [confirmId, setConfirmId] = useState('')
  const [flash, setFlash] = useState('')
  const ref = useRef(null)
  const labelRef = useRef(null)
  const options = useMemo(() => types.length ? types : FALLBACK_TYPES, [types])
  const current = options.find((type) => valueId && type.id === valueId) || options.find((type) => type.label === valueLabel) || options[0]

  useEffect(() => {
    const el = labelRef.current
    if (!el) return
    const shift = el.scrollWidth - el.clientWidth
    if (shift > 1) {
      el.style.setProperty('--marquee-shift', `${shift}px`)
      el.classList.add('marquee')
    } else {
      el.classList.remove('marquee')
      el.style.removeProperty('--marquee-shift')
    }
  }, [current?.label, open])

  useEffect(() => {
    const onDoc = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false) }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [])

  useEffect(() => {
    if (disabled) {
      setOpen(false)
      setCreating(false)
      setEditingId('')
      setConfirmId('')
    }
  }, [disabled])

  useEffect(() => {
    if (!flash) return undefined
    const timer = setTimeout(() => setFlash(''), 3200)
    return () => clearTimeout(timer)
  }, [flash])

  const choose = (next) => {
    if (disabled) return
    onChange(next)
    setOpen(false)
    setCreating(false)
    setEditingId('')
    setConfirmId('')
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
      const result = await onCreate(label)
      const created = result?.data || result
      setCustomLabel('')
      if (result?.meta?.operation === 'reactivated') setFlash('已重新启用该类型')
      else setFlash('')
      choose(created)
    } catch (error) {
      setCreateError(error.message || '创建类型失败')
    } finally {
      setCreatingType(false)
    }
  }

  const startEdit = (event, type) => {
    event.stopPropagation()
    setEditingId(type.id)
    setEditLabel(type.label)
    setEditError('')
  }
  const cancelEdit = (event) => {
    event?.stopPropagation()
    setEditingId('')
    setEditError('')
  }
  const submitEdit = async (event, type) => {
    event.preventDefault()
    event.stopPropagation()
    const label = editLabel.trim()
    if (!label) {
      setEditError('请输入类型名称')
      return
    }
    if (label === type.label) {
      setEditingId('')
      return
    }
    setEditing(true)
    setEditError('')
    try {
      const updated = await updateInspirationType(type.id, { label })
      const next = options.map((item) => (item.id === updated.data.id ? updated.data : item))
      onTypesChange?.(next)
      setEditingId('')
    } catch (error) {
      setEditError(error.message || '类型更新失败')
    } finally {
      setEditing(false)
    }
  }

  const askArchive = (event, type) => {
    event.stopPropagation()
    setConfirmId(type.id)
  }
  const cancelArchive = (event) => {
    event?.stopPropagation()
    setConfirmId('')
  }
  const confirmArchive = async (event, type) => {
    event.stopPropagation()
    setConfirmId('')
    try {
      await archiveInspirationType(type.id)
      const next = options.filter((item) => item.id !== type.id)
      onTypesChange?.(next)
      // 若被停用的类型正是当前选中类型，通知父级回退为“先不分类”
      if (valueId && type.id === valueId) onArchivedActive?.(type)
    } catch (error) {
      setFlash(error.message || '类型停用失败')
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
        <span className="type-label-text" ref={labelRef}>类型：{current?.label || valueLabel}</span>
        <span className="caret" aria-hidden="true">▾</span>
      </button>

      <div className={`type-menu${open ? ' open' : ''}`} role="listbox">
        {options.map((type) => {
          const isCustom = type.is_system === false && type.workspace_id !== null && type.workspace_id !== undefined
          const archived = Boolean(type.archived_at)
          const isActiveCustom = isCustom && !archived
          if (editingId === type.id) {
            return (
              <form className="type-edit-row" key={type.id || type.slug} onSubmit={(event) => submitEdit(event, type)}>
                <span className="swatch" style={{ background: colorValue(type), color: colorValue(type) }} aria-hidden="true" />
                <input
                  className="type-edit-input"
                  value={editLabel}
                  onChange={(event) => setEditLabel(event.target.value)}
                  maxLength={40}
                  aria-label="重命名灵感类型"
                  autoFocus
                  onClick={(event) => event.stopPropagation()}
                />
                <button type="submit" className="type-edit-ok" disabled={editing} aria-label="确认重命名">{editing ? '…' : '✓'}</button>
                <button type="button" className="type-edit-cancel" onClick={cancelEdit} aria-label="取消重命名">×</button>
                {editError && <span className="type-edit-error" role="alert">{editError}</span>}
              </form>
            )
          }
          return (
            <div className={`type-item${isActiveCustom ? ' has-actions' : ''}`} key={type.id || type.slug} role="option" aria-selected={(valueId && type.id === valueId) || (!valueId && type.label === valueLabel)} data-type={type.label}>
              <button
                type="button"
                className="type-item-main"
                disabled={disabled}
                onClick={() => choose(type)}
              >
                <span className="swatch" style={{ background: colorValue(type), color: colorValue(type) }} aria-hidden="true" />
                <span className="type-item-label">{type.label}</span>
                {archived && <span className="type-archived-tag">已停用</span>}
              </button>
              {isActiveCustom && !disabled && (
                <span className="type-item-actions">
                  <button type="button" className="type-edit-btn" aria-label={`编辑类型 ${type.label}`} onClick={(event) => startEdit(event, type)}>✎</button>
                  <button type="button" className="type-del-btn" aria-label={`停用类型 ${type.label}`} onClick={(event) => askArchive(event, type)}>×</button>
                </span>
              )}
              {isActiveCustom && confirmId === type.id && (
                <div className="type-archive-popover" role="dialog" aria-label={`确认停用 ${type.label}`}>
                  <p>停用类型不会删除已有灵感，仅从后续选择中移除。确认停用？</p>
                  <div className="type-archive-actions">
                    <button type="button" onClick={cancelArchive}>取消</button>
                    <button type="button" className="danger" onClick={(event) => confirmArchive(event, type)}>确认停用</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {flash && <span className="type-flash" role="status">{flash}</span>}
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
