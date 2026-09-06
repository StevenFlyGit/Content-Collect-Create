// ============================================================
// creationLlm —— 无状态创作 LLM 接口（plan / draft / rewrite）
// 依据 docs/creation-studio/backend-design.md §6：
// · 不接收 creation_id 作为远端存储依据，不写数据库
// · 响应 Cache-Control: no-store
// · 日志只记录 request_id / 类型 / 引擎 / 耗时 / 状态码，不记录 prompt 与正文
// ============================================================
import { Router } from 'express'
import { z } from 'zod'
import { config } from '../config.js'
import { workspaceRateLimit } from '../rateLimit.js'
import { completeJson, parseModelJson, localPlan, localDraft, localRewrite } from '../llmAdapter.js'

const router = Router()
const llmRateLimit = workspaceRateLimit({ windowMs: config.llm.rateLimitWindowMs, max: config.llm.rateLimitMax })

/* ---------- 请求 / 响应结构 ---------- */

const materialSchema = z.object({
  origin: z.enum(['inspiration', 'hotspot']).optional(),
  title: z.string().trim().min(1, '素材标题不能为空').max(300),
  text: z.string().max(20_000).optional().default(''),
  source_name: z.string().max(200).optional().default(''),
  source_url: z.string().url('素材链接必须为有效 URL').optional().or(z.literal('')),
}, { message: '素材结构不正确' })

const briefSchema = z.object({
  supplement: z.string().max(2000).optional().default(''),
  purpose: z.string().max(500).optional().default(''),
  style: z.string().max(1000).optional().default(''),
})

const planSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(120),
  core_point: z.string().trim().min(1, '核心观点不能为空').max(2000),
  outline_text: z.string().trim().min(1, '大纲不能为空').max(12_000),
})

const contentSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(50_000),
  tags: z.string().max(1000).optional(),
  summary: z.string().max(1000).optional(),
})

const planRequestSchema = z.object({
  request_id: z.string().uuid().optional(),
  materials: z.array(materialSchema).min(1, '至少需要 1 项素材').max(20, '单次最多 20 项素材'),
  ...briefSchema.shape,
})

const draftRequestSchema = z.object({
  request_id: z.string().uuid().optional(),
  plan: planSchema,
  platforms: z.array(z.enum(['xhs', 'wechat'])).min(1, '至少选择 1 个平台').max(2, '最多选择 2 个平台'),
  materials: z.array(materialSchema).min(1).max(20),
  brief: briefSchema.optional().default({ supplement: '', purpose: '', style: '' }),
})

const rewriteRequestSchema = z.object({
  request_id: z.string().uuid().optional(),
  platform: z.enum(['xhs', 'wechat']),
  content: contentSchema,
  instruction: z.string().trim().min(1, '修改要求不能为空').max(2000),
  plan: planSchema.optional(),
  brief: briefSchema.optional(),
})

/* ---------- 工具 ---------- */

function materialBlock(materials) {
  return materials
    .map((m, index) => `【素材 ${index + 1}】${m.origin === 'hotspot' ? '（热点）' : '（灵感）'}\n标题：${m.title}\n内容：${m.text || '（无正文）'}`)
    .join('\n\n')
}

function briefBlock(brief) {
  const lines = []
  if (brief?.supplement) lines.push(`补充说明：${brief.supplement}`)
  if (brief?.purpose) lines.push(`创作目的：${brief.purpose}`)
  if (brief?.style) lines.push(`表达风格：${brief.style}`)
  return lines.length ? lines.join('\n') : '（无额外要求）'
}

function noStore(req, res, next) {
  res.set('Cache-Control', 'no-store')
  next()
}

function logCall(req, kind, engine, startedAt, status) {
  // 安全要求 §9：日志不含 prompt、素材或正文
  console.log(`[llm] request_id=${req.requestId} kind=${kind} engine=${engine} status=${status} duration=${Date.now() - startedAt}ms`)
}

/* ---------- POST /api/llm/creation/plan ---------- */

