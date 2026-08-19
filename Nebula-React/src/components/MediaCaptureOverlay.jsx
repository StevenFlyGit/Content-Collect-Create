import { useEffect, useRef, useState } from 'react'
import './MediaCaptureOverlay.css'

// 录音模式只开音频；拍照模式保留视频 + 音频（不影响截图）。
const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
]

function pickAudioMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const t of AUDIO_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(t)) return t
  }
  return ''
}

function describeError(e) {
  if (!e) return '未知错误'
  if (e.name === 'NotAllowedError') return '摄像头/麦克风权限被拒绝，请在浏览器设置中允许后重试。'
  if (e.name === 'NotFoundError') return '未检测到摄像头或麦克风设备。'
  if (e.name === 'NotReadableError') return '拍摄设备被其他程序占用，请关闭后重试。'
  if (e.name === 'OverconstrainedError') return '没有满足要求的拍摄设备。'
  return '无法访问拍摄设备：' + (e.message || e.name || '未知错误')
}

/**
 * MediaCaptureOverlay —— 纯客户端拍照/录音浮层（PWA）
 * - 拍照(camera)：getUserMedia + canvas 截图 → image/jpeg Blob
 * - 录音(record)：MediaRecorder → webm Blob（映射为前端 audio 附件）
 * 所有设备访问错误都本地化提示，不向上抛异常打断编辑。
 */
export default function MediaCaptureOverlay({ mode, onCancel, onCaptured }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const startedAtRef = useRef(0)
  const [error, setError] = useState('')
  const [recording, setRecording] = useState(false)
  const isPhoto = mode === 'camera'

  const stopStream = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop() } catch { /* noop */ }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }

  const cleanup = () => {
    stopStream()
    onCancel()
  }

  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // 拍照时才需要视频流；录音只开音频，避免不必要的摄像头指示灯与资源占用。
          video: isPhoto,
          audio: true,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
      } catch (e) {
        setError(describeError(e))
      }
    }
    start()
    return () => {
      cancelled = true
      stopStream()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const takePhoto = () => {
    const video = videoRef.current
    if (!video) return
    const w = video.videoWidth || 1280
    const h = video.videoHeight || 720
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, w, h)
    canvas.toBlob(
      (blob) => {
        if (blob) onCaptured({ blob, kind: 'image', mime: 'image/jpeg' })
        cleanup()
      },
      'image/jpeg',
      0.9
    )
  }

  const startRecording = () => {
    const stream = streamRef.current
    if (!stream) return
    const mime = pickAudioMime()
    try {
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      startedAtRef.current = performance.now()
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        const durationMs = Math.round(performance.now() - startedAtRef.current)
        const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' })
        onCaptured({ blob, kind: 'audio', mime: blob.type || 'audio/webm', durationMs })
        cleanup()
      }
      rec.start()
      recorderRef.current = rec
      setRecording(true)
    } catch (e) {
      setError(describeError(e))
    }
  }

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    setRecording(false)
  }

  return (
    <div className="capture-overlay" role="dialog" aria-modal="true" aria-label={isPhoto ? '拍照' : '录音'}>
      <div className="capture-panel">
        <div className="capture-head">
          <span>{isPhoto ? '拍照' : '录音'}</span>
          <button type="button" className="capture-x" aria-label="关闭" onClick={cleanup}>×</button>
        </div>

        {error ? (
          <div className="capture-error" role="alert">{error}</div>
        ) : (
          <>
            <video ref={videoRef} className="capture-video" playsInline muted={!isPhoto} />
            <div className="capture-actions">
              {isPhoto ? (
                <button type="button" className="capture-shoot" onClick={takePhoto}>拍摄</button>
              ) : (
                <button
                  type="button"
                  className={`capture-shoot${recording ? ' recording' : ''}`}
                  onClick={recording ? stopRecording : startRecording}
                >
                  {recording ? '停止' : '开始'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
