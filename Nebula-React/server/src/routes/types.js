import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { query } from '../db.js'
import { inspirationTypeCreateSchema } from '../validators.js'
import { conflict } from '../errors.js'

const router = Router()

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id,slug,label,color_token,icon,sort_order FROM inspiration_types WHERE (workspace_id=$1 OR workspace_id IS NULL) AND archived_at IS NULL ORDER BY sort_order, workspace_id NULLS FIRST, label', [req.workspaceId])
    res.json({ data: rows })
  } catch (error) { next(error) }
})

router.post('/', async (req, res, next) => {
  try {
    const input = inspirationTypeCreateSchema.parse(req.body)
    const existing = await query('SELECT id FROM inspiration_types WHERE label=$1 AND (workspace_id=$2 OR workspace_id IS NULL) AND archived_at IS NULL LIMIT 1', [input.label, req.workspaceId])
    if (existing.rows[0]) throw conflict('该灵感类型名称已存在', 'TYPE_LABEL_EXISTS')
    const slug = input.slug || `custom-${randomUUID().slice(0, 8)}`
    const { rows } = await query(
      'INSERT INTO inspiration_types(workspace_id,slug,label,color_token,icon) VALUES($1,$2,$3,$4,$5) RETURNING id,slug,label,color_token,icon,sort_order',
      [req.workspaceId, slug, input.label, input.color_token, input.icon || null]
    )
    res.status(201).json({ data: rows[0] })
  } catch (error) { next(error) }
})

export default router
