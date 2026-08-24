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

export default function CreationBasketPage() {
  const navigate = useNavigate()
  const requestSeq = useRef(0)
  const [inspirations, setInspirations] = useState([])
  const [hotspots, setHotspots] = useState([])
  const [state, setState] = useState('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [busy, setBusy] = useState(false)

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
                  <div className="basket-item" key={item.basket_item_id}>
                    <span className="bi-ico"><span className="dot" style={{ '--d': `var(${item.color_token})` }} /></span>
                    <div className="bi-body">
                      <p className="bi-title">{item.title || item.text || '（无标题）'}</p>
                      <div className="bi-meta">灵感 · {item.type}{item.time ? ` · ${item.time}` : ''}</div>
                    </div>
                    <button type="button" className="bi-remove" title="移除并退回" aria-label="移除" onClick={() => handleRemove(item.basket_item_id)}>×</button>
                  </div>
                ))}
              </div>
              <div className="basket-tips">
                <h4>灵感类型 <small>支持 6 种类别</small></h4>
                <ul className="cat-list">
                  <li><span className="dot" style={{ '--d': 'var(--nebula-violet)' }} />想法</li>
                  <li><span className="dot" style={{ '--d': 'var(--nebula-blue)' }} />引用</li>
                  <li><span className="dot" style={{ '--d': 'var(--nebula-rose)' }} />随感</li>
                  <li><span className="dot" style={{ '--d': 'var(--nebula-mint)' }} />待办</li>
                  <li><span className="dot" style={{ '--d': 'var(--nebula-amber)' }} />案例</li>
                  <li><span className="dot" style={{ '--d': 'var(--danger)' }} />问题</li>
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
                    <div className="basket-item" key={item.basket_item_id}>
                      <span className="bi-ico">📡</span>
                      <div className="bi-body">
                        <p className="bi-title">{item.title}</p>
                        <div className="bi-meta">
                          热点 · {catLabel}{fresh && fresh !== '未知时间' ? ` · ${fresh}` : ''} · 数据来源 AIHOT
                        </div>
                      </div>
                      <button type="button" className="bi-remove" title="移除并退回" aria-label="移除" onClick={() => handleRemove(item.basket_item_id)}>×</button>
                    </div>
                  )
                })}
              </div>
              <div className="basket-tips">
                <h4>热度趋势 <small>仅展示等级，不展示数值</small></h4>
                <ul>
                  <li><b style={{ color: 'var(--nebula-rose)' }}>● 飙升</b> · 话题突然引爆，关注度陡升</li>
                  <li><b style={{ color: 'var(--danger)' }}>● 高热</b> · 持续讨论中，已成当下焦点</li>
                  <li><b style={{ color: 'var(--nebula-amber)' }}>● 升温</b> · 缓慢上升，仍有发酵空间</li>
                  <li><b style={{ color: 'var(--ink-muted)' }}>● 平稳</b> · 稳定关注，可作为常驻素材</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