router.post('/plan', llmRateLimit, noStore, async (req, res, next) => {
  const startedAt = Date.now()
  let engine = 'local'
  try {
    const input = planRequestSchema.parse(req.body || {})
    const materials = input.materials.map((m) => ({ ...m, text: m.text || '' }))
    let plan
    const completion = await completeJson({
      system: '你是中文内容选题编辑。根据素材和要求生成一个选题大纲，只输出 JSON：{"title": string, "core_point": string, "outline_text": string}。title 不超过 40 字；outline_text 保留换行，分 3-4 个小节。',
      user: `${materialBlock(materials)}\n\n${briefBlock(input)}`,
    })
    engine = completion.engine
    if (completion.text) {
      plan = planSchema.parse(parseModelJson(completion.text))
    } else {
      plan = localPlan({ materials, ...input })
    }
    logCall(req, 'plan', engine, startedAt, 200)
    res.json({ data: { plan }, engine, request_id: req.requestId })
  } catch (error) {
    logCall(req, 'plan', engine, startedAt, error.status || 500)
    next(error)
  }
})

/* ---------- POST /api/llm/creation/draft ---------- */

router.post('/draft', llmRateLimit, noStore, async (req, res, next) => {
  const startedAt = Date.now()
  let engine = 'local'
  try {
    const input = draftRequestSchema.parse(req.body || {})
    const drafts = {}
    for (const platform of input.platforms) {
      let content
      const completion = await completeJson({
        system: platform === 'xhs'
          ? '你是小红书图文笔记作者。根据已确认大纲生成正文，只输出 JSON：{"title": string, "body": string, "tags": string}。短段落、口语化、有场景感和具体建议；tags 形如 "#标签1 #标签2"。'
          : '你是微信公众号作者。根据已确认大纲生成正文，只输出 JSON：{"title": string, "body": string, "summary": string}。完整论述、分节展开、表达连贯；summary 不超过 110 字。',
        user: `已确认大纲：\n标题：${input.plan.title}\n核心观点：${input.plan.core_point}\n大纲：\n${input.plan.outline_text}\n\n素材：\n${materialBlock(input.materials)}\n\n${briefBlock(input.brief)}`,
      })
      engine = completion.engine
      if (completion.text) {
        content = contentSchema.parse(parseModelJson(completion.text))
        if (platform === 'xhs' && !content.tags) content.tags = ''
        if (platform === 'wechat' && !content.summary) content.summary = ''
      } else {
        content = localDraft({ plan: input.plan, platform, materials: input.materials, brief: input.brief })
      }
      drafts[platform] = content
    }
    logCall(req, 'draft', engine, startedAt, 200)
    res.json({ data: { drafts }, engine, request_id: req.requestId })
  } catch (error) {
    logCall(req, 'draft', engine, startedAt, error.status || 500)
    next(error)
  }
})

/* ---------- POST /api/llm/creation/rewrite ---------- */

router.post('/rewrite', llmRateLimit, noStore, async (req, res, next) => {
  const startedAt = Date.now()
  let engine = 'local'
  try {
    const input = rewriteRequestSchema.parse(req.body || {})
    let content
    const completion = await completeJson({
      system: `你是中文内容改写助手，只修改当前${input.platform === 'xhs' ? '小红书笔记' : '微信公众号文章'}稿件。只输出 JSON：{"title": string, "body": string${input.platform === 'xhs' ? ', "tags": string' : ', "summary": string'}}。保留原文结构与关键信息，按用户指令调整。`,
      user: `当前稿件：\n标题：${input.content.title}\n正文：${input.content.body}\n\n修改要求：${input.instruction}${input.plan ? `\n\n大纲核心观点：${input.plan.core_point}` : ''}`,
    })
    engine = completion.engine
    if (completion.text) {
      content = contentSchema.parse(parseModelJson(completion.text))
      if (input.platform === 'xhs') content.tags = content.tags ?? input.content.tags ?? ''
      else content.summary = content.summary ?? input.content.summary ?? ''
    } else {
      content = localRewrite({ instruction: input.instruction, content: input.content, plan: input.plan })
    }
    logCall(req, 'rewrite', engine, startedAt, 200)
    res.json({ data: { content }, engine, request_id: req.requestId })
  } catch (error) {
    logCall(req, 'rewrite', engine, startedAt, error.status || 500)
    next(error)
  }
})

export default router
