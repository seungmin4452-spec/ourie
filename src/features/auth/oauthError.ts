// 소셜 로그인이 실패했을 때 제공자가 URL에 실어 보내는 사유를 붙잡아 둔다.
//
// 실패하면(동의 화면에서 취소, 제공자 설정 오류 등) Supabase는 성공했을 때와
// 같은 redirectTo로 돌려보내되 세션 대신 `#error=...&error_description=...`을
// 싣는다. supabase-js는 이 경우 해시를 건드리지 않는다 — 성공했을 때만
// `window.location.hash = ''`까지 간다. 그러니 값을 지우는 건 우리 쪽이다.
//
// 문제는 그 redirectTo가 보통 로그인이 필요한 화면(`/`)이라는 것이다.
// RequireAuth가 세션 없는 것을 보고 `<Navigate to="/login">`으로 넘기는데, 그
// 경로에는 해시가 없으므로 이때 사유가 통째로 사라진다. 그래서 아무 설명 없이
// 로그인 화면으로 되돌아온 것처럼 보인다.
//
// **모듈이 평가될 때 바로 읽는 이유**가 여기 있다. 라우터의 첫 렌더보다 먼저
// 끝나는 시점은 그것뿐이다. 이 모듈은 SocialAuthButtons가 임포트하고, 그쪽은
// LoginPage를 거쳐 router.tsx에 정적으로 매달려 있다 — 로그인 화면을 lazy로
// 바꾸면 이 보장이 깨지므로, 그때는 AuthProvider 쪽에서 직접 임포트해야 한다.

let pending = readOAuthErrorFromUrl()

/**
 * 방금 실패한 소셜 로그인의 사유. 한 번 읽으면 사라진다 — 화면을 다시 열
 * 때까지 옛날 오류가 붙어 있으면 안 된다.
 */
export function takeOAuthError(): string | null {
  const error = pending
  pending = null
  return error
}

function readOAuthErrorFromUrl(): string | null {
  if (typeof window === 'undefined') return null

  const url = new URL(window.location.href)
  // 해시와 쿼리를 둘 다 본다. implicit 흐름(이 앱의 기본값)은 해시로 오지만,
  // 제공자에 닿기도 전에 실패한 경우처럼 쿼리로 오는 경우도 있다.
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const code = hash.get('error') ?? url.searchParams.get('error')
  if (!code) return null

  const description =
    hash.get('error_description') ?? url.searchParams.get('error_description')

  for (const key of ['error', 'error_code', 'error_description']) {
    hash.delete(key)
    url.searchParams.delete(key)
  }
  const nextHash = hash.toString()
  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${url.search}${nextHash ? `#${nextHash}` : ''}`,
  )

  return toMessage(code, description)
}

function toMessage(code: string, description: string | null): string | null {
  // 동의 화면에서 취소한 것은 고장이 아니라 마음을 바꾼 것이다. 본인이 방금 한
  // 일이라 설명이 필요 없고, 경고를 띄우면 뭔가 잘못된 것처럼 보인다.
  if (code === 'access_denied') return null
  // 그 밖에는 제공자가 준 설명을 그대로 보여준다. 영어로 나오지만, 설정이
  // 어긋났을 때(대시보드의 Redirect URLs 등) 원인을 짚을 유일한 단서다.
  return description ?? '소셜 로그인에 실패했어요. 잠시 후 다시 시도해주세요.'
}
