// ============================================================
// creationDb —— IndexedDB 初始化、升级与事务封装
// 依据 docs/creation-studio/backend-design.md §4
// 库名 nebula_creation_v1；页面组件不得散落调用原生 IndexedDB API，
// 一律经由 creationRepository / draftRepository / localJobRepository。
// ============================================================

const DB_NAME = 'nebula_creation_v1'
const DB_VERSION = 1

export const STORES = {
  creations: 'creations',
  materials: 'creation_materials',
  briefs: 'creation_briefs',
  plans: 'creation_plans',
  drafts: 'platform_drafts',
  revisions: 'draft_revisions',
  messages: 'chat_messages',
  jobs: 'local_jobs',
}

export const PLATFORMS = ['xhs', 'wechat']
export const PLATFORM_LABEL = { xhs: '小红书', wechat: '微信公众号' }

let dbPromise = null

export function openCreationDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORES.creations)) {
        const store = db.createObjectStore(STORES.creations, { keyPath: 'id' })
        store.createIndex('status', 'status')
        store.createIndex('updated_at', 'updated_at')
        store.createIndex('status_updated', ['status', 'updated_at'])
      }
      if (!db.objectStoreNames.contains(STORES.materials)) {
        db.createObjectStore(STORES.materials, { keyPath: ['creation_id', 'item_id'] })
      }
      if (!db.objectStoreNames.contains(STORES.briefs)) {
        db.createObjectStore(STORES.briefs, { keyPath: 'creation_id' })
      }
      if (!db.objectStoreNames.contains(STORES.plans)) {
        db.createObjectStore(STORES.plans, { keyPath: 'creation_id' })
      }
      if (!db.objectStoreNames.contains(STORES.drafts)) {
        db.createObjectStore(STORES.drafts, { keyPath: ['creation_id', 'platform'] })
      }
      if (!db.objectStoreNames.contains(STORES.revisions)) {
        const store = db.createObjectStore(STORES.revisions, { keyPath: ['creation_id', 'platform', 'version'] })
        store.createIndex('by_creation_platform', ['creation_id', 'platform'])
      }
      if (!db.objectStoreNames.contains(STORES.messages)) {
        const store = db.createObjectStore(STORES.messages, { keyPath: 'id' })
        store.createIndex('by_creation_platform_time', ['creation_id', 'platform', 'created_at'])
      }
      if (!db.objectStoreNames.contains(STORES.jobs)) {
        db.createObjectStore(STORES.jobs, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
    request.onerror = () => {
      dbPromise = null
      reject(request.error || new Error('IndexedDB 打开失败'))
    }
  })
  return dbPromise
}

/** 单个 IDB 请求 → Promise（仅在事务回调内使用）。 */
export function idb(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB 请求失败'))
  })
}

/**
 * 事务封装：stores 为字符串数组，mode 为 readonly / readwrite。
 * handler 收到 { creations, materials, ... } 形式的 store 映射，
 * 返回值会在事务成功提交后 resolve；handler 抛错则中止事务并 reject。
 */
export async function creationTx(stores, mode, handler) {
  const db = await openCreationDb()
  const names = Array.isArray(stores) ? stores : [stores]
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, mode)
    const storeMap = {}
    for (const name of names) storeMap[name] = tx.objectStore(name)
    let value
    let handlerDone = false
    Promise.resolve(handler(storeMap)).then(
      (result) => { value = result; handlerDone = true },
      (error) => {
        try { tx.abort() } catch { /* 事务已结束 */ }
        reject(error)
      },
    )
    tx.oncomplete = () => { if (handlerDone) resolve(value) }
    tx.onabort = () => reject(tx.error || new Error('IndexedDB 事务被中止'))
    tx.onerror = () => { /* 统一由 onabort / handler 捕获 */ }
  })
}

/** LocalStorage 轻量键（backend-design.md §4.2），正文等长内容禁止写入。 */
export const LS_KEYS = {
  defaultStyle: 'nebula.creation.defaultStyle',
  lastOpenedId: 'nebula.creation.lastOpenedId',
}

export function readDefaultStyle() {
  try { return localStorage.getItem(LS_KEYS.defaultStyle) || '' } catch { return '' }
}

export function writeDefaultStyle(style) {
  try { localStorage.setItem(LS_KEYS.defaultStyle, style); return true } catch { return false }
}

/** 首次建立创作会话后请求持久化存储（best-effort，失败不影响主流程）。 */
export async function requestStoragePersist() {
  try { if (navigator.storage?.persist) await navigator.storage.persist() } catch { /* 忽略 */ }
}
