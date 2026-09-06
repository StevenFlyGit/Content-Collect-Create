// ============================================================
// creationRepository —— 创作会话、素材快照、brief 与选题大纲
// 依据 docs/creation-studio/backend-design.md §4.1
// ============================================================
import { creationTx, idb, STORES, readDefaultStyle } from './creationDb.js'

const nowIso = () => new Date().toISOString()

/** 校验 creative id 存在并返回记录，否则抛错。 */
async function mustGetCreation(storeMap, id) {
  const record = await idb(storeMap[STORES.creations].get(id))
  if (!record) throw Object.assign(new Error('创作会话不存在'), { code: 'CREATION_NOT_FOUND' })
  return record
}

/**
 * 建立本地创作会话（原子写入 creations + creation_materials + creation_briefs）。
 * materials: [{ item_id, origin, source_id, title, text, source_name, source_url, captured_at }]
 */
export async function createCreation({ materials }) {
  const id = crypto.randomUUID()
  const createdAt = nowIso()
  const record = {
    id,
    status: 'in_progress',
    stage: 'brief',
    source_count: materials.length,
    title_preview: materials[0]?.title || '未命名创作',
    selected_platforms: [],
    active_platform: 'xhs',
    created_at: createdAt,
    updated_at: createdAt,
    schema_version: 1,
  }
  await creationTx([STORES.creations, STORES.materials, STORES.briefs], 'readwrite', async (stores) => {
    stores[STORES.creations].put(record)
    for (const material of materials) {
      stores[STORES.materials].put({ creation_id: id, ...material })
    }
    stores[STORES.briefs].put({
      creation_id: id,
      supplement: '',
      purpose: '',
      style_snapshot: readDefaultStyle(),
      updated_at: createdAt,
      version: 0,
    })
  })
  return record
}

export async function getCreation(id) {
  return creationTx([STORES.creations], 'readonly', (stores) => idb(stores[STORES.creations].get(id)))
}

/** 创作空间列表：status=in_progress，按 updated_at 倒序。 */
export async function listInProgressCreations() {
  const all = await creationTx([STORES.creations], 'readonly', (stores) => idb(stores[STORES.creations].getAll()))
  return all
    .filter((item) => item.status === 'in_progress')
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
}

/** 更新创作会话字段并触碰 updated_at；patch 中不允许直接改 id。 */
export async function updateCreation(id, patch) {
  return creationTx([STORES.creations], 'readwrite', async (stores) => {
    const record = await mustGetCreation(stores, id)
    const next = { ...record, ...patch, id, updated_at: nowIso() }
    stores[STORES.creations].put(next)
    return next
  })
}

export async function getMaterials(id) {
  const all = await creationTx([STORES.materials], 'readonly', (stores) => idb(stores[STORES.materials].getAll()))
  return all.filter((item) => item.creation_id === id)
}

export async function getBrief(id) {
  return creationTx([STORES.briefs], 'readonly', (stores) => idb(stores[STORES.briefs].get(id)))
}

/** 保存 brief 输入（防抖调用方负责节流）；version 递增，触碰 creation updated_at。 */
export async function saveBrief(id, patch) {
  return creationTx([STORES.briefs, STORES.creations], 'readwrite', async (stores) => {
    const brief = (await idb(stores[STORES.briefs].get(id))) || { creation_id: id }
    const next = {
      ...brief,
      ...patch,
      creation_id: id,
      version: (brief.version || 0) + 1,
      updated_at: nowIso(),
    }
    stores[STORES.briefs].put(next)
    const creation = await mustGetCreation(stores, id)
    stores[STORES.creations].put({ ...creation, updated_at: nowIso() })
    return next
  })
}

export async function getPlan(id) {
  return creationTx([STORES.plans], 'readonly', (stores) => idb(stores[STORES.plans].get(id)))
}

