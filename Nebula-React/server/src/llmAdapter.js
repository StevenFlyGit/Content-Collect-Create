// ============================================================
// llmAdapter —— 无状态 LLM 调用适配器
// 依据 docs/creation-studio/backend-design.md §2 / §6：
// · 只做鉴权、模型调用与结构校验，不落库、不保存请求正文或结果
// · 未配置 LLM_API_KEY 时使用确定性本地回退，保证创作流程可用
// · 临时网络错误最多自动重试一次
// ============================================================
import { config } from './config.js'

const REQUEST_TIMEOUT_MS = 60_000

/**
 * 调用 OpenAI 兼容 chat/completions，返回 JSON 文本。
 * 未配置密钥时返回 { text: null, engine: 'local' }，由调用方走本地回退。
 */
export async function completeJson({ system, user }) {
  if (!config.llm.apiKey) return { text: null, engine: 'local' }
  const url = `${config.llm.baseUrl.replace(/\/$/, '')}/chat/completions`
  const body = JSON.stringify({
    model: config.llm.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  })
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${config.llm.apiKey}` }

  let lastError = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(url, { method: 'POST', headers, body, signal: controller.signal })
      clearTimeout(timer)
      if (!response.ok) {
        const error = new Error(`LLM 服务返回 ${response.status}`)
        error.status = 502
        error.code = 'LLM_UPSTREAM_ERROR'
        throw error
      }
      const payload = await response.json().catch(() => null)
      if (!payload) {
        // 上游返回非 JSON（如网关 HTML 错误页）：给明确 502，避免落入无状态的 500
        const error = new Error('模型服务返回了无法解析的响应')
        error.status = 502
        error.code = 'LLM_INVALID_RESPONSE'
        throw error
      }
      const text = payload?.choices?.[0]?.message?.content
      if (!text) {
        const error = new Error('LLM 未返回内容')
        error.status = 502
        error.code = 'LLM_EMPTY_RESPONSE'
        throw error
      }
      return { text, engine: 'llm', usage: payload?.usage || null }
    } catch (error) {
      clearTimeout(timer)
      // 业务错误（上游 4xx/5xx、空响应、非 JSON）不重试；仅网络类错误重试一次
      if (error.code === 'LLM_UPSTREAM_ERROR' || error.code === 'LLM_EMPTY_RESPONSE' || error.code === 'LLM_INVALID_RESPONSE') throw error
      lastError = error
    }
  }
  const error = new Error('模型服务暂时不可用，请稍后重试')
  error.status = 502
  error.code = 'LLM_NETWORK_ERROR'
  throw error
}

/** 解析模型输出为 JSON；失败抛 502 结构错误。 */
export function parseModelJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    const error = new Error('模型返回内容不是有效 JSON')
    error.status = 502
    error.code = 'LLM_INVALID_OUTPUT'
    throw error
  }
}

/* ---------- 本地确定性回退（与原型演示逻辑对齐） ---------- */

export function localPlan({ materials, supplement, purpose, style }) {
  const first = materials[0]
  const thought = String(supplement || '').trim()
  const title = thought ? thought.replace(/[。！？].*$/, '').slice(0, 40) : first.title
  const corePoint = thought || first.text || first.title
  const outline = [
    '一、从读者熟悉的问题切入',
    `结合「${first.title}」，说明这次想讨论的现象。`,
    '',
    '二、表达这篇内容的核心观点',
    corePoint,
    '',
    '三、把观点落到具体做法',
    '用一个范围明确的小任务举例，先做出第一版，再根据实际反馈调整。',
    '',
    '四、回到读者自己的节奏',
    '用一个今天就能开始的行动建议收尾，不夸张，不制造焦虑。',
  ].join('\n')
  return {
    title,
    core_point: corePoint,
    outline_text: outline,
    _meta: { purpose: purpose || '', style: style || '' },
  }
}

export function localDraft({ plan, platform, materials, brief }) {
  const body = [
    plan.core_point,
    '',
    plan.outline_text,
    platform === 'wechat'
      ? '\n\n把注意力放回真正需要完成的事情，我们就能更清楚地判断工具有没有帮助。先写下自己的想法，再让工具协助整理结构；完成第一版后，保留自己认可的内容，删掉那些并不认同的表达。\n\n不必等全部准备好才动手。先完成一件小事，从作品和反馈中形成自己的判断。'
      : '\n\n先从今天能完成的一小步开始。你想先试哪一件事？',
  ].join('\n')
  return {
    title: plan.title,
    body,
    ...(platform === 'xhs'
      ? { tags: '#个人成长 #学习方法' }
      : { summary: (brief?.purpose || plan.core_point || '').slice(0, 110) }),
  }
}

export function localRewrite({ instruction, content, plan }) {
  const next = { ...content }
  const text = String(instruction || '')
  if (/精简|短|压缩/.test(text)) {
    next.body = content.body.split('\n\n').filter((_, index) => index % 3 !== 2).join('\n\n')
  } else if (/开头|直接/.test(text)) {
    next.body = `先说结论：${plan?.core_point || ''}\n\n${content.body}`
  } else {
    next.body = `我们可以先把目标放小一点，从眼前这件事开始。\n\n${content.body}`
  }
  return next
}
