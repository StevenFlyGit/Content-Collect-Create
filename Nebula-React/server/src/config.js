import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'

const serverRoot = fileURLToPath(new URL('..', import.meta.url))
dotenv.config({ path: `${serverRoot}/.env.local` })
dotenv.config({ path: `${serverRoot}/.env` })

const required = (name, fallback = '') => process.env[name] || fallback

export const config = {
  port: Number(required('API_PORT', '3210')),
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: required('DATABASE_SSL', 'true') !== 'false',
  databaseSslRejectUnauthorized: required('DATABASE_SSL_REJECT_UNAUTHORIZED', 'false') === 'true',
  databaseSslCa: required('DATABASE_SSL_CA'),
  workspaceId: required('WORKSPACE_ID'),
  corsOrigin: required('CORS_ORIGIN', 'http://localhost:5173'),
  appTimezone: required('APP_TIMEZONE', 'Asia/Shanghai'),
  trustProxy: required('TRUST_PROXY', '0'),
  rateLimitWindowMs: Number(required('API_RATE_LIMIT_WINDOW_MS', '60000')),
  rateLimitMax: Number(required('API_RATE_LIMIT_MAX', '300')),
  presignTtl: Number(required('PRESIGN_TTL_SECONDS', '300')),
  pendingAssetTtlMinutes: Number(required('PENDING_ASSET_TTL_MINUTES', '30')),
  cleanupIntervalSeconds: Number(required('CLEANUP_INTERVAL_SECONDS', '300')),
  oss: {
    region: required('OSS_REGION'),
    endpoint: required('OSS_ENDPOINT'),
    bucket: required('OSS_BUCKET'),
    accessKeyId: required('OSS_ACCESS_KEY_ID'),
    accessKeySecret: required('OSS_ACCESS_KEY_SECRET'),
    corsOrigins: required('OSS_CORS_ORIGINS', required('CORS_ORIGIN', 'http://localhost:5173'))
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  },
}

export function assertDatabaseConfig() {
  if (!config.databaseUrl) throw new Error('缺少服务端环境变量：DATABASE_URL')
}

export function assertServerConfig() {
  const missing = []
  if (!config.databaseUrl) missing.push('DATABASE_URL')
  if (!config.workspaceId) missing.push('WORKSPACE_ID')
  if (!config.oss.region) missing.push('OSS_REGION')
  if (!config.oss.endpoint) missing.push('OSS_ENDPOINT')
  if (!config.oss.bucket) missing.push('OSS_BUCKET')
  if (!config.oss.accessKeyId) missing.push('OSS_ACCESS_KEY_ID')
  if (!config.oss.accessKeySecret) missing.push('OSS_ACCESS_KEY_SECRET')
  if (missing.length) throw new Error(`缺少服务端环境变量：${missing.join('、')}`)
  if (!/^\d+$/.test(String(config.port)) || config.port < 1 || config.port > 65535) throw new Error('API_PORT 必须为有效端口')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(config.workspaceId)) throw new Error('WORKSPACE_ID 必须为有效 UUID')
  if (!Number.isFinite(config.presignTtl) || config.presignTtl < 60) throw new Error('PRESIGN_TTL_SECONDS 必须不少于 60 秒')
  if (!Number.isFinite(config.rateLimitWindowMs) || config.rateLimitWindowMs < 1000) throw new Error('API_RATE_LIMIT_WINDOW_MS 必须不少于 1000 毫秒')
  if (!Number.isInteger(config.rateLimitMax) || config.rateLimitMax < 1) throw new Error('API_RATE_LIMIT_MAX 必须为正整数')
}


