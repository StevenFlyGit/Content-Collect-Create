import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './config.js'

/**
 * AIHOT 上游极薄客户端（Node 移植版）。
 * 严格复刻 Code-10/server/aihot_client.py 的「极薄代理」红线：
 *  - 同域转发 AIHOT 匿名只读 v1 API（仅 GET）。
 *  - 附 ETag / If-None-Match；上游 304 时复用缓存（短路，不再传输 body）。
 *  - 同端点 60s 轮询间隔下限节流，降低上游压力。
 *  - 上游不可达时回退到内置 fixture（真实抓取样例），标注 source='fixture'，避免白屏。
 * 不落库、不改写来源内容；来源署名随响应透传。
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = path.join(here, 'fixtures')

const GLOBAL_MIN_GAP = 0.2 // 秒，两次上游调用之间的最小间隔（礼貌限速）

/**
 * @typedef {Object} CacheEntry
 * @property {string|null} etag
 * @property {string} body
 * @property {number} ts
 */

/**
 * @typedef {Object} ProxyResult
 * @property {number} status
 * @property {string} body
 * @property {'upstream'|'cache'|'fixture'|'error'} source
 */

export class AihotClient {
  constructor() {
    /** @type {Map<string, CacheEntry>} */
    this._cache = new Map()
    this._lastGlobal = 0
  }

  // ---------------------------------------------------------------- fixture
  /** 根据 proxy 路径（不含查询串）映射到 fixture 文件。 */
  _resolveFixture(proxyPath) {
    if (proxyPath === '/items') return 'items.json'
    if (proxyPath === '/hot-topics') return 'hot_topics.json'
    if (proxyPath === '/stories' || proxyPath.startsWith('/stories/')) return 'story_sample.json'
    if (proxyPath === '/dailies') return 'dailies_index.json'
    if (proxyPath.startsWith('/dailies/')) return 'daily_report.json'
    return null
  }

  _loadFixture(name) {
    try {
      return fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8')
    } catch {
      return null
    }
  }

  // ---------------------------------------------------------------- 节流
  _throttleGlobal() {
    const now = Date.now() / 1000
    const wait = GLOBAL_MIN_GAP - (now - this._lastGlobal)
    if (wait > 0) {
      // 极小延迟，用 Atomics 自旋避免引入 timer 依赖；GLOBAL_MIN_GAP 仅 0.2s
      const until = now + wait
      // eslint-disable-next-line no-empty
      while (Date.now() / 1000 < until) {}
    }
    this._lastGlobal = Date.now() / 1000
  }

  // ---------------------------------------------------------------- 上游
  async _requestUpstream(url, etag) {
    const headers = {
      'User-Agent': config.aihotUserAgent,
      Accept: 'application/json',
    }
    if (etag) headers['If-None-Match'] = etag
    let res
    try {
      res = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(config.aihotTimeoutMs) })
    } catch (err) {
      // 网络 / DNS / 超时
      return { status: null, body: null, etag: null, error: `${err.name}: ${err.message}` }
    }
    const status = res.status
    if (status === 304) {
      return { status: 304, body: null, etag: res.headers.get('ETag'), error: null }
    }
    const body = await res.text()
    return { status, body, etag: res.headers.get('ETag'), error: null }
  }

  // ---------------------------------------------------------------- 入口
  /**
   * @param {string} proxyPath 形如 /items、/stories/<id>（不含 /api/proxy 前缀）
   * @param {string} queryString 原始查询串（已编码），直接透传给上游
   * @returns {Promise<ProxyResult>}
   */
  async proxy(proxyPath, queryString) {
    const cacheKey = proxyPath + (queryString ? `?${queryString}` : '')
    const url = `${config.aihotUpstreamBase}${config.aihotApiPrefix}${proxyPath}` + (queryString ? `?${queryString}` : '')

    const cached = this._cache.get(cacheKey)
    const now = Date.now() / 1000

    // 节流：同端点 60s 内且有缓存 → 直接复用，不再打上游
    if (cached && now - cached.ts < config.aihotMinPollInterval) {
      return { status: 200, body: cached.body, source: 'cache' }
    }

    this._throttleGlobal()
    const { status, body, etag, error } = await this._requestUpstream(url, cached?.etag ?? null)

    // 304：内容未变，复用缓存并刷新时间戳
    if (status === 304 && cached) {
      this._cache.set(cacheKey, { etag: cached.etag, body: cached.body, ts: now })
      return { status: 200, body: cached.body, source: 'cache' }
    }

    // 200：更新缓存
    if (status === 200 && body != null) {
      this._cache.set(cacheKey, { etag, body, ts: now })
      return { status: 200, body, source: 'upstream' }
    }

    // 上游失败（网络/超时/5xx）→ fixture 离线回退
    if (error != null || status == null || status >= 500) {
      const fbName = this._resolveFixture(proxyPath)
      if (fbName) {
        const fb = this._loadFixture(fbName)
        if (fb != null) {
          this._cache.set(cacheKey, { etag: null, body: fb, ts: now })
          return { status: 200, body: fb, source: 'fixture' }
        }
      }
      return { status: 502, body: JSON.stringify({ error: 'upstream_unavailable', detail: error || `status=${status}` }), source: 'error' }
    }

    // 上游 4xx（如非法参数）：原样透传，不回退 fixture
    return { status: status || 500, body: body || '', source: 'upstream' }
  }
}

