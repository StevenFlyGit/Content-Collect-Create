import { config } from './config.js'
import { query, withTransaction } from './db.js'
import { deleteObject } from './oss.js'

const BATCH_SIZE = 50

async function enqueueExpiredPendingAssets() {
  return withTransaction(async (client) => {
    const { rows } = await client.query(`
      SELECT id, workspace_id, storage_key
      FROM assets
      WHERE status = 'pending'
        AND created_at < now() - ($1::int * interval '1 minute')
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT $2
    `, [Math.max(config.pendingAssetTtlMinutes, 1), BATCH_SIZE])
    for (const asset of rows) {
      await client.query(`UPDATE assets SET status='deleting', deleted_at=COALESCE(deleted_at, now()) WHERE id=$1`, [asset.id])
      await client.query(`
        INSERT INTO asset_deletion_tasks(workspace_id, asset_id, storage_key, status, next_attempt_at)
        VALUES($1,$2,$3,'pending',now())
        ON CONFLICT(asset_id) DO UPDATE SET status='pending', next_attempt_at=now(), last_error=NULL, updated_at=now()
      `, [asset.workspace_id, asset.id, asset.storage_key])
    }
    return rows.length
  })
}

async function claimDeletionTasks() {
  return withTransaction(async (client) => {
    const { rows } = await client.query(`
      SELECT id, workspace_id, asset_id, storage_key, attempts
      FROM asset_deletion_tasks
      WHERE (status IN ('pending','failed') AND next_attempt_at <= now())
         OR (status='processing' AND updated_at < now() - interval '10 minutes')
      ORDER BY next_attempt_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT $1
    `, [BATCH_SIZE])
    for (const task of rows) {
      await client.query(`UPDATE asset_deletion_tasks SET status='processing', updated_at=now() WHERE id=$1`, [task.id])
    }
    return rows
  })
}

async function finishTask(task) {
  try {
    await deleteObject(task.storage_key)
    await withTransaction(async (client) => {
      await client.query(`UPDATE assets SET status='deleted', deleted_at=COALESCE(deleted_at, now()) WHERE id=$1 AND workspace_id=$2`, [task.asset_id, task.workspace_id])
      await client.query(`UPDATE asset_deletion_tasks SET status='succeeded', updated_at=now(), last_error=NULL WHERE id=$1`, [task.id])
    })
  } catch (error) {
    const attempts = Number(task.attempts || 0) + 1
    const delaySeconds = Math.min(3600, 5 * (2 ** Math.min(attempts - 1, 8)))
    await query(`
      UPDATE asset_deletion_tasks
      SET status='failed', attempts=$1, next_attempt_at=now() + ($2::int * interval '1 second'), last_error=$3, updated_at=now()
      WHERE id=$4
    `, [attempts, delaySeconds, String(error.message || error).slice(0, 1000), task.id]).catch(() => {})
  }
}

export async function runCleanupOnce() {
  if (!config.databaseUrl) return { expired: 0, processed: 0 }
  const expired = await enqueueExpiredPendingAssets()
  const tasks = await claimDeletionTasks()
  for (const task of tasks) await finishTask(task)
  return { expired, processed: tasks.length }
}

let scheduler
export function startCleanupScheduler() {
  if (scheduler || process.env.NODE_ENV === 'test') return scheduler
  const intervalMs = Math.max(config.cleanupIntervalSeconds, 30) * 1000
  scheduler = setInterval(() => {
    runCleanupOnce().catch((error) => console.error('附件清理任务执行失败', error))
  }, intervalMs)
  scheduler.unref?.()
  runCleanupOnce().catch((error) => console.error('附件首次清理任务执行失败', error))
  return scheduler
}
