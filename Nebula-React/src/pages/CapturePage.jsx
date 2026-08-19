import { useEffect, useRef, useState } from 'react'
import TopNav from '../components/TopNav.jsx'
import ModeToolbar from '../components/ModeToolbar.jsx'
import TypeSelect from '../components/TypeSelect.jsx'
import CosmosBackground from '../components/CosmosBackground.jsx'
import MediaCaptureOverlay from '../components/MediaCaptureOverlay.jsx'
import { isSecureContextSupported } from '../lib/secure.js'
import { uploadCapturedAsset } from '../lib/assetUpload.js'
import './CapturePage.css'

const DEMO_DATE = new Date(2026, 7, 18, 17, 42)
const pad = (n) => String(n).padStart(2, '0')
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const dateStamp = `${DEMO_DATE.getFullYear()} 年 ${DEMO_DATE.getMonth() + 1} 月 ${DEMO_DATE.getDate()} 日 · ${WEEK[DEMO_DATE.getDay()]} · ${pad(DEMO_DATE.getHours())}:${pad(DEMO_DATE.getMinutes())}`

const SKETCH =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><defs><linearGradient id='g'><stop offset='0' stop-color='%23a78bfa'/><stop offset='1' stop-color='%237dd3fc'/></linearGradient></defs><rect width='200' height='200' fill='url(%23g)' opacity='.3'/><text x='100' y='110' text-anchor='middle' fill='%23f5f3ed' font-family='serif' font-size='18' font-style='italic'>草图</text></svg>"
const OCR =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='200' height='200' fill='%23312e4a'/><text x='100' y='110' text-anchor='middle' fill='%23a78bfa' font-family='sans-serif' font-size='14'>OCR 中…</text></svg>"

