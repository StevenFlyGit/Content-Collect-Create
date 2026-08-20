import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { query } from '../db.js'
import { inspirationTypeCreateSchema, inspirationTypePatchSchema } from '../validators.js'
import { conflict, notFound } from '../errors.js'

const router = Router()

// 自定义类型随机配色：六色白名单，不含仅用于“先不分类”的 --ink-muted
const COLOR_POOL = ['--nebula-violet', '--nebula-blue', '--nebula-rose', '--nebula-mint', '--nebula-amber', '--danger']

function typeReadOnlyError() {
  return Object.assign(new Error('系统初始类型不可编辑或删除'), { status: 403, code: 'TYPE_READ_ONLY' })
}
function typeArchivedError() {
  return Object.assign(new Error('该类型已停用，不支持编辑'), { status: 409, code: 'TYPE_ARCHIVED' })
}
function typeNotFoundError() {
  return notFound('灵感类型不存在', 'TYPE_NOT_FOUND')
}

function mapType(row) {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    slug: row.slug,
    label: row.label,
    color_token: row.color_token,
    icon: row.icon,
    sort_order: row.sort_order,
    archived_at: row.archived_at,
    is_system: row.workspace_id === null,
  }
}

// 列表：默认仅活动类型；include_archived=true 时连同已归档类型返回（用于历史展示/维护）
router.get('/', async (req, res, next) => {
  try {
    const includeArchived = req.query.include_archived === 'true'
    const where = ['(workspace_id=$1 OR workspace_id IS NULL)']
    if (!includeArchived) where.push('archived_at IS NULL')
    const { rows } = await query(
      `SELECT id, workspace_id, slug, label, color_token, icon, sort_order, archived_at
       FROM inspiration_types
       WHERE ${where.join(' AND ')}
       ORDER BY sort_order, workspace_id NULLS FIRST, label`,
      [req.workspaceId]
    )
    res.json({ data: rows.map(mapType) })
  } catch (error) { next(error) }
})

// 详情：系统类型或当前工作区类型可见；不可见或不存在返回 404 TYPE_NOT_FOUND
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, workspace_id, slug, label, color_token, icon, sort_order, archived_at
       FROM inspiration_types
       WHERE id=$1 AND (workspace_id=$2 OR workspace_id IS NULL)`,
      [req.params.id, req.workspaceId]
    )
    if (!rows[0]) throw typeNotFoundError()
    res.json({ data: mapType(rows[0]) })
  } catch (error) { next(error) }
})

// 新增或重新启用：前端只提交 label（+可选 icon）；颜色由后端随机分配并持久化
router.post('/', async (req, res, next) => {
  try {
    const input = inspirationTypeCreateSchema.parse(req.body)
    const label = input.label

    // 1) 命中当前工作区已归档同名类型 -> 重新启用（保留原 id/slug/color_token，不新增行）
    const archived = await query(
      'SELECT id FROM inspiration_types WHERE workspace_id=$1 AND label=$2 AND archived_at IS NOT NULL LIMIT 1',
      [req.workspaceId, label]
    )
    if (archived.rows[0]) {
      const { rows } = await query(
        `UPDATE inspiration_types
         SET archived_at=NULL
         WHERE id=$1 AND workspace_id=$2
         RETURNING id, workspace_id, slug, label, color_token, icon, sort_order, archived_at`,
        [archived.rows[0].id, req.workspaceId]
      )
      return res.status(200).json({ data: mapType(rows[0]), meta: { operation: 'reactivated' } })
    }

    // 2) 命中活动同名（系统初始或当前工作区活动自定义）-> 冲突
    const active = await query(
      'SELECT id FROM inspiration_types WHERE label=$1 AND (workspace_id=$2 OR workspace_id IS NULL) AND archived_at IS NULL LIMIT 1',
      [label, req.workspaceId]
    )
    if (active.rows[0]) throw conflict('该灵感类型名称已存在', 'TYPE_LABEL_EXISTS')

    // 3) 真正新增：后端生成 slug 与随机颜色，颜色一经写入保持稳定
    const slug = input.slug || `custom-${randomUUID().slice(0, 8)}`
    const colorToken = COLOR_POOL[Math.floor(Math.random() * COLOR_POOL.length)]
    const { rows } = await query(
      `INSERT INTO inspiration_types(workspace_id, slug, label, color_token, icon)
       VALUES($1,$2,$3,$4,$5)
       RETURNING id, workspace_id, slug, label, color_token, icon, sort_order, archived_at`,
      [req.workspaceId, slug, label, colorToken, input.icon || null]
    )
    res.status(201).json({ data: mapType(rows[0]), meta: { operation: 'created' } })
  } catch (error) { next(error) }
})

// 编辑：仅允许修改工作区自定义类型的 label/icon/sort_order；不改 color_token/slug
router.patch('/:id', async (req, res, next) => {
  try {
    const input = inspirationTypePatchSchema.parse(req.body)
    const { rows } = await query(
      'SELECT id, workspace_id, archived_at FROM inspiration_types WHERE id=$1 AND workspace_id=$2',
      [req.params.id, req.workspaceId]
    )
    if (!rows[0]) throw typeNotFoundError() // 系统类型或其他工作区类型视为不可见
    if (rows[0].workspace_id === null) throw typeReadOnlyError()
    if (rows[0].archived_at !== null) throw typeArchivedError()

    const sets = []
    const values = []
    if (input.label !== undefined) {
      const dup = await query(
        'SELECT id FROM inspiration_types WHERE label=$1 AND workspace_id=$2 AND archived_at IS NULL AND id<>$3 LIMIT 1',
        [input.label, req.workspaceId, req.params.id]
      )
      if (dup.rows[0]) throw conflict('该灵感类型名称已存在', 'TYPE_LABEL_EXISTS')
      sets.push(`label=$${values.length + 1}`)
      values.push(input.label)
    }
    if (input.icon !== undefined) {
      sets.push(`icon=$${values.length + 1}`)
      values.push(input.icon || null)
    }
    if (input.sort_order !== undefined) {
      sets.push(`sort_order=$${values.length + 1}`)
      values.push(input.sort_order)
    }
    if (!sets.length) return res.json({ data: mapType(rows[0]) })

    values.push(req.params.id, req.workspaceId)
    const { rows: updated } = await query(
      `UPDATE inspiration_types
       SET ${sets.join(',')}
       WHERE id=$${values.length - 1} AND workspace_id=$${values.length}
       RETURNING id, workspace_id, slug, label, color_token, icon, sort_order, archived_at`,
      values
    )
    res.json({ data: mapType(updated[0]) })
  } catch (error) { next(error) }
})

// 删除/归档：设置 archived_at，不删除类型行，不级联删除历史灵感
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, workspace_id FROM inspiration_types WHERE id=$1 AND workspace_id=$2',
      [req.params.id, req.workspaceId]
    )
    if (!rows[0]) throw typeNotFoundError()
    if (rows[0].workspace_id === null) throw typeReadOnlyError()
    const { rows: updated } = await query(
      "UPDATE inspiration_types SET archived_at=now() WHERE id=$1 AND workspace_id=$2 RETURNING archived_at",
      [req.params.id, req.workspaceId]
    )
    res.json({ data: { id: req.params.id, archived_at: updated[0].archived_at, status: 'archived' } })
  } catch (error) { next(error) }
})

export default router
