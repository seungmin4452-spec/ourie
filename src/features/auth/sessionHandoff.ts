// 사파리에 로그인된 세션을 방금 설치한 홈 화면 앱으로 넘겨준다.
//
// iOS는 홈 화면 웹앱에 별도의 저장소 컨테이너를 준다. localStorage/쿠키/
// IndexedDB 모두 설치를 진행한 사파리 탭과 공유되지 않는다. 그래서 사파리에는
// 멀쩡히 남아 있는 Supabase 세션이 앱의 첫 실행에서는 아예 없는 상태가 되고,
// 몇 분 전에 로그인한 커플이 새로 만든 아이콘을 누르면 로그인 화면부터 다시
// 시작하게 된다.
//
// 그 첫 실행에 값을 전달할 수 있는 유일한 통로는 실행 URL, 즉 설치할 때마다
// 새로 만들어 주는 매니페스트의 start_url(api/manifest.ts)이다. 그래서 설치
// 페이지가 세션의 refresh token을 같이 실어 보내고, start_url이
// "/?session=<token>"이 되고, 앱은 RequireAuth가 로그인 여부를 판단하기 전에
// 이 토큰을 실제 세션으로 교환한다.
//
// 알아둘 점: 이렇게 하면 사파리와 앱이 하나의 refresh token 계열을 공유하게
// 되고, Supabase는 토큰을 쓸 때마다 회전시킨다. 나중에 갱신을 시도하는 쪽은
// 저장해 둔 토큰이 이미 소진된 것을 보고 로그아웃될 수 있다. 실제로는 아이콘이
// 생긴 뒤로는 사파리 탭을 더 쓰지 않으니 드물게 일어나고, 일어나도 비용은
// 로그인 한 번이다. 지금처럼 매번 반드시 로그인해야 하는 것보다는 낫다.

import type { Session } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

// api/_shared.ts의 SESSION_HANDOFF_PARAM과 이름이 같아야 한다. start_url에 이
// 파라미터를 써넣는 쪽이 거기다. (api/는 별도 tsconfig로 빌드되고 src/와
// import를 공유하지 않는다.)
export const SESSION_HANDOFF_PARAM = 'session'

// 페이지 로드당 한 번만 해석한다. StrictMode에서 AuthProvider의 effect가 두 번
// 실행되는데, 토큰은 한 번만 쓸 수 있어서 두 번째 교환은 이미 회전된 토큰으로
// 실패하고 로그아웃된 앱처럼 보이게 된다.
let pending: Promise<Session | null> | null = null

/**
 * 설치되는 앱에 넘겨줄 refresh token. 로그인 상태가 아니면 null.
 * 아직 세션을 들고 있는 브라우저에서, 설치 시점에 읽어야 한다.
 */
export async function createSessionHandoffToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.refresh_token ?? null
}

/**
 * 앱이 시작할 때 쓸 세션. 이미 저장돼 있는 세션이 있으면 그것을, 없으면 설치
 * 페이지가 넘겨준 세션을 쓴다.
 */
export function resolveInitialSession(): Promise<Session | null> {
  pending ??= readInitialSession()
  return pending
}

async function readInitialSession(): Promise<Session | null> {
  // 아래에서 저장된 세션이 이기더라도 토큰은 무조건 URL에서 걷어낸다. start_url은
  // 설치 시점에 고정되므로 이 토큰은 *매번* 실행될 때마다 따라오고, 그대로 두면
  // 더 이상 필요 없어진 뒤에도 주소창에 남고 서버로 가는 모든 내비게이션 요청에
  // 실린다.
  const token = takeHandoffTokenFromUrl()

  const { data } = await supabase.auth.getSession()
  if (data.session || !token) return data.session

  try {
    const { data: refreshed, error } = await supabase.auth.refreshSession({
      refresh_token: token,
    })
    // 만료됐거나 이미 회전된 토큰이면 평소처럼 로그인 화면으로 보내면 된다.
    return error ? null : refreshed.session
  } catch {
    return null
  }
}

function takeHandoffTokenFromUrl(): string | null {
  const url = new URL(window.location.href)
  const token = url.searchParams.get(SESSION_HANDOFF_PARAM)
  if (!token) return null

  url.searchParams.delete(SESSION_HANDOFF_PARAM)
  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${url.search}${url.hash}`,
  )
  return token
}