/** 保存大纲编辑（title / core_point / outline_text），version 递增并触碰会话。 */
export async function savePlan(id, fields) {
  return creationTx([STORES.plans, STORES.creations], 'readwrite', async (stores) => {
    const plan = (await idb(stores[STORES.plans].get(id))) || { creation_id: id, version: 0, confirmed_version: null, confirmed_snapshot: null }
    const next = {
      ...plan,
      creation_id: id,
      title: fields.title ?? plan.title ?? '',
      core_point: fields.core_point ?? plan.core_point ?? '',
      outline_text: fields.outline_text ?? plan.outline_text ?? '',
      version: (plan.version || 0) + 1,
      updated_at: nowIso(),
    }
    stores[STORES.plans].put(next)
    const creation = await mustGetCreation(stores, id)
    stores[STORES.creations].put({ ...creation, title_preview: next.title || creation.title_preview, updated_at: nowIso() })
    return next
  })
}

/** 由模型结果写入首个大纲（不递增已有版本序，用于生成落盘）。 */
export async function writeGeneratedPlan(id, { title, core_point, outline_text }) {
  return creationTx([STORES.plans, STORES.creations], 'readwrite', async (stores) => {
    const plan = (await idb(stores[STORES.plans].get(id))) || { creation_id: id, version: 0, confirmed_version: null, confirmed_snapshot: null }
    const next = {
      ...plan,
      creation_id: id,
      title,
      core_point,
      outline_text,
      version: (plan.version || 0) + 1,
      updated_at: nowIso(),
    }
    stores[STORES.plans].put(next)
    const creation = await mustGetCreation(stores, id)
    stores[STORES.creations].put({ ...creation, stage: 'plan', title_preview: title || creation.title_preview, updated_at: nowIso() })
    return next
  })
}

/** 确认大纲：当前三字段冻结为 confirmed_snapshot，stage → platform。 */
export async function confirmPlan(id) {
  return creationTx([STORES.plans, STORES.creations], 'readwrite', async (stores) => {
    const plan = await idb(stores[STORES.plans].get(id))
    if (!plan) throw Object.assign(new Error('选题大纲尚未生成'), { code: 'PLAN_NOT_FOUND' })
    const snapshot = { title: plan.title, core_point: plan.core_point, outline_text: plan.outline_text }
    const next = { ...plan, confirmed_version: plan.version, confirmed_snapshot: snapshot, updated_at: nowIso() }
    stores[STORES.plans].put(next)
    const creation = await mustGetCreation(stores, id)
    const record = { ...creation, stage: 'platform', updated_at: nowIso() }
    stores[STORES.creations].put(record)
    return next
  })
}

/** 删除创作：一个事务清理该 creation_id 下全部数据。 */
export async function deleteCreation(id) {
  await creationTx(
    [STORES.creations, STORES.materials, STORES.briefs, STORES.plans, STORES.drafts, STORES.revisions, STORES.messages, STORES.jobs],
    'readwrite',
    async (stores) => {
      stores[STORES.creations].delete(id)
      for (const material of await idb(stores[STORES.materials].getAll())) {
        if (material.creation_id === id) stores[STORES.materials].delete([id, material.item_id])
      }
      stores[STORES.briefs].delete(id)
      stores[STORES.plans].delete(id)
      for (const platform of ['xhs', 'wechat']) stores[STORES.drafts].delete([id, platform])
      const revisions = await idb(stores[STORES.revisions].index('by_creation_platform').getAllKeys())
      for (const key of revisions) if (key[0] === id) stores[STORES.revisions].delete(key)
      const messageKeys = await idb(stores[STORES.messages].getAllKeys())
      for (const key of messageKeys) {
        const message = await idb(stores[STORES.messages].get(key))
        if (message?.creation_id === id) stores[STORES.messages].delete(key)
      }
      for (const job of await idb(stores[STORES.jobs].getAll())) {
        if (job.creation_id === id) stores[STORES.jobs].delete(job.id)
      }
    },
  )
}
