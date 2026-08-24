import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CosmosBackground from '../components/CosmosBackground.jsx'
import TopNav from '../components/TopNav.jsx'
import {
  clearBasket,
  getBasket,
  removeBasketItem,
} from '../lib/hotspots.js'
import { showToast } from '../lib/toast.js'
import './CreationBasketPage.css'

// 热点原生 category slug → 中文标签（与后端 aihot.categoryInfo 对齐）
const HS_CAT_LABEL = {
  'ai-models': '模型',
  'ai-products': '产品',
  paper: '论文',
  industry: '行业',
  tip: '技巧',
}
const FRESHNESS_LABEL = { fresh: '新鲜', aging: '较旧', expired: '过期', unknown: '未知时间' }

// 灵感类型 slug → 中文短标签（PRD §2.4 + 与 inspiration_types 表对齐）
const INSP_TYPE_LABEL = {
  idea: '想法',
  quote: '引用',
  moment: '随感',
  task: '待办',
  case: '案例',
  question: '问题',
}

export default function CreationBasketPage() {
  const navigate = useNavigate()
  const requestSeq = useRef(0)
  const [inspirations, setInspirations] = useState([])
  const [hotspots, setHotspots] = useState([])
  const [state, setState] = useState('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState(null)
  const [inspDetail, setInspDetail] = useState(null)

  const load = useCallback(async () => {
    const seq = ++requestSeq.current
    setState('loading')
    setErrorMsg('')
    try {
      const result = await getBasket()
      if (seq !== requestSeq.current) return
      setInspirations(result.data?.inspirations || [])
      setHotspots(result.data?.hotspots || [])
      setState('ready')
    } catch (err) {
      if (seq !== requestSeq.current) return
      setErrorMsg(err.message || '加载失败')
      setState('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleRemove = async (id) => {
    if (busy) return
    setBusy(true)
    try {
      await removeBasketItem(id)
      showToast('已移除并退回')
      load()
    } catch (err) {
      showToast(`移除失败：${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  const handleClear = async (origin, label) => {
    if (busy) return
    if (!window.confirm(`确定清空创作篮的「${label}」吗？此操作不可撤销。`)) return
    setBusy(true)
    try {
      const res = await clearBasket(origin)
      showToast(`已清空${label}（${res.data?.removed_count || 0} 项）`)
      load()
    } catch (err) {
      showToast(`清空失败：${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  const handleClearAll = async () => {
    if (busy) return
    if (!window.confirm('确定清空整个创作篮吗？灵感区与热点区都会被清空，此操作不可撤销。')) return
    setBusy(true)
    try {
      const r1 = await clearBasket('inspiration')
      const r2 = await clearBasket('hotspot')
      showToast(`已清空创作篮（${((r1.data?.removed_count || 0) + (r2.data?.removed_count || 0))} 项）`)
      load()
    } catch (err) {
      showToast(`清空失败：${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  const total = inspirations.length + hotspots.length
  const hasItems = total > 0

  return (
    <>
      <CosmosBackground variant="home" />
      <TopNav variant="home" />
      <main className="wrap basket-wrap">
        <div className="page-head reveal">
          <div>
            <h1 className="page-title">创作篮</h1>
            <p className="page-sub">灵感区与热点区统一装配 · 后续可一键生成选题卡</p>
          </div>
        </div>

        {/* 顶部状态条：常驻可见 · items>0 时显示「清空全部」 */}
        <div className={`basket-headbar reveal d1${hasItems ? ' has-items' : ''}`}>
          <div className="h-title">当前创作篮 <b>{total}</b> 项素材</div>
          <div className="h-counters">
            <span className="h-pill" data-col="i"><span className="b-dot">●</span>灵感 <b>{inspirations.length}</b></span>
            <span className="h-pill" data-col="h"><span className="b-dot">●</span>热点 <b>{hotspots.length}</b></span>
            <button type="button" className="h-clear" onClick={handleClearAll}>清空全部</button>
          </div>
        </div>

        {state === 'loading' && <div className="empty">正在加载创作篮…</div>}
        {state === 'error' && (
          <div className="empty">加载失败：{errorMsg}。<button type="button" onClick={load}>重试</button></div>
        )}

        {state === 'ready' && (
          <div className="basket-grid reveal d2">
            {/* 灵感区 */}
            <div className="basket-col">
              <div className="basket-col-head">
                <h3><span className="ico" data-col="i">💡</span>灵感区 <span className="count">{inspirations.length}</span></h3>
                <div className="col-actions">
                  <button type="button" className="col-btn ghost" onClick={() => navigate('/timeline')}>＋ 添加灵感</button>
                  <button type="button" className="col-btn text" disabled={!inspirations.length} onClick={() => handleClear('inspiration', '灵感区')}>取消本次</button>
                </div>
              </div>
              <div className="basket-list">
                {inspirations.length === 0 ? (
                  <div className="empty">
                    <span className="big">💡</span>
                    <div className="ttl">灵感区还是空的</div>
                    <div className="desc">去灵感库勾选已收集的灵感，或先添加热点话题。</div>
                    <button type="button" className="btn primary cta" onClick={() => navigate('/timeline')}>前往灵感库 →</button>
                  </div>
                ) : inspirations.map((item) => (
                  <div
                    className="basket-item basket-item--clickable"
                    key={item.basket_item_id}
                    role="button"
                    tabIndex={0}
                    aria-label={`查看灵感详情：${item.title || item.text || '（无标题）'}`}
                    onClick={() => setInspDetail(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setInspDetail(item)
                      }
                    }}
                  >
                    <span className="bi-ico"><span className="dot" style={{ '--d': `var(${item.color_token})` }} /></span>
                    <div className="bi-body">
                      <p className="bi-title">{item.title || item.text || '（无标题）'}</p>
                      <div className="bi-meta">灵感 · {item.type}{item.time ? ` · ${item.time}` : ''}</div>
                    </div>
                    <button
                      type="button"
                      className="bi-remove"
                      title="移除并退回"
                      aria-label="移除"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemove(item.basket_item_id)
                      }}
                    >×</button>
                  </div>
                ))}
              </div>
              <div className="basket-tips">
                <h4>灵感类型 <small>支持 6 种类别</small></h4>
                <ul>
                  <li><b style={{ color: 'var(--nebula-violet)' }}><span className="dot" style={{ '--d': 'var(--nebula-violet)' }} />想法</b></li>
                  <li><b style={{ color: 'var(--nebula-blue)' }}><span className="dot" style={{ '--d': 'var(--nebula-blue)' }} />引用</b></li>
                  <li><b style={{ color: 'var(--nebula-rose)' }}><span className="dot" style={{ '--d': 'var(--nebula-rose)' }} />随感</b></li>
                  <li><b style={{ color: 'var(--nebula-mint)' }}><span className="dot" style={{ '--d': 'var(--nebula-mint)' }} />待办</b></li>
                  <li><b style={{ color: 'var(--nebula-amber)' }}><span className="dot" style={{ '--d': 'var(--nebula-amber)' }} />案例</b></li>
                  <li><b style={{ color: 'var(--danger)' }}><span className="dot" style={{ '--d': 'var(--danger)' }} />问题</b></li>
                </ul>
              </div>
            </div>

            {/* 热点区 */}
            <div className="basket-col">
              <div className="basket-col-head">
                <h3><span className="ico" data-col="h">📡</span>热点区 <span className="count">{hotspots.length}</span></h3>
                <div className="col-actions">
                  <button type="button" className="col-btn ghost" onClick={() => navigate('/hotspots')}>＋ 添加热点</button>
                  <button type="button" className="col-btn text" disabled={!hotspots.length} onClick={() => handleClear('hotspot', '热点区')}>取消本次</button>
                </div>
              </div>
              <div className="basket-list">
                {hotspots.length === 0 ? (
                  <div className="empty">
                    <span className="big">📡</span>
                    <div className="ttl">热点区还是空的</div>
                    <div className="desc">去热点页点击「加入创作」，系统会把热点快照（不可变）汇入这里。</div>
                    <button type="button" className="btn primary cta" onClick={() => navigate('/hotspots')}>前往热点页 →</button>
                  </div>
                ) : hotspots.map((item) => {
                  const catLabel = HS_CAT_LABEL[item.category_source_raw] || HS_CAT_LABEL[item.category] || '其他'
                  const fresh = FRESHNESS_LABEL[item.freshness]
                  return (
                    <div
                      className="basket-item basket-item--clickable"
                      key={item.basket_item_id}
                      role="button"
                      tabIndex={0}
                      aria-label={`查看热点详情：${item.title}`}
                      onClick={() => setDetail(item)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setDetail(item)
                        }
                      }}
                    >
                      <span className="bi-ico">📡</span>
                      <div className="bi-body">
                        <p className="bi-title">{item.title}</p>
                        <div className="bi-meta">
                          热点 · {catLabel}{fresh && fresh !== '未知时间' ? ` · ${fresh}` : ''} · 数据来源 AIHOT
                        </div>
                      </div>
                      <button
                        type="button"
                        className="bi-remove"
                        title="移除并退回"
                        aria-label="移除"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemove(item.basket_item_id)
                        }}
                      >×</button>
                    </div>
                  )
                })}
              </div>
              <div className="basket-tips">
                <h4>热度趋势 <small>仅展示等级，不展示数值</small></h4>
                <ul>
                  <li><b style={{ color: 'var(--nebula-rose)' }}>● 飙升</b></li>
                  <li><b style={{ color: 'var(--danger)' }}>● 高热</b></li>
                  <li><b style={{ color: 'var(--nebula-amber)' }}>● 升温</b></li>
                  <li><b style={{ color: 'var(--ink-muted)' }}>● 平稳</b></li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 热点详情弹窗（点击整张热点卡片即触发） */}
      {detail && (() => {
        const catLabel = HS_CAT_LABEL[detail.category_source_raw] || HS_CAT_LABEL[detail.category] || '其他'
        const freshLabel = FRESHNESS_LABEL[detail.freshness]
        const freshOk = freshLabel && freshLabel !== '未知时间'
        const detailUrl = detail.source_url || detail.ai_hot_url
        const publishedAt = detail.published_at ? new Date(detail.published_at).toLocaleString('zh-CN', { hour12: false }) : ''
        const capturedAt = detail.captured_at ? new Date(detail.captured_at).toLocaleString('zh-CN', { hour12: false }) : ''
        return (
          <div
            className="bsk-detail-mask"
            role="dialog"
            aria-modal="true"
            aria-label={`热点详情：${detail.title}`}
            onClick={() => setDetail(null)}
          >
            <div className="bsk-detail-card" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="bsk-detail-close" aria-label="关闭" onClick={() => setDetail(null)}>×</button>
              <div className="bsk-detail-tags">
                <span className="bsk-tag">{catLabel}</span>
                {freshOk && <span className="bsk-fresh">{freshLabel}</span>}
                {typeof detail.rank === 'number' && <span className="bsk-rank">第 {detail.rank} 名</span>}
              </div>
              <h3 className="bsk-detail-title">{detail.title}</h3>
              {detail.summary && <p className="bsk-detail-summary">{detail.summary}</p>}
              <div className="bsk-detail-meta">
                {detail.source_name && <div>来源：{detail.source_name}</div>}
                {publishedAt && <div>发布时间：{publishedAt}</div>}
                {!publishedAt && capturedAt && <div>收录时间：{capturedAt}</div>}
                <div className="bsk-detail-aihot">数据来源：AIHOT</div>
              </div>
              {detailUrl && (
                <a
                  className="btn primary bsk-detail-link"
                  href={detailUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >查看原文 →</a>
              )}
            </div>
          </div>
        )
      })()}

      {/* 灵感详情弹窗（点击整张灵感卡片即触发） */}
      {inspDetail && (() => {
        const inspTypeLabel = INSP_TYPE_LABEL[inspDetail.type_slug] || inspDetail.type || '未分类'
        const colorVar = inspDetail.color_token || '--ink-muted'
        const recordedAt = inspDetail.recorded_at
          ? new Date(inspDetail.recorded_at).toLocaleString('zh-CN', { hour12: false })
          : ''
        const addedAt = inspDetail.added_at
          ? new Date(inspDetail.added_at).toLocaleString('zh-CN', { hour12: false })
          : ''
        const displayTitle = inspDetail.title || inspDetail.text || '（无标题）'
        return (
          <div
            className="bsk-insp-detail-mask"
            role="dialog"
            aria-modal="true"
            aria-label={`灵感详情：${displayTitle}`}
            onClick={() => setInspDetail(null)}
          >
            <div className="bsk-insp-detail-card" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="bsk-insp-detail-close" aria-label="关闭" onClick={() => setInspDetail(null)}>×</button>
              <div className="bsk-insp-detail-tags">
                <span
                  className="bsk-insp-tag"
                  style={{ '--accent': `var(${colorVar})` }}
                >
                  <span className="dot" />
                  {inspTypeLabel}
                </span>
              </div>
              {inspDetail.title && <h3 className="bsk-insp-detail-title">{inspDetail.title}</h3>}
              {inspDetail.text && (
                <p className="bsk-insp-detail-body">{inspDetail.text}</p>
              )}
              <div className="bsk-insp-detail-meta">
                {recordedAt && <div>记录时间：{recordedAt}</div>}
                {!recordedAt && addedAt && <div>记录时间：{addedAt}</div>}
                {addedAt && recordedAt && <div>加入创作篮：{addedAt}</div>}
                <div className="bsk-insp-detail-id">灵感 ID：<code>{inspDetail.inspiration_id}</code></div>
              </div>
              <button
                type="button"
                className="btn primary bsk-insp-detail-remove"
                onClick={() => {
                  const id = inspDetail.basket_item_id
                  setInspDetail(null)
                  handleRemove(id)
                }}
              >移除并退回</button>
            </div>
          </div>
        )
      })()}
    </>
  )
}
