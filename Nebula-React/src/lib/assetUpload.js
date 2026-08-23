import { uploadAsset as uploadRemoteAsset } from './api.js'

export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
export const MAX_AUDIO_DURATION_MS = 60 * 1000
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024

/**
 * 常见录音 / 音频格式登记表。
 *
 * 为什么需要它：通过 <input type="file"> 选择本地文件时，File.type（MIME）在 Windows /
 * 部分 Android 上常常为空字符串 ''，或被标记为变体类型（如 audio/x-m4a、audio/x-aac、
 * application/octet-stream），而非规范类型。仅靠 MIME 白名单会误伤这些文件，
 * 典型报错就是「录音 (2).m4a：音频格式不受支持」。
 *
 * 因此采用「扩展名 → 魔数(magic bytes) → MIME」三重识别，并把识别结果规范化为
 * 统一的可存储 MIME（canonical mime），保证前后端一致放行。
 *
 * 字段说明：
 *  - mime:    规范存储 MIME（落库 / 上传声明用）
 *  - ext:     规范存储扩展名（OSS 对象键用）
 *  - exts:    该格式常见的文件扩展名
 *  - aliases: 需要被识别为同一格式的变体 MIME
 *  - magic:   文件头魔数签名（用于无扩展名 / 空 MIME 时的兜底识别）
 */
export const AUDIO_FORMATS = [
  {
    mime: 'audio/mpeg', ext: 'mp3', label: 'MP3',
    exts: ['mp3', 'mp2', 'mpa'],
    aliases: ['audio/mp3', 'audio/x-mp3', 'audio/mpeg3', 'audio/x-mpeg'],
    // MPEG-1/2/2.5 音频帧同步字，或 ID3 标签头
    magic: [[0xff, 0xfb], [0xff, 0xf3], [0xff, 0xf2], [0xff, 0xf0], [0x49, 0x44, 0x33]],
  },
  {
    mime: 'audio/mp4', ext: 'm4a', label: 'M4A',
    exts: ['m4a', 'mp4', 'm4b', 'm4r', 'f4a', 'f4b'],
    aliases: ['audio/x-m4a', 'audio/mp4a-latm', 'audio/mp4a', 'application/mp4', 'audio/m4a'],
    // ISO-BMFF：文件头出现 'ftyp' 盒，且主品牌不是 3gp*
    magic: [{ box: 'ftyp', notBrand: /^3gp/i }],
  },
  {
    mime: 'audio/3gpp', ext: '3gp', label: '3GP',
    exts: ['3gp', '3gpp', '3g2', '3gpp2'],
    aliases: ['audio/3gpp2', 'audio/x-3gp'],
    // ISO-BMFF：'ftyp' 盒且主品牌以 3gp 开头
    magic: [{ box: 'ftyp', brand: /^3gp/i }],
  },
  {
    mime: 'audio/aac', ext: 'aac', label: 'AAC',
    exts: ['aac'],
    aliases: ['audio/aac', 'audio/aacp', 'audio/x-aac'],
    // ADTS 帧同步字
    magic: [[0xff, 0xf1], [0xff, 0xf9]],
  },
  {
    mime: 'audio/amr', ext: 'amr', label: 'AMR',
    exts: ['amr', '3ga'],
    aliases: ['audio/amr-nb', 'audio/amr-wb', 'audio/x-amr'],
    // AMR-NB / AMR-WB 文件头魔数
    magic: [
      [0x23, 0x21, 0x41, 0x4d, 0x52, 0x0a],
      [0x23, 0x21, 0x41, 0x4d, 0x52, 0x2d, 0x57, 0x42, 0x0a],
    ],
  },
  {
    mime: 'audio/wav', ext: 'wav', label: 'WAV',
    exts: ['wav', 'wave'],
    aliases: ['audio/x-wav', 'audio/wave', 'audio/x-pn-wav'],
    // RIFF 容器头
    magic: [[0x52, 0x49, 0x46, 0x46]],
  },
  {
    mime: 'audio/ogg', ext: 'ogg', label: 'OGG/Opus',
    exts: ['ogg', 'oga', 'opus'],
    aliases: ['audio/x-ogg', 'application/ogg', 'application/x-ogg', 'audio/opus', 'audio/vorbis', 'audio/x-opus', 'audio/x-vorbis', 'audio/speex'],
    // Ogg 页头
    magic: [[0x4f, 0x67, 0x67, 0x53]],
  },
  {
    mime: 'audio/flac', ext: 'flac', label: 'FLAC',
    exts: ['flac'],
    aliases: ['audio/x-flac', 'application/flac', 'application/x-flac'],
    // FLAC 标记
    magic: [[0x66, 0x4c, 0x61, 0x43]],
  },
  {
    mime: 'audio/webm', ext: 'webm', label: 'WebM',
    exts: ['webm'],
    aliases: ['audio/x-webm'],
    // EBML 头
    magic: [[0x1a, 0x45, 0xdf, 0xa3]],
  },
  {
    mime: 'audio/x-ms-wma', ext: 'wma', label: 'WMA',
    exts: ['wma'],
    aliases: ['audio/wma'],
    // ASF 文件头 GUID
    magic: [[0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11]],
  },
]

// 所有被接受的 MIME（规范 + 别名），供白名单式快速校验。
export const AUDIO_MIMES = AUDIO_FORMATS.flatMap((f) => [f.mime, ...f.aliases])

