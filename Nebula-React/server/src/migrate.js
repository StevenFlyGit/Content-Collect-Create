import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertDatabaseConfig } from './config.js'
import { pool, query } from './db.js'

assertDatabaseConfig()
const here = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.join(here, '..', 'migrations')

try {
  const files = (await fs.readdir(migrationsDir))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  if (files.length === 0) {
    console.log('未找到任何迁移脚本')
  }

  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8')
    console.log(`→ 执行迁移：${file}`)
    await query(sql)
  }
  console.log('数据库迁移完成')
} finally {
  await pool?.end()
}
