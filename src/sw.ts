/// <reference lib="webworker" />
import { precacheAndRoute, type PrecacheEntry } from 'workbox-precaching'
import { readAppMetaFromDb } from './app/appMetaDb'
import { PWA_INSTALL_PATH } from './lib/pwaInstallPath'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>
}

precacheAndRoute(self.__WB_MANIFEST)

// 새 서비스워커는 원래 "자기가 담당할 화면이 전부 닫힐 때까지" 대기한다. 홈
// 화면 앱에서 그 조건은 앱 스위처에서 완전히 밀어 종료하는 것이라, 배포를
// 해도 커플은 계속 옛 화면을 보게 된다. 아래 두 줄이 그 대기를 건너뛴다:
// skipWaiting()은 설치가 끝나는 즉시 활성 서비스워커가 되고, clients.claim()은
// 이미 열려 있는 화면까지 넘겨받는다.
//
// 그 대가로 실행 중인 앱의 담당자가 도중에 바뀌므로, 화면에 이미 그려진 구버전
// 코드와 새로 내주는 파일이 섞일 수 있다. 그래서 앱 쪽에서 담당자가 바뀌는
// 순간을 잡아 한 번 새로고침한다 (src/app/serviceWorkerUpdates.ts).
//
// precacheAndRoute가 등록한 install 리스너가 먼저 캐시를 다 채운 뒤에 활성화가
// 일어난다 — skipWaiting()은 install이 끝나기 전까지는 효력이 없다.
self.skipWaiting()
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

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
  if (event.request.mode !== 'navigate') return

  // These share this origin (and therefore fall inside the SW scope), but are
  // already rendered per request with the right title/icon -- rewriting them
  // here would clobber fresh values with whatever happened to be cached.
  // PWA_INSTALL_PATH matters most: it is the page the home-screen icon is
  // added from, so a stale title here is exactly the bug we are fixing.
  const url = new URL(event.request.url)
  const isServerRendered =
    url.pathname.startsWith('/api/') || url.pathname === PWA_INSTALL_PATH
  if (url.origin === self.location.origin && isServerRendered) return

  event.respondWith(personalizeNavigation(event.request))
})
