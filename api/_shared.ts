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
