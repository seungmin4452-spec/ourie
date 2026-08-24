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
// 이 SVG를 어떻게 내보낼지는 두 번 틀렸다. 처음엔 <image>가 원본 사진 https
// URL을 그대로 참조했는데, 크롬이 설치 시 매니페스트를 보내는 구글 WebAPK
// 서명 서버의 SVG 렌더러가 SSRF 방지 목적으로 그런 외부 참조를 따라가지 않아
// "설치 중..."이 끝나지 않고 멈췄다. 그다음엔 사진 바이트를 직접 base64로
// SVG 안에 박아 매니페스트의 icons[].src에 data: URI로 얹었는데, 이번엔 설치는
// 끝나지만(멈추지 않지만) 만들어진 아이콘이 사진이 아니라 기본 로고였다 --
// 수십~수백 KB짜리 data URI가 매니페스트 JSON 자체를 부풀려, 서명 서버가 그
// 무게를 못 견디고 조용히 실패해 크롬이 진짜 WebAPK 대신 파비콘을 쓰는 가벼운
// 바로가기로 물러난 것으로 보인다.
//
// 그래서 이 SVG는 이제 데이터로 매니페스트에 얹지 않고, api/icon-maskable.ts가
// 평범한 이미지 응답으로 내보내는 하나의 https:// 아이콘 URL이 된다. 매니페스트
// 쪽 icons[].src는 그 URL 하나만 담은 짧은 문자열이라("any" 아이콘이 원본 사진
// URL을 그대로 담던 것과 같은 모양) 부풀지 않고, 서명 서버는 그 URL을 평범한
// 외부 아이콘으로 fetch하면 그만이다 -- SVG *안에서* 또 다른 리소스를 참조하지
// 않으므로(사진 바이트는 이미 그 응답 자체에 구워져 있다) 앞선 두 실패 원인
// 모두를 비켜간다.
const MASKABLE_ICON_SIZE = 512
const MASKABLE_SAFE_ZONE_RATIO = 0.8 // 사진이 캔버스의 80%를 차지 (여백 10%씩)

// Edge 런타임엔 Buffer가 없어 표준 웹 API로 base64를 인코딩한다. btoa는 한
// 문자당 1바이트인 "binary string"만 받으므로 먼저 그 형태로 바꾼다. 512px
// 정사각 JPEG 정도 크기(수십~백여 KB)에서 String.fromCharCode를 청크 없이
// 한 번에 호출하면 인자 개수 제한에 걸릴 수 있어 청크로 나눠 처리한다.
function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

// 사진을 fetch해 data: URI(base64)로 바꾼다. api/icon-maskable.ts가 자기
// 응답(SVG) 안에 사진 바이트를 구워 넣을 때 쓴다. 네트워크 실패·비정상 응답이면
// null을 돌려주고, 호출한 쪽이 404로 응답해 매니페스트의 'any' 아이콘(원본
// https URL 그대로, 크롬이 클라이언트에서 직접 fetch)으로 물러나게 한다.
export async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const contentType = response.headers.get('content-type') ?? 'image/jpeg'
    const bytes = new Uint8Array(await response.arrayBuffer())
    return `data:${contentType};base64,${bytesToBase64(bytes)}`
  } catch {
    return null
  }
}

// SVG 마크업 그 자체를 돌려준다(data: URI로 감싸지 않는다) -- 응답 바이트로
// 그대로 내보내는 api/icon-maskable.ts가 쓴다.
export function maskableIconSvg(photoDataUrl: string, backgroundColor: string): string {
  const inset = (MASKABLE_ICON_SIZE * (1 - MASKABLE_SAFE_ZONE_RATIO)) / 2
  const content = MASKABLE_ICON_SIZE * MASKABLE_SAFE_ZONE_RATIO
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MASKABLE_ICON_SIZE}" height="${MASKABLE_ICON_SIZE}">` +
    `<rect width="${MASKABLE_ICON_SIZE}" height="${MASKABLE_ICON_SIZE}" fill="${escapeHtmlAttr(backgroundColor)}"/>` +
    `<image href="${escapeHtmlAttr(photoDataUrl)}" x="${inset}" y="${inset}" width="${content}" height="${content}" preserveAspectRatio="xMidYMid slice"/>` +
    `</svg>`
  )
}
