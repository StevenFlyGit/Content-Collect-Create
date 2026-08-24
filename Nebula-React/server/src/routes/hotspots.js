import { Router } from 'express'
import { aihotClient, normalizeItems } from '../aihot.js'

const router = Router()

// /items 允许透传的参数白名单
const ITEMS_PARAMS = {
  mode: ['selected', 'all'],
  window: ['24h', '7d'],
  category: ['ai-models', 'ai-products', 'paper', 'industry', 'tip'],
  by: ['timeline', 'published'],
}

function buildQuery(params, allowed) {
  const sp = new URLSearchParams()
  for (const [key, allowedValues] of Object.entries(allowed)) {
    const value = params[key]
    if (value == null || value === '') continue
    if (Array.isArray(allowedValues)) {
      if (!allowedValues.includes(value)) continue // 非法值直接丢弃，不转发
    }
    sp.set(key, String(value))
  }
  if (params.q != null && params.q !== '') sp.set('q', String(params.q).slice(0, 200))
  if (params.limit != null) {
    const limit = Math.min(Math.max(Number.parseInt(params.limit, 10) || 30, 1), 100)
    if (Number.isFinite(limit)) sp.set('limit', String(limit))
  }
  if (params.cursor != null && params.cursor !== '') sp.set('cursor', String(params.cursor).slice(0, 200))
  return sp.toString()
}

/**
 * GET /api/hotspots/items —— 代理 AIHOT /items，返回归一化热点列表。
 * 仅透传白名单参数，避免拼接非法查询。
 */
router.get('/items', async (req, res, next) => {
  try {
    const queryString = buildQuery(req.query, ITEMS_PARAMS)
    const result = await aihotClient.proxy('/items', queryString)
    res.set('X-AIHOT-Source', result.source)
    if (result.status !== 200) {
      return res.status(result.status).json({ error: 'upstream_error', code: result.source === 'error' ? 'UPSTREAM_UNAVAILABLE' : 'UPSTREAM_ERROR', request_id: req.requestId })
    }
    const items = normalizeItems(result.body)
    res.json({ data: { items, source: result.source } })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/hotspots/hot-topics —— 代理 AIHOT /hot-topics（Top10 热点榜）。
 */
router.get('/hot-topics', async (req, res, next) => {
  try {
    const allowed = { window: ['24h', '7d'] }
    const queryString = buildQuery(req.query, allowed)
    const result = await aihotClient.proxy('/hot-topics', queryString)
    res.set('X-AIHOT-Source', result.source)
    if (result.status !== 200) {
      return res.status(result.status).json({ error: 'upstream_error', code: result.source === 'error' ? 'UPSTREAM_UNAVAILABLE' : 'UPSTREAM_ERROR', request_id: req.requestId })
    }
    const items = normalizeItems(result.body)
    res.json({ data: { items, source: result.source } })
  } catch (error) {
    next(error)
  }
})

export default router
