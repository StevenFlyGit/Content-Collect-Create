import { z } from 'zod'

export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
// 常见录音 / 音频格式登记表（与前端 src/lib/assetUpload.js 保持一致）。
// 浏览器 / 微信 / iOS / Android 导出的录音多为 m4a、aac、amr、wav、mp3、3gp；
// 桌面端常见 ogg/opus、flac、wma、webm。除规范 MIME 外，aliases 覆盖 Windows / Android
// 上常见的变体 MIME（如 audio/x-m4a、application/octet-stream 之外的前缀），避免误拒。
export const AUDIO_FORMATS = [
  { mime: 'audio/mpeg', ext: 'mp3', exts: ['mp3', 'mp2', 'mpa'], aliases: ['audio/mp3', 'audio/x-mp3', 'audio/mpeg3', 'audio/x-mpeg'] },
  { mime: 'audio/mp4', ext: 'm4a', exts: ['m4a', 'mp4', 'm4b', 'm4r', 'f4a', 'f4b'], aliases: ['audio/x-m4a', 'audio/mp4a-latm', 'audio/mp4a', 'application/mp4', 'audio/m4a'] },
  { mime: 'audio/3gpp', ext: '3gp', exts: ['3gp', '3gpp', '3g2', '3gpp2'], aliases: ['audio/3gpp2', 'audio/x-3gp'] },
  { mime: 'audio/aac', ext: 'aac', exts: ['aac'], aliases: ['audio/aac', 'audio/aacp', 'audio/x-aac'] },
  { mime: 'audio/amr', ext: 'amr', exts: ['amr', '3ga'], aliases: ['audio/amr-nb', 'audio/amr-wb', 'audio/x-amr'] },
  { mime: 'audio/wav', ext: 'wav', exts: ['wav', 'wave'], aliases: ['audio/x-wav', 'audio/wave', 'audio/x-pn-wav'] },
  { mime: 'audio/ogg', ext: 'ogg', exts: ['ogg', 'oga', 'opus'], aliases: ['audio/x-ogg', 'application/ogg', 'application/x-ogg', 'audio/opus', 'audio/vorbis', 'audio/x-opus', 'audio/x-vorbis', 'audio/speex'] },
  { mime: 'audio/flac', ext: 'flac', exts: ['flac'], aliases: ['audio/x-flac', 'application/flac', 'application/x-flac'] },
  { mime: 'audio/webm', ext: 'webm', exts: ['webm'], aliases: ['audio/x-webm'] },
  { mime: 'audio/x-ms-wma', ext: 'wma', exts: ['wma'], aliases: ['audio/wma'] },
]
export const AUDIO_MIMES = AUDIO_FORMATS.flatMap((f) => [f.mime, ...f.aliases])
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024
export const MAX_AUDIO_DURATION_MS = 60_000

/** 把任意可识别的音频 MIME / 扩展名规范化为统一存储 MIME；无法识别返回 null。 */
export function normalizeAudioMime(mime) {
  const m = String(mime || '').split(';')[0].trim().toLowerCase()
  const fmt = AUDIO_FORMATS.find((f) => f.mime === m || f.aliases.includes(m))
  return fmt ? fmt.mime : null
}


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
  const declaredMime = String(input.mime_type || input.mime || '').split(';')[0].trim().toLowerCase()
  let mime = declaredMime
  const bytes = Number(input.bytes)
  if (!Number.isInteger(bytes) || bytes <= 0) throw validationError('附件字节数必须为正整数')
  if (kind === 'image' && !IMAGE_MIMES.includes(mime)) throw validationError('图片仅支持 JPG、PNG、WEBP、GIF', 'IMAGE_MIME_UNSUPPORTED')
  if (kind === 'image' && bytes > MAX_IMAGE_BYTES) throw validationError('图片仅支持 JPG、PNG、WEBP、GIF，且单个文件不得超过 20MB', 'IMAGE_LIMIT_EXCEEDED')
  if (kind === 'audio') {
    const canonical = normalizeAudioMime(mime)
    if (!canonical) throw validationError('音频格式不受支持', 'AUDIO_MIME_UNSUPPORTED')
    mime = canonical
    if (bytes > MAX_AUDIO_BYTES) throw validationError('音频文件不得超过 100MB', 'AUDIO_SIZE_EXCEEDED')
    // 时长上限仍为 1 分钟；浏览器无法探测时长（声明为 0 / 缺省）时放行，交由服务端兜底，
    // 避免对 amr/wma 等在部分平台上读不到元数据的格式二次报错。
    const duration = Number(input.duration_ms)
    if (input.duration_ms != null && (!Number.isInteger(duration) || duration < 0 || duration > MAX_AUDIO_DURATION_MS)) {
      throw validationError('音频时长不得超过 1 分钟', 'AUDIO_DURATION_EXCEEDED')
    }
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

// 创建：前端只提交 label 与可选 icon；color_token 由后端从六色白名单随机分配并持久化。
export const inspirationTypeCreateSchema = z.object({
  slug: z.string().trim().min(1).max(40).regex(/^[a-z0-9][a-z0-9-]*$/, 'slug 仅支持小写字母、数字和连字符').optional(),
  label: z.string().trim().min(1).max(40),
  icon: z.string().trim().max(40).nullable().optional(),
})

// 编辑：仅开放 label/icon/sort_order；color_token 与 slug 不可修改。
export const inspirationTypePatchSchema = z.object({
  label: z.string().trim().min(1).max(40).optional(),
  icon: z.string().trim().max(40).nullable().optional(),
  sort_order: z.number().int().optional(),
})

export const assetCompleteSchema = z.object({
  asset_id: uuidSchema,
  bytes: z.number().int().positive().optional(),
  duration_ms: z.number().int().min(0).max(MAX_AUDIO_DURATION_MS).optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i, 'sha256 格式不正确').optional(),
})

