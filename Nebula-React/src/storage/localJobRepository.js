// ============================================================
// localJobRepository —— 本地生成任务状态与刷新恢复
// 依据 docs/creation-studio/backend-design.md §4.1 local_jobs
// 只保存恢复界面需要的状态，不保存 prompt。
// ============================================================
import { creationTx, idb, STORES } from './creationDb.js'

const nowIso = () => new Date().toISOString()

/**
 * 创建本地任务。kind: plan | draft | rewrite；
 * draft 为双平台时 platforms 为数组。
 */
export async function createJob({ creation_id, kind, platforms = null, base_version = null }) {
  const timestamp = nowIso()
  const job = {
    id: crypto.randomUUID(),
    creation_id,
    kind,
    platforms,
    state: 'running',
    base_version,
    request_id: crypto.randomUUID(),
    error_code: null,
    created_at: timestamp,
    updated_at: timestamp,
  }
  await creationTx([STORES.jobs], 'readwrite', (stores) => { stores[STORES.jobs].put(job) })
  return job
}

/** 更新任务终态：state = succeeded | failed | interrupted。 */
export async function finishJob(id, { state, error_code = null }) {
  return creationTx([STORES.jobs], 'readwrite', async (stores) => {
    const job = await idb(stores[STORES.jobs].get(id))
    if (!job) return null
    const next = { ...job, state, error_code, updated_at: nowIso() }
    stores[STORES.jobs].put(next)
    return next
  })
}

/** 查询某创作最近一次任务（按 updated_at 倒序）。 */
export async function getLatestJob(creationId) {
  const all = await creationTx([STORES.jobs], 'readonly', (stores) => idb(stores[STORES.jobs].getAll()))
  return all
    .filter((job) => job.creation_id === creationId)
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))[0] || null
}

/**
 * 页面刷新 / 首次加载时调用：遗留 running 任务 → interrupted。
 * 返回被中断的任务数，供界面提示「上次生成被中断，可重试」。
 */
export async function interruptRunningJobs() {
  const all = await creationTx([STORES.jobs], 'readwrite', async (stores) => {
    const jobs = await idb(stores[STORES.jobs].getAll())
    let interrupted = 0
    for (const job of jobs) {
      if (job.state === 'running') {
        stores[STORES.jobs].put({ ...job, state: 'interrupted', error_code: 'INTERRUPTED', updated_at: nowIso() })
        interrupted += 1
      }
    }
    return interrupted
  })
  return all
}
