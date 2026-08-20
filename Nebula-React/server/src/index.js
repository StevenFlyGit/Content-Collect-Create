import express from 'express'
import cors from 'cors'
import { randomUUID } from 'node:crypto'
import { config, assertServerConfig } from './config.js'
import { query } from './db.js'
import { workspaceContext } from './auth.js'
import { checkOss, ensureBucketCors } from './oss.js'
import { errorResponse } from './errors.js'
import inspirationRoutes from './routes/inspirations.js'
import assetRoutes from './routes/assets.js'
import typeRoutes from './routes/types.js'
import boardRoutes from './routes/boards.js'
import { startCleanupScheduler } from './cleanup.js'
import { workspaceRateLimit } from './rateLimit.js'

const app = express()
if (config.trustProxy !== '0' && config.trustProxy !== 'false') app.set('trust proxy', Number.isNaN(Number(config.trustProxy)) ? config.trustProxy : Number(config.trustProxy))
app.use((req, res, next) => {
  req.requestId = req.get('x-request-id') || randomUUID()
  res.set('X-Request-Id', req.requestId)
  next()
})
app.use(cors({ origin: config.corsOrigin.split(',').map((item) => item.trim()), methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-Workspace-Id', 'Idempotency-Key', 'X-Request-Id'] }))
app.use(express.json({ limit: '2mb' }))

async function dependencyStatus() {
  const health = { api: 'ok', database: 'unknown', oss: 'unknown' }
  try { await query('SELECT 1'); health.database = 'ok' } catch { health.database = 'error' }
  try { await checkOss(); health.oss = 'ok' } catch { health.oss = 'error' }
  return health
}

app.get('/api/live', (req, res) => res.json({ status: 'ok', api: 'ok', request_id: req.requestId }))
app.get('/api/ready', async (req, res) => {
  const health = await dependencyStatus()
  const ok = health.database === 'ok' && health.oss === 'ok'
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', ...health, request_id: req.requestId })
})
app.get('/api/health', async (req, res) => {
  const health = await dependencyStatus()
  const ok = health.database === 'ok' && health.oss === 'ok'
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', ...health, request_id: req.requestId })
})
app.use('/api', workspaceContext)
app.use('/api', workspaceRateLimit({ windowMs: config.rateLimitWindowMs, max: config.rateLimitMax }))
app.use('/api/inspirations', inspirationRoutes)
app.use('/api/assets', assetRoutes)
app.use('/api/inspiration-types', typeRoutes)
app.use('/api/daily-boards', boardRoutes)
app.use((req, res) => res.status(404).json({ error: '接口不存在', code: 'NOT_FOUND', request_id: req.requestId }))
app.use((error, req, res, next) => errorResponse(res, error, req))

if (process.env.NODE_ENV !== 'test') {
  assertServerConfig()
  app.listen(config.port, async () => {
    console.log(`Nebula 灵感 API 已启动：http://localhost:${config.port}`)
    startCleanupScheduler()
    try {
      const result = await ensureBucketCors()
      if (result.updated) {
        console.log(`OSS Bucket CORS 已自动更新：已添加对 ${config.oss.corsOrigins.join(', ')} 的跨域支持`)
      } else {
        console.log(`OSS Bucket CORS 检查通过：${result.reason}`)
      }
    } catch (error) {
      console.warn(`OSS Bucket CORS 自动配置失败：${error.message || error}。若前端直传 OSS 仍报跨域，请在阿里云控制台手动配置，或运行 server/scripts/ensure-oss-cors.mjs。`)
    }
  })
}

export default app