// 常见图片 / 音频扩展名正则，用于文件选择器在 file.type 为空时按扩展名兜底识别。
export const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i
export const AUDIO_EXT_RE = new RegExp('\\.(' + AUDIO_FORMATS.flatMap((f) => f.exts).join('|') + ')$', 'i')

function extOf(name = '') {
  const m = /\.([a-z0-9]+)$/i.exec(name)
  return m ? m[1].toLowerCase() : ''
}

/** 校验单条魔数签名是否命中文件头。 */
function matchMagic(head, pattern) {
  if (head == null || head.length === 0) return false
  if (Array.isArray(pattern) || pattern instanceof Uint8Array) {
    const sig = pattern instanceof Uint8Array ? pattern : Uint8Array.from(pattern)
    if (head.length < sig.length) return false
    for (let i = 0; i < sig.length; i++) if (head[i] !== sig[i]) return false
    return true
  }
  if (typeof pattern === 'string') {
    if (head.length < pattern.length) return false
    for (let i = 0; i < pattern.length; i++) if (head[i] !== pattern.charCodeAt(i)) return false
    return true
  }
  if (pattern && pattern.box === 'ftyp') {
    // 在文件头 64 字节内查找 'ftyp' 盒，其后的 4 字节为主品牌(major brand)。
    const ascii = String.fromCharCode.apply(null, Array.from(head.slice(0, 64)))
    const idx = ascii.indexOf('ftyp')
    if (idx < 0) return false
    const brand = ascii.slice(idx + 4, idx + 8)
    if (pattern.brand) return pattern.brand.test(brand)
    if (pattern.notBrand) return !pattern.notBrand.test(brand)
    return true
  }
  return false
}

function detectByMagic(head) {
  return AUDIO_FORMATS.find((f) => f.magic.some((p) => matchMagic(head, p))) || null
}

/**
 * 识别音频格式：扩展名 → 魔数 → MIME 三重兜底。
 * 返回 { format, mime, ext } 或 null（无法识别）。
 */
export function detectAudioFormat({ mime = '', filename = '', head } = {}) {
  const normalizedMime = String(mime || '').split(';')[0].trim().toLowerCase()
  const ext = extOf(filename)

  // 1) 已知 MIME（含变体别名）→ 直接命中
  let fmt = AUDIO_FORMATS.find((f) => f.mime === normalizedMime || f.aliases.includes(normalizedMime))
  if (fmt) return { format: fmt, mime: fmt.mime, ext: fmt.ext }

  // 2) 扩展名命中（覆盖 file.type 为空 / 变体的情况）
  if (ext) {
    fmt = AUDIO_FORMATS.find((f) => f.exts.includes(ext))
    if (fmt) return { format: fmt, mime: fmt.mime, ext: fmt.ext }
  }

  // 3) 魔数命中（无扩展名 / 空 MIME 的最后兜底）
  if (head && head.length) {
    fmt = detectByMagic(head)
    if (fmt) return { format: fmt, mime: fmt.mime, ext: fmt.ext }
  }

  return null
}

/** 把任意可识别的音频输入（MIME / 扩展名 / 魔数）规范化为统一存储 MIME；无法识别返回 null。 */
export function normalizeAudioMime(input) {
  const detected = detectAudioFormat(input)
  return detected ? detected.mime : null
}

/** 读取文件头部若干字节（默认 64），用于魔数识别。读取失败返回空 Uint8Array。 */
export async function readFileHead(file, n = 64) {
  try {
    const buf = await file.slice(0, n).arrayBuffer()
    return new Uint8Array(buf)
  } catch {
    return new Uint8Array(0)
  }
}

export function validateLocalAsset({ kind, mime, bytes, durationMs = 0, filename = '', head }) {
  mime = String(mime || '').split(';')[0].trim()
  if (kind === 'image') {
    if (!IMAGE_MIMES.includes(mime)) throw new Error('图片仅支持 JPG、PNG、WEBP、GIF')
    if (bytes > MAX_IMAGE_BYTES) throw new Error('图片单个文件不得超过 20MB')
  } else if (kind === 'audio') {
    const detected = detectAudioFormat({ mime, filename, head })
    if (!detected) {
      throw new Error('音频格式不受支持（支持 m4a、mp3、wav、aac、amr、ogg、3gp、flac、webm、wma 等常见录音格式）')
    }
    if (bytes > MAX_AUDIO_BYTES) throw new Error('音频文件不得超过 100MB')
    // 时长上限仍为 1 分钟；浏览器无法探测时长（durationMs 为 0/未知）时放行，交由服务端兜底，
    // 避免对 amr/wma 等在部分平台上读不到元数据的格式二次报错。
    if (durationMs > MAX_AUDIO_DURATION_MS) throw new Error('音频时长不得超过 1 分钟')
    // 返回规范化后的 MIME，供调用方落库 / 上传声明，避免把变体 MIME 透传到后端再次被拒。
    return { mime: detected.mime }
  } else throw new Error('附件类型不受支持')
}

export async function uploadCapturedAsset({ blob, kind, mime, meta = {}, inspirationId }) {
  const result = validateLocalAsset({ kind, mime, bytes: blob.size, durationMs: meta.duration_ms || 0 })
  const normalizedMime = result?.mime || mime
  return uploadRemoteAsset({ blob, kind, mime: normalizedMime, durationMs: meta.duration_ms || 0, inspirationId })
}
