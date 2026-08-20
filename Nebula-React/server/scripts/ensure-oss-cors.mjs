#!/usr/bin/env node
/**
 * 手动为 OSS Bucket 配置浏览器直传所需的 CORS 规则。
 * 当服务端 AK/SK 缺少 PutBucketCORS 权限时，启动阶段会自动跳过 CORS 配置；
 * 此时可让有权限的账号运行此脚本，或在阿里云控制台手动添加规则。
 *
 * 用法：
 *   node scripts/ensure-oss-cors.mjs
 *
 * 环境变量（与服务端 .env.local 一致）：
 *   OSS_REGION, OSS_ENDPOINT, OSS_BUCKET,
 *   OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET,
 *   CORS_ORIGIN（可选，默认 http://localhost:5173）,
 *   OSS_CORS_ORIGINS（可选，逗号分隔，默认取 CORS_ORIGIN）
 */
import '../src/config.js'
import { ensureBucketCors, getBucketCors } from '../src/oss.js'
import { config } from '../src/config.js'

async function main() {
  console.log(`目标 Bucket：${config.oss.bucket}`)
  console.log(`待配置来源：${config.oss.corsOrigins.join(', ') || '(空)'}`)

  const before = await getBucketCors()
  console.log(`现有 CORS 规则数：${before.length}`)

  const result = await ensureBucketCors()
  if (result.updated) {
    console.log('✅ 已更新 Bucket CORS 规则')
    console.log(JSON.stringify(result.rules, null, 2))
  } else {
    console.log(`ℹ️ ${result.reason}`)
  }
}

main().catch((error) => {
  console.error('❌ 配置失败：', error.message || error)
  process.exit(1)
})
