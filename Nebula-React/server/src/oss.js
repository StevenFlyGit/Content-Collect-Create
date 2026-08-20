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