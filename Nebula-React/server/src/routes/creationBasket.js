import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { query, withTransaction } from '../db.js'
import { uuidSchema } from '../validators.js'
import { notFound } from '../errors.js'
import { freshnessFromPublished } from '../aihot.js'

const router = Router()

const ORIGINS = new Set(['inspiration', 'hotspot'])

function formatTime(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: process.env.APP_TIMEZONE || 'Asia/Shanghai' })
  } catch {
    return ''
  }
}

/** GET /api/creation-basket —— 返回当前工作区创作篮全部条目（灵感 + 热点）。 */
router.get('/', async (req, res, next) => {
  try {
    const ws = req.workspaceId
    const insp = await query(
      `SELECT bi.id AS basket_item_id, i.id AS inspiration_id, i.title, i.text_raw, t.label AS type_label, t.color_token, i.recorded_at
       FROM creation_basket_items bi
       JOIN inspirations i ON i.id = bi.inspiration_id
       LEFT JOIN inspiration_types t ON t.id = i.type_id
       WHERE bi.workspace_id = $1 AND bi.origin = 'inspiration' AND i.deleted_at IS NULL
       ORDER BY bi.added_at DESC`,
      [ws],
    )
    const hs = await query(
      `SELECT bi.id AS basket_item_id, s.id AS snapshot_id, s.title, s.summary, s.source_name, s.source_url, s.ai_hot_url,
              s.published_at, s.captured_at, s.category, s.category_source_raw, s.rank
       FROM creation_basket_items bi
       JOIN hotspot_snapshots s ON s.id = bi.hotspot_snapshot_id
       WHERE bi.workspace_id = $1 AND bi.origin = 'hotspot'
       ORDER BY bi.added_at DESC`,
      [ws],
    )

    const inspirations = insp.rows.map((row) => ({
      basket_item_id: row.basket_item_id,
      inspiration_id: row.inspiration_id,
      title: row.title,
      text: row.text_raw,
      type: row.type_label || '先不分类',
      color_token: row.color_token || '--ink-muted',
      time: formatTime(row.recorded_at),
      added_at: row.added_at,
    }))
    const hotspots = hs.rows.map((row) => ({
      basket_item_id: row.basket_item_id,
      snapshot_id: row.snapshot_id,
      title: row.title,
      summary: row.summary,
      source_name: row.source_name,
      source_url: row.source_url,
      ai_hot_url: row.ai_hot_url,
      published_at: row.published_at,
      captured_at: row.captured_at,
      category: row.category,
      category_source_raw: row.category_source_raw,
      rank: row.rank,
      freshness: freshnessFromPublished(row.published_at),
      added_at: row.added_at,
    }))
    res.json({ data: { inspirations, hotspots } })
  } catch (error) {
    next(error)
  }
})

/** POST /api/creation-basket/items —— 把一条素材加入创作篮（origin 决定引用哪一实体）。 */
router.post('/items', async (req, res, next) => {
  try {
    const input = req.body || {}
    const origin = input.origin
    if (!ORIGINS.has(origin)) {
      return res.status(422).json({ error: 'origin 必须为 inspiration 或 hotspot', code: 'VALIDATION_ERROR', request_id: req.requestId })
    }
    let inspirationId = null
    let hotspotSnapshotId = null
    if (origin === 'inspiration') {
      if (!input.inspiration_id) return res.status(422).json({ error: 'origin=inspiration 时 inspiration_id 必填', code: 'VALIDATION_ERROR', request_id: req.requestId })
      inspirationId = uuidSchema.parse(input.inspiration_id)
    } else {
      if (!input.hotspot_snapshot_id) return res.status(422).json({ error: 'origin=hotspot 时 hotspot_snapshot_id 必填', code: 'VALIDATION_ERROR', request_id: req.requestId })
      hotspotSnapshotId = uuidSchema.parse(input.hotspot_snapshot_id)
    }

    const result = await withTransaction(async (client) => {
      // 先查是否已存在（用于 already_existed 判定与返回既有 id）
      const conflictCols = origin === 'inspiration' ? 'inspiration_id' : 'hotspot_snapshot_id'
      const conflictVal = origin === 'inspiration' ? inspirationId : hotspotSnapshotId
      const existing = await client.query(
        `SELECT id FROM creation_basket_items WHERE workspace_id=$1 AND origin=$2 AND ${conflictCols}=$3`,
        [req.workspaceId, origin, conflictVal],
      )
      if (existing.rows[0]) {
        return { basket_item_id: existing.rows[0].id, already_existed: true }
      }
      const { rows } = await client.query(
        `INSERT INTO creation_basket_items (id, workspace_id, origin, inspiration_id, hotspot_snapshot_id, added_at)
         VALUES ($1,$2,$3,$4,$5, now())
         RETURNING id`,
        [randomUUID(), req.workspaceId, origin, inspirationId, hotspotSnapshotId],
      )
      return { basket_item_id: rows[0].id, already_existed: false }
    })
    res.status(200).json({ data: result })
  } catch (error) {
    next(error)
  }
})

/** DELETE /api/creation-basket/items/:id —— 移除单条。 */
router.delete('/items/:id', async (req, res, next) => {
  try {
    const id = uuidSchema.parse(req.params.id)
    const { rowCount } = await query('DELETE FROM creation_basket_items WHERE id=$1 AND workspace_id=$2', [id, req.workspaceId])
    if (!rowCount) throw notFound('创作篮条目不存在')
    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

/** POST /api/creation-basket/clear —— 按 origin 清空（灵感区 or 热点区）。 */
router.post('/clear', async (req, res, next) => {
  try {
    const origin = req.body?.origin
    if (!ORIGINS.has(origin)) {
      return res.status(422).json({ error: 'origin 必须为 inspiration 或 hotspot', code: 'VALIDATION_ERROR', request_id: req.requestId })
    }
    const { rowCount } = await query('DELETE FROM creation_basket_items WHERE workspace_id=$1 AND origin=$2', [req.workspaceId, origin])
    res.json({ data: { removed_count: rowCount || 0 } })
  } catch (error) {
    next(error)
  }
})

export default router
