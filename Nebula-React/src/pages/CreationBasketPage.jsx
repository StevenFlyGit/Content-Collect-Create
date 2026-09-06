import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CosmosBackground from '../components/CosmosBackground.jsx'
import TopNav from '../components/TopNav.jsx'
import SelectionBar from '../components/SelectionBar.jsx'
import CreationBriefModal from '../components/CreationBriefModal.jsx'
import {
  clearBasket,
  getBasket,
  removeBasketItem,
} from '../lib/hotspots.js'
import { showToast } from '../lib/toast.js'
import {
  createCreation, getBrief, saveBrief, updateCreation, listInProgressCreations,
} from '../storage/creationRepository.js'
import { requestStoragePersist } from '../storage/creationDb.js'
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
  // 选择模式：点击卡片切换选中（与灵感库交互对齐），键为 basket_item_id（全表唯一，无需前缀）
  const [selected, setSelected] = useState(() => new Set())
  // 本地创作会话（点击「开始创作」后建立）与可恢复的进行中创作
  const [briefSession, setBriefSession] = useState(null)
  const [resumable, setResumable] = useState(null)

  const load = useCallback(async () => {
    const seq = ++requestSeq.current
    setState('loading')
    setErrorMsg('')
    try {
      const result = await getBasket()
      if (seq !== requestSeq.current) return
      const nextInspirations = result.data?.inspirations || []
      const nextHotspots = result.data?.hotspots || []
      setInspirations(nextInspirations)
      setHotspots(nextHotspots)
      setState('ready')
      // 同步修剪选中集：列表里已不存在的素材自动取消选中
      setSelected((previous) => {
        if (previous.size === 0) return previous
        const aliveIds = new Set(
          [...nextInspirations, ...nextHotspots].map((item) => item.basket_item_id)
        )
        const next = new Set([...previous].filter((id) => aliveIds.has(id)))
        return next.size === previous.size ? previous : next
      })
    } catch (err) {
      if (seq !== requestSeq.current) return
      setErrorMsg(err.message || '加载失败')
      setState('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // 查询本地进行中创作：存在时显示「继续上次创作」入口（backend-design.md §7）
  useEffect(() => {
    let active = true
    listInProgressCreations()
      .then((creations) => { if (active) setResumable(creations[0] || null) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  // Escape 清空选中（与灵感库一致）
  useEffect(() => {
    const handler = (event) => { if (event.key === 'Escape') setSelected(new Set()) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const toggle = (id) => setSelected((previous) => {
    const next = new Set(previous)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  // 「开始创作」：建立本地创作会话 + 素材快照 → 打开「这次想怎么写」弹窗
  // 前置校验：至少选中 1 条灵感（热点不能替代灵感）
  const handleStartCreate = async () => {
    const inspIds = new Set(inspirations.map((item) => item.basket_item_id))
    const hasInspiration = [...selected].some((id) => inspIds.has(id))
    if (!hasInspiration) {
      showToast('请至少选择 1 条灵感')
      return
    }
    // 素材快照：把必要文字复制进 IndexedDB，后续不依赖原素材是否仍在创作篮（backend-design.md §3）
    const selectedItems = [...inspirations, ...hotspots].filter((item) => selected.has(item.basket_item_id))
    const materials = selectedItems.map((item) => (item.inspiration_id
      ? {
        item_id: item.basket_item_id,
        origin: 'inspiration',
        source_id: item.inspiration_id,
        title: item.title || item.text || '（无标题）',
        text: item.text || '',
        source_name: '',
        source_url: '',
        captured_at: item.recorded_at || item.added_at || '',
      }
      : {
        item_id: item.basket_item_id,
        origin: 'hotspot',
        source_id: item.snapshot_id,
        title: item.title,
        text: item.summary || '',
        source_name: item.source_name || '',
        source_url: item.source_url || item.ai_hot_url || '',
        captured_at: item.captured_at || item.added_at || '',
      }))
    try {
      const record = await createCreation({ materials })
      requestStoragePersist()
      const briefRecord = await getBrief(record.id)
      setResumable(record)
      setBriefSession({ id: record.id, brief: briefRecord, materialsCount: materials.length })
    } catch (err) {
      showToast(`创作会话创建失败：${err.message}`)
    }
  }

  // brief 弹窗：输入停止 400ms 后由弹窗回调落盘
  const handleBriefPersist = async (patch) => {
    const session = briefSession
    if (!session) return
    try {
      const next = await saveBrief(session.id, patch)
      setBriefSession((prev) => (prev && prev.id === session.id ? { ...prev, brief: next } : prev))
    } catch { /* 保存失败保留内存值，不误报成功 */ }
  }

  const handleBriefGenerate = async () => {
    const session = briefSession
    if (!session) return
    try {
      await updateCreation(session.id, { stage: 'plan' })
      setBriefSession(null)
      navigate(`/creation/${session.id}`)
    } catch (err) {
      showToast(`会话更新失败：${err.message}`)
    }
  }

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
            <p className="page-sub">点击素材卡片多选 · 选定后可开始创作</p>
          </div>
          {resumable && (
            <button type="button" className="resume-btn" onClick={() => navigate(`/creation/${resumable.id}`)}>
              继续上次创作 →
            </button>
          )}
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
                ) : inspirations.map((item) => {
                  const isSelected = selected.has(item.basket_item_id)
                  return (
                    <div
                      className={`basket-item basket-item--clickable${isSelected ? ' selected' : ''}`}
                      key={item.basket_item_id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      aria-label={`选择灵感：${item.title || item.text || '（无标题）'}`}
                      onClick={() => toggle(item.basket_item_id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggle(item.basket_item_id)
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
                        className="bi-view"
                        title="查看详情"
                        onClick={(e) => {
                          e.stopPropagation()
                          setInspDetail(item)
                        }}
                      >查看</button>
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
                  const isSelected = selected.has(item.basket_item_id)
                  return (
                    <div
                      className={`basket-item basket-item--clickable${isSelected ? ' selected' : ''}`}
                      key={item.basket_item_id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      aria-label={`选择热点：${item.title}`}
                      onClick={() => toggle(item.basket_item_id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggle(item.basket_item_id)
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
                        className="bi-view"
                        title="查看详情"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDetail(item)
                        }}
                      >查看</button>
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

      {/* 底部多选操作栏：与灵感库 SelectionBar 同一组件与视觉，选中 ≥1 项时滑入 */}
      <SelectionBar
        count={selected.size}
        selected={selected}
        onClear={() => setSelected(new Set())}
        onAdd={handleStartCreate}
        unitLabel="项素材"
        actionLabel="开始创作 →"
        showFeedback={false}
        regionLabel="已选素材操作栏"
      />

      {/* 「这次想怎么写」弹窗：点击「开始创作」建立本地会话后弹出（brief 阶段） */}
      {briefSession && (
        <CreationBriefModal
          open
          materialsCount={briefSession.materialsCount}
          brief={briefSession.brief}
          onPersist={handleBriefPersist}
          onGenerate={handleBriefGenerate}
          onCancel={() => setBriefSession(null)}
        />
      )}
    </>
  )
}
