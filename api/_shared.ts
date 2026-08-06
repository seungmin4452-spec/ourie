// Shared helpers for the small per-request HTML pages under api/. Not a
// route itself: Vercel only turns files directly under api/ (and its
// subdirectories) that export a default handler into endpoints, and this
// file is imported by those, not routed to.

export const APP_URL = 'https://seungmin4452-spec.github.io/ourie/'
export const DEFAULT_TITLE = 'Ourie'
export const DEFAULT_ICON = `${APP_URL}apple-touch-icon.png`

export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function sanitizeIconUrl(value: string | null): string {
  if (!value) return DEFAULT_ICON
  try {
    const parsed = new URL(value)
    if (parsed.protocol === 'https:' || parsed.protocol === 'data:') return value
  } catch {
    // Not a valid absolute URL -- fall through to the default.
  }
  return DEFAULT_ICON
}
