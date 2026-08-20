import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCompletedObjectMetadata } from '../src/routes/assets.js'

const asset = { bytes: 1024, mime_type: 'image/jpeg' }

function objectWith(headers = {}) {
  return { res: { headers } }
}

test('附件完成校验接受大小、类型及 ETag 均匹配的 OSS 对象', () => {
  const result = validateCompletedObjectMetadata(asset, objectWith({
    'content-length': '1024',
    'content-type': 'image/jpeg',
    etag: '"abc123"',
  }))
  assert.equal(result.actualBytes, 1024)
  assert.equal(result.actualMime, 'image/jpeg')
  assert.equal(result.etag, 'abc123')
})

test('附件完成校验拒绝大小不匹配', () => {
  assert.throws(
    () => validateCompletedObjectMetadata(asset, objectWith({ 'content-length': '1000', 'content-type': 'image/jpeg', etag: 'abc' })),
    (error) => error.code === 'OBJECT_SIZE_MISMATCH'
  )
})

test('附件完成校验拒绝缺失或不匹配的 Content-Type', () => {
  assert.throws(
    () => validateCompletedObjectMetadata(asset, objectWith({ 'content-length': '1024', etag: 'abc' })),
    (error) => error.code === 'OBJECT_MIME_MISSING'
  )
  assert.throws(
    () => validateCompletedObjectMetadata(asset, objectWith({ 'content-length': '1024', 'content-type': 'image/png', etag: 'abc' })),
    (error) => error.code === 'OBJECT_MIME_MISMATCH'
  )
})

test('附件完成校验拒绝同时缺失 ETag 与 CRC64', () => {
  assert.throws(
    () => validateCompletedObjectMetadata(asset, objectWith({ 'content-length': '1024', 'content-type': 'image/jpeg' })),
    (error) => error.code === 'OBJECT_INTEGRITY_METADATA_MISSING'
  )
})
