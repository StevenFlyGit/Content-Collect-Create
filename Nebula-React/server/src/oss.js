import OSS from 'ali-oss'
import { config } from './config.js'

let client
export function getOssClient() {
  if (client) return client
  if (!config.oss.endpoint || !config.oss.bucket || !config.oss.accessKeyId || !config.oss.accessKeySecret) {
    throw new Error('OSS 配置不完整')
  }
  client = new OSS({
    region: config.oss.region || undefined,
    endpoint: config.oss.endpoint,
    bucket: config.oss.bucket,
    accessKeyId: config.oss.accessKeyId,
    accessKeySecret: config.oss.accessKeySecret,
    secure: true,
  })
  return client
}

export function signedPutUrl(key, mimeType) {
  return getOssClient().signatureUrl(key, {
    method: 'PUT',
    expires: config.presignTtl,
    'Content-Type': mimeType,
  })
}

export function signedGetUrl(key) {
  return getOssClient().signatureUrl(key, { expires: config.presignTtl })
}

export async function headObject(key) {
  return getOssClient().head(key)
}

export async function getObjectStream(key) {
  const result = await getOssClient().getStream(key)
  return result.stream || result
}

export async function deleteObject(key) {
  return getOssClient().delete(key)
}

export async function checkOss() {
  await getOssClient().getBucketInfo()
  return true
}

const CORS_ALLOWED_METHODS = ['PUT', 'POST', 'GET', 'HEAD']
const CORS_ALLOWED_HEADERS = ['content-type', 'content-length', 'cache-control', 'origin']
const CORS_EXPOSE_HEADERS = ['etag', 'x-oss-hash-crc64ecma', 'content-length']

function normalizeRule(rule) {
  return {
    allowedOrigin: Array.isArray(rule.allowedOrigin) ? rule.allowedOrigin : rule.allowedOrigin ? [rule.allowedOrigin] : [],
    allowedMethod: (Array.isArray(rule.allowedMethod) ? rule.allowedMethod : rule.allowedMethod ? [rule.allowedMethod] : []).map((s) => String(s).toUpperCase()),
    allowedHeader: (Array.isArray(rule.allowedHeader) ? rule.allowedHeader : rule.allowedHeader ? [rule.allowedHeader] : []).map((s) => String(s).toLowerCase()),
    exposeHeader: (Array.isArray(rule.exposeHeader) ? rule.exposeHeader : rule.exposeHeader ? [rule.exposeHeader] : []).map((s) => String(s).toLowerCase()),
    maxAgeSeconds: rule.maxAgeSeconds || 86400,
  }
}

function ruleCoversOrigins(rule, origins) {
  return origins.every((origin) => rule.allowedOrigin.includes(origin) || rule.allowedOrigin.includes('*'))
}

function buildRequiredRule(origins) {
  return {
    allowedOrigin: origins,
    allowedMethod: CORS_ALLOWED_METHODS.map((s) => s.toUpperCase()),
    allowedHeader: CORS_ALLOWED_HEADERS.map((s) => s.toLowerCase()),
    exposeHeader: CORS_EXPOSE_HEADERS.map((s) => s.toLowerCase()),
    maxAgeSeconds: 86400,
  }
}

function ruleKey(rule) {
  const parts = [
    ...rule.allowedOrigin.slice().sort(),
    ...rule.allowedMethod.slice().sort(),
    ...rule.allowedHeader.slice().sort(),
    ...rule.exposeHeader.slice().sort(),
    String(rule.maxAgeSeconds),
  ]
  return parts.join('|')
}

function dedupeRules(rules) {
  const seen = new Set()
  return rules.filter((rule) => {
    const key = ruleKey(rule)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function getBucketCors() {
  try {
    const result = await getOssClient().getBucketCORS(config.oss.bucket)
    const rules = Array.isArray(result.corsRules) ? result.corsRules : Array.isArray(result.rules) ? result.rules : []
    return rules.map(normalizeRule)
  } catch (error) {
    if (error?.code === 'NoSuchCORSConfiguration' || error?.status === 404 || String(error?.message).includes('NoSuchCORSConfiguration')) {
      return []
    }
    throw error
  }
}

export async function setBucketCors(rules) {
  return getOssClient().putBucketCORS(config.oss.bucket, rules)
}

export async function ensureBucketCors() {
  const origins = config.oss.corsOrigins
  if (!origins.length) return { updated: false, reason: '未配置 OSS_CORS_ORIGINS' }

  const existing = await getBucketCors()
  const requiredRule = buildRequiredRule(origins)

  const alreadyCovers = existing.some((rule) => {
    if (!rule.allowedMethod.includes('PUT')) return false
    if (!rule.allowedHeader.includes('content-type')) return false
    return ruleCoversOrigins(rule, origins)
  })

  if (alreadyCovers) {
    const deduped = dedupeRules(existing)
    if (deduped.length !== existing.length) {
      await setBucketCors(deduped)
      return { updated: true, reason: '已清理重复 CORS 规则', rules: deduped }
    }
    return { updated: false, reason: '现有 CORS 规则已覆盖配置来源', rules: existing }
  }

  const nextRules = dedupeRules([...existing, requiredRule])
  await setBucketCors(nextRules)
  return { updated: true, rules: nextRules }
}