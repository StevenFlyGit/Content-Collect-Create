import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  const [dragId, setDragId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const [seekingId, setSeekingId] = useState(null)
  const emptyPointerDrag = () => ({
    active: false, id: null, overId: null, overAfter: false,
    startX: 0, startY: 0, grabOffsetX: 0, grabOffsetY: 0,
    width: 120, height: 120, x: 0, y: 0,
  })
  const [pointerDrag, setPointerDrag] = useState(emptyPointerDrag())
  const saveTimer = useRef(null)
  const pulseTimer = useRef(null)
  const attachmentsRef = useRef([])
  const imageRowRef = useRef(null)
  const emptyDragStart = () => ({ id: null, x: 0, y: 0, timer: null, pointerType: '', pointerId: null, element: null })
  const dragStartRef = useRef(emptyDragStart())
  const pointerDragRef = useRef(pointerDrag)
  const endPointerDragRef = useRef(null)

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
  useEffect(() => { pointerDragRef.current = pointerDrag }, [pointerDrag])
  useEffect(() => { endPointerDragRef.current = endPointerDrag })
  // 兜底：指针在组件外松开或被系统取消时也要收尾，避免长按计时器悬空启动拖拽
  useEffect(() => {
    const onPointerFinish = () => {
      if (pointerDragRef.current.active) { endPointerDragRef.current?.(); return }
      if (!dragStartRef.current.id) return
      clearTimeout(dragStartRef.current.timer)
      dragStartRef.current = emptyDragStart()
    }
    window.addEventListener('pointerup', onPointerFinish)
    window.addEventListener('pointercancel', onPointerFinish)
    return () => {
      window.removeEventListener('pointerup', onPointerFinish)
      window.removeEventListener('pointercancel', onPointerFinish)
    }
  }, [])
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

  const reorderAttachment = (sourceId, targetId, placeAfter = false) => {
    if (!sourceId || sourceId === targetId) return
    const next = [...attachmentsRef.current]
    const from = next.findIndex((item) => item.id === sourceId)
    if (from < 0) return
    const [moved] = next.splice(from, 1)
    let to = next.findIndex((item) => item.id === targetId)
    if (to < 0) return
    if (placeAfter) to += 1
    next.splice(to, 0, moved)
    persistAttachmentState(next)
  }

  const handleAttachmentDrop = (targetId) => {
    setDragOverId(null)
    // 保持原有语义：源在目标之前时，落到目标之后；源在目标之后时，落到目标之前
    const from = attachmentsRef.current.findIndex((item) => item.id === dragId)
    const to = attachmentsRef.current.findIndex((item) => item.id === targetId)
    reorderAttachment(dragId, targetId, from >= 0 && to >= 0 && from < to)
    setDragId(null)
  }

  const handleAttachmentDragEnter = (e, targetId) => {
    e.preventDefault()
    if (dragId && dragId !== targetId) setDragOverId(targetId)
  }

  const handleAttachmentDragLeave = (e, targetId) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOverId((current) => (current === targetId ? null : current))
  }

  const handleAttachmentKeyDown = (id) => (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const from = attachmentsRef.current.findIndex((item) => item.id === id)
    const to = from + (e.key === 'ArrowLeft' ? -1 : 1)
    if (from < 0 || to < 0 || to >= attachmentsRef.current.length) return
    // 向右移动需插入到目标之后（目标在移除源项后索引前移一位）
    reorderAttachment(id, attachmentsRef.current[to].id, e.key === 'ArrowRight')
  }

  const clearDragState = () => { setDragId(null); setDragOverId(null) }

  // 找到指针下方最近的图片卡片，并按指针位于其中心线左/右判断插入到前或后
  const findDragOverTarget = (clientX) => {
    const cards = imageRowRef.current?.querySelectorAll('[data-attach-id]')
    if (!cards || !cards.length) return null
    let nearest = null
    let minDist = Infinity
    cards.forEach((card) => {
      const id = card.dataset.attachId
      if (id === pointerDrag.id) return
      const rect = card.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const dist = Math.abs(clientX - centerX)
      if (dist < minDist) { minDist = dist; nearest = { id, after: clientX > centerX } }
    })
    return nearest
  }

  // 拖拽激活时记录：指针初始坐标(startX/startY)、图标原始位置与尺寸(rect)、
  // 以及按下点相对图标左上角的抓取偏移(grabOffset)。之后拖动全程用
  // 「原始位置 + 相对位移」更新图标坐标，而不是直接套用绝对指针位置，
  // 保证手按在图标的哪个点、拖动中图标就跟在哪个点，激活瞬间零跳变。
  const startPointerDrag = (id, clientX, clientY, element) => {
    const rect = element?.getBoundingClientRect?.()
    setPointerDrag({
      active: true,
      id,
      overId: id,
      overAfter: false,
      startX: clientX,
      startY: clientY,
      grabOffsetX: rect ? clientX - rect.left : 60,
      grabOffsetY: rect ? clientY - rect.top : 60,
      width: rect?.width || 120,
      height: rect?.height || 120,
      x: clientX,
      y: clientY,
    })
  }

  const handleImagePointerDown = (id) => (e) => {
    if (e.target.closest('button') || submitting) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const element = e.currentTarget
    const pointerId = e.pointerId
    const { clientX, clientY } = e
    const isMouse = e.pointerType === 'mouse'
    // 鼠标立即捕获指针，保证拖出容器后仍能收到移动/松开事件；触屏延迟捕获以保留页面滚动手势
    if (isMouse) {
      try { element.setPointerCapture(pointerId) } catch { /* 忽略捕获失败 */ }
    }
    dragStartRef.current = {
      id,
      x: clientX,
      y: clientY,
      pointerType: e.pointerType || 'mouse',
      pointerId,
      element,
      // 触屏/触控笔：长按 220ms 后进入拖拽；鼠标不依赖长按，由移动阈值直接触发
      timer: isMouse ? null : setTimeout(() => {
        if (dragStartRef.current.id !== id) return
        try { element.setPointerCapture(pointerId) } catch { /* 某些浏览器在延迟后捕获可能失败，忽略 */ }
        startPointerDrag(id, clientX, clientY, element)
      }, 220),
    }
  }

  const handleImagePointerMove = (e) => {
    const { clientX, clientY } = e
    if (!pointerDrag.active) {
      const start = dragStartRef.current
      if (!start.id) return
      const dx = clientX - start.x
      const dy = clientY - start.y
      if (Math.hypot(dx, dy) <= 8) return
      if (start.pointerType === 'mouse') {
        // 鼠标：移动超过 8px 阈值立即开始拖拽
        startPointerDrag(start.id, clientX, clientY, start.element)
        return
      }
      // 触屏/触控笔：长按生效前发生移动视为滚动意图，取消本次拖拽
      clearTimeout(start.timer)
      dragStartRef.current = emptyDragStart()
      return
    }
    e.preventDefault()
    const target = findDragOverTarget(clientX)
    const overId = target?.id || pointerDrag.id
    const overAfter = target ? target.after : false
    setPointerDrag((prev) => ({ ...prev, overId, overAfter, x: clientX, y: clientY }))
  }

  const endPointerDrag = () => {
    const { id, overId, overAfter, startX, startY, x, y } = pointerDragRef.current
    // 同步清空 ref，保证同一次 pointerup 在元素/容器/窗口多级监听中只收尾一次
    pointerDragRef.current = emptyPointerDrag()
    setPointerDrag(emptyPointerDrag())
    // 松手时总位移低于阈值视为点按/误触，不触发重排
    const movedEnough = Math.hypot(x - startX, y - startY) >= 6
    if (movedEnough && id && overId && id !== overId) reorderAttachment(id, overId, overAfter)
    clearTimeout(dragStartRef.current.timer)
    dragStartRef.current = emptyDragStart()
  }

  const handleImagePointerUp = () => {
    if (!pointerDragRef.current.active) {
      clearTimeout(dragStartRef.current.timer)
      dragStartRef.current = emptyDragStart()
      return
    }
    endPointerDrag()
  }

  const handleImagePointerCancel = () => {
    clearTimeout(dragStartRef.current.timer)
    dragStartRef.current = emptyDragStart()
    setPointerDrag(emptyPointerDrag())
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

  const addAttachmentsBatch = async (items) => {
    const valid = []
    const errors = []
    for (const item of items) {
      try {
        validateLocalAsset({ kind: item.kind, mime: item.mime, bytes: item.blob.size, durationMs: item.durationMs || 0 })
        valid.push(item)
      } catch (error) {
        errors.push(`${item.label || '未命名文件'}：${error.message}`)
      }
    }
    if (!valid.length) {
      setStatus('error')
      setSavedText('草稿保存失败')
      setNote(errors.join('；') || '没有可添加的附件')
      return
    }
    const nextAttachments = [...attachmentsRef.current]
    const createdSrcs = []
    for (const item of valid) {
      const id = newId()
      const src = URL.createObjectURL(item.blob)
      createdSrcs.push(src)
      nextAttachments.push({ id, kind: item.kind, label: item.label || (item.kind === 'image' ? '图片' : '语音'), mime: item.mime, blob: item.blob, src, durationMs: item.durationMs || 0, pendingUpload: false, failed: false })
    }
    setStatus('saving')
    setSavedText('正在保存附件草稿…')
    try {
      await saveCompleteDraft(snapshot(nextAttachments))
      attachmentsRef.current = nextAttachments
      setAttachments(nextAttachments)
      setDraftDirty(false)
      setStatus('saved')
      setSavedText('草稿已保存')
      const kindText = valid.every((i) => i.kind === 'image') ? '图片' : valid.every((i) => i.kind === 'audio') ? '音频' : '附件'
      const errorText = errors.length ? `；${errors.length} 个文件未通过校验：${errors.slice(0, 2).join('；')}${errors.length > 2 ? '等' : ''}` : ''
      setNote(`${valid.length} 个${kindText}已加入草稿，提交灵感时上传${errorText}`)
    } catch (error) {
      createdSrcs.forEach((s) => { if (s?.startsWith('blob:')) URL.revokeObjectURL(s) })
      setStatus('error')
      setSavedText('草稿保存失败')
      setNote(`草稿保存失败：${error.message || '附件 Blob 未能写入 IndexedDB'}`)
    }
  }

  const handleFileSelected = async ({ kind, files, file }) => {
    const sourceFiles = files || (file ? [file] : [])
    if (!sourceFiles.length) return
    const items = []
    for (const f of sourceFiles) {
      const isImage = kind === 'image' && f.type.startsWith('image/')
      const isAudio = kind === 'audio' && f.type.startsWith('audio/')
      if (!isImage && !isAudio) continue
      if (isAudio) {
        const src = URL.createObjectURL(f)
        const durationMs = await readAudioDuration(src)
        URL.revokeObjectURL(src)
        items.push({ blob: f, kind, mime: f.type, durationMs, label: f.name })
      } else {
        items.push({ blob: f, kind, mime: f.type, durationMs: 0, label: f.name })
      }
    }
    if (!items.length) { setNote('请选择有效的图片或音频文件'); return }
    await addAttachmentsBatch(items)
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
    const result = await createInspirationType({ label })
    setTypes((current) => [...current.filter((item) => item.id !== result.data.id), result.data])
    setTypeIssue('')
    return result
  }
  const handleArchivedActiveType = (type) => {
    setType('先不分类')
    setTypeId('')
    setTypeIssue(`当前选中的类型“${type.label}”已停用，已为你回退为“先不分类”。`)
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
        {attachments.length > 0 && (
          <div className="attachments" id="attachments">
            {attachments.some((a) => a.kind === 'audio') && (
              <>
                {attachments.filter((a) => a.kind === 'audio').map((attachment) => {
                  const statusBadge = attachment.failed ? <span className="att-status failed">上传失败</span> : attachment.pendingUpload ? <span className="att-status">上传中…</span> : attachment.synced ? <span className="att-status">已上传</span> : <span className="att-status">本地草稿</span>
                  const totalSec = Math.max(0, Math.round((attachment.durationMs || 0) / 1000)); const mm = String(Math.floor(totalSec / 60)).padStart(2, '0'); const ss = String(totalSec % 60).padStart(2, '0')
                  return (
                    <div className={`attach audio ${dragId === attachment.id ? 'dragging' : ''} ${dragOverId === attachment.id ? 'drag-over' : ''}`} aria-label={attachment.label} key={attachment.id}
                      draggable
                      tabIndex={0}
                      onDragStart={(e) => { if (e.target.closest('audio')) { e.preventDefault(); return } setDragId(attachment.id); e.dataTransfer.effectAllowed = 'move' }}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                      onDragEnter={(e) => handleAttachmentDragEnter(e, attachment.id)}
                      onDragLeave={(e) => handleAttachmentDragLeave(e, attachment.id)}
                      onDrop={(e) => { e.preventDefault(); handleAttachmentDrop(attachment.id) }}
                      onDragEnd={clearDragState}
                      onKeyDown={handleAttachmentKeyDown(attachment.id)}
                    >
                      <div className={`wave ${seekingId === attachment.id ? 'paused' : ''}`} aria-hidden="true">{[30,60,80,50,90,40,70,55,85,35,65,75].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
                      <audio className="audio-player" src={attachment.src} controls preload="metadata" disabled={attachment.failed} onSeeking={() => setSeekingId(attachment.id)} onSeeked={() => setSeekingId(null)} />
                      <div className="meta"><span>{attachment.label || '灵感语音'}</span><span>{mm}:{ss}</span>{statusBadge}</div>
                      <button className="x" type="button" aria-label="移除附件" onClick={() => removeAttachment(attachment.id)} disabled={submitting}>×</button>
                    </div>
                  )
                })}
              </>
            )}
            {attachments.some((a) => a.kind !== 'audio') && (
              <div
                className={`image-row ${pointerDrag.active ? 'is-dragging' : ''}`}
                role="list"
                aria-label="图片附件"
                ref={imageRowRef}
                onPointerMove={handleImagePointerMove}
                onPointerUp={handleImagePointerUp}
                onPointerCancel={handleImagePointerCancel}
              >
                {attachments.filter((a) => a.kind !== 'audio').map((attachment) => {
                  const statusBadge = attachment.failed ? <span className="att-status failed">上传失败</span> : attachment.pendingUpload ? <span className="att-status">上传中…</span> : attachment.synced ? <span className="att-status">已上传</span> : <span className="att-status">本地草稿</span>
                  const isDragging = pointerDrag.active && pointerDrag.id === attachment.id
                  const isOver = pointerDrag.active && pointerDrag.overId === attachment.id && pointerDrag.overId !== attachment.id
                  return (
                    <div
                      className={`attach ${isDragging ? 'dragging' : ''} ${isOver ? 'drag-over' : ''}`}
                      role="listitem"
                      aria-label={attachment.label}
                      data-attach-id={attachment.id}
                      key={attachment.id}
                      tabIndex={0}
                      onPointerDown={handleImagePointerDown(attachment.id)}
                      onPointerUp={handleImagePointerUp}
                      onPointerCancel={handleImagePointerCancel}
                      onContextMenu={(e) => { if (pointerDrag.active || dragStartRef.current.id) e.preventDefault() }}
                      onKeyDown={handleAttachmentKeyDown(attachment.id)}
                    >
                      <img src={attachment.src} alt={attachment.label || ''} draggable={false} />
                      {statusBadge}
                      <button className="x" type="button" aria-label="移除附件" onClick={() => removeAttachment(attachment.id)} disabled={submitting}>×</button>
                    </div>
                  )
                })}
                {pointerDrag.active && (() => {
                  const asset = attachments.find((a) => a.id === pointerDrag.id)
                  if (!asset) return null
                  // 通过 Portal 渲染到 document.body：祖先 .reveal 动画带有 transform，
                  // 会把 position:fixed 的包含块变成自身，导致 left/top(来自 clientX/clientY
                  // 视口坐标)被按表单局部坐标解释——这正是「长按后图标跳到远处」的根因。
                  // 渲染到 body 后 fixed 坐标系与视口统一，偏移问题彻底消除。
                  return createPortal(
                    <div
                      className="attach drag-ghost"
                      style={{
                        left: pointerDrag.x - pointerDrag.grabOffsetX,
                        top: pointerDrag.y - pointerDrag.grabOffsetY,
                        width: pointerDrag.width,
                        height: pointerDrag.height,
                      }}
                      aria-hidden="true"
                    >
                      <img src={asset.src} alt="" draggable={false} />
                    </div>,
                    document.body,
                  )
                })()}
              </div>
            )}
          </div>
        )}
      </form>
      <div className="dropzone-hint reveal d2">提示：图片单个最大 20MB；音频最长 1 分钟。点击「保存草稿」临时保存到当前浏览器中，点击「提交灵感」上传云端永久保存。</div>
      {note && <div className="capture-note" role="status">{note}</div>}
    </main>
    <div className="toolbar" role="toolbar" aria-label="记录工具栏"><div className="toolbar-inner"><ModeToolbar mode={mode} onModeChange={handleModeChange} onFileSelected={handleFileSelected} disabled={submitting} /><div className="action-row"><TypeSelect valueId={typeId} valueLabel={type} types={types} onChange={onTypeChange} onCreate={createCustomType} onTypesChange={setTypes} onArchivedActive={handleArchivedActiveType} disabled={submitting} /><button className="secondary" type="button" onClick={() => saveDraftNow('manual')} disabled={submitting}>保存草稿</button><button className="primary" type="submit" form="editorForm" disabled={submitting}>{submitting ? '提交中…' : '提交灵感'}</button></div></div></div>
    {overlay && <MediaCaptureOverlay mode={overlay} onCancel={() => setOverlay(null)} onCaptured={handleCaptured} />}
  </>
}

