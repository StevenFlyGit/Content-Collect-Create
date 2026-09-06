import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteAsset, uploadAsset } from './api.js'
import { AUDIO_EXT_RE, IMAGE_EXT_RE, readFileHead, validateLocalAsset } from './assetUpload.js'

/**
 * 新增附件队列 hook。
 *
 * 抽出来的原因：CapturePage（记录灵感）已经把「本机校验 → 预签名 → OSS 直传 → complete」
 * 这条链路跑通了，编辑抽屉需要的是同一套能力，但它的已有附件来自服务端（asset_id），
 * 新增附件来自本地 Blob，两者必须分开管理。这个 hook 只负责「新增队列」这半边，
 * 已有附件由调用方自己维护，最终提交时在调用处合并成一份 asset_ids 清单交给后端。
 *
 * 状态机：待上传(pending) → 上传中(pendingUpload) → 已同步(synced) / 失败(failed)。
 * 失败项保留在队列里，下次提交会跳过已 synced 的项、只重试失败项。
 */

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function readAudioDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0)
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(0)
    }
    audio.src = url
  })
}

export default function useAttachmentUploader(inspirationId) {
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const itemsRef = useRef(items)

  useEffect(() => { itemsRef.current = items }, [items])

  // 卸载时回收所有 blob URL，避免编辑抽屉关闭后遗留内存引用
  useEffect(() => () => {
    itemsRef.current.forEach((item) => {
      if (item.src?.startsWith('blob:')) URL.revokeObjectURL(item.src)
    })
  }, [])

  const patchItem = useCallback((id, patch) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])

  const appendItems = useCallback((created) => {
    setItems((current) => [...current, ...created])
  }, [])

  /** 拍照 / 录音产出的 Blob（已知 kind 与 mime，无需再按扩展名识别）。 */
  const addCaptured = useCallback(({ blob, kind, mime, durationMs = 0, label }) => {
    setError('')
    try {
      const result = validateLocalAsset({ kind, mime, bytes: blob.size, durationMs })
      appendItems([{
        id: createId(),
        kind,
        mime: result?.mime || mime,
        blob,
        src: URL.createObjectURL(blob),
        durationMs,
        label: label || (kind === 'image' ? '照片' : '录音'),
        pendingUpload: false,
        failed: false,
        synced: false,
        asset_id: null,
      }])
      setNotice(`已加入 1 个${kind === 'image' ? '图片' : '音频'}，点「保存修改」后上传`)
    } catch (err) {
      setError(err.message)
    }
  }, [appendItems])

  /** 从 <input type="file"> 选择本机文件。file.type 在 Windows 常为空，故按扩展名 + 魔数兜底。 */
  const addFiles = useCallback(async (kind, fileList) => {
    setError('')
    const files = Array.from(fileList || [])
    if (!files.length) return
    const valid = []
    const errors = []
    for (const file of files) {
      const isImage = kind === 'image' && (file.type.startsWith('image/') || IMAGE_EXT_RE.test(file.name))
      const isAudio = kind === 'audio' && (file.type.startsWith('audio/') || AUDIO_EXT_RE.test(file.name))
      if (!isImage && !isAudio) {
        errors.push(`${file.name || '未命名文件'}：不是受支持的${kind === 'image' ? '图片' : '音频'}文件`)
        continue
      }
      const head = await readFileHead(file, 64)
      const durationMs = kind === 'audio' ? await readAudioDuration(file) : 0
      try {
        const result = validateLocalAsset({ kind, mime: file.type, bytes: file.size, durationMs, filename: file.name, head })
        valid.push({ kind, blob: file, mime: result?.mime || file.type, durationMs, label: file.name })
      } catch (err) {
        errors.push(`${file.name || '未命名文件'}：${err.message}`)
      }
    }
    if (!valid.length) {
      setError(errors.join('；'))
      return
    }
    appendItems(valid.map((item) => ({
      id: createId(),
      ...item,
      src: URL.createObjectURL(item.blob),
      pendingUpload: false,
      failed: false,
      synced: false,
      asset_id: null,
    })))
    const tail = errors.length ? `；${errors.length} 个文件未通过校验：${errors.slice(0, 2).join('；')}${errors.length > 2 ? '等' : ''}` : ''
    setNotice(`已加入 ${valid.length} 个附件，点「保存修改」后上传${tail}`)
  }, [appendItems])

  /** 从队列移除。已上传的会同时请求远端删除，失败也不阻断本地交互（最终清单会兜底清理）。 */
  const remove = useCallback(async (id) => {
    const target = itemsRef.current.find((item) => item.id === id)
    if (!target) return
    setItems((current) => current.filter((item) => item.id !== id))
    if (target.src?.startsWith('blob:')) URL.revokeObjectURL(target.src)
    if (target.synced && target.asset_id) {
      try { await deleteAsset(target.asset_id) } catch { /* 忽略：最终 asset_ids 清单不含它时会由后端清理 */ }
    }
  }, [])

  const reset = useCallback(() => {
    itemsRef.current.forEach((item) => {
      if (item.src?.startsWith('blob:')) URL.revokeObjectURL(item.src)
    })
    setItems([])
    setError('')
    setNotice('')
  }, [])

  /**
   * 上传队列中所有未完成项，返回新增的 asset_id 列表。
   * 任一失败即抛错，但已成功的项会标记为 synced，重试时自动跳过。
   */
  const uploadAll = useCallback(async () => {
    const pending = itemsRef.current.filter((item) => !item.synced)
    if (!pending.length) return []
    setBusy(true)
    const uploaded = []
    try {
      for (const item of pending) {
        patchItem(item.id, { pendingUpload: true, failed: false })
        try {
          const result = await uploadAsset({
            blob: item.blob,
            kind: item.kind,
            mime: item.mime,
            durationMs: item.durationMs,
            inspirationId,
            assetId: item.asset_id || item.id,
            onPresigned: ({ asset_id: assetId }) => patchItem(item.id, { asset_id: assetId }),
          })
          uploaded.push(result.asset_id)
          patchItem(item.id, { asset_id: result.asset_id, pendingUpload: false, failed: false, synced: true })
        } catch (err) {
          patchItem(item.id, { pendingUpload: false, failed: true })
          throw err
        }
      }
      return uploaded
    } finally {
      setBusy(false)
    }
  }, [inspirationId, patchItem])

  return { items, busy, error, notice, addFiles, addCaptured, remove, reset, uploadAll, setError, setNotice }
}
