/// <reference lib="webworker" />
import { precacheAndRoute, type PrecacheEntry } from 'workbox-precaching'
import { readAppMetaFromDb } from './app/appMetaDb'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>
}

precacheAndRoute(self.__WB_MANIFEST)

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// iOS Safari's "Add to Home Screen" icon label appears to come from the raw
// HTML bytes the server returned, not from any DOM mutation JS makes after
// the page loads (confirmed: JS-set apple-mobile-web-app-title shows up in
// the Share Sheet preview, but never in the actual home-screen icon name).
// Since this is a static SPA with no per-request server, we fake per-request
// rendering here: rewrite the navigation response's <head> tags using the
// couple's cached title/icon (see appMetaDb.ts) before the browser ever
// parses it.
async function personalizeNavigation(request: Request): Promise<Response> {
  const response = await fetch(request)
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/html')) return response

  const meta = await readAppMetaFromDb().catch(() => undefined)
  if (!meta?.title && !meta?.icon) return response

  let html = await response.text()
  if (meta.title) {
    html = html.replace(
      /<meta\s+name="apple-mobile-web-app-title"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="apple-mobile-web-app-title" content="${escapeHtmlAttr(meta.title)}" />`,
    )
  }
  if (meta.icon) {
    html = html.replace(
      /<link\s+rel="apple-touch-icon"\s+href="[^"]*"\s*\/?>/i,
      `<link rel="apple-touch-icon" href="${escapeHtmlAttr(meta.icon)}" />`,
    )
  }

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(personalizeNavigation(event.request))
  }
})
