import pg from 'pg'
import { config } from './config.js'

const { Pool } = pg
export const pool = config.databaseUrl
  ? new Pool({
      connectionString: config.databaseUrl,
      max: Number(process.env.DB_POOL_MAX || 5),
      idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 10000),
      connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5000),
      ssl: config.databaseSsl ? { rejectUnauthorized: config.databaseSslRejectUnauthorized, ...(config.databaseSslCa ? { ca: config.databaseSslCa } : {}) } : false,
      application_name: 'nebula-inspiration-api',
    })
  : null

export async function withTransaction(callback) {
  if (!pool) throw new Error('DATABASE_URL 未配置')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function query(text, params) {
  if (!pool) throw new Error('DATABASE_URL 未配置')
  return pool.query(text, params)
}

