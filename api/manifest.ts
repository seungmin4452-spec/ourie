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

const BACKGROUND_COLOR = '#F1F4F7'

interface ManifestIcon {
  src: string
  sizes: string
  type?: string
  purpose?: string
}

function defaultIcons(origin: string): ManifestIcon[] {
  return [
    { src: `${origin}/pwa-192x192.png`, sizes: '192x192', type: 'image/png' },
    { src: `${origin}/pwa-512x512.png`, sizes: '512x512', type: 'image/png' },
  ]
}

export default function handler(request: Request): Response {
  const url = new URL(request.url)
  const origin = requestOrigin(request)
  const title = url.searchParams.get('title')?.trim() || DEFAULT_TITLE
  const icon = sanitizeIconUrl(url.searchParams.get('icon'), origin)
  const handoff = sanitizeSessionHandoff(url.searchParams.get(SESSION_HANDOFF_PARAM))

  // 커플 사진이 있으면 기본 아이콘은 아예 후보에서 뺀다. 목록에 남겨두면
  // 안드로이드에서 사진이 아니라 그 기본 아이콘이 설치된다 -- iOS는
  // apple-touch-icon 하나만 보는 반면, Chrome은 이 배열에서 런처에 쓸 하나를
  // 직접 고르고, 그 기준이 "순서"가 아니라 "이상적인 크기(48dp × 화면 배율)에
  // 가장 가까운 것"이기 때문이다. 배율 3배 기기의 이상 크기는 144px이라
  // pwa-192x192.png(+48)가 512px 사진(+368)을 이기고, 4배 기기에서는 192px가
  // 정확히 일치해 그 자리에서 채택된다. 사진을 배열 맨 앞에 놓아도 소용없다.
  //
  // 그래서 사진이 있을 때는 사진만 내보내고, 없을 때만 기본 아이콘을 쓴다.
  // 대신 사진 URL이 죽으면 설치 가능 조건을 만족할 아이콘이 하나도 없게 되는데,
  // 그 사진은 앱 안과 설치 페이지에도 같이 걸리는 것이라 조용히 묻히지 않는다.
  //
  // 크기·타입은 cropImageToSquare가 내놓는 그대로(512px 정사각 JPEG)라 정확하다.
  // maskable을 같이 선언하는 이유: 이게 없으면 Android O+가 사진을 흰 배경 위에
  // 축소해 얹어서, 아이콘을 꽉 채우는 iOS 쪽과 달라진다.
  //
  // 다만 maskable 항목은 원본 사진을 그대로 내보내면 안 된다 -- 그 사진은
  // 가장자리까지 꽉 찬 상태라 세이프존 규격이 없고, 규격 없는 이미지를
  // 런처가 받으면 스스로 방어적으로 다시 축소하는데 그 축소가 배포마다
  // 누적돼 사진이 점점 작아지는 것처럼 보였다. 'any' 쪽은 여백 없이 꽉 찬
  // 원본 사진 그대로 두고, maskable 쪽만 세이프존을 구운 별도 아이콘을 쓴다.
  //
  // 그 세이프존 아이콘은 여기서 데이터(SVG data: URI)로 직접 만들지 않고
  // api/icon-maskable.ts가 내주는 평범한 https:// URL로 가리킨다 -- 이유는
  // _shared.ts의 maskableIconSvg 주석 참고 (data: URI로 얹었을 때 매니페스트가
  // 부풀어 설치가 사진 대신 기본 로고로 조용히 물러났던 문제).
  const icons: ManifestIcon[] =
    icon === defaultIconUrl(origin)
      ? defaultIcons(origin)
      : [
          {
            src: `${origin}/api/icon-maskable?icon=${encodeURIComponent(icon)}`,
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
          { src: icon, sizes: '512x512', type: 'image/jpeg', purpose: 'any' },
        ]

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
    theme_color: BACKGROUND_COLOR,
    background_color: BACKGROUND_COLOR,
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
