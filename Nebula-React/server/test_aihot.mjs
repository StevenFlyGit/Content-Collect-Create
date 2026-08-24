import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { config } from './src/config.js'
import {
  AihotClient,
  normalizeItem,
  normalizeItems,
  extractSnapshotFields,
  categoryInfo,
  heatLevelFromScore,
  freshnessFromPublished,
  heatLabel,
} from './src/aihot.js'

let passed = 0
const ok = (name) => { passed++; console.log(`OK   ${name}`) }

// 1) 归一化 /items fixture
const itemsBody = readFileSync('./src/fixtures/items.json', 'utf8')
const items = normalizeItems(itemsBody)
assert(items.length === 6, `items 应有 6 条，实际 ${items.length}`)
const it0 = items[0]
assert(it0.id && it0.title, '归一化 item 含 id/title')
assert(typeof it0.categoryLabel === 'string' && it0.categoryLabel.length > 0, 'categoryLabel 存在')
assert(['surge', 'hot', 'rise', 'steady'].includes(it0.heatLevel), 'heatLevel 合法')
assert(['fresh', 'aging', 'expired', 'unknown'].includes(it0.freshness), 'freshness 合法')
ok(`normalizeItems(/items) -> ${items.length} 条，字段完整`)

// 2) 归一化 /hot-topics fixture（仅 rank/title/source，无 score）
const hotBody = readFileSync('./src/fixtures/hot_topics.json', 'utf8')
const hots = normalizeItems(hotBody)
assert(hots.length > 0, 'hot-topics 应非空')
assert(hots.every((h) => h.heatLevel === 'steady'), 'hot-topics 无 score → steady')
assert(hots.every((h) => typeof h.rank === 'number'), 'hot-topics 含 rank')
ok(`normalizeItems(/hot-topics) -> ${hots.length} 条，rank 保留、heatLevel=steady`)

// 3) 分类 / 热度 / 时效辅助
assert(categoryInfo('ai-models').label === '模型', 'categoryInfo ai-models -> 模型')
assert(heatLevelFromScore(80) === 'surge' && heatLevelFromScore(50) === 'rise' && heatLevelFromScore(10) === 'steady', 'heatLevelFromScore 分级')
assert(freshnessFromPublished(new Date(Date.now() - 3600_000).toISOString()) === 'fresh', 'freshness <48h -> fresh')
assert(freshnessFromPublished(null) === 'unknown', 'freshness 无时间 -> unknown')
assert(heatLabel('surge') === '飙升', 'heatLabel surge -> 飙升')
ok('categoryInfo / heatLevelFromScore / freshnessFromPublished / heatLabel 辅助函数')

// 4) extractSnapshotFields：合法 raw 派生全部字段
const raw = {
  id: 'abc123',
  title: '测试热点',
  summary: '摘要',
  source: { name: '某来源' },
  links: { aihot: 'https://aihot.virxact.com/x/abc123', original: 'https://example.com' },
  publishedAt: new Date().toISOString(),
  discoveredAt: new Date().toISOString(),
  category: 'ai-models',
  reason: '理由',
}
const fields = extractSnapshotFields(raw)
assert(fields.entry_key === 'aihot:abc123', 'entry_key = aihot:<id>')
assert(fields.source === 'aihot' && fields.external_id === 'abc123', 'source/external_id 派生')
assert(fields.summary === '理由', 'summary 取 reason 优先')
ok('extractSnapshotFields 合法 raw -> 字段完整且 entry_key 正确')

// 5) extractSnapshotFields：缺失必填应抛错
let threw = false
try { extractSnapshotFields({ id: 'x', title: 't', source: { name: 's' } /* 缺 links.aihot */ }) } catch { threw = true }
assert(threw, '缺 links.aihot 应抛错')
ok('extractSnapshotFields 缺失必填字段 -> 抛错')

// 6) fixture 回退（强制上游不可达：127.0.0.1:1 立即 ECONNREFUSED）
const client = new AihotClient()
config.aihotUpstreamBase = 'http://127.0.0.1:1'
config.aihotTimeoutMs = 2000
const res = await client.proxy('/items', '')
assert(res.status === 200, 'fixture 回退 status=200')
assert(res.source === 'fixture', `fixture 回退 source=fixture，实际 ${res.source}`)
const fallbackItems = normalizeItems(res.body)
assert(fallbackItems.length === 6, 'fixture 回退 body 可归一化为 6 条')
ok('上游不可达 -> fixture 回退（source=fixture，body 可归一化）')

console.log(`\n所有后端离线单测通过（${passed} 组）`)