export default function CapturePage() {
  const [mode, setMode] = useState('image')
  const [type, setType] = useState('想法')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState('saved')
  const [savedText, setSavedText] = useState('已自动保存 · 17:42')
  const [aiOpen, setAiOpen] = useState(false)
  const [typePulse, setTypePulse] = useState(false)
  const [overlay, setOverlay] = useState(null) // 'camera' | 'record' | null
  const [note, setNote] = useState('')
  const [attachments, setAttachments] = useState([
    { id: 'sketch', kind: 'image', label: '附件：草图.jpg', src: SKETCH },
    { id: 'ocr', kind: 'processing', label: '处理中', src: OCR },
  ])
  const saveTimer = useRef(null)
  const pulseTimer = useRef(null)

  useEffect(() => {
    if (!body) return undefined
    setStatus('saving')
    setSavedText('正在保存…')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setStatus('saved')
      const d = new Date()
      setSavedText(`已自动保存 · ${pad(d.getHours())}:${pad(d.getMinutes())}`)
    }, 800)
    return () => clearTimeout(saveTimer.current)
  }, [body])

  useEffect(() => {
    const timer = setTimeout(() => setAiOpen(true), 3000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => () => {
    clearTimeout(saveTimer.current)
    clearTimeout(pulseTimer.current)
  }, [])

  const removeAttachment = (id) => {
    setAttachments((items) => {
      const target = items.find((i) => i.id === id)
      if (target && target.src && target.src.startsWith('blob:')) {
        URL.revokeObjectURL(target.src)
      }
      return items.filter((item) => item.id !== id)
    })
  }

  // 拍照/录音为纯客户端 PWA 能力：安全上下文内打开浮层，其余模式切换编辑器输入态
  const handleModeChange = (key) => {
    if (key === 'camera' || key === 'record') {
      if (!isSecureContextSupported()) {
        setNote('拍照 / 录音需要 HTTPS 或 localhost 安全环境')
        return
      }
      setOverlay(key)
      return
    }
    setMode(key)
  }

  const handleCaptured = async ({ blob, kind, mime, durationMs }) => {
    const id = `cap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const label = kind === 'image' ? '照片' : '语音'
    const att = {
      id,
      kind,
      label,
      src: URL.createObjectURL(blob),
      blob,
      pendingUpload: true,
      failed: false,
      durationMs: kind === 'audio' ? (durationMs || 0) : 0,
    }
    setAttachments((items) => [...items, att])
    try {
      const { asset_id, synced } = await uploadCapturedAsset({
        blob,
        kind: kind === 'image' ? 'image' : 'audio',
        mime,
        meta: kind === 'audio' ? { duration_ms: att.durationMs } : {},
      })
      setAttachments((items) =>
        items.map((i) => (i.id === id ? { ...i, asset_id, synced, pendingUpload: false } : i))
      )
    } catch (e) {
      setAttachments((items) =>
        items.map((i) => (i.id === id ? { ...i, pendingUpload: false, failed: true } : i))
      )
      setNote('附件保存失败，已保留在本地草稿：' + (e && e.message ? e.message : '未知错误'))
    }
  }

  // 从本机文件选择器选中图片/音频：预览 + 解析真实时长 + 落库（与拍照/录音共用同一上传契约）
  const readAudioDuration = (url) =>
    new Promise((resolve) => {
      const el = document.createElement('audio')
      el.preload = 'metadata'
      el.onloadedmetadata = () =>
        resolve(Math.round((Number.isFinite(el.duration) ? el.duration : 0) * 1000))
      el.onerror = () => resolve(0)
      el.src = url
    })

  const handleFileSelected = async ({ kind, file }) => {
    if (!file) return
    const isImage = kind === 'image' && file.type.startsWith('image/')
    const isAudio = kind === 'audio' && file.type.startsWith('audio/')
    if (!isImage && !isAudio) {
      setNote(
        `不支持的文件类型：${file.name}（${file.type || '未知类型'}）。请选择图片（jpg / png 等）或音频（mp3 / wav 等）文件。`
      )
      return
    }
    const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const src = URL.createObjectURL(file)
    const durationMs = isAudio ? await readAudioDuration(src) : 0
    const att = {
      id,
      kind,
      label: kind === 'image' ? '图片' : '语音',
      src,
      blob: file,
      pendingUpload: true,
      failed: false,
      durationMs,
    }
    setAttachments((items) => [...items, att])
    try {
      const { asset_id, synced } = await uploadCapturedAsset({
        blob: file,
        kind: kind === 'image' ? 'image' : 'audio',
        mime: file.type,
        meta: kind === 'audio' ? { duration_ms: durationMs } : {},
      })
      setAttachments((items) =>
        items.map((i) => (i.id === id ? { ...i, asset_id, synced, pendingUpload: false } : i))
      )
    } catch (e) {
      setAttachments((items) =>
        items.map((i) => (i.id === id ? { ...i, pendingUpload: false, failed: true } : i))
      )
      setNote('附件保存失败，已保留在本地草稿：' + (e && e.message ? e.message : '未知错误'))
    }
  }

  const onTypeChange = (next) => {
    setType(next)
    setAiOpen(false)
  }

  const onAcceptAi = () => {
    setType('引用')
    setAiOpen(false)
  }

  const onSubmit = (e) => {
    e.preventDefault()
    setStatus('saved')
    setSavedText('已记录 ✓')
    clearTimeout(pulseTimer.current)
    setTypePulse(true)
    pulseTimer.current = setTimeout(() => setTypePulse(false), 220)
  }

  const statusChip = (
    <div className={`status-chip ${status === 'saving' ? 'saving' : 'saved'}`}>
      <span className="dot" />
      <span>{savedText}</span>
    </div>
  )

  return (
    <>
      <CosmosBackground variant="capture" />
      <TopNav variant="sub" title="记录灵感" backTo="/" right={statusChip} />

      <main className="capture-main">
        <p className="date-stamp reveal">{dateStamp}</p>

        <form className="editor reveal d1" id="editorForm" autoComplete="off" onSubmit={onSubmit}>
          <input className="title-input" type="text" placeholder="给这一刻起个名字（可留空）" aria-label="标题" />

          <textarea
            className="body-input"
            placeholder={'写下此刻的想法……\n\n不必完整，先抓住那束光。\n粘贴图片、拖入文件、随时切换灵感类型。'}
            aria-label="正文"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            autoFocus
          />

          {attachments.length > 0 && (
            <div className="attachments" id="attachments">
              {attachments.map((attachment) => {
                const statusBadge = attachment.failed
                  ? <span className="att-status failed">上传失败</span>
                  : attachment.pendingUpload
                    ? <span className="att-status">上传中…</span>
                    : null
                if (attachment.kind === 'audio') {
                  const totalSec = Math.max(0, Math.round((attachment.durationMs || 0) / 1000))
                  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0')
                  const ss = String(totalSec % 60).padStart(2, '0')
                  return (
                    <div className="attach audio" aria-label={attachment.label} key={attachment.id}>
                      <div className="wave" aria-hidden="true">
                        {[30, 60, 80, 50, 90, 40, 70, 55, 85, 35, 65, 75].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}
                      </div>
                      <audio
                        className="audio-player"
                        src={attachment.src}
                        controls
                        preload="metadata"
                      />
                      <div className="meta">
                        <span>灵感语音</span>
                        <span>{`${mm}:${ss}`}</span>
                        {statusBadge}
                      </div>
                      <button className="x" type="button" aria-label="移除附件" onClick={() => removeAttachment(attachment.id)}>×</button>
                    </div>
                  )
                }
                return (
                  <div className={`attach${attachment.kind === 'processing' ? ' processing' : ''}`} aria-label={attachment.label} key={attachment.id}>
                    <img src={attachment.src} alt="" />
                    {attachment.kind !== 'processing' && statusBadge}
                    {attachment.kind !== 'processing' && <button className="x" type="button" aria-label="移除附件" onClick={() => removeAttachment(attachment.id)}>×</button>}
                  </div>
                )
              })}
            </div>
          )}

          {aiOpen && (
            <div className="ai-suggest" id="aiSuggest">
              <span className="badge">AI</span>
              <span>看起来像 <strong>「引用」</strong>，要切换吗？</span>
              <button type="button" onClick={onAcceptAi}>接受</button>
            </div>
          )}
        </form>

        <div className="dropzone-hint reveal d2">
          提示：点击「图片」/「音频」从本机选择文件；也可粘贴图片、拖拽文件到上方；移动端支持拍照与录音（需 HTTPS / localhost）。
        </div>
        {note && (
          <div className="capture-note" role="status">{note}</div>
        )}
      </main>

      <div className="toolbar" role="toolbar" aria-label="记录工具栏">
        <div className="toolbar-inner">
          <ModeToolbar mode={mode} onModeChange={handleModeChange} onFileSelected={handleFileSelected} />
          <div className="action-row">
            <TypeSelect value={type} onChange={onTypeChange} pulse={typePulse} />
            <button className="primary" type="submit" form="editorForm">
              保存灵感 <span aria-hidden="true">⌘↵</span>
            </button>
          </div>
        </div>
      </div>

      {overlay && (
        <MediaCaptureOverlay
          mode={overlay}
          onCancel={() => setOverlay(null)}
          onCaptured={handleCaptured}
        />
      )}
    </>
  )
}

