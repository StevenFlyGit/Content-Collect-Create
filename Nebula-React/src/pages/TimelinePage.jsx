import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopNav from '../components/TopNav.jsx'
import DateWheel from '../components/DateWheel.jsx'
import ViewSwitch from '../components/ViewSwitch.jsx'
import InspirationSticky from '../components/InspirationSticky.jsx'
import NebulaView from '../components/NebulaView.jsx'
import SelectionBar from '../components/SelectionBar.jsx'
import CosmosBackground from '../components/CosmosBackground.jsx'
import { getInspirationTypes, listInspirations, saveDailyBoard, searchInspirations } from '../lib/api.js'
import './TimelinePage.css'

const today = new Date()
const PAGE_SIZE = 20
const yearValues = Array.from({ length: 11 }, (_, index) => today.getFullYear() - 5 + index)
const monthValues = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))
const daysIn = (year, month) => new Date(year, month, 0).getDate()
const dateKey = ({ year, month, day }) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
const toDateState = (date) => ({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() })
const rotations = [-1.5, 0.8, -0.5, 1.2, -1, 0.4, -0.6]

function defaultPosition(index) {
  return {
    x: 32 + (index % 4) * 270,
    y: 28 + Math.floor(index / 4) * 190,
    z: index + 1,
    rotation: rotations[index % rotations.length],
  }
}

function mapItem(item, index) {
  const stored = item.board_position_json || {}
  const fallback = defaultPosition(index)
  const hasCoordinates = Number.isFinite(Number(stored.x)) && Number.isFinite(Number(stored.y))
  const position = hasCoordinates ? {
    x: Number(stored.x),
    y: Number(stored.y),
    z: Number.isFinite(Number(stored.z)) ? Number(stored.z) : fallback.z,
    rotation: Number.isFinite(Number(stored.rotation)) ? Number(stored.rotation) : fallback.rotation,
  } : fallback
  return {
    ...item,
    position,
    text: item.text || '（无正文）',
    attachments: (item.attachments || []).map((asset) => ({
      ...asset,
      kind: asset.kind === 'image' ? 'img' : asset.kind,
      label: asset.kind === 'audio' ? `${Math.round((asset.duration_ms || 0) / 1000)} 秒` : asset.status === 'ready' ? '查看图片' : `附件（${asset.status}）`,
    })),
  }
}

