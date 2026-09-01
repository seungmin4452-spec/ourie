/// <reference lib="webworker" />
import { precacheAndRoute, type PrecacheEntry } from 'workbox-precaching'
import { readAppMetaFromDb } from './app/appMetaDb'
import { PWA_INSTALL_PATH } from './lib/pwaInstallPath'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>
}

// index.html은 프리캐시 라우팅 후보에서 뺀다. 워크박스가 그대로 등록하면
// "/"(navigate) 요청마다 자기 라우트가 디렉토리 인덱스 규칙으로 그 엔트리에
// 먼저 매칭돼 event.respondWith()를 선점해버린다 -- 아래 fetch 리스너가 같은
// 이벤트에 다시 respondWith()를 걸어도 이미 늦어 무시된다. 그 결과 "/"만은
// personalizeNavigation을 한 번도 못 거치고 빌드 시점의 정적 index.html(기본
// 아이콘을 가리키는 /manifest.webmanifest)이 그대로 나갔다 -- 안드로이드가
// start_url("/")에서 매니페스트를 주기적으로 다시 읽을 때마다 커플 사진이
// 아니라 기본 로고를 보게 되던 원인이 이거였다. 나머지 자산의 프리캐시는
// 그대로 두고 이 엔트리 하나만 라우팅에서 제외한다.
precacheAndRoute(
  self.__WB_MANIFEST.filter((entry) => {
    const url = typeof entry === 'string' ? entry : entry.url
    return url !== 'index.html'
  }),
)

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

  // 안드로이드 쪽 문제를 여기서 같이 막는다. Chrome은 설치된 앱의 이름·아이콘을
  // start_url("/")에서 매니페스트를 주기적으로 다시 읽어 갱신하는데, 빌드된
  // index.html에 박혀 나가는 링크는 vite-plugin-pwa가 만든 정적
  // /manifest.webmanifest다 -- 이름이 "Ourie"이고 아이콘이 기본 아이콘인 그것.
  // 두 매니페스트의 id가 양쪽 다 "/"라 Chrome은 같은 앱으로 보므로, 커플 사진으로
  // 설치한 앱이 다음 갱신 때 조용히 기본 아이콘으로 되돌아간다. 커플의 값을 실은
  // /api/manifest로 바꿔 끼워, 갱신이 반대 방향으로 -- 방금 꾸민 대로 -- 일어나게
  // 한다. (iOS는 설치된 아이콘을 갱신하지 않으므로 이 줄과 무관하다.)
  const manifestParams = new URLSearchParams()
  if (meta.title) manifestParams.set('title', meta.title)
  // https만 쿼리스트링에 싣는다: 오프라인 폴백 아이콘은 수십 KB짜리 data URL이라
  // URL에 담을 수 없다 (pwaInstall.ts의 buildPwaInstallUrl과 같은 규칙).
  if (meta.icon?.startsWith('https://')) manifestParams.set('icon', meta.icon)
  html = html.replace(
    /<link\s+rel="manifest"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="manifest" href="/api/manifest?${escapeHtmlAttr(manifestParams.toString())}" />`,
  )

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

// ------------------------------------------------------------
// 알림 (Web Push)
//
// 두 곳에서 보낸다: api/notify-dday.ts(매일 아침 디데이)와 api/poke.ts(상대방이
// 버튼을 눌러 보내는 콕 찌르기). 페이로드는 그쪽이 만든 JSON 그대로이고, 여기서
// 종류를 구분하지 않는다 — 무엇을 어떤 이름으로 띄울지는 보내는 쪽이 정한다.
//
// iOS는 push 이벤트를 받고도 알림을 띄우지 않으면(silent push) 구독 자체를
// 회수해버린다. 그래서 페이로드가 깨졌거나 비어 있어도 아래 기본 문구로 반드시
// 하나는 띄운다.
// ------------------------------------------------------------

interface PushPayload {
  title: string
  body: string
  url?: string
  /**
   * 같은 이름의 알림은 쌓이지 않고 마지막 하나로 덮인다. 보내는 쪽이 정하는
   * 이유는 종류마다 원하는 게 다르기 때문이다 — 디데이는 하나로 덮이면 되지만
   * ("ourie-dday"), 콕 찌르기는 "보고싶어"가 "전화해줘"를 지우면 안 되므로
   * 종류별로 다른 이름을 쓴다 (src/features/poke/message.ts).
   */
  tag?: string
  /** 같은 tag로 덮어쓸 때도 소리·진동을 다시 낼지. */
  renotify?: boolean
}

// TypeScript의 NotificationOptions에는 renotify가 없다. 표준에는 있고 실제
// 브라우저도 지원하는데 타입 정의만 따라오지 않은 것이라, 여기서 얹어 쓴다.
interface PushNotificationOptions extends NotificationOptions {
  renotify?: boolean
}

const FALLBACK_PUSH: PushPayload = {
  title: '오늘의 디데이',
  body: '앱에서 오늘이 며칠째인지 확인해보세요.',
}

function readPushPayload(event: PushEvent): PushPayload {
  try {
    const data = event.data?.json() as Partial<PushPayload> | null
    if (!data?.title || !data.body) return FALLBACK_PUSH
    return {
      title: data.title,
      body: data.body,
      url: data.url,
      tag: data.tag,
      renotify: data.renotify,
    }
  } catch {
    // JSON이 아니면 서버가 보낸 게 아니거나 형식이 바뀐 것이다. 알림을
    // 거르는 대신 기본 문구로 띄운다 (위 silent push 문제).
    return FALLBACK_PUSH
  }
}

self.addEventListener('push', (event) => {
  const payload = readPushPayload(event)

  const options: PushNotificationOptions = {
    body: payload.body,
    // 안드로이드·데스크톱이 쓰는 값이다. iOS 홈 화면 앱은 이 값을 무시하고
    // 홈 화면 아이콘을 그대로 쓴다.
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    // tag 없이 renotify를 주면 브라우저가 TypeError를 던진다. 보내는 쪽이
    // tag를 빠뜨렸을 때를 대비해 여기서 같이 묶는다.
    tag: payload.tag ?? 'ourie',
    renotify: payload.renotify ?? false,
    data: { url: payload.url ?? '/' },
  }

  event.waitUntil(self.registration.showNotification(payload.title, options))
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
