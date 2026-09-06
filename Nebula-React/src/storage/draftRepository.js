// ============================================================
// draftRepository —— 平台稿件、版本撤销与 chatbot 对话
// 依据 docs/creation-studio/backend-design.md §4.1 platform_drafts /
// draft_revisions / chat_messages
// content 结构：{ title, body, summary, tags }；xhs 用 tags，wechat 用 summary。
// ============================================================
import { creationTx, idb, STORES } from './creationDb.js'

const nowIso = () => new Date().toISOString()
const MAX_REVISIONS = 20

async function mustGetDraft(stores, creationId, platform) {
  const draft = await idb(stores[STORES.drafts].get([creationId, platform]))
  if (!draft) throw Object.assign(new Error('该平台稿件尚未生成'), { code: 'DRAFT_NOT_FOUND' })
  return draft
}

export async function getDraft(creationId, platform) {
  return creationTx([STORES.drafts], 'readonly', (stores) => idb(stores[STORES.drafts].get([creationId, platform])))
}

export async function listDrafts(creationId) {
  const all = await creationTx([STORES.drafts], 'readonly', (stores) => idb(stores[STORES.drafts].getAll()))
  const result = {}
  for (const draft of all) if (draft.creation_id === creationId) result[draft.platform] = draft
  return result
}

/**
 * 保存稿件（生成 / 手动编辑 / 改写 / 恢复共用）：
 * version 递增 + 写入 revision + 修剪最旧的非固定版本 + 触碰会话，单事务原子提交。
 */
export async function saveDraft(creationId, platform, content, { origin = 'manual', sourcePlanVersion = null } = {}) {
  return creationTx([STORES.drafts, STORES.revisions, STORES.creations], 'readwrite', async (stores) => {
    const current = await idb(stores[STORES.drafts].get([creationId, platform]))
    const version = (current?.version || 0) + 1
    const updatedAt = nowIso()
    const next = {
      creation_id: creationId,
      platform,
      content: {
        title: content.title ?? current?.content?.title ?? '',
        body: content.body ?? current?.content?.body ?? '',
        summary: content.summary ?? current?.content?.summary ?? '',
        tags: content.tags ?? current?.content?.tags ?? '',
      },
      version,
      source_plan_version: sourcePlanVersion ?? current?.source_plan_version ?? null,
      completed_at: null,
      updated_at: updatedAt,
    }
    stores[STORES.drafts].put(next)
    stores[STORES.revisions].put({
      creation_id: creationId,
      platform,
      version,
      content: next.content,
      origin,
      source_plan_version: next.source_plan_version,
      pinned: false,
      created_at: updatedAt,
    })
    // 修剪：每个平台最多保留最近 20 个版本，固定版本不参与清理
    const revisions = (await idb(stores[STORES.revisions].index('by_creation_platform').getAll([creationId, platform])))
      .sort((a, b) => b.version - a.version)
    for (const revision of revisions.slice(MAX_REVISIONS)) {
      if (!revision.pinned) stores[STORES.revisions].delete([creationId, platform, revision.version])
    }
    const creation = await idb(stores[STORES.creations].get(creationId))
    if (creation) stores[STORES.creations].put({ ...creation, updated_at: nowIso() })
    return next
  })
}

/** 完成当前平台稿件；全部已选平台完成后创作会话标记 completed。 */
export async function completeDraft(creationId, platform) {
  return creationTx([STORES.drafts, STORES.creations], 'readwrite', async (stores) => {
    const draft = await mustGetDraft(stores, creationId, platform)
    const updatedAt = nowIso()
    stores[STORES.drafts].put({ ...draft, completed_at: updatedAt, updated_at: updatedAt })
    const creation = await idb(stores[STORES.creations].get(creationId))
    if (creation) {
      const selected = creation.selected_platforms?.length ? creation.selected_platforms : [platform]
      const drafts = []
      for (const p of selected) drafts.push(await idb(stores[STORES.drafts].get([creationId, p])))
      const allCompleted = drafts.every((d) => d?.completed_at)
      stores[STORES.creations].put({
        ...creation,
        status: allCompleted ? 'completed' : 'in_progress',
        updated_at: nowIso(),
      })
    }
    return updatedAt
  })
}

export async function listRevisions(creationId, platform) {
  const all = await creationTx([STORES.revisions], 'readonly', (stores) =>
    idb(stores[STORES.revisions].index('by_creation_platform').getAll([creationId, platform])))
  return all.sort((a, b) => b.version - a.version)
}

/** 撤销：恢复到上一版本（生成新 revision，origin=restore）。 */
export async function restorePreviousRevision(creationId, platform) {
  const revisions = await listRevisions(creationId, platform)
  if (revisions.length < 2) return null
  const target = revisions[1]
  return saveDraft(creationId, platform, target.content, { origin: 'restore' })
}

export async function listChatMessages(creationId, platform) {
  const all = await creationTx([STORES.messages], 'readonly', (stores) =>
    idb(stores[STORES.messages].index('by_creation_platform_time').getAll([creationId, platform])))
  return all.sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
}

export async function addChatMessage({ creation_id, platform, role, text, applied_version = null, status = 'done' }) {
  const message = {
    id: crypto.randomUUID(),
    creation_id,
    platform,
    role,
    text,
    applied_version,
    status,
    created_at: nowIso(),
  }
  await creationTx([STORES.messages], 'readwrite', (stores) => { stores[STORES.messages].put(message) })
  return message
}
