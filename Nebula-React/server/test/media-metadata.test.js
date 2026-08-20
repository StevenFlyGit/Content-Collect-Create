import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { readAudioDurationMs, validateAudioDuration } from '../src/mediaMetadata.js'

test('音频实际时长超过 1 分钟时拒绝', () => {
  assert.throws(() => validateAudioDuration({ actualMs: 60001, declaredMs: 60000 }), /超过 1 分钟/)
})

test('音频实际时长与声明差异过大时拒绝', () => {
  assert.throws(() => validateAudioDuration({ actualMs: 10000, declaredMs: 3000 }), /声明不一致/)
})

test('无法解析的 OSS 音频对象不允许 complete', async () => {
  await assert.rejects(
    readAudioDurationMs(Readable.from([Buffer.from('not-an-audio-file')]), 'audio/mpeg', 17),
    (error) => error.code === 'AUDIO_METADATA_INVALID' || error.code === 'AUDIO_DURATION_UNREADABLE',
  )
})