// Shared helpers for the small per-request HTML pages under api/. Not a
// route itself: Vercel only turns files directly under api/ (and its
// subdirectories) that export a default handler into endpoints, and this
// file is imported by those, not routed to.
//
// The app is served from the same Vercel origin as these functions, so links
// back into it are plain root-relative paths -- no hardcoded host. Only
// absolute URLs that leave the page (og:image, Response.redirect) need an
// origin, and that is read off the incoming request so preview deployments
// and any future custom domain work without a code change.

export const DEFAULT_TITLE = 'Ourie'

export function requestOrigin(request: Request): string {
  return new URL(request.url).origin
}

export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function defaultIconUrl(origin: string): string {
  return `${origin}/apple-touch-icon.png`
}

export function sanitizeIconUrl(value: string | null, origin: string): string {
  const fallback = defaultIconUrl(origin)
  if (!value) return fallback
  try {
    const parsed = new URL(value)
    if (parsed.protocol === 'https:' || parsed.protocol === 'data:') return value
  } catch {
    // Not a valid absolute URL -- fall through to the default.
  }
  return fallback
}
