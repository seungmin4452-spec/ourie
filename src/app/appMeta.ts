import { writeAppMetaToDb } from './appMetaDb'

// Must stay in sync with the key read by the inline script in index.html.
export const APP_META_STORAGE_KEY = 'ourie-app-meta'

export function readCachedAppMeta(): { title: string; icon: string } | null {
  try {
    const raw = localStorage.getItem(APP_META_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function cacheAppMeta(title: string, icon: string) {
  try {
    localStorage.setItem(APP_META_STORAGE_KEY, JSON.stringify({ title, icon }))
  } catch {
    // Storage can be unavailable (private mode, quota) -- non-critical, skip.
  }
  // sw.ts reads this copy to rewrite the HTML doc it serves for navigation
  // requests -- service workers can't reach localStorage.
  void writeAppMetaToDb({ title, icon }).catch(() => {
    // IndexedDB can be unavailable (private mode, quota) -- non-critical, skip.
  })
}
