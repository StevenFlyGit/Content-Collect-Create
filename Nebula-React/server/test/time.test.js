import test from 'node:test'
import assert from 'node:assert/strict'
import { businessDateRange } from '../src/time.js'
import { dateSchema } from '../src/validators.js'

test('Asia/Shanghai 业务日期转换为 UTC 边界', () => {
  const range = businessDateRange('2026-08-19', 'Asia/Shanghai')
  assert.equal(range.start.toISOString(), '2026-08-18T16:00:00.000Z')
  assert.equal(range.end.toISOString(), '2026-08-19T16:00:00.000Z')
})

test('不存在的自然日会被拒绝', () => {
  assert.throws(() => dateSchema.parse('2026-02-30'))
  assert.throws(() => businessDateRange('2026-02-30', 'Asia/Shanghai'), /日期不存在/)
})
