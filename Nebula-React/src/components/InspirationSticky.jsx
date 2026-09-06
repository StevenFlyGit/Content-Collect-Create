import { useRef, useState } from 'react'
import { getAssetAccessUrl } from '../lib/api.js'
import './InspirationSticky.css'

/**
 * 卡片层级上限。卡片是 .board 内的绝对定位元素，与页面级固定 UI 同处根层叠上下文；
 * TopNav / SelectionBar 为 30、加入创作篮提示条为 31，卡片必须始终低于它们，
 * 否则选中置顶时会盖住顶部导航和底部操作栏。因此卡片组最高可用层级为 29。
 */
const CARD_Z_TOP = 29
const CARD_Z_HOVER = 28

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
 * 灵感卡片：单击主体=选中（用于创作），双击主体=查看详情，
 * 左上角 × 删除，右下角「编辑」。附件与按钮点击区与卡片主体隔离。
 */
export default function InspirationSticky({ data, selected, onToggle, onMove, onView, onEdit, onDelete }) {
  const dragRef = useRef(null)
  const clickTimerRef = useRef(null)
  const position = data.position || { x: 0, y: 0, z: 1, rotation: 0 }
  const zIndexBase = Number.isFinite(position.z) ? position.z : 1

  const stop = (event) => event.stopPropagation()

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
    if (!cancelled && !drag.moved) {
      // 延迟单击，给双击（查看）让路：双击时清除 timer，只触发 onView
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = setTimeout(() => onToggle?.(data.id), 220)
    }
  }

  const handleDoubleClick = (event) => {
    event.stopPropagation()
    clearTimeout(clickTimerRef.current)
    onView?.(data.id)
  }

  return (
    <article
      className={`sticky${selected ? ' selected' : ''}`}
      data-type={data.type}
      tabIndex={0}
      role="button"
      aria-roledescription="灵感卡片"
      aria-pressed={selected}
      aria-label={`灵感 ${data.id}：${data.type}`}
      // z-index 由 inline style 写入，会压过 CSS 里同属性的 :hover / :active 规则，
      // 因此置顶档位必须在这里算好：选中 → 组内最高层 29；未选中 → 沿用白板布局记录的 z，
      // 但夹到 27 以内，为 hover(28) 与选中(29) 留出置顶空间。
      style={{ left: position.x, top: position.y, zIndex: selected ? CARD_Z_TOP : Math.min(zIndexBase, CARD_Z_HOVER - 1), '--sticky-rotation': `${position.rotation}deg` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => handlePointerEnd(event)}
      onPointerCancel={(event) => handlePointerEnd(event, true)}
      onDoubleClick={handleDoubleClick}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggle?.(data.id)
        }
      }}
    >
      {onDelete && (
        <button
          type="button"
          className="del-btn"
          aria-label="删除灵感"
          onPointerDown={stop}
          onClick={(event) => { event.stopPropagation(); onDelete(data.id) }}
          onDoubleClick={stop}
        >×</button>
      )}

      <div className="head">
        <span className="pill" style={{ color: `var(${data.color_token || '--ink-muted'})` }}>{data.type}</span>
        <span className="time">{data.time}</span>
        {onEdit && (
          <button
            type="button"
            className="edit-btn"
            aria-label="编辑灵感"
            onPointerDown={stop}
            onClick={(event) => { event.stopPropagation(); onEdit(data.id) }}
            onDoubleClick={stop}
          >编辑</button>
        )}
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
