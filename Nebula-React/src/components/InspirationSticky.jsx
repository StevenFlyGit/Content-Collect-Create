import './InspirationSticky.css'

/**
 * InspirationSticky —— 灵感白板贴片
 * 每条灵感以贴片呈现；data-type 决定类型色；选中态描边 + 复选标记。
 */
export default function InspirationSticky({ data, selected, onToggle }) {
  return (
    <article
      className={`sticky ${data.pos}${selected ? ' selected' : ''}`}
      data-type={data.type}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      aria-label={`灵感 ${data.id}：${data.type}`}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggle()
        }
      }}
    >
      <div className="check" aria-hidden="true">{selected && '✓'}</div>

      <div className="head">
        <span className="pill">{data.type}</span>
        <span>{data.time}</span>
      </div>

      <p className={`text${data.quote ? ' quote' : ''}`}>{data.text}</p>

      {data.attachments?.length > 0 && (
        <div className="attach-row">
          {data.attachments.map((attachment, index) => (
            <span className="chip" key={index}>
              {attachment.kind === 'img' && '🖼 '}
              {attachment.kind === 'audio' && '🎙 '}
              {attachment.kind === 'link' && '🔗 '}
              {attachment.label}
            </span>
          ))}
        </div>
      )}

      {data.aiTag && <div className="ai-tag">✦ {data.aiTag}</div>}
      {data.used && <div className="used">{data.used}</div>}
    </article>
  )
}