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

// 설치를 진행한 브라우저의 로그인 세션을 매니페스트의 start_url을 통해 설치된
// 앱으로 넘겨준다. iOS는 홈 화면 앱에 별도의 저장소 컨테이너를 주기 때문에, 이게
// 없으면 커플이 방금 만든 아이콘이 로그인 화면부터 열린다. 이 파라미터를 써넣고
// 다시 읽어들이는 쪽은 src/features/auth/sessionHandoff.ts이고, 그쪽 이름과
// 항상 같아야 한다.
export const SESSION_HANDOFF_PARAM = 'session'

// Supabase refresh token은 짧은 불투명 문자열이다. 그 형태가 아니면 토큰이
// 아니고, 우리가 서비스하는 매니페스트에 끼어들 이유도 없다.
export function sanitizeSessionHandoff(value: string | null): string | null {
  if (!value) return null
  return /^[A-Za-z0-9._~-]{8,512}$/.test(value) ? value : null
}

// 홈 화면 아이콘이 실행할 URL. 넘겨줄 세션 인계 토큰이 있으면 같이 싣는다.
export function appLaunchUrl(handoff: string | null): string {
  return handoff
    ? `/?${SESSION_HANDOFF_PARAM}=${encodeURIComponent(handoff)}`
    : '/'
}

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

// purpose: 'maskable'로 내보낼 아이콘은 안드로이드 세이프존 규격을 픽셀에
// 직접 구워 넣어야 한다 (사진을 캔버스의 80%로 줄이고 나머지를 배경색으로
// 채운 정사각형). cropImageToSquare(src/lib/image.ts)가 만드는 원본은
// 가장자리까지 꽉 찬 사진이라 이 규격이 없고, 런처는 여백 없는 이미지를
// maskable로 받으면 마스크에 잘려도 안전하도록 스스로 사진을 다시 축소해
// 흰 배경 위에 얹는다 -- 그 자체 축소가 배포/업데이트로 매니페스트를 다시
// 읽을 때마다 누적되어, 사진이 점점 작아지고 흰 여백이 점점 커지는 것처럼
// 보였다. 규격에 맞는 이미지를 우리가 직접 내보내면 런처가 더 손댈 필요가
// 없어져 이 누적이 멈춘다.
//
// 새 이미지를 저장소에 다시 업로드하는 대신, 있는 사진 URL을 감싸는 SVG를
// 요청마다 즉석에서 만든다: <image>가 원본 사진을 참조하고, 그 바깥을
// 배경색 사각형이 채운다. data: URI라 sanitizeIconUrl의 화이트리스트도
// 그대로 통과한다.
const MASKABLE_ICON_SIZE = 512
const MASKABLE_SAFE_ZONE_RATIO = 0.8 // 사진이 캔버스의 80%를 차지 (여백 10%씩)

export function maskableIconDataUrl(photoUrl: string, backgroundColor: string): string {
  const inset = (MASKABLE_ICON_SIZE * (1 - MASKABLE_SAFE_ZONE_RATIO)) / 2
  const content = MASKABLE_ICON_SIZE * MASKABLE_SAFE_ZONE_RATIO
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MASKABLE_ICON_SIZE}" height="${MASKABLE_ICON_SIZE}">` +
    `<rect width="${MASKABLE_ICON_SIZE}" height="${MASKABLE_ICON_SIZE}" fill="${escapeHtmlAttr(backgroundColor)}"/>` +
    `<image href="${escapeHtmlAttr(photoUrl)}" x="${inset}" y="${inset}" width="${content}" height="${content}" preserveAspectRatio="xMidYMid slice"/>` +
    `</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
