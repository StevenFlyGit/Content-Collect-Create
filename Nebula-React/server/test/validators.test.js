import test from 'node:test'
import assert from 'node:assert/strict'
import { validateAssetInput, MAX_IMAGE_BYTES, MAX_AUDIO_DURATION_MS } from '../src/validators.js'

test('图片 20MB 上限校验', () => {
  assert.doesNotThrow(() => validateAssetInput({ kind: 'image', mime: 'image/jpeg', bytes: MAX_IMAGE_BYTES }))
  assert.throws(() => validateAssetInput({ kind: 'image', mime: 'image/jpeg', bytes: MAX_IMAGE_BYTES + 1 }), /20MB/)
})

test('音频 1 分钟上限校验', () => {
  assert.doesNotThrow(() => validateAssetInput({ kind: 'audio', mime: 'audio/webm', bytes: 1024, duration_ms: MAX_AUDIO_DURATION_MS }))
  assert.throws(() => validateAssetInput({ kind: 'audio', mime: 'audio/webm', bytes: 1024, duration_ms: MAX_AUDIO_DURATION_MS + 1 }), /1 分钟/)
})

test('音频字节上限与 MIME 校验', () => {
  assert.throws(() => validateAssetInput({ kind: 'audio', mime: 'audio/wav', bytes: 1024, duration_ms: 1000 }), /格式/)
  assert.throws(() => validateAssetInput({ kind: 'audio', mime: 'audio/webm', bytes: 101 * 1024 * 1024, duration_ms: 1000 }), /100MB/)
})

test('音频时长不可识别时拒绝上传', () => {
  assert.throws(() => validateAssetInput({ kind: 'audio', mime: 'audio/webm', bytes: 1024, duration_ms: 0 }), /必须可识别/)
})