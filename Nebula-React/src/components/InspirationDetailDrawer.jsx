import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deleteInspiration, getInspiration, getInspirationType, getInspirationTypes, getAssetAccessUrl, updateInspiration } from '../lib/api.js'
import useAttachmentUploader from '../lib/useAttachmentUploader.js'
import { isSecureContextSupported } from '../lib/secure.js'
import DateWheel from './DateWheel.jsx'
import MediaCaptureOverlay from './MediaCaptureOverlay.jsx'
import InspirationDeleteConfirmModal, { DELETE_MESSAGES } from './InspirationDeleteConfirmModal.jsx'
import './InspirationDetail.css'

const colorValue = (token) => (token || '--ink-muted').startsWith('--') ? `var(${token})` : token
const pad2 = (n) => String(n).padStart(2, '0')
const formatDateTime = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', { hour12: false })
}
const daysIn = (year, month) => new Date(year, month, 0).getDate()
const combineToIso = (year, month, day, timeStr) => {
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number)
  const date = new Date(year, month - 1, day, hh || 0, mm || 0)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
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

function EditAttachmentView({ attachment, onRemove }) {
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
    return <div className="edit-att"><span className="detail-chip">{attachment.kind === 'image' ? '图片' : '音频'}（{attachment.status || '未就绪'}）</span></div>
  }
  return (
    <div className="edit-att">
      {attachment.kind === 'image'
        ? <a href={url} target="_blank" rel="noreferrer" className="edit-att-image" aria-label="打开图片附件"><img src={url} alt={attachment.label || '图片附件'} onError={refresh} /></a>
        : <audio src={url} controls preload="metadata" onError={refresh} />}
      {/* 删除只从「最终保留清单」中移除，真正落库在点「保存修改」时由后端按 asset_ids 统一清理，
          这样编辑途中反悔（取消）不会误删云端附件。 */}
      <button type="button" className="edit-att-del" onClick={() => onRemove(attachment.asset_id)}>删除</button>
      {failed && <button type="button" className="detail-refresh" onClick={refresh}>重新获取</button>}
    </div>
  )
}

/** 编辑期间新增、尚未上传的本地附件（Blob 预览 + 待上传/上传中/失败 状态）。 */
function PendingAttachmentView({ attachment, onRemove }) {
  const status = attachment.failed
    ? <span className="edit-att-status failed">上传失败</span>
    : attachment.pendingUpload
      ? <span className="edit-att-status">上传中…</span>
      : <span className="edit-att-status">待上传</span>
  return (
    <div className="edit-att edit-att--new">
      {attachment.kind === 'image'
        ? <span className="edit-att-image"><img src={attachment.src} alt={attachment.label || '新增图片'} /></span>
        : <audio src={attachment.src} controls preload="metadata" />}
      <span className="edit-att-name">{attachment.label}</span>
      {status}
      <button type="button" className="edit-att-del" onClick={onRemove}>移除</button>
    </div>
  )
}

