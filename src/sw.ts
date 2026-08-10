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

// ------------------------------------------------------------
// 디데이 알림 (Web Push)
//
// api/notify-dday.ts가 하루 한 번 보내는 알림을 여기서 받는다. 페이로드는
// 그쪽이 만든 JSON 그대로다.
//
// iOS는 push 이벤트를 받고도 알림을 띄우지 않으면(silent push) 구독 자체를
// 회수해버린다. 그래서 페이로드가 깨졌거나 비어 있어도 아래 기본 문구로 반드시
// 하나는 띄운다.
// ------------------------------------------------------------

interface PushPayload {
  title: string
  body: string
  url?: string
}

const FALLBACK_PUSH: PushPayload = {
  title: '오늘의 디데이',
  body: '앱에서 오늘이 며칠째인지 확인해보세요.',
}

function readPushPayload(event: PushEvent): PushPayload {
  try {
    const data = event.data?.json() as Partial<PushPayload> | null
    if (!data?.title || !data.body) return FALLBACK_PUSH
    return { title: data.title, body: data.body, url: data.url }
  } catch {
    // JSON이 아니면 서버가 보낸 게 아니거나 형식이 바뀐 것이다. 알림을
    // 거르는 대신 기본 문구로 띄운다 (위 silent push 문제).
    return FALLBACK_PUSH
  }
}

self.addEventListener('push', (event) => {
  const payload = readPushPayload(event)

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      // 안드로이드·데스크톱이 쓰는 값이다. iOS 홈 화면 앱은 이 값을 무시하고
      // 홈 화면 아이콘을 그대로 쓴다.
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      // 하루 한 번이라 겹칠 일이 드물지만, 재발송이 있어도 알림이 쌓이지 않고
      // 마지막 하나로 덮이게 한다.
      tag: 'ourie-dday',
      data: { url: payload.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const target = (event.notification.data as { url?: string } | null)?.url ?? '/'

  event.waitUntil(
    (async () => {
      // 이미 열려 있는 창이 있으면 새로 띄우지 않는다. 홈 화면 앱에서 창을 또
      // 열면 브라우저로 튕겨 나가고, 그 순간 standalone 밖이라 돌아올 길이
      // 없어진다 (vite.config.ts의 scope 주석과 같은 이유).
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      const existing = clients.find((client) => client.url.startsWith(self.location.origin))
      if (existing) {
        await existing.focus()
        if ('navigate' in existing) await existing.navigate(target).catch(() => undefined)
        return
      }
      await self.clients.openWindow(target)
    })(),
  )
})

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
