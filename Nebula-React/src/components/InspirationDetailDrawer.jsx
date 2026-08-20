import { useCallback, useEffect, useMemo, useState } from 'react'
import { deleteInspiration, getInspiration, getInspirationType, getInspirationTypes, getAssetAccessUrl, updateInspiration } from '../lib/api.js'
import './InspirationDetail.css'

const colorValue = (token) => (token || '--ink-muted').startsWith('--') ? `var(${token})` : token
const pad2 = (n) => String(n).padStart(2, '0')
const toLocalInput = (iso) => {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}
const fromLocalInput = (value) => {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}
const formatDateTime = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', { hour12: false })
}

function AttachmentView({ attachment }) {
  const [url, setUrl] = useState(attachment.preview_url || '')
  const [failed, setFailed] = useState(false)
  const refresh = async () => {
    if (!attachment.asset_id) return
    try {
      const result = await getAssetAccessUrl(attachment.asset_id)
      setUrl(result.data?.url || '')
      setFailed(false)
    } catch { setFailed(true) }
  }
  if (attachment.status !== 'ready' || !url) {
    return <span className="detail-chip">{attachment.kind === 'image' ? '图片' : '音频'}（{attachment.status || '未就绪'}）</span>
  }
  if (attachment.kind === 'image') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="detail-image" aria-label="打开图片附件">
        <img src={url} alt={attachment.label || '图片附件'} onError={refresh} />
      </a>
    )
  }
  return (
    <div className="detail-audio">
      <audio src={url} controls preload="metadata" onError={refresh} />
      {failed && <button type="button" className="detail-refresh" onClick={refresh}>重新获取</button>}
    </div>
  )
}

function DeleteConfirmDialog({ onConfirm, onCancel, busy, error }) {
  return (
    <div className="detail-delete-confirm" role="dialog" aria-label="确认删除灵感">
      <p>删除后将进入后台清理，且会从列表、白板、搜索与计数中移除。此操作不可撤销，确认删除？</p>
      {error && <p className="detail-error" role="alert">{error}</p>}
      <div className="detail-delete-actions">
        <button type="button" className="detail-btn" onClick={onCancel} disabled={busy}>取消</button>
        <button type="button" className="detail-btn danger" onClick={onConfirm} disabled={busy}>{busy ? '删除中…' : '确认删除'}</button>
      </div>
    </div>
  )
}

function EditForm({ detail, types, archivedType, onSave, onCancel, busy, error }) {
  const [title, setTitle] = useState(detail.title || '')
  const [text, setText] = useState(detail.text_raw || '')
  const [typeId, setTypeId] = useState(detail.type_id || '')
  const [recordedAt, setRecordedAt] = useState(toLocalInput(detail.recorded_at))
  const options = useMemo(() => {
    const base = (types || []).map((type) => ({ id: type.id, label: type.label }))
    if (archivedType && !base.some((item) => item.id === archivedType.id)) base.unshift({ id: archivedType.id, label: `${archivedType.label}（已停用）` })
    return base
  }, [types, archivedType])

  const submit = (event) => {
    event.preventDefault()
    onSave({
      title: title.trim() || null,
      text_raw: text,
      type_id: typeId || null,
      recorded_at: fromLocalInput(recordedAt) || detail.recorded_at,
    })
  }

  return (
    <form className="detail-edit-form" onSubmit={submit}>
      {error && <p className="detail-error" role="alert">{error}</p>}
      <label className="detail-field">
        <span>标题</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="（可留空）" maxLength={200} autoFocus />
      </label>
      <label className="detail-field">
        <span>正文</span>
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows={8} />
      </label>
      <label className="detail-field">
        <span>类型</span>
        <select value={typeId || ''} onChange={(event) => setTypeId(event.target.value)}>
          <option value="">先不分类</option>
          {options.map((type) => <option value={type.id} key={type.id}>{type.label}</option>)}
        </select>
      </label>
      <label className="detail-field">
        <span>发生时间</span>
        <input type="datetime-local" value={recordedAt} onChange={(event) => setRecordedAt(event.target.value)} />
      </label>
      <div className="detail-edit-actions">
        <button type="button" className="detail-btn" onClick={onCancel} disabled={busy}>取消</button>
        <button type="submit" className="detail-btn primary" disabled={busy}>{busy ? '保存中…' : '保存修改'}</button>
      </div>
    </form>
  )
}

