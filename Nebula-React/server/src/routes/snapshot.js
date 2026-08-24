import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { query, withTransaction } from '../db.js'
import { extractSnapshotFields } from '../aihot.js'

const router = Router()

/**
 * POST /api/hotspot-snapshots
 * 前端把 AIHOT 原始 item（raw）提交，后端从 raw 派生所有快照字段后 UPSERT 入 `hotspot_snapshots`。
 * 同 (workspace_id, entry_key) 已存在 → 刷新 snapshot_taken_at 并返回 already_existed=true，不重复入库。
 */
router.post('/', async (req, res, next) => {
  try {
    const raw = req.body?.raw
    if (!raw || typeof raw !== 'object') {
      return res.status(400).json({ error: '缺少 raw 字段', code: 'MISSING_FIELD', request_id: req.requestId })
    }
    const fields = extractSnapshotFields(raw)
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO hotspot_snapshots
           (id, source, external_id, entry_key, title, summary, source_name, source_url, ai_hot_url,
            published_at, captured_at, category, category_source_raw, rank, raw_payload, workspace_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (workspace_id, entry_key) DO UPDATE SET snapshot_taken_at = now()
         RETURNING id, entry_key, snapshot_taken_at, (xmax = 0) AS inserted`,
        [
          randomUUID(), fields.source, fields.external_id, fields.entry_key, fields.title, fields.summary,
          fields.source_name, fields.source_url, fields.ai_hot_url, fields.published_at, fields.captured_at,
          fields.category, fields.category_source_raw, fields.rank, JSON.stringify(fields.raw_payload), req.workspaceId,
        ],
      )
      const row = rows[0]
      return { id: row.id, entry_key: row.entry_key, already_existed: !row.inserted, snapshot_taken_at: row.snapshot_taken_at }
    })
    res.status(200).json({ data: result })
  } catch (error) {
    next(error)
  }
})

export default router
