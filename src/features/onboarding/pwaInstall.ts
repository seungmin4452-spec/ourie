// iOS Safari's "Add to Home Screen" reads the icon label from the raw HTML
// bytes the server returned for the page you are standing on -- not from
// anything JS does to the DOM afterward, and not from a service-worker
// rewritten response (both were tried, neither worked). So the couple's own
// name only lands on the home screen if they add it *from* a page a server
// rendered with that name baked in: api/pwa-install.ts.
//
// Adding from the SPA at "/" instead always yields the static "Ourie" in
// index.html, which is exactly the trap this helper exists to keep everyone
// out of.

import { PWA_INSTALL_PATH } from '@/lib/pwaInstallPath'

export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

// Root-relative on purpose: same-origin keeps an already-installed PWA inside
// its scope, and leaving scope on iOS drops it into an in-app browser with no
// way back.
export function buildPwaInstallUrl(title: string, icon: string | null): string {
  const params = new URLSearchParams({ title })
  // Only https icons travel by query string. The offline fallback is a 512px
  // PNG data URL (renderEmojiIcon.ts) -- tens of KB, far past what a URL can
  // carry -- and api/pwa-install.ts already substitutes the default icon when
  // this parameter is missing.
  if (icon?.startsWith('https://')) params.set('icon', icon)
  return `${PWA_INSTALL_PATH}?${params.toString()}`
}
