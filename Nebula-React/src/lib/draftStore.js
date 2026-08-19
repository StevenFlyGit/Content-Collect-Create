// IndexedDB 草稿库：离线/无后端时暂存灵感与拍摄的媒体 Blob（对齐 03 §5.1「未完成上传可保存本地草稿」）
// 设计要点：
// - keyPath 'id'，草稿含 { id, title, text_raw, type, recorded_at, attachments:[{id,kind,mime,blob,synced}], created_at }
// - 仅在浏览器环境使用；Node 或无 IndexedDB 时 openDB 会 reject，由调用方降级处理。

const DB_NAME = 'nebula-drafts'
const STORE = 'drafts'
const VERSION = 1

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB 不可用'))
      return
    }
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function putDraft(draft) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(draft)
    tx.oncomplete = () => resolve(draft)
    tx.onerror = () => reject(tx.error)
  })
}

export async function getDraft(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

export async function getAllDrafts() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

export async function deleteDraft(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
