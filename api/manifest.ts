// A Web App Manifest carrying the couple's own name, served per request.
//
// The static /manifest.webmanifest can't do this -- it says "Ourie" for
// everyone -- but a manifest is what makes iOS treat the home-screen app as a
// real web app with a declared scope. Without one, iOS infers the scope from
// the URL that was added, and it infers it narrowly: the app launched, the
// install page's redirect to "/" fell outside it, and iOS dropped the whole
// thing into an in-app browser (bottom bar with back/share/"Open in Safari")
// before the app ever painted.
//
// Declaring scope "/" puts the entire app inside it, and start_url "/" means
// the icon launches straight into the app with no redirect hop at all.
//
// Name resolution works out on both iOS generations: 16.4+ prefers this
// manifest's name, older versions ignore the manifest and fall back to the
// apple-mobile-web-app-title that pwa-install.ts writes. Both are the
// couple's name. Same for icons vs. apple-touch-icon.

import {
  appLaunchUrl,
  DEFAULT_TITLE,
  defaultIconUrl,
  requestOrigin,
  sanitizeIconUrl,
  sanitizeSessionHandoff,
  SESSION_HANDOFF_PARAM,
} from './_shared.js'

export const config = { runtime: 'edge' }

interface ManifestIcon {
  src: string
  sizes: string
  type?: string
}

export default function handler(request: Request): Response {
  const url = new URL(request.url)
  const origin = requestOrigin(request)
  const title = url.searchParams.get('title')?.trim() || DEFAULT_TITLE
  const icon = sanitizeIconUrl(url.searchParams.get('icon'), origin)
  const handoff = sanitizeSessionHandoff(url.searchParams.get(SESSION_HANDOFF_PARAM))

  const icons: ManifestIcon[] = [
    { src: `${origin}/pwa-192x192.png`, sizes: '192x192', type: 'image/png' },
    { src: `${origin}/pwa-512x512.png`, sizes: '512x512', type: 'image/png' },
  ]

  // Only describe the couple's photo when there actually is one. It comes out
  // of cropImageToSquare as a 512px square JPEG, so these values are accurate
  // rather than hopeful -- but the fallback is a PNG of another size, and
  // mislabelling that would be worse than leaving it to the defaults above.
  if (icon !== defaultIconUrl(origin)) {
    icons.unshift({ src: icon, sizes: '512x512', type: 'image/jpeg' })
  }

  const manifest = {
    // start_url은 바뀌어도 id는 고정이다: 재설치가 옆에 아이콘을 하나 더 만드는
    // 대신 기존 앱을 대체하게 해주는 게 id이고, 그대로 두지 않으면 아래의 세션
    // 인계 때문에 설치할 때마다 서로 다른 앱이 된다.
    id: '/',
    name: title,
    short_name: title,
    description: '둘만 사용하는 커플 전용 추억 관리 PWA',
    display: 'standalone',
    scope: '/',
    // 설치를 진행한 브라우저의 세션을 설치된 앱으로 실어 보낸다. iOS에서 앱은
    // 자기만의 빈 저장소 컨테이너로 시작하기 때문에 이게 없으면 로그인 화면부터
    // 열린다 (_shared.ts 참고). 설치 시점에 고정되는 값이라 앱은 도착하자마자
    // 이 파라미터를 URL에서 걷어내고, 자기 세션이 생긴 뒤로는 무시한다. 딱 한
    // 번의 실행에만 유효한 값이다.
    start_url: appLaunchUrl(handoff),
    theme_color: '#F1F4F7',
    background_color: '#F1F4F7',
    icons,
  }

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      // Personalized per couple -- must never be shared by a CDN edge.
      'Cache-Control': 'private, no-store',
    },
  })
}
