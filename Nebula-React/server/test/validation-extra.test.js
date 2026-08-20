import test from 'node:test'
import assert from 'node:assert/strict'
import { inspirationTypeCreateSchema } from '../src/validators.js'
import { validateBoardInput } from '../src/routes/boards.js'
import { workspaceRateLimit } from '../src/rateLimit.js'

const ID = '11111111-1111-4111-8111-111111111111'

test('自定义类型可由服务端生成 slug', () => {
  const value = inspirationTypeCreateSchema.parse({ label: '产品观察', color_token: '--ink-muted' })
  assert.equal(value.slug, undefined)
  assert.equal(value.label, '产品观察')
})

test('自定义类型拒绝非法颜色变量', () => {
  assert.throws(
    () => inspirationTypeCreateSchema.parse({ label: '产品观察', color_token: 'red' }),
    /颜色必须为合法 CSS 变量名/
  )
})

test('白板输入接受合法位置与版本', () => {
  const value = validateBoardInput({
    board_date: '2026-08-19',
    layout_version: 0,
    positions: [{ inspiration_id: ID, x: 32, y: 28, z: 1, rotation: -1.5 }],
  })
  assert.equal(value.boardDate, '2026-08-19')
  assert.equal(value.layoutVersion, 0)
  assert.deepEqual(value.positions[0], { id: ID, position: { x: 32, y: 28, z: 1, rotation: -1.5 } })
})

test('白板输入将旧版 pos 位置转换为坐标', () => {
  const value = validateBoardInput({
    board_date: '2026-08-19',
    layout_version: 0,
    positions: [{ inspiration_id: ID, board_position_json: { pos: 's5' } }],
  })
  assert.deepEqual(value.positions[0], { id: ID, position: { x: 32, y: 218, z: 5, rotation: -1 } })
})

test('白板输入拒绝不存在日期、非有限坐标和负版本', () => {
  assert.throws(() => validateBoardInput({ board_date: '2026-02-30', layout_version: 0, positions: [] }), /日期不存在/)
  assert.throws(() => validateBoardInput({ board_date: '2026-08-19', layout_version: -1, positions: [] }), /非负整数/)
  assert.throws(() => validateBoardInput({ board_date: '2026-08-19', layout_version: 0, positions: [{ inspiration_id: ID, x: 'NaN', y: 1 }] }), /有限数字/)
})

test('工作区限流在阈值内放行，超限返回 429', () => {
  const middleware = workspaceRateLimit({ windowMs: 60_000, max: 2 })
  const req = { workspaceId: ID, ip: '192.0.2.10', requestId: 'request-test' }
  const headers = {}
  let statusCode = 200
  let payload
  let nextCount = 0
  const res = {
    set(name, value) { headers[name] = value; return this },
    status(code) { statusCode = code; return this },
    json(value) { payload = value; return this },
  }
  const next = () => { nextCount += 1 }

  middleware(req, res, next)
  middleware(req, res, next)
  middleware(req, res, next)

  assert.equal(nextCount, 2)
  assert.equal(statusCode, 429)
  assert.equal(payload.code, 'RATE_LIMITED')
  assert.equal(payload.request_id, 'request-test')
  assert.equal(headers['X-RateLimit-Remaining'], '0')
  assert.ok(Number(headers['Retry-After']) >= 1)
})
