import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertDatabaseConfig } from './config.js'
import { pool, query } from './db.js'

assertDatabaseConfig()
const here = path.dirname(fileURLToPath(import.meta.url))

try {
  const sql = await fs.readFile(path.join(here, '..', 'migrations', '001_init.sql'), 'utf8')
  await query(sql)
  console.log('数据库迁移完成')
} finally {
  await pool?.end()
}