export default function TimelinePage() {
  const navigate = useNavigate()
  const requestSequence = useRef(0)
  const [date, setDate] = useState(toDateState(today))
  const [items, setItems] = useState([])
  const [view, setView] = useState('board')
  const [selected, setSelected] = useState(() => new Set())
  const [state, setState] = useState('loading')
  const [query, setQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [types, setTypes] = useState([])
  const [note, setNote] = useState('')
  const [loadError, setLoadError] = useState('')
  const [savingBoard, setSavingBoard] = useState(false)
  const [boardDirty, setBoardDirty] = useState(false)
  const [layoutVersion, setLayoutVersion] = useState(0)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const yearIdx = Math.max(0, yearValues.indexOf(date.year))
  const monthIdx = date.month - 1
  const totalDays = daysIn(date.year, date.month)
  const dayValues = useMemo(() => Array.from({ length: totalDays }, (_, index) => String(index + 1).padStart(2, '0')), [totalDays])
  const dayIdx = date.day - 1
  const selectedDate = dateKey(date)
  const fullDate = `${date.year} 年 ${date.month} 月 ${date.day} 日`
  const filterLabel = types.find((type) => type.slug === filter)?.label || ''
  const boardHeight = Math.max(560, ...items.map((item) => item.position.y + 250))

  const loadPage = useCallback(async ({ targetPage = 1, append = false } = {}) => {
    const sequence = ++requestSequence.current
    if (append) setLoadingMore(true)
    else {
      setState('loading')
      setLoadError('')
    }
    try {
      const common = { page: targetPage, page_size: PAGE_SIZE, ...(filter ? { type_slug: filter } : {}) }
      const result = activeQuery
        ? await searchInspirations({ ...common, q: activeQuery, from: selectedDate, to: selectedDate })
        : await listInspirations({ ...common, date: selectedDate })
      if (sequence !== requestSequence.current) return
      setItems((current) => {
        const base = append ? current.length : 0
        const mapped = (result.data || []).map((item, index) => mapItem(item, base + index))
        if (!append) return mapped
        const existing = new Set(current.map((item) => item.id))
        return [...current, ...mapped.filter((item) => !existing.has(item.id))]
      })
      setPage(result.meta?.page || targetPage)
      setTotal(result.meta?.total || 0)
      setHasMore(Boolean(result.meta?.has_more))
      if (!append) {
        setSelected(new Set())
        setLayoutVersion(result.meta?.layout_version || 0)
        setBoardDirty(false)
      }
      setState('ready')
    } catch (error) {
      if (sequence !== requestSequence.current) return
      setState('error')
      setLoadError(error.message || '加载失败')
    } finally {
      if (sequence === requestSequence.current) setLoadingMore(false)
    }
  }, [activeQuery, filter, selectedDate])

  useEffect(() => {
    let active = true
    getInspirationTypes().then((result) => { if (active) setTypes(result.data || []) }).catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => { loadPage({ targetPage: 1 }) }, 180)
    return () => clearTimeout(timer)
  }, [loadPage])

  useEffect(() => {
    const handler = (event) => { if (event.key === 'Escape') setSelected(new Set()) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const updatePart = (part, value) => setDate((current) => {
    const next = { ...current, [part]: value }
    if (part === 'year' || part === 'month') next.day = Math.min(current.day, daysIn(next.year, next.month))
    return next
  })
  const toggle = (id) => setSelected((previous) => {
    const next = new Set(previous)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const goTo = (target) => setDate(toDateState(target))
  const clusters = items.slice(0, 8).map((item, index) => ({ id: item.id, color: `c${(index % 4) + 1}`, top: `${18 + ((index * 17) % 62)}%`, left: `${18 + ((index * 23) % 64)}%`, label: item.text.slice(0, 18) }))
  const moveSticky = (id, position) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, position } : item))
    setBoardDirty(true)
    setNote('白板布局有未保存更改')
  }
  const saveBoard = async () => {
    if (!boardDirty || savingBoard) return
    setSavingBoard(true)
    try {
      const result = await saveDailyBoard({
        board_date: selectedDate,
        layout_version: layoutVersion,
        positions: items.map((item) => ({ inspiration_id: item.id, ...item.position })),
      })
      setLayoutVersion(result.data.layout_version)
      setBoardDirty(false)
      setNote('白板布局已保存')
    } catch (error) {
      setNote(`白板布局保存失败：${error.message}`)
    } finally {
      setSavingBoard(false)
    }
  }
  const search = (event) => {
    event.preventDefault()
    const nextQuery = query.trim()
    if (nextQuery === activeQuery) loadPage({ targetPage: 1 })
    else setActiveQuery(nextQuery)
  }
  const clearSearch = () => {
    setQuery('')
    setActiveQuery('')
  }

  return <>
    <CosmosBackground variant="timeline" />
    <TopNav variant="timeline" title="灵感库" backTo="/" right={<>
      <button type="button" className="nav-btn" onClick={() => navigate('/capture')}>＋ 记录</button>
      <button type="button" className="nav-btn" onClick={() => setSearchOpen((value) => !value)}>🔍 搜索{activeQuery ? '（已启用）' : ''}</button>
      <button type="button" className="nav-btn" onClick={() => setFilterOpen((value) => !value)}>⊕ 筛选{filterLabel ? `（${filterLabel}）` : ''}</button>
    </>} />
    <section className="datesec reveal">
      <h2>选择灵感发生的日期</h2>
      <div className="wheels">
        <DateWheel col="year" values={yearValues} index={yearIdx} onIndexChange={(index) => updatePart('year', yearValues[index])} ariaLabel="年份滚轮" />
        <div className="wheel-divider" aria-hidden="true" />
        <DateWheel col="month" values={monthValues} index={monthIdx} onIndexChange={(index) => updatePart('month', index + 1)} ariaLabel="月份滚轮" />
        <div className="wheel-divider" aria-hidden="true" />
        <DateWheel col="day" values={dayValues} index={dayIdx} onIndexChange={(index) => updatePart('day', index + 1)} ariaLabel="日滚轮" />
      </div>
      <div className="date-summary" style={{ marginTop: 18 }}><span><strong>{fullDate}</strong> · 共 <strong>{total}</strong> 条灵感</span><button type="button" className="q" onClick={() => goTo(today)}>今天</button></div>
      {searchOpen && <form className="timeline-tools" onSubmit={search}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索当天标题或正文" aria-label="搜索灵感" /><button type="submit" className="q">搜索</button>{activeQuery && <button type="button" className="q" onClick={clearSearch}>清除</button>}</form>}
      {filterOpen && <div className="timeline-tools"><label htmlFor="type-filter">灵感类型</label><select id="type-filter" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">全部类型</option>{types.map((type) => <option value={type.slug} key={type.id}>{type.label}</option>)}</select></div>}
      {activeQuery && <p className="timeline-scope">正在搜索 {fullDate} 的灵感：{activeQuery}</p>}
      {note && <p className="capture-note" role="status">{note}</p>}
      <div style={{ textAlign: 'center', marginTop: 20 }}><ViewSwitch view={view} onChange={setView} /></div>
    </section>
    <section className="board-wrap">
      <header className="board-head"><div className="board-title"><strong>{date.month} 月 {date.day} 日</strong> 白板 · 已加载 {items.length}/{total} 条灵感</div><div className="board-actions"><button type="button" className={`icon-btn${boardDirty ? ' active' : ''}`} title="保存布局" aria-label="保存布局" onClick={saveBoard} disabled={savingBoard || !boardDirty}>{savingBoard ? '…' : '⌘'}</button></div></header>
      {state === 'loading' && <div className="empty">正在加载…</div>}
      {state === 'error' && <div className="empty">加载失败：{loadError}。<button type="button" onClick={() => loadPage({ targetPage: 1 })}>重试</button></div>}
      {state === 'ready' && !items.length && <div className="empty">{activeQuery || filter ? '当前搜索或筛选没有结果。' : '这一天还没有已提交灵感。'}</div>}
      <div className="board" style={{ display: view === 'board' ? 'block' : 'none', minHeight: boardHeight }}>{items.map((sticky) => <InspirationSticky key={sticky.id} data={sticky} selected={selected.has(sticky.id)} onToggle={() => toggle(sticky.id)} onMove={(position) => moveSticky(sticky.id, position)} />)}</div>
      {view === 'nebula' && <NebulaView clusters={clusters} selected={selected} onToggle={toggle} />}
      {state === 'ready' && items.length > 0 && <div className="pagination-state">{hasMore ? <button type="button" className="q load-more" onClick={() => loadPage({ targetPage: page + 1, append: true })} disabled={loadingMore}>{loadingMore ? '加载中…' : '加载更多'}</button> : <span>已加载全部 {total} 条灵感</span>}</div>}
      <div className="thumb-map" aria-hidden="true" />
    </section>
    <SelectionBar count={selected.size} onClear={() => setSelected(new Set())} />
  </>
}
