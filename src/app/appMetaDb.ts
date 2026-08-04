// IndexedDB mirror of the app-meta cache (see appMeta.ts). Service workers
// cannot read localStorage, so sw.ts reads this to personalize the HTML
// document it hands back for navigation requests. Plain get/set on a single
// record -- deliberately not using a library since indexedDB is the only API
// this needs and it's the same shape in both the window and worker contexts.

const DB_NAME = 'ourie-app-meta'
const STORE_NAME = 'kv'
const RECORD_KEY = 'meta'

export interface AppMetaRecord {
  title: string
  icon: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function writeAppMetaToDb(meta: AppMetaRecord): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(meta, RECORD_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function readAppMetaFromDb(): Promise<AppMetaRecord | undefined> {
  const db = await openDb()
  try {
    return await new Promise<AppMetaRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(RECORD_KEY)
      req.onsuccess = () => resolve(req.result as AppMetaRecord | undefined)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}
