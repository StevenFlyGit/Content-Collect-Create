const DB_NAME = 'nebula-drafts'
const STORE = 'drafts'
const VERSION = 2

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB 不可用'))
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'draft_id' })
      else {
        const oldStore = request.transaction.objectStore(STORE)
        if (oldStore.keyPath !== 'draft_id') {
          db.deleteObjectStore(STORE)
          db.createObjectStore(STORE, { keyPath: 'draft_id' })
        }
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('打开草稿库失败'))
  })
}

function transaction(mode, action) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    let result
    try { result = action(store) } catch (error) { reject(error); return }
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error || new Error('草稿库事务失败'))
    tx.onabort = () => reject(tx.error || new Error('草稿库事务已中止'))
  }))
}

export const putDraft = (draft) => transaction('readwrite', (store) => store.put({ ...draft, updated_at: draft.updated_at || new Date().toISOString() }))
export const getDraft = (draftId) => transaction('readonly', (store) => new Promise((resolve, reject) => { const r = store.get(draftId); r.onsuccess = () => resolve(r.result || null); r.onerror = () => reject(r.error) }))
export const getAllDrafts = () => transaction('readonly', (store) => new Promise((resolve, reject) => { const r = store.getAll(); r.onsuccess = () => resolve((r.result || []).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))); r.onerror = () => reject(r.error) }))
export const deleteDraft = (draftId) => transaction('readwrite', (store) => store.delete(draftId))

export async function saveCompleteDraft(draft) {
  const normalized = { ...draft, draft_id: draft.draft_id || draft.id, updated_at: new Date().toISOString(), local_status: 'saved', sync_status: draft.sync_status || 'local', attachments: (draft.attachments || []).map((asset) => ({ ...asset, src: undefined })) }
  return putDraft(normalized)
}
