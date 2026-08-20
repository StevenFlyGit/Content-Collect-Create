import { randomUUID } from 'node:crypto'
import { config } from './config.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function workspaceContext(req, res, next) {
  const id = req.get('x-workspace-id') || config.workspaceId
  if (!id) return res.status(401).json({ error: '缺少工作区上下文', code: 'WORKSPACE_REQUIRED', request_id: req.requestId })
  if (!UUID_PATTERN.test(id)) return res.status(422).json({ error: '工作区标识格式不正确', code: 'WORKSPACE_INVALID', request_id: req.requestId })
  req.workspaceId = id
  next()
}

export function idempotencyKey(req) {
  return req.get('idempotency-key') || req.body?.idempotency_key || randomUUID()
}
