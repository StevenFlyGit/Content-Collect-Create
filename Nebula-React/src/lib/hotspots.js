import { apiFetch } from './api.js'

// 前端筛选控件 → AIHOT 原生 slug 映射（PRD §2.4）
const CATEGORY_SLUG = {
  model: 'ai-models',
  product: 'ai-products',
  paper: 'paper',
  industry: 'industry',
  skill: 'tip',
}

function buildQuery(params = {}) {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue
    sp.set(key, String(value))
  }
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

/** 拉取热点列表（代理 AIHOT /items）。返回 { data: { items, source } }。 */
export const listHotspots = (params = {}) => apiFetch(`/hotspots/items${buildQuery(params)}`)

/** 拉取热点榜 Top10（代理 AIHOT /hot-topics）。 */
export const listHotTopics = (params = {}) => apiFetch(`/hotspots/hot-topics${buildQuery(params)}`)

/**
 * 把一条热点快照入库（后端从 raw 派生全部字段）。
 * @param {object} raw AIHOT 原始 item（或由其关键字段重组的等价对象）
 */
export const createSnapshot = (raw) =>
  apiFetch('/hotspot-snapshots', { method: 'POST', body: JSON.stringify({ raw }) })

/** 把一条素材加入创作篮。payload: { origin, inspiration_id } 或 { origin, hotspot_snapshot_id }。 */
export const addToBasket = (payload) =>
  apiFetch('/creation-basket/items', { method: 'POST', body: JSON.stringify(payload) })

/** 查询当前工作区创作篮全部条目（灵感 + 热点）。 */
export const getBasket = () => apiFetch('/creation-basket')

/** 移除创作篮单条。 */
export const removeBasketItem = (id) =>
  apiFetch(`/creation-basket/items/${id}`, { method: 'DELETE' })

/** 按 origin 清空（inspiration | hotspot）。 */
export const clearBasket = (origin) =>
  apiFetch('/creation-basket/clear', { method: 'POST', body: JSON.stringify({ origin }) })

/**
 * 由后端归一化后的热点条目，重组出「加入创作」所需的 raw（供后端落库快照）。
 * 归一化已剥离原始字段，这里用已知字段重建 extractSnapshotFields 所需的
 * id / title / source.name / links.aihot，避免再次请求上游（PRD §5.3）。
 */
export function rebuildRaw(item) {
  return {
    id: item.id,
    title: item.title,
    source: { name: item.source_name },
    links: { aihot: item.ai_hot_url, original: item.source_url || null },
    publishedAt: item.published_at || null,
    discoveredAt: item.captured_at || null,
    category: item.category || null,
    reason: item.summary || null,
    rank: typeof item.rank === 'number' ? item.rank : null,
  }
}

/** 前端分类 key → AIHOT slug。 */
export const categoryToSlug = (key) => CATEGORY_SLUG[key] || ''