export const aihotClient = new AihotClient()

// ============================================================
//  字段归一化（与 prd §5.2.2 一致）
// ============================================================

const CATEGORY_MAP = {
  'ai-models': { cls: 'model', label: '模型' },
  'ai-products': { cls: 'product', label: '产品' },
  paper: { cls: 'paper', label: '论文' },
  industry: { cls: 'industry', label: '行业' },
  tip: { cls: 'skill', label: '技巧' },
}

export function categoryInfo(slug) {
  return CATEGORY_MAP[slug] || { cls: 'other', label: slug || '其他' }
}

const HEAT_LABELS = { surge: '飙升', hot: '高热', rise: '升温', steady: '平稳' }
export function heatLabel(level) {
  return HEAT_LABELS[level] || '平稳'
}

/** 由 score（0-100）推断热度等级（启发式；items 有 score，hot-topics 无 score 时归为平稳）。 */
export function heatLevelFromScore(score) {
  if (typeof score !== 'number' || Number.isNaN(score)) return 'steady'
  if (score >= 75) return 'surge'
  if (score >= 60) return 'hot'
  if (score >= 45) return 'rise'
  return 'steady'
}

/** 由 publishedAt 推断 freshness（PRD §2.3）。 */
export function freshnessFromPublished(publishedAt) {
  if (!publishedAt) return 'unknown'
  const ms = Date.now() - new Date(publishedAt).getTime()
  if (Number.isNaN(ms)) return 'unknown'
  const hours = ms / 3600000
  if (hours < 48) return 'fresh'
  if (hours < 168) return 'aging'
  return 'expired'
}

/**
 * 把 AIHOT 原始 item 归一化为前端卡片 / 快照所需的字段。
 * 兼容 /items（含 summary/reason/score/category）与 /hot-topics（仅 rank/title/source）。
 */
export function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null
  const category = raw.category || null
  const cat = categoryInfo(category)
  const score = typeof raw.score === 'number' ? raw.score : null
  const heatLevel = heatLevelFromScore(score)
  const publishedAt = raw.publishedAt || null
  return {
    id: raw.id,
    external_id: raw.id,
    title: raw.title || '',
    summary: raw.reason || raw.summary || raw.title || '',
    source_name: raw.source?.name || '',
    source_url: raw.links?.original || raw.links?.aihot || null,
    ai_hot_url: raw.links?.aihot || '',
    published_at: publishedAt,
    captured_at: raw.discoveredAt || raw.latestAt || null,
    category, // 原生 slug
    category_source_raw: category,
    rank: typeof raw.rank === 'number' ? raw.rank : null,
    score,
    freshness: freshnessFromPublished(publishedAt),
    heatLevel,
    heatLabel: heatLabel(heatLevel),
    categoryLabel: cat.label,
    categoryClass: cat.cls,
  }
}

/** 解析上游响应（可能含 errors 包裹），返回归一化后的 item 数组。 */
export function normalizeItems(body) {
  let parsed
  try {
    parsed = typeof body === 'string' ? JSON.parse(body) : body
  } catch {
    return []
  }
  const rawItems = Array.isArray(parsed) ? parsed : (parsed?.items || [])
  return rawItems.map(normalizeItem).filter(Boolean)
}

/**
 * 从 raw 抽取快照落库字段（prd §5.2.2 规则）。
 * 返回 { snapshot 字段 }，缺失必填项时抛出带 code 的错误。
 */
export function extractSnapshotFields(raw) {
  const missing = []
  if (!raw?.id) missing.push('id')
  if (!raw?.title) missing.push('title')
  if (!raw?.source?.name) missing.push('source.name')
  if (!raw?.links?.aihot) missing.push('links.aihot')
  if (missing.length) {
    const err = new Error(`缺少必填字段：${missing.join('、')}`)
    err.status = 400
    err.code = 'MISSING_FIELD'
    err.detail = missing
    throw err
  }
  return {
    source: 'aihot',
    external_id: raw.id,
    entry_key: `aihot:${raw.id}`,
    title: raw.title,
    summary: raw.reason || raw.summary || raw.title || null,
    source_name: raw.source.name,
    source_url: raw.links.original || raw.links.aihot || null,
    ai_hot_url: raw.links.aihot,
    published_at: raw.publishedAt || null,
    captured_at: raw.discoveredAt || raw.latestAt || null,
    category: raw.category || 'ai',
    category_source_raw: raw.category || null,
    rank: typeof raw.rank === 'number' ? raw.rank : null,
    raw_payload: raw,
  }
}
