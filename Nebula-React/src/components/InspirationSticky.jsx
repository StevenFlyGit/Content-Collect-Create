import { useRef, useState } from 'react'
import { getAssetAccessUrl } from '../lib/api.js'
import './InspirationSticky.css'

function AssetPreview({ attachment }) {
  const [url, setUrl] = useState(attachment.preview_url || '')
  const [refreshing, setRefreshing] = useState(false)
  const [failed, setFailed] = useState(false)
  const refresh = async (event) => {
    event?.stopPropagation()
    if (!attachment.asset_id || refreshing) return
    setRefreshing(true)
    try {
      const result = await getAssetAccessUrl(attachment.asset_id)
      setUrl(result.data?.url || '')
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setRefreshing(false)
    }
  }

  if (attachment.status !== 'ready' || !url) return <span className="chip">附件（{attachment.status || '未就绪'}）</span>
  if (attachment.kind === 'img') {
    return <div className="asset-preview image-preview" onPointerDown={(event) => event.stopPropagation()}>
      <a href={url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} aria-label="打开图片附件">
        <img src={url} alt={attachment.label || '图片附件'} onError={refresh} />
      </a>
      {failed && <button type="button" className="asset-refresh" onClick={refresh} disabled={refreshing}>{refreshing ? '获取中…' : '重新获取'}</button>}
    </div>
  }
  if (attachment.kind === 'audio') {
    return <div className="asset-preview audio-preview" onPointerDown={(event) => event.stopPropagation()}>
      <audio src={url} controls preload="metadata" onError={refresh} aria-label={attachment.label || '音频附件'} />
      {failed && <button type="button" className="asset-refresh" onClick={refresh} disabled={refreshing}>{refreshing ? '获取中…' : '重新获取'}</button>}
    </div>
  }
  return <a className="chip" href={url} target="_blank" rel="noreferrer" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>打开附件</a>
}

/**
 * 灵感白板贴片：短按切换多选，桌面端拖动后回传 x/y/z/rotation 坐标。
 */
export default function InspirationSticky({ data, selected, onToggle, onMove }) {
  const dragRef = useRef(null)
  const position = data.position || { x: 0, y: 0, z: 1, rotation: 0 }

  const handlePointerDown = (event) => {
    if (event.button !== 0) return
    const mobile = globalThis.matchMedia?.('(max-width: 720px)').matches
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
      mobile,
      element: event.currentTarget,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handlePointerMove = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || drag.mobile) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) < 4) return
    drag.moved = true
    const board = drag.element?.offsetParent
    const maxX = Math.max(0, (board?.clientWidth || 1280) - drag.element.offsetWidth)
    const maxY = Math.max(0, (board?.clientHeight || 560) + 400 - drag.element.offsetHeight)
    onMove?.({
      x: Math.round(Math.min(Math.max(0, drag.originX + dx), maxX)),
      y: Math.round(Math.min(Math.max(0, drag.originY + dy), maxY)),
      z: position.z,
      rotation: position.rotation,
    })
  }

  const handlePointerEnd = (event, cancelled = false) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    drag.element?.releasePointerCapture?.(event.pointerId)
    dragRef.current = null
    if (!cancelled && !drag.moved) onToggle()
  }

  return (
    <article
      className={`sticky${selected ? ' selected' : ''}`}
      data-type={data.type}
      tabIndex={0}
      role="button"
      aria-roledescription="可拖动灵感贴片"
      aria-pressed={selected}
      aria-label={`灵感 ${data.id}：${data.type}`}
      style={{ left: position.x, top: position.y, zIndex: position.z, '--sticky-rotation': `${position.rotation}deg` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => handlePointerEnd(event)}
      onPointerCancel={(event) => handlePointerEnd(event, true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggle()
        }
      }}
    >
      <div className="check" aria-hidden="true">{selected && '✓'}</div>

      <div className="head">
        <span className="pill" style={{ color: `var(${data.color_token || '--ink-muted'})` }}>{data.type}</span>
        <span>{data.time}</span>
      </div>

      <p className={`text${data.quote ? ' quote' : ''}`}>{data.text}</p>

      {data.attachments?.length > 0 && (
        <div className="attach-row">
          {data.attachments.map((attachment, index) => (
            <AssetPreview attachment={attachment} key={attachment.asset_id || `${attachment.kind}-${index}`} />
          ))}
        </div>
      )}

      {data.aiTag && <div className="ai-tag">✦ {data.aiTag}</div>}
      {data.used && <div className="used">{data.used}</div>}
    </article>
  )
}
