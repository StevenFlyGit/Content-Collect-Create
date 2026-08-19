import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopNav from '../components/TopNav.jsx'
import DateWheel from '../components/DateWheel.jsx'
import ViewSwitch from '../components/ViewSwitch.jsx'
import InspirationSticky from '../components/InspirationSticky.jsx'
import NebulaView from '../components/NebulaView.jsx'
import SelectionBar from '../components/SelectionBar.jsx'
import CosmosBackground from '../components/CosmosBackground.jsx'
import { stickies, clusters } from '../data/inspirations.js'
import './TimelinePage.css'

// scheme-B 是演示原型，使用固定日期，避免页面内容随着系统日期漂移。
const TODAY = new Date(2026, 7, 18)
const YESTERDAY = new Date(TODAY)
YESTERDAY.setDate(YESTERDAY.getDate() - 1)

const yearValues = Array.from({ length: 11 }, (_, i) => 2020 + i) // 2020~2030
const monthValues = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
const daysIn = (year, month) => new Date(year, month, 0).getDate()
const sameDate = (date, parts) => (
  date.getFullYear() === parts.year &&
  date.getMonth() + 1 === parts.month &&
  date.getDate() === parts.day
)

function countForDate(date) {
  if (sameDate(TODAY, date)) return 4
  if (sameDate(YESTERDAY, date)) return 6
  return Math.max(0, (date.year * 100 + date.month * 31 + date.day) % 7)
}

export default function TimelinePage() {
  const navigate = useNavigate()
  const [date, setDate] = useState({
    year: TODAY.getFullYear(),
    month: TODAY.getMonth() + 1,
    day: TODAY.getDate(),
  })
  const [view, setView] = useState('board')
  const [selected, setSelected] = useState(() => new Set())

  const yearIdx = date.year - 2020
  const monthIdx = date.month - 1
  const totalDays = daysIn(date.year, date.month)
  const dayValues = useMemo(
    () => Array.from({ length: totalDays }, (_, i) => String(i + 1).padStart(2, '0')),
    [totalDays]
  )
  const dayIdx = date.day - 1
  const fullDate = `${date.year} 年 ${date.month} 月 ${date.day} 日`
  const dayCount = countForDate(date)

  const updatePart = (part, value) => {
    setDate((current) => {
      const next = { ...current, [part]: value }
      if (part === 'year' || part === 'month') {
        next.day = Math.min(current.day, daysIn(next.year, next.month))
      }
      return next
    })
  }

  const toggle = (key) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const clearSel = () => setSelected(new Set())

  const goTo = (targetDate) => {
    const targetYear = targetDate.getFullYear()
    const targetMonth = targetDate.getMonth() + 1
    if (!yearValues.includes(targetYear)) return
    setDate({
      year: targetYear,
      month: targetMonth,
      day: Math.min(targetDate.getDate(), daysIn(targetYear, targetMonth)),
    })
  }

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') clearSel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <CosmosBackground variant="timeline" />
      <TopNav
        variant="timeline"
        title="灵感库"
        backTo="/"
        right={
          <>
            <button type="button" className="nav-btn" onClick={() => navigate('/capture')}>＋ 记录</button>
            <button type="button" className="nav-btn" aria-label="搜索">🔍 搜索</button>
            <button type="button" className="nav-btn" aria-label="筛选">⊕ 筛选</button>
          </>
        }
      />

      <section className="datesec reveal">
        <h2>选择灵感发生的日期</h2>

        <div className="wheels">
          <DateWheel
            col="year"
            values={yearValues}
            index={yearIdx}
            onIndexChange={(index) => updatePart('year', yearValues[index])}
            ariaLabel="年份滚轮"
          />
          <div className="wheel-divider" aria-hidden="true" />
          <DateWheel
            col="month"
            values={monthValues}
            index={monthIdx}
            onIndexChange={(index) => updatePart('month', index + 1)}
            ariaLabel="月份滚轮"
          />
          <div className="wheel-divider" aria-hidden="true" />
          <DateWheel
            col="day"
            values={dayValues}
            index={dayIdx}
            onIndexChange={(index) => updatePart('day', index + 1)}
            ariaLabel="日滚轮"
          />
        </div>

        <div className="date-summary" style={{ marginTop: 18 }}>
          <span><strong>{fullDate}</strong> · 当天有 <strong>{dayCount}</strong> 条灵感</span>
          <button type="button" className="q" onClick={() => goTo(TODAY)}>今天</button>
          <button type="button" className="q" onClick={() => goTo(YESTERDAY)}>
            最近有灵感（昨天 {YESTERDAY.getMonth() + 1}/{YESTERDAY.getDate()} · 6 条）
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <ViewSwitch view={view} onChange={setView} />
        </div>
      </section>

      <section className="board-wrap">
        <header className="board-head">
          <div className="board-title">
            <strong>{date.month} 月 {date.day} 日</strong> 白板 · {dayCount} 条灵感
            <span style={{ opacity: .5 }}>·</span>
            <span>共 12 条</span>
          </div>
          <div className="board-actions">
            <button type="button" className="icon-btn" title="缩略地图" aria-label="缩略地图">▦</button>
            <button type="button" className="icon-btn" title="整理白板" aria-label="整理白板">⊜</button>
          </div>
        </header>

        <div className="board" style={{ display: view === 'board' ? 'block' : 'none' }}>
          {stickies.map((sticky, index) => (
            <InspirationSticky
              key={sticky.id}
              data={sticky}
              selected={selected.has(index)}
              onToggle={() => toggle(index)}
            />
          ))}
        </div>

        {view === 'nebula' && (
          <NebulaView clusters={clusters} selected={selected} onToggle={toggle} />
        )}

        <div className="thumb-map" aria-hidden="true" />
      </section>

      <SelectionBar count={selected.size} onClear={clearSel} />
    </>
  )
}