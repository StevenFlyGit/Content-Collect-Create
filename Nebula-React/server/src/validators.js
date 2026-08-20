import { z } from 'zod'

export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
export const AUDIO_MIMES = ['audio/webm', 'audio/mp4', 'audio/mp3', 'audio/m4a', 'audio/mpeg', 'audio/ogg']
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024
export const MAX_AUDIO_DURATION_MS = 60_000

export const uuidSchema = z.string().uuid('必须为有效 UUID')
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期必须为 YYYY-MM-DD').refine((value) => {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}, '日期不存在')

function validationError(message, code = 'VALIDATION_ERROR') {
  return Object.assign(new Error(message), { status: 422, code })
}

export function validateAssetInput(input) {
  const kind = input.kind
  if (!['image', 'audio'].includes(kind)) throw validationError('附件类型不受支持')
  const mime = String(input.mime_type || input.mime || '').split(';')[0].trim().toLowerCase()
  const bytes = Number(input.bytes)
  if (!Number.isInteger(bytes) || bytes <= 0) throw validationError('附件字节数必须为正整数')
  if (kind === 'image' && !IMAGE_MIMES.includes(mime)) throw validationError('图片仅支持 JPG、PNG、WEBP、GIF', 'IMAGE_MIME_UNSUPPORTED')
  if (kind === 'image' && bytes > MAX_IMAGE_BYTES) throw validationError('图片仅支持 JPG、PNG、WEBP、GIF，且单个文件不得超过 20MB', 'IMAGE_LIMIT_EXCEEDED')
  if (kind === 'audio') {
    if (!AUDIO_MIMES.includes(mime)) throw validationError('音频格式不受支持', 'AUDIO_MIME_UNSUPPORTED')
    if (bytes > MAX_AUDIO_BYTES) throw validationError('音频文件不得超过 100MB', 'AUDIO_SIZE_EXCEEDED')
    const duration = Number(input.duration_ms)
    if (!Number.isInteger(duration) || duration <= 0 || duration > MAX_AUDIO_DURATION_MS) throw validationError('音频时长必须可识别且不得超过 1 分钟', 'AUDIO_DURATION_EXCEEDED')
  }
  return { kind, mime, bytes, durationMs: input.duration_ms == null ? null : Number(input.duration_ms) }
}

export const inspirationCreateSchema = z.object({
  id: uuidSchema.optional(),
  draft_id: z.string().max(120).optional(),
  idempotency_key: z.string().max(120).optional(),
  title: z.string().max(200).nullable().optional(),
  text_raw: z.string().max(100000).default(''),
  type_id: uuidSchema.nullable().optional(),
  type_label: z.string().max(40).nullable().optional(),
  recorded_at: z.string().datetime({ offset: true }).optional(),
  user_tags_json: z.array(z.any()).max(50).optional(),
  board_position_json: z.record(z.any()).nullable().optional(),
  is_quote: z.boolean().optional(),
  sync_status: z.enum(['local', 'synced']).optional(),
  processing_status: z.enum(['draft', 'synced', 'failed']).optional(),
  asset_ids: z.array(uuidSchema).max(100).optional(),
}).passthrough()

export const inspirationPatchSchema = inspirationCreateSchema.partial()

export const inspirationTypeCreateSchema = z.object({
  slug: z.string().trim().min(1).max(40).regex(/^[a-z0-9][a-z0-9-]*$/, 'slug 仅支持小写字母、数字和连字符').optional(),
  label: z.string().trim().min(1).max(40),
  color_token: z.string().trim().min(1).max(40).regex(/^--[a-z0-9-]+$/, '颜色必须为合法 CSS 变量名').default('--ink-muted'),
  icon: z.string().trim().max(40).nullable().optional(),
})

export const assetCompleteSchema = z.object({
  asset_id: uuidSchema,
  bytes: z.number().int().positive().optional(),
  duration_ms: z.number().int().positive().max(MAX_AUDIO_DURATION_MS).optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i, 'sha256 格式不正确').optional(),
})

