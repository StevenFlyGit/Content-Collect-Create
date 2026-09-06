// ============================================================
// creationLlm —— 三个无状态创作 LLM 接口（浏览器 → 服务端）
// 依据 docs/creation-studio/backend-design.md §6：
// 请求由浏览器从 IndexedDB 读取并组装，request_id 每次重新生成。
// ============================================================
import { apiFetch } from './api.js'

const requestId = () => crypto.randomUUID()

/** 生成选题大纲。payload: { materials, supplement, purpose, style } → { data: { plan }, engine } */
export function generatePlan(payload) {
  return apiFetch('/llm/creation/plan', { method: 'POST', body: JSON.stringify({ request_id: requestId(), ...payload }) })
}

/** 为一个或两个平台生成正文。payload: { plan, platforms, materials, brief } → { data: { drafts } } */
export function generateDraft(payload) {
  return apiFetch('/llm/creation/draft', { method: 'POST', body: JSON.stringify({ request_id: requestId(), ...payload }) })
}

/** 按指令改写当前平台稿件。payload: { platform, content, instruction, plan, brief } → { data: { content } } */
export function rewriteDraft(payload) {
  return apiFetch('/llm/creation/rewrite', { method: 'POST', body: JSON.stringify({ request_id: requestId(), ...payload }) })
}
