import { useCallback, useEffect, useRef, useState } from 'react'
import TopNav from '../components/TopNav.jsx'
import ModeToolbar from '../components/ModeToolbar.jsx'
import TypeSelect from '../components/TypeSelect.jsx'
import CosmosBackground from '../components/CosmosBackground.jsx'
import MediaCaptureOverlay from '../components/MediaCaptureOverlay.jsx'
import { isSecureContextSupported } from '../lib/secure.js'
import { createInspiration, createInspirationType, deleteAsset, getInspirationTypes, updateInspiration, uploadAsset } from '../lib/api.js'
import { deleteDraft, getAllDrafts, saveCompleteDraft } from '../lib/draftStore.js'
import { validateLocalAsset } from '../lib/assetUpload.js'
import './CapturePage.css'

const pad = (n) => String(n).padStart(2, '0')
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const newId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
const localDateStamp = (value) => {
  const date = new Date(value)
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日 · ${WEEK[date.getDay()]} · ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function CapturePage() {
  const [draftId, setDraftId] = useState(() => newId())
  const [recordedAt, setRecordedAt] = useState(() => new Date().toISOString())
  const [mode, setMode] = useState('image')
  const [type, setType] = useState('想法')
  const [typeId, setTypeId] = useState('')
  const [typeIssue, setTypeIssue] = useState('')
  const [types, setTypes] = useState([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState('saved')
  const [savedText, setSavedText] = useState('尚未保存')
  const [overlay, setOverlay] = useState(null)
  const [note, setNote] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [draftDirty, setDraftDirty] = useState(false)
  const [attachments, setAttachments] = useState([])
  const saveTimer = useRef(null)
  const pulseTimer = useRef(null)
  const attachmentsRef = useRef([])

  const snapshot = useCallback((attachmentList = attachmentsRef.current) => ({
    draft_id: draftId,
    title,
    text_raw: body,
    type_label: type,
    type_id: typeId || undefined,
    recorded_at: recordedAt,
    local_status: 'pending',
    sync_status: 'local',
    attachments: attachmentList.map(({ src, ...asset }) => asset),
  }), [body, draftId, recordedAt, title, type, typeId])

  const persistAttachmentState = useCallback(async (attachmentList) => {
    attachmentsRef.current = attachmentList
    setAttachments(attachmentList)
    await saveCompleteDraft(snapshot(attachmentList))
  }, [snapshot])

  const saveDraftNow = useCallback(async (reason = 'manual') => {
    setStatus('saving')
    setSavedText('正在保存草稿…')
    try {
      await saveCompleteDraft(snapshot())
      const now = new Date()
      setStatus('saved')
      setDraftDirty(false)
      setSavedText(reason === 'auto' ? `草稿已保存 · ${pad(now.getHours())}:${pad(now.getMinutes())}` : '草稿已保存')
      return true
    } catch (error) {
      setStatus('error')
      setSavedText('草稿保存失败')
      setNote(`草稿保存失败：${error.message || 'IndexedDB 写入失败'}`)
      return false
    }
  }, [snapshot])

  useEffect(() => {
    let active = true
    getAllDrafts().then((drafts) => {
      if (!active || !drafts.length) { if (active) setHydrated(true); return }
      const draft = drafts[0]
      setDraftId(draft.draft_id || draftId)
      setRecordedAt(draft.recorded_at || new Date().toISOString())
      setTitle(draft.title || '')
      setBody(draft.text_raw || '')
      setType(draft.type_label || '想法')
      setTypeId(draft.type_id || '')
      setTypeIssue('')
      const restoredAttachments = (draft.attachments || []).map((asset) => ({ ...asset, src: asset.blob ? URL.createObjectURL(asset.blob) : '' }))
      attachmentsRef.current = restoredAttachments
      setAttachments(restoredAttachments)
      setSavedText('已恢复本地草稿')
      setStatus('saved')
      setHydrated(true)
    }).catch((error) => {
      if (active) { setHydrated(true); setStatus('error'); setSavedText('草稿读取失败'); setNote(`无法读取本地草稿：${error.message}`) }
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    getInspirationTypes().then((result) => { if (active) setTypes(result.data || []) }).catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!types.length) return
    const matchedById = typeId ? types.find((item) => item.id === typeId) : null
    const matchedByLabel = types.find((item) => item.label === type)
    if (matchedById) {
      if (matchedById.label !== type) setType(matchedById.label)
      setTypeIssue('')
      return
    }
    if (matchedByLabel) {
      if (typeId !== matchedByLabel.id) setTypeId(matchedByLabel.id)
      setTypeIssue('')
      return
    }
    if (typeId) {
      setTypeId('')
      setTypeIssue('本地草稿中的灵感类型已失效，请重新选择类型后再提交。')
    }
  }, [type, typeId, types])

  useEffect(() => {
    if (!hydrated || submitting || !draftDirty) return undefined
    setStatus('saving')
    setSavedText('等待自动保存…')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { saveDraftNow('auto') }, 2000)
    return () => clearTimeout(saveTimer.current)
  }, [attachments, body, draftDirty, hydrated, saveDraftNow, submitting, title, type, typeId])

  useEffect(() => () => {
    clearTimeout(saveTimer.current)
    clearTimeout(pulseTimer.current)
  }, [])
  // 软键盘弹出时上抬底部工具栏，避免被遮挡（移动端真机有效）
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return undefined
    const apply = () => {
      const kb = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      document.documentElement.style.setProperty('--kb-offset', kb > 0 ? `${kb}px` : '0px')
    }
    viewport.addEventListener('resize', apply)
    viewport.addEventListener('scroll', apply)
    apply()
    return () => {
      viewport.removeEventListener('resize', apply)
      viewport.removeEventListener('scroll', apply)
      document.documentElement.style.removeProperty('--kb-offset')
    }
  }, [])
  useEffect(() => { attachmentsRef.current = attachments }, [attachments])
  useEffect(() => () => {
    attachmentsRef.current.forEach((asset) => { if (asset.src?.startsWith('blob:')) URL.revokeObjectURL(asset.src) })
  }, [])

  const addAttachment = async ({ blob, kind, mime, durationMs = 0, label }) => {
    try {
      validateLocalAsset({ kind, mime, bytes: blob.size, durationMs })
    } catch (error) {
      setStatus('error'); setSavedText('草稿保存失败'); setNote(error.message); return
    }
    const id = newId()
    const src = URL.createObjectURL(blob)
    const nextAttachments = [...attachmentsRef.current, { id, kind, label: label || (kind === 'image' ? '图片' : '语音'), mime, blob, src, durationMs, pendingUpload: false, failed: false }]
    setStatus('saving')
    setSavedText('正在保存附件草稿…')
    try {
      await saveCompleteDraft(snapshot(nextAttachments))
      attachmentsRef.current = nextAttachments
      setAttachments(nextAttachments)
      setDraftDirty(false)
      setStatus('saved')
      setSavedText('草稿已保存')
      setNote(kind === 'audio' ? '音频已加入草稿，提交灵感时上传；最长 1 分钟。' : '图片已加入草稿，提交灵感时上传；单个最大 20MB。')
    } catch (error) {
      URL.revokeObjectURL(src)
      setStatus('error')
      setSavedText('草稿保存失败')
      setNote(`草稿保存失败：${error.message || '附件 Blob 未能写入 IndexedDB'}`)
    }
  }

  const removeAttachment = async (id) => {
    if (submitting) return
    const target = attachmentsRef.current.find((item) => item.id === id)
    if (!target) return
    const nextAttachments = attachmentsRef.current.filter((item) => item.id !== id)
    setStatus('saving')
    setSavedText('正在移除附件…')
    try {
      // 先确认本地草稿已不再引用附件，再请求远端删除，避免远端已删除而恢复草稿仍指向旧 asset_id。
      await saveCompleteDraft(snapshot(nextAttachments))
      attachmentsRef.current = nextAttachments
      setAttachments(nextAttachments)
      setDraftDirty(false)
      if (target.src?.startsWith('blob:')) URL.revokeObjectURL(target.src)
      if (target.asset_id) await deleteAsset(target.asset_id)
      setStatus('saved')
      setSavedText('草稿已保存')
      setNote('附件已从草稿移除。')
    } catch (error) {
      setStatus('error')
      setSavedText('附件移除未完全成功')
      setNote(`附件移除未完全成功：${error.message || '请稍后重试'}。请重新检查草稿后再提交。`)
    }
  }

  const handleModeChange = (key) => {
    if (key === 'camera' || key === 'record') {
      if (!isSecureContextSupported()) { setNote('拍照 / 录音需要 HTTPS 或 localhost 安全环境'); return }
      setOverlay(key); return
    }
    setMode(key)
  }

  const handleCaptured = async ({ blob, kind, mime, durationMs }) => {
    setOverlay(null)
    await addAttachment({ blob, kind: kind === 'image' ? 'image' : 'audio', mime, durationMs, label: kind === 'image' ? '照片' : '语音' })
  }

  const readAudioDuration = (url) => new Promise((resolve) => {
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => resolve(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0)
    audio.onerror = () => resolve(0)
    audio.src = url
  })

  const handleFileSelected = async ({ kind, file }) => {
    if (!file) return
    const isImage = kind === 'image' && file.type.startsWith('image/')
    const isAudio = kind === 'audio' && file.type.startsWith('audio/')
    if (!isImage && !isAudio) { setNote('请选择有效的图片或音频文件'); return }
    const src = URL.createObjectURL(file)
    const durationMs = isAudio ? await readAudioDuration(src) : 0
    URL.revokeObjectURL(src)
    await addAttachment({ blob: file, kind, mime: file.type, durationMs, label: file.name })
  }

  const submitInspiration = async (event) => {
    event.preventDefault()
    if (submitting) return
    if (typeIssue) {
      setStatus('error')
      setSavedText('类型需要重新选择')
      setNote(typeIssue)
      return
    }
    if (!title.trim() && !body.trim() && attachmentsRef.current.length === 0) {
      setStatus('error')
      setSavedText('无法提交空白灵感')
      setNote('请至少输入标题、正文，或添加一个图片/音频附件。')
      return
    }
    const localSaved = await saveDraftNow('manual')
    if (!localSaved) return
    setSubmitting(true)
    setStatus('saving')
    setSavedText('正在提交灵感…')
    setNote('')
    let remoteCommitted = false
    try {
      const typeInput = typeId ? { type_id: typeId } : { type_label: type }
      const created = await createInspiration({
        draft_id: draftId,
        idempotency_key: draftId,
        title: title.trim() || null,
        text_raw: body,
        ...typeInput,
        recorded_at: recordedAt,
      })
      const inspirationId = created.data.id
      // 幂等重试时也先覆盖远端主记录，避免首次失败后再次编辑造成 RDS 内容陈旧。
      await updateInspiration(inspirationId, {
        title: title.trim() || null,
        text_raw: body,
        ...typeInput,
        recorded_at: recordedAt,
        sync_status: 'local',
        processing_status: 'draft',
      })
      const uploaded = []
      for (const asset of attachmentsRef.current) {
        if (asset.synced && asset.asset_id) {
          uploaded.push({ asset_id: asset.asset_id, reused: true })
          continue
        }
        if (!asset.blob) throw new Error(`附件“${asset.label || asset.id}”缺少本地文件，无法继续提交`)
        const uploading = attachmentsRef.current.map((item) => item.id === asset.id ? { ...item, pendingUpload: true, failed: false } : item)
        await persistAttachmentState(uploading)
        try {
          const result = await uploadAsset({
            blob: asset.blob,
            kind: asset.kind,
            mime: asset.mime,
            durationMs: asset.durationMs,
            inspirationId,
            assetId: asset.asset_id || asset.id,
            onPresigned: async ({ asset_id: assetId }) => {
              const presigned = attachmentsRef.current.map((item) => item.id === asset.id ? { ...item, asset_id: assetId } : item)
              await persistAttachmentState(presigned)
            },
          })
          uploaded.push(result)
          const synced = attachmentsRef.current.map((item) => item.id === asset.id ? { ...item, asset_id: result.asset_id, pendingUpload: false, failed: false, synced: true, sync_status: 'synced' } : item)
          await persistAttachmentState(synced)
        } catch (error) {
          const failed = attachmentsRef.current.map((item) => item.id === asset.id ? { ...item, pendingUpload: false, failed: true, synced: false } : item)
          try { await persistAttachmentState(failed) } catch { setAttachments(failed); attachmentsRef.current = failed }
          throw error
        }
      }
      const readyAssetIds = attachmentsRef.current.filter((asset) => asset.synced && asset.asset_id).map((asset) => asset.asset_id)
      await updateInspiration(inspirationId, { sync_status: 'synced', processing_status: 'synced', asset_ids: readyAssetIds })
      remoteCommitted = true
      // 只有远端主记录、所有附件及最终状态更新均成功后，才清理 IndexedDB 草稿。
      await deleteDraft(draftId)
      attachmentsRef.current.forEach((asset) => { if (asset.src?.startsWith('blob:')) URL.revokeObjectURL(asset.src) })
      attachmentsRef.current = []
      setAttachments([])
      setDraftId(newId())
      setRecordedAt(new Date().toISOString())
      setTitle('')
      setBody('')
      setDraftDirty(false)
      setSubmitting(false)
      setStatus('saved')
      setSavedText('已提交 / 已同步 ✓')
      setNote(`灵感与 ${uploaded.length} 个附件已完成入库，可继续记录下一条。`)
    } catch (error) {
      setSubmitting(false)
      setStatus('error')
      if (remoteCommitted) {
        setSavedText('灵感已同步，本地草稿清理失败')
        setNote(`远端已完成入库，但本地 IndexedDB 草稿清理失败：${error.message || '请稍后重试'}。本地副本已保留，不会再次显示为远端提交失败。`)
      } else {
        setSavedText('提交失败，草稿已保留')
        setNote(`提交失败：${error.message || '请稍后重试'}。本地草稿未删除，可再次提交。`)
      }
    }
  }
  const onTypeChange = (next) => { setType(next.label); setTypeId(next.id || ''); setTypeIssue(''); setDraftDirty(true) }
  const createCustomType = async (label) => {
    const result = await createInspirationType({ label, color_token: '--ink-muted' })
    setTypes((current) => [...current.filter((item) => item.id !== result.data.id), result.data])
    setTypeIssue('')
    return result.data
  }
  const statusChip = <div className={`status-chip ${status === 'saving' ? 'saving' : status === 'error' ? 'error' : 'saved'}`}><span className="dot" /><span>{savedText}</span></div>

  return <>
    <CosmosBackground variant="capture" />
    <TopNav variant="sub" title="记录灵感" backTo="/" right={statusChip} />
    <main className="capture-main">
      <p className="date-stamp reveal">{localDateStamp(recordedAt)}</p>
      <form className="editor reveal d1" id="editorForm" autoComplete="off" onSubmit={submitInspiration}>
        <input className="title-input" type="text" placeholder="给这一刻起个名字（可留空）" aria-label="标题" value={title} disabled={submitting} onChange={(e) => { setTitle(e.target.value); setDraftDirty(true) }} />
        <textarea className="body-input" placeholder={'写下此刻的想法……\n\n不必完整，先抓住那束光。\n粘贴图片、拖入文件、随时切换灵感类型。'} aria-label="正文" value={body} disabled={submitting} onChange={(e) => { setBody(e.target.value); setDraftDirty(true) }} autoFocus />
        {attachments.length > 0 && <div className="attachments" id="attachments">{attachments.map((attachment) => {
          const statusBadge = attachment.failed ? <span className="att-status failed">上传失败</span> : attachment.pendingUpload ? <span className="att-status">上传中…</span> : attachment.synced ? <span className="att-status">已上传</span> : <span className="att-status">本地草稿</span>
          if (attachment.kind === 'audio') {
            const totalSec = Math.max(0, Math.round((attachment.durationMs || 0) / 1000)); const mm = String(Math.floor(totalSec / 60)).padStart(2, '0'); const ss = String(totalSec % 60).padStart(2, '0')
            return <div className="attach audio" aria-label={attachment.label} key={attachment.id}><div className="wave" aria-hidden="true">{[30,60,80,50,90,40,70,55,85,35,65,75].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div><audio className="audio-player" src={attachment.src} controls preload="metadata" /><div className="meta"><span>{attachment.label || '灵感语音'}</span><span>{mm}:{ss}</span>{statusBadge}</div><button className="x" type="button" aria-label="移除附件" onClick={() => removeAttachment(attachment.id)} disabled={submitting}>×</button></div>
          }
          return <div className="attach" aria-label={attachment.label} key={attachment.id}><img src={attachment.src} alt={attachment.label || ''} />{statusBadge}<button className="x" type="button" aria-label="移除附件" onClick={() => removeAttachment(attachment.id)} disabled={submitting}>×</button></div>
        })}</div>}
      </form>
      <div className="dropzone-hint reveal d2">提示：图片单个最大 20MB；音频最长 1 分钟。点击「保存草稿」临时保存到当前浏览器中，点击「提交灵感」上传云端永久保存。</div>
      {note && <div className="capture-note" role="status">{note}</div>}
    </main>
    <div className="toolbar" role="toolbar" aria-label="记录工具栏"><div className="toolbar-inner"><ModeToolbar mode={mode} onModeChange={handleModeChange} onFileSelected={handleFileSelected} disabled={submitting} /><div className="action-row"><TypeSelect valueId={typeId} valueLabel={type} types={types} onChange={onTypeChange} onCreate={createCustomType} disabled={submitting} /><button className="secondary" type="button" onClick={() => saveDraftNow('manual')} disabled={submitting}>保存草稿</button><button className="primary" type="submit" form="editorForm" disabled={submitting}>{submitting ? '提交中…' : '提交灵感'}</button></div></div></div>
    {overlay && <MediaCaptureOverlay mode={overlay} onCancel={() => setOverlay(null)} onCaptured={handleCaptured} />}
  </>
}

