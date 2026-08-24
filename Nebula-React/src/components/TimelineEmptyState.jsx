import { useMemo, useState } from 'react'
import { INSPIRATION_PROMPTS } from '../lib/inspirationPrompts.js'
import './TimelineEmptyState.css'

/**
 * TimelineEmptyState —— 「灵感库」当日无灵感时的空状态（方案 B「星云初生」）
 * ------------------------------------------------------------
 * 设计要点（对齐原型 empty-state-B-nebula.html）：
 * - 组件返回 fragment：背景特效层 .te-nebula 与内容层 .te-empty 平级，由父级容器
 *   （.board.board--empty）一起承载；.te-nebula 的 inset:0 才能真正铺满整个底板
 *   （不再被任何 max-width 容器截断）。
 * - 双视图：白板视图 chip 横排（te-chips--row），星云视图 chip 弧形环绕
 *   （te-chips--arc）；标题/副文案随视图切换。
 * - 6 类灵感 chip 严格按原型白名单（idea/quote/moment/task/case/question）过滤，
 *   排除「先不分类」等其它类别。
 * - 「开始记录」主按钮 + 「随机灵感提示」并列，降低启动门槛。
 * - 尊重 prefers-reduced-motion：关闭漂浮/呼吸/闪烁动画。
 */
const COPY = {
  board: {
    title: '你的星云正在等待第一颗星',
    sub: '每个念头都是一个粒子，准备爆发成发光的形态',
  },
  nebula: {
    title: '这一片星云还没有被点亮',
    sub: '点一颗星，让今天的思绪有了落点',
  },
}

// 原型严格限定的 6 类灵感（与 design/empty-state-B-nebula.html 一一对应）。
const CHIP_WHITELIST = [
  { slug: 'idea', label: '想法', color: '#a78bfa' },
  { slug: 'quote', label: '引用', color: '#7dd3fc' },
  { slug: 'moment', label: '随感', color: '#f9a8d4' },
  { slug: 'task', label: '待办', color: '#86efac' },
  { slug: 'case', label: '案例', color: '#fcd34d' },
  { slug: 'question', label: '问题', color: '#fca5a5' },
]

export default function TimelineEmptyState({ view = 'board', types = [], onRecord, onPickType, onRandom }) {
  const [promptVisible, setPromptVisible] = useState(false)
  const [promptText, setPromptText] = useState('')
  const [promptIndex, setPromptIndex] = useState(-1)

  // 严格按原型白名单过滤：忽略「先不分类」等额外类别，仅保留 6 类；
  // 若后端 types 含同名 slug，用其 color 覆盖兜底色，保持视觉一致。
  const chips = useMemo(() => {
    return CHIP_WHITELIST.map((entry) => {
      const matched = (types || []).find((type) => type.slug === entry.slug || type.label === entry.label)
      return {
        slug: entry.slug,
        label: entry.label,
        color: matched?.color || entry.color,
      }
    })
  }, [types])

  const copy = COPY[view] || COPY.board

  const handleRandom = () => {
    const nextIndex = (promptIndex + 1) % INSPIRATION_PROMPTS.length
    setPromptIndex(nextIndex)
    setPromptText(INSPIRATION_PROMPTS[nextIndex])
    setPromptVisible(true)
    onRandom?.()
  }

  return (
    <>
      {/* 背景特效层：与 .te-empty 平级，inset:0 铺满整个底板（含四边四角）；
          z-index:0 + pointer-events:none，不影响交互 */}
      <div className="te-nebula" aria-hidden="true">
        <span className="te-neb te-neb--1" />
        <span className="te-neb te-neb--2" />
        <span className="te-neb te-neb--3" />
        <span className="te-neb te-neb--4" />
        <span className="te-neb te-neb--5" />
        <span className="te-neb te-neb--6" />
        <span className="te-neb te-neb--7" />
        <span className="te-neb te-neb--8" />
        <span className="te-neb te-neb--9" />
        <span className="te-particle te-particle--1" />
        <span className="te-particle te-particle--2" />
        <span className="te-particle te-particle--3" />
        <span className="te-particle te-particle--4" />
        <span className="te-particle te-particle--5" />
        <span className="te-particle te-particle--6" />
        <span className="te-particle te-particle--7" />
        <span className="te-particle te-particle--8" />
        <span className="te-particle te-particle--9" />
        <span className="te-particle te-particle--10" />
        <span className="te-particle te-particle--11" />
        <span className="te-particle te-particle--12" />
        <span className="te-star te-star--tl" />
        <span className="te-star te-star--tr" />
        <span className="te-star te-star--bl" />
        <span className="te-star te-star--br" />
        <span className="te-star te-star--ml" />
        <span className="te-star te-star--mr" />
      </div>

      {/* 内容层：去掉 max-width/min-height/grid 居中容器属性，只保留定位与层级，
          让标题/按钮/chip 在底板内自然居中，不再约束 .te-nebula 的铺满范围 */}
      <section className={`te-empty te-empty--${view}`} aria-label="当天还没有灵感">
        <div className="te-content">
          <h2 className="te-title">{copy.title}</h2>
          <p className="te-sub">{copy.sub}</p>

          {/* 6 类灵感快捷入口：白板横排 / 星云弧形，由 view 决定 */}
          <div
            className={`te-chips ${view === 'nebula' ? 'te-chips--arc' : 'te-chips--row'}`}
            role="group"
            aria-label="按类型快速记录"
          >
            {chips.map((chip) => (
              <button
                type="button"
                key={chip.slug}
                className="te-chip"
                style={{ '--chip': chip.color }}
                onClick={() => onPickType?.(chip.slug, chip.label)}
              >
                <span className="te-chip-dot" style={{ background: chip.color }} />
                {chip.label}
              </button>
            ))}
          </div>

          <div className="te-actions">
            <button type="button" className="te-btn te-btn--primary" onClick={() => onRecord?.()}>
              ✎ 开始记录
            </button>
            <button type="button" className="te-btn te-btn--ghost" onClick={handleRandom}>
              ✦ 随机灵感提示
            </button>
          </div>

          <p
            className={`te-prompt${promptVisible ? ' is-visible' : ''}`}
            aria-live="polite"
          >
            {promptText}
          </p>
        </div>
      </section>
    </>
  )
}
