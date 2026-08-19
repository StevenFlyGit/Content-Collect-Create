import { useEffect, useRef, useState } from 'react'
import TopNav from '../components/TopNav.jsx'
import ModeToolbar from '../components/ModeToolbar.jsx'
import TypeSelect from '../components/TypeSelect.jsx'
import CosmosBackground from '../components/CosmosBackground.jsx'
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
  const [attachments, setAttachments] = useState([
    { id: 'sketch', kind: 'image', label: '附件：草图.jpg', src: SKETCH },
    { id: 'audio', kind: 'audio', label: '音频：01:24' },
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
    setAttachments((items) => items.filter((item) => item.id !== id))
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
                if (attachment.kind === 'audio') {
                  return (
                    <div className="attach audio" aria-label={attachment.label} key={attachment.id}>
                      <div className="wave" aria-hidden="true">
                        {[30, 60, 80, 50, 90, 40, 70, 55, 85, 35, 65, 75].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}
                      </div>
                      <div className="meta"><span>灵感语音</span><span>01:24</span></div>
                      <button className="x" type="button" aria-label="移除附件" onClick={() => removeAttachment(attachment.id)}>×</button>
                    </div>
                  )
                }
                return (
                  <div className={`attach${attachment.kind === 'processing' ? ' processing' : ''}`} aria-label={attachment.label} key={attachment.id}>
                    <img src={attachment.src} alt="" />
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
          提示：可直接粘贴图片、拖拽文件到上方；移动端后续支持拍照与录音。
        </div>
      </main>

      <div className="toolbar" role="toolbar" aria-label="记录工具栏">
        <div className="toolbar-inner">
          <ModeToolbar mode={mode} onModeChange={setMode} />
          <div className="action-row">
            <TypeSelect value={type} onChange={onTypeChange} pulse={typePulse} />
            <button className="primary" type="submit" form="editorForm">
              保存灵感 <span aria-hidden="true">⌘↵</span>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

