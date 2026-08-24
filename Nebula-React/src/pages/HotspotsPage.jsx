import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CosmosBackground from '../components/CosmosBackground.jsx'
import TopNav from '../components/TopNav.jsx'
import {
  addToBasket,
  categoryToSlug,
  createSnapshot,
  listHotspots,
  rebuildRaw,
} from '../lib/hotspots.js'
import { showToast } from '../lib/toast.js'
import './HotspotsPage.css'

// 分类 key → 中文标签（筛选 chips 用）
const CAT_LABELS = [
  { key: 'all', label: '全部' },
  { key: 'model', label: '模型' },
  { key: 'product', label: '产品' },
  { key: 'paper', label: '论文' },
  { key: 'industry', label: '行业' },
  { key: 'skill', label: '技巧' },
]

// 时间窗选项
const TIME_OPTIONS = [
  { val: '24h', label: '24h' },
  { val: '7d', label: '7d' },
]

function relativeTime(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return ''
  const min = Math.floor(ms / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  return `${day} 天前`
}

const SOURCE_LABEL = { upstream: '实时', cache: '缓存', fixture: '演示数据' }

export default function HotspotsPage() {
  const navigate = useNavigate()
  const requestSeq = useRef(0)

  const [time, setTime] = useState('24h')
  const [cat, setCat] = useState('all')
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [items, setItems] = useState([])
  const [source, setSource] = useState('')
  const [state, setState] = useState('loading') // loading | ready | error
  const [errorMsg, setErrorMsg] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [added, setAdded] = useState(() => new Set())
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [filterOpen, setFilterOpen] = useState(false)
  const [showFixture, setShowFixture] = useState(true)
  const [detail, setDetail] = useState(null)

  // 关键词防抖（避免每次按键都打上游）
  useEffect(() => {
    const t = setTimeout(() => setKeyword(keywordInput.trim()), 300)
    return () => clearTimeout(t)
  }, [keywordInput])

  const load = useCallback(async () => {
    const seq = ++requestSeq.current
    setState('loading')
    setErrorMsg('')
    try {
      const params = { mode: 'selected', by: 'timeline', window: time }
      const slug = categoryToSlug(cat)
      if (slug) params.category = slug
      if (keyword) params.q = keyword
      const result = await listHotspots(params)
      if (seq !== requestSeq.current) return
      setItems(result.data?.items || [])
      setSource(result.data?.source || '')
      setState('ready')
    } catch (err) {
      if (seq !== requestSeq.current) return
      setErrorMsg(err.message || '加载失败')
      setState('error')
    }
  }, [time, cat, keyword])

  useEffect(() => {
    load()
  }, [load])

  const isFixture = source === 'fixture'

  const handleAdd = useCallback(
    async (item) => {
      if (added.has(item.id) || busyId) return
      setBusyId(item.id)
      try {
        const snap = await createSnapshot(rebuildRaw(item))
        await addToBasket({ origin: 'hotspot', hotspot_snapshot_id: snap.data.id })
        setAdded((prev) => new Set(prev).add(item.id))
        setCollapsed((prev) => {
          const next = new Set(prev)
          next.delete(item.id)
          return next
        })
        showToast(isFixture ? '已加入创作篮（演示数据快照）' : '已加入创作篮')
      } catch (err) {
        showToast(`加入失败：${err.message}`)
      } finally {
        setBusyId(null)
      }
    },
    [added, busyId, isFixture],
  )

  const continueAdding = (item) => {
    setCollapsed((prev) => new Set(prev).add(item.id))
  }

  const filterSummary = useMemo(() => {
    const parts = []
    if (cat !== 'all') parts.push(CAT_LABELS.find((c) => c.key === cat)?.label || cat)
    if (keyword) parts.push(`关键词：${keyword}`)
    return parts.length ? parts.join(' · ') : '未筛选'
  }, [cat, keyword])

  return (
    <>
      <CosmosBackground variant="home" />
      <TopNav variant="home" />
      <main className="wrap hs-wrap">
        <div className="page-head reveal">
          <div>
            <h1 className="page-title">热点</h1>
            <p className="page-sub">多品类实时热点 · 数据来源 AIHOT · 点击「加入创作」汇入创作篮</p>
          </div>
        </div>

        {isFixture && showFixture && (
          <div className="demo-banner reveal d1" role="status">
            <span className="dot" />
            <span>当前为演示数据，加入的快照也是样例（fixture 回退模式）。</span>
            <button type="button" title="知道了" aria-label="关闭演示提示" onClick={() => setShowFixture(false)}>×</button>
          </div>
        )}

        {/* 移动端折叠开关：PC 端隐藏 */}
        <button
          type="button"
          className={`filter-toggle reveal d2${filterOpen ? ' expanded' : ''}`}
          aria-expanded={filterOpen}
          aria-controls="filterBar"
          onClick={() => setFilterOpen((v) => !v)}
        >
          <span className="ft-left">⚙️ <b>筛选</b></span>
          <span className="ft-summary">{filterSummary}</span>
          <span className="ft-arrow">▾</span>
        </button>

        <div className={`filter-bar reveal d2${filterOpen ? ' expanded' : ''}`} id="filterBar">
          {/* 频道：仅 AI 可点，其余灰色 disabled */}
          <div className="fb-row">
            <span className="fb-label">频道</span>
            <div className="fb-channels">
              <button type="button" className="fb-channel active">AI 热点<span className="src-tag">From 卡兹克</span></button>
              <button type="button" className="fb-channel" disabled>科技</button>
              <button type="button" className="fb-channel" disabled>财经</button>
              <button type="button" className="fb-channel" disabled>生活</button>
              <button type="button" className="fb-channel" disabled>游戏</button>
            </div>
          </div>

          {/* 时间窗 + 分类 */}
          <div className="fb-row">
            <span className="fb-label">时间窗</span>
            <div className="seg">
              {TIME_OPTIONS.map((o) => (
                <button
                  type="button"
                  key={o.val}
                  className={`seg-btn${time === o.val ? ' active' : ''}`}
                  onClick={() => setTime(o.val)}
                >{o.label}</button>
              ))}
            </div>
            <span className="fb-label">分类</span>
            <div className="chips">
              {CAT_LABELS.map((c) => (
                <button
                  type="button"
                  key={c.key}
                  className={`chip${cat === c.key ? ' active' : ''}`}
                  onClick={() => setCat(c.key)}
                >{c.label}</button>
              ))}
            </div>
          </div>

          {/* 来源 + 关键词 */}
          <div className="fb-row">
            <span className="fb-label">来源</span>
            <div className="seg">
              <button type="button" className="seg-btn active">本地过滤</button>
              <button type="button" className="seg-btn" disabled>全网</button>
            </div>
            <span className="fb-label">关键词</span>
            <input
              className="fb-input"
              type="text"
              value={keywordInput}
              placeholder="搜索标题或摘要…"
              onChange={(e) => setKeywordInput(e.target.value)}
              aria-label="关键词搜索"
            />
          </div>

          {/* 状态行 */}
          <div className="fb-status">
            <span>
              <span className="src-dot" />
              数据来源：AIHOT · <b>{SOURCE_LABEL[source] || '—'}</b>
            </span>
            <button type="button" className={`fb-cache${isFixture ? ' cached' : ''}`} onClick={load} title="重新拉取热点">
              ↻ 刷新
            </button>
          </div>
        </div>

        {state === 'loading' && <div className="empty">正在加载热点…</div>}
        {state === 'error' && (
          <div className="empty">加载失败：{errorMsg}。<button type="button" onClick={load}>重试</button></div>
        )}
        {state === 'ready' && items.length === 0 && (
          <div className="empty"><span className="big">🔍</span>没有匹配的热点。<br />试试调整筛选条件或清空关键词。</div>
        )}

        {state === 'ready' && items.length > 0 && (
          <div className="grid reveal d3">
            {items.map((item, idx) => {
              const isAdded = added.has(item.id)
              const isCollapsed = collapsed.has(item.id)
              const cardClass = [
                'hs-card',
                'reveal',
                `d${(idx % 5) + 1}`,
                isAdded ? 'added' : '',
                isAdded && isCollapsed ? 'collapsed' : '',
              ].filter(Boolean).join(' ')
              return (
                <article className={cardClass} key={item.id}>
                  <div className="hs-top">
                    <span className="hs-tag" data-cat={item.categoryClass}>{item.categoryLabel}</span>
                    <span className="hs-heat" data-level={item.heatLevel}>● {item.heatLabel}</span>
                  </div>
                  <h3 className="hs-title">{item.title}</h3>
                  <p className="hs-summary">{item.summary}</p>
                  <div className="hs-meta">
                    <span className="src">📡 {item.source_name}</span>
                    <span>🕒 {relativeTime(item.published_at || item.captured_at)}</span>
                  </div>
                  <div className="hs-foot">
                    <span className="aihot">数据来源：AIHOT</span>
                    <span>· 个人非商业 demo</span>
                    <span className="hs-detail" role="button" tabIndex={0} onClick={() => setDetail(item)} onKeyDown={(e) => { if (e.key === 'Enter') setDetail(item) }}>详情</span>
                  </div>
                  <div className="hs-action">
                    <button
                      type="button"
                      className="btn primary add"
                      disabled={busyId === item.id}
                      onClick={() => handleAdd(item)}
                    >{busyId === item.id ? '加入中…' : '加入创作'}</button>
                    <span className="added-pill">✓ 已加入创作篮</span>
                    <div className="hs-added">
                      <button type="button" className="btn ghost" onClick={() => navigate('/timeline')}>去添加灵感</button>
                      <button type="button" className="btn primary" onClick={() => navigate('/creation-basket')}>进入创作篮 →</button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        <div className="attrib-foot">
          数据来源：AIHOT · 个人非商业 demo · 商业用途须取得 AIHOT 书面授权
        </div>
      </main>

      {detail && (
        <div className="hs-detail-mask" role="dialog" aria-modal="true" onClick={() => setDetail(null)}>
          <div className="hs-detail-card" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="hs-detail-close" aria-label="关闭" onClick={() => setDetail(null)}>×</button>
            <div className="hs-top">
              <span className="hs-tag" data-cat={detail.categoryClass}>{detail.categoryLabel}</span>
              <span className="hs-heat" data-level={detail.heatLevel}>● {detail.heatLabel}</span>
            </div>
            <h3 className="hs-detail-title">{detail.title}</h3>
            <p className="hs-detail-summary">{detail.summary}</p>
            <div className="hs-detail-meta">
              <div>来源：{detail.source_name || '—'}</div>
              {detail.published_at && <div>发布时间：{new Date(detail.published_at).toLocaleString('zh-CN', { hour12: false })}</div>}
              <div className="aihot">数据来源：AIHOT</div>
            </div>
            {(detail.source_url || detail.ai_hot_url) && (
              <a
                className="btn primary hs-detail-link"
                href={detail.source_url || detail.ai_hot_url}
                target="_blank"
                rel="noopener noreferrer"
              >查看原文 →</a>
            )}
          </div>
        </div>
      )}
    </>
  )
}