export default function InspirationDetailDrawer({ inspirationId, onClose, onChanged }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('view')
  const [types, setTypes] = useState([])
  const [archivedType, setArchivedType] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await getInspiration(inspirationId)
      const data = result.data
      setDetail(data)
      // 若灵感引用了已停用的类型，额外查询以标记“类型已停用”
      if (data.type_id) {
        try {
          const typeResult = await getInspirationType(data.type_id)
          if (typeResult.data?.archived_at) setArchivedType(typeResult.data)
          else setArchivedType(null)
        } catch { setArchivedType(null) }
      } else {
        setArchivedType(null)
      }
    } catch (err) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [inspirationId])

  useEffect(() => {
    setMode('view')
    setConfirmingDelete(false)
    setActionError('')
    load()
    getInspirationTypes().then((result) => setTypes(result.data || [])).catch(() => {})
  }, [load])

  const handleSave = async (patch) => {
    setBusy(true)
    setActionError('')
    try {
      const result = await updateInspiration(inspirationId, patch)
      setDetail(result.data)
      setMode('view')
      onChanged?.()
    } catch (err) {
      setActionError(err.message || '保存失败')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    setBusy(true)
    setActionError('')
    try {
      await deleteInspiration(inspirationId)
      onChanged?.()
      onClose()
    } catch (err) {
      setActionError(err.message || '删除失败')
      setBusy(false)
      setConfirmingDelete(false)
    }
  }

  const typeToken = archivedType?.color_token || detail?.color_token

  return (
    <div className="detail-overlay" role="dialog" aria-modal="true" aria-label="灵感详情" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="detail-panel">
        <header className="detail-head">
          <strong>{mode === 'edit' ? '编辑灵感' : (detail?.title || '灵感详情')}</strong>
          <button type="button" className="detail-close" aria-label="关闭" onClick={onClose}>×</button>
        </header>

        {loading && <div className="detail-body"><p className="detail-empty">正在加载…</p></div>}
        {error && <div className="detail-body"><p className="detail-empty">加载失败：{error}。<button type="button" className="detail-btn" onClick={load}>重试</button></p></div>}

        {!loading && !error && detail && mode === 'view' && (
          <div className="detail-body">
            <div className="detail-type">
              <span className="swatch" style={{ background: colorValue(typeToken), color: colorValue(typeToken) }} aria-hidden="true" />
              <span>{detail.type}</span>
              {archivedType && <span className="detail-archived-tag">类型已停用</span>}
            </div>
            <p className="detail-time">发生时间：{formatDateTime(detail.recorded_at)}</p>
            <p className="detail-text">{detail.text_raw || '（无正文）'}</p>
            {detail.attachments?.length > 0 && (
              <div className="detail-attachments">
                {detail.attachments.map((attachment, index) => (
                  <AttachmentView attachment={attachment} key={attachment.asset_id || `${attachment.kind}-${index}`} />
                ))}
              </div>
            )}
            <dl className="detail-meta">
              <div><dt>同步状态</dt><dd>{detail.sync_status === 'synced' ? '已同步' : '草稿'}</dd></div>
              <div><dt>创建时间</dt><dd>{formatDateTime(detail.created_at)}</dd></div>
              <div><dt>更新时间</dt><dd>{formatDateTime(detail.updated_at)}</dd></div>
            </dl>
            <div className="detail-actions">
              <button type="button" className="detail-btn primary" onClick={() => setMode('edit')}>编辑</button>
              <button type="button" className="detail-btn danger" onClick={() => setConfirmingDelete(true)}>删除</button>
            </div>
            {confirmingDelete && (
              <DeleteConfirmDialog onConfirm={handleDelete} onCancel={() => setConfirmingDelete(false)} busy={busy} error={actionError} />
            )}
          </div>
        )}

        {!loading && !error && detail && mode === 'edit' && (
          <div className="detail-body">
            <EditForm detail={detail} types={types} archivedType={archivedType} onSave={handleSave} onCancel={() => { setMode('view'); setActionError('') }} busy={busy} error={actionError} />
          </div>
        )}
      </div>
    </div>
  )
}
