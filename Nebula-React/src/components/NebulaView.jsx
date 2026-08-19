import './NebulaView.css'

/**
 * NebulaView —— 灵感星云视图（贴片关系聚类 + SVG 连接线）
 * 与白板共享同一份 selected 集合（cluster 索引偏移 +100）。
 */
export default function NebulaView({ clusters, selected, onToggle }) {
  return (
    <div className="nebula-view on" role="tabpanel">
      <svg viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="grad1" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#a78bfa" stopOpacity="0" />
            <stop offset=".5" stopColor="#a78bfa" stopOpacity=".4" />
            <stop offset="1" stopColor="#f9a8d4" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="grad2" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#7dd3fc" stopOpacity="0" />
            <stop offset=".5" stopColor="#7dd3fc" stopOpacity=".4" />
            <stop offset="1" stopColor="#a78bfa" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M 200,150 Q 400,80 500,280" stroke="url(#grad1)" strokeWidth="1.2" fill="none" />
        <path d="M 500,280 Q 650,400 820,200" stroke="url(#grad2)" strokeWidth="1.2" fill="none" />
        <path d="M 250,420 Q 400,360 500,280" stroke="url(#grad1)" strokeWidth="1.2" fill="none" />
        <path d="M 500,280 Q 700,200 800,440" stroke="url(#grad2)" strokeWidth="1.2" fill="none" />
      </svg>

      {clusters.map((c, i) => {
        const sel = selected.has(i + 100)
        return (
          <div
            key={c.id}
            className={`cluster ${c.color}${sel ? ' selected' : ''}`}
            style={{ top: c.top, left: c.left }}
            role="button"
            tabIndex={0}
            aria-pressed={sel}
            onClick={() => onToggle(i + 100)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(i + 100) } }}
          >
            <span className="core" aria-hidden="true" />
            <span className="label">{c.label}</span>
          </div>
        )
      })}
    </div>
  )
}