function EditForm({ detail, types, archivedType, uploader, onSave, onCancel, busy, error }) {
  const recorded = detail.recorded_at ? new Date(detail.recorded_at) : new Date()
  const [title, setTitle] = useState(detail.title || '')
  const [text, setText] = useState(detail.text_raw || '')
  const [typeId, setTypeId] = useState(detail.type_id || '')
  // 已有附件（服务端资产）：编辑期只在本地方便增删，点「保存修改」时才把保留清单提交给后端
  const [keptAssets, setKeptAssets] = useState(detail.attachments || [])
  const [overlay, setOverlay] = useState(null)
  const imageInputRef = useRef(null)
  const audioInputRef = useRef(null)
  const [year, setYear] = useState(recorded.getFullYear())
  const [month, setMonth] = useState(recorded.getMonth() + 1)
  const [day, setDay] = useState(recorded.getDate())
  const [hour, setHour] = useState(recorded.getHours())
  const [minute, setMinute] = useState(recorded.getMinutes())
  const today = new Date()
  const startYear = Math.min(today.getFullYear() - 5, recorded.getFullYear())
  const yearValues = useMemo(() => Array.from({ length: 21 }, (_, i) => startYear + i), [startYear])
  const monthValues = useMemo(() => Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')), [])
  const dayValues = useMemo(() => Array.from({ length: daysIn(year, month) }, (_, i) => String(i + 1).padStart(2, '0')), [year, month])
  const hourValues = useMemo(() => Array.from({ length: 24 }, (_, i) => pad2(i)), [])
  const minuteValues = useMemo(() => Array.from({ length: 60 }, (_, i) => pad2(i)), [])
  const options = useMemo(() => {
    const base = (types || []).map((type) => ({ id: type.id, label: type.label }))
    if (archivedType && !base.some((item) => item.id === archivedType.id)) base.unshift({ id: archivedType.id, label: `${archivedType.label}（已停用）` })
    return base
  }, [types, archivedType])

  useEffect(() => { if (day > daysIn(year, month)) setDay(daysIn(year, month)) }, [year, month, day])

  const submit = (event) => {
    event.preventDefault()
    const timeStr = `${pad2(hour)}:${pad2(minute)}`
    const recordedAt = combineToIso(year, month, day, timeStr) || detail.recorded_at
    onSave({
      title: title.trim() || null,
      text_raw: text,
      type_id: typeId || null,
      recorded_at: recordedAt,
      // 只提交仍处于 ready 的已有附件。未就绪项（历史上传失败的残留）不进清单，
      // 后端会把它当作过期资产一并清理（inspirations.js 的 staleAssets 分支）。
      keptAssetIds: keptAssets.filter((asset) => asset.status === 'ready').map((asset) => asset.asset_id),
    })
  }

  const removeKept = (assetId) => setKeptAssets((current) => current.filter((asset) => asset.asset_id !== assetId))

  const openCapture = (mode) => {
    if (!isSecureContextSupported()) {
      uploader.setError('拍照 / 录音需要 HTTPS 或 localhost 安全环境')
      return
    }
    setOverlay(mode)
  }

  const handleCaptured = ({ blob, kind, mime, durationMs }) => {
    setOverlay(null)
    uploader.addCaptured({ blob, kind, mime, durationMs, label: kind === 'image' ? '照片' : '录音' })
  }

  // 选完文件后立刻清空 input.value，保证连续选择同一个文件时仍会触发 change
  const onFilePicked = (kind) => (event) => {
    uploader.addFiles(kind, event.target.files)
    event.target.value = ''
  }

  return (
    <form className="detail-edit-form" onSubmit={submit}>
      {error && <p className="detail-error" role="alert">{error}</p>}
      <div className="edit-wheel-row" role="group" aria-label="发生日期与时间">
        <DateWheel col="year" values={yearValues} index={yearValues.indexOf(year)} onIndexChange={(i) => setYear(yearValues[i])} ariaLabel="年份" compact />
        <DateWheel col="month" values={monthValues} index={month - 1} onIndexChange={(i) => setMonth(i + 1)} ariaLabel="月份" compact />
        <DateWheel col="day" values={dayValues} index={day - 1} onIndexChange={(i) => setDay(i + 1)} ariaLabel="日" compact />
        <div className="wheel-divider" aria-hidden="true" />
        <DateWheel col="hour" values={hourValues} index={hour} onIndexChange={setHour} ariaLabel="时" compact />
        <DateWheel col="minute" values={minuteValues} index={minute} onIndexChange={setMinute} ariaLabel="分" compact />
      </div>
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
      <div className="detail-edit-attachments">
        <span className="detail-field-label">素材</span>

        {/* 已有附件：删除只移除本地保留项，保存时由后端统一清理 */}
        {keptAssets.length > 0 && (
          <div className="edit-att-list">
            {keptAssets.map((attachment, index) => (
              <EditAttachmentView attachment={attachment} key={attachment.asset_id || `${attachment.kind}-${index}`} onRemove={removeKept} />
            ))}
          </div>
        )}

        {/* 本次新增的本地附件 */}
        {uploader.items.length > 0 && (
          <div className="edit-att-list">
            {uploader.items.map((item) => (
              <PendingAttachmentView attachment={item} key={item.id} onRemove={() => uploader.remove(item.id)} />
            ))}
          </div>
        )}

        <div className="edit-att-add" role="group" aria-label="添加素材">
          <button type="button" className="edit-att-add-btn" onClick={() => imageInputRef.current?.click()} disabled={busy}>＋ 选图</button>
          <button type="button" className="edit-att-add-btn" onClick={() => audioInputRef.current?.click()} disabled={busy}>＋ 选音频</button>
          <button type="button" className="edit-att-add-btn" onClick={() => openCapture('camera')} disabled={busy}>📷 拍照</button>
          <button type="button" className="edit-att-add-btn" onClick={() => openCapture('record')} disabled={busy}>🎙 录音</button>
        </div>
        <p className="edit-att-hint">图片单个最大 20MB；音频最长 1 分钟。删除与新增都在点「保存修改」后统一生效。</p>
        <input ref={imageInputRef} type="file" accept="image/*" multiple hidden onChange={onFilePicked('image')} tabIndex={-1} />
        <input ref={audioInputRef} type="file" accept="audio/*" multiple hidden onChange={onFilePicked('audio')} tabIndex={-1} />
        {uploader.notice && <p className="edit-att-notice" role="status">{uploader.notice}</p>}
      </div>

      {/* 拍照/录音浮层渲染在抽屉内部：.detail-overlay(z-index:1100) 自身就是层叠上下文，
          浮层的 z-index:50 只需在它内部高于 .detail-panel（z-index:auto）即可置顶。
          若改用 portal 挂到 body，反而会掉到 1100 之下被抽屉盖住。 */}
      {overlay && (
        <MediaCaptureOverlay mode={overlay} onCancel={() => setOverlay(null)} onCaptured={handleCaptured} />
      )}
      <div className="detail-edit-actions">
        <button type="button" className="detail-btn" onClick={onCancel} disabled={busy}>取消</button>
        <button type="submit" className="detail-btn primary" disabled={busy}>{busy ? '保存中…' : '保存修改'}</button>
      </div>
    </form>
  )
}

export default function InspirationDetailDrawer({ inspirationId, onClose, onChanged, initialMode = 'view' }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('view')
  const [types, setTypes] = useState([])
  const [archivedType, setArchivedType] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // 新增附件队列（本地 Blob → 预签名 → OSS → complete），与已有服务端附件分开管理
  const uploader = useAttachmentUploader(inspirationId)
  const closeAttemptRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await getInspiration(inspirationId)
      const data = result.data
      setDetail(data)
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
    setMode(initialMode)
    setConfirmingDelete(false)
    setActionError('')
    closeAttemptRef.current = false
    load()
    getInspirationTypes().then((result) => setTypes(result.data || [])).catch(() => {})
  }, [load, initialMode])

  const handleSave = async (patch) => {
    const { keptAssetIds = [], ...fields } = patch
    setBusy(true)
    setActionError('')
    try {
      // 先上传本次新增附件，再合并出最终资产清单交给后端；后端会把不在清单里的
      // 旧附件统一标记为 deleting 并入库删除任务（inspirations.js 的 staleAssets 分支）。
      const uploadedIds = await uploader.uploadAll()
      const result = await updateInspiration(inspirationId, {
        ...fields,
        sync_status: 'synced',
        asset_ids: [...keptAssetIds, ...uploadedIds],
      })
      setDetail((previous) => ({ ...previous, ...result.data }))
      uploader.reset()
      setMode('view')
      onChanged?.()
    } catch (err) {
      setActionError(err.message || '保存失败')
    } finally {
      setBusy(false)
    }
  }

  // 上传途中关闭会中断请求：首次点击给提示，再次点击才强制关闭，
  // 既避免误关丢失已选附件，也保证上传卡住时仍有逃生出口。
  const requestClose = () => {
    if (mode === 'edit' && uploader.busy) {
      if (!closeAttemptRef.current) {
        closeAttemptRef.current = true
        setActionError('附件仍在上传，关闭会中断上传。再次点击可强制关闭。')
        return
      }
    }
    closeAttemptRef.current = false
    onClose()
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
    }
  }

  const typeToken = archivedType?.color_token || detail?.color_token

  return (
    <div className="detail-overlay" role="dialog" aria-modal="true" aria-label="灵感详情" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose() }}>
      <div className="detail-panel">
        <header className="detail-head">
          <strong>{mode === 'edit' ? '编辑灵感' : (detail?.title || '灵感详情')}</strong>
          <button type="button" className="detail-close" aria-label="关闭" onClick={requestClose}>×</button>
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
              <InspirationDeleteConfirmModal
                message={DELETE_MESSAGES[0]}
                onConfirm={handleDelete}
                onCancel={() => { setConfirmingDelete(false); setActionError('') }}
                busy={busy}
                error={actionError}
              />
            )}
          </div>
        )}

        {!loading && !error && detail && mode === 'edit' && (
          <div className="detail-body">
            <EditForm
              detail={detail}
              types={types}
              archivedType={archivedType}
              uploader={uploader}
              onSave={handleSave}
              onCancel={() => { setMode('view'); setActionError('') }}
              busy={busy}
              error={actionError || uploader.error}
            />
          </div>
        )}
      </div>
    </div>
  )
}
