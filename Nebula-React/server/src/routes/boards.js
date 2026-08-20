import { Router } from 'express'
import { withTransaction } from '../db.js'
import { conflict } from '../errors.js'
import { dateSchema, uuidSchema } from '../validators.js'

const router = Router()

const LEGACY_ROTATIONS = [-1.5, 0.8, -0.5, 1.2, -1, 0.4, -0.6]

function legacyPosition(value, index) {
  const match = String(value || '').match(/^s(\d+)$/i)
  const ordinal = Math.max(1, Number(match?.[1] || index + 1))
  return {
    x: 32 + ((ordinal - 1) % 4) * 270,
    y: 28 + Math.floor((ordinal - 1) / 4) * 190,
    z: ordinal,
    rotation: LEGACY_ROTATIONS[(ordinal - 1) % LEGACY_ROTATIONS.length],
  }
}

function finiteNumber(value, field) {
  const number = Number(value)
  if (!Number.isFinite(number)) throw Object.assign(new Error(`${field} 必须为有限数字`), { status: 422, code: 'VALIDATION_ERROR' })
  return number
}

export function validateBoardInput(body) {
  const boardDate = dateSchema.parse(body.board_date)
  if (!Array.isArray(body.positions)) throw Object.assign(new Error('positions 必须为数组'), { status: 422, code: 'VALIDATION_ERROR' })
  if (body.positions.length > 100) throw Object.assign(new Error('单次最多保存 100 个白板位置'), { status: 422, code: 'VALIDATION_ERROR' })
  const layoutVersion = body.layout_version == null ? null : Number(body.layout_version)
  if (layoutVersion != null && (!Number.isInteger(layoutVersion) || layoutVersion < 0)) throw Object.assign(new Error('layout_version 必须为非负整数'), { status: 422, code: 'VALIDATION_ERROR' })

  const positions = body.positions.map((item, index) => {
    const id = uuidSchema.parse(item.inspiration_id || item.id)
    const legacy = item.board_position_json ?? item.position
    if (legacy && typeof legacy === 'object' && !Array.isArray(legacy) && legacy.x == null && legacy.y == null && legacy.pos) {
      return { id, position: legacyPosition(legacy.pos, index) }
    }
    const source = legacy && typeof legacy === 'object' && !Array.isArray(legacy) ? legacy : item
    return {
      id,
      position: {
        x: finiteNumber(source.x, 'x'),
        y: finiteNumber(source.y, 'y'),
        z: Math.trunc(finiteNumber(source.z ?? 1, 'z')),
        rotation: finiteNumber(source.rotation ?? 0, 'rotation'),
      },
    }
  })
  return { boardDate, positions, layoutVersion }
}

async function saveBoard(req, res, next) {
  try {
    const { boardDate, positions, layoutVersion } = validateBoardInput(req.body)
    const result = await withTransaction(async (client) => {
      const current = await client.query('SELECT id,layout_version FROM daily_boards WHERE workspace_id=$1 AND board_date=$2 FOR UPDATE', [req.workspaceId, boardDate])
      const currentVersion = current.rows[0]?.layout_version || 0
      if (layoutVersion != null && layoutVersion !== currentVersion) {
        throw conflict('白板布局已被其他操作更新，请刷新后重试', 'BOARD_VERSION_CONFLICT')
      }

      for (const item of positions) {
        const updated = await client.query(`
          UPDATE inspirations
          SET board_position_json=$1
          WHERE id=$2 AND workspace_id=$3 AND deleted_at IS NULL AND sync_status='synced'
          RETURNING id
        `, [JSON.stringify(item.position), item.id, req.workspaceId])
        if (!updated.rows[0]) throw Object.assign(new Error(`灵感不存在、不属于当前工作区或尚未同步：${item.id}`), { status: 422, code: 'INSPIRATION_NOT_FOUND' })
      }

      if (current.rows[0]) {
        const updated = await client.query('UPDATE daily_boards SET layout_version=layout_version+1 WHERE id=$1 RETURNING id,board_date,layout_version', [current.rows[0].id])
        return updated.rows[0]
      }
      const inserted = await client.query('INSERT INTO daily_boards(workspace_id,board_date,layout_version) VALUES($1,$2,1) RETURNING id,board_date,layout_version', [req.workspaceId, boardDate])
      return inserted.rows[0]
    })
    res.json({ data: result })
  } catch (error) { next(error) }
}

router.post('/', saveBoard)
router.patch('/', saveBoard)

export default router
