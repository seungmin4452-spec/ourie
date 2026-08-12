import { supabase } from '@/lib/supabase'

/**
 * 이름을 profiles가 아니라 auth 메타데이터로 넘기는 이유: 이메일 확인이 켜져
 * 있으면 이 호출이 세션 없이 끝난다(아래 signUp의 반환값에서 session이 null).
 * 세션이 없으면 RLS 때문에 profiles에 쓸 수 없으므로, 여기서 프로필을 갱신하는
 * 코드는 그 경우에 조용히 실패한다.
 *
 * 대신 이 값을 받아 profiles row를 만드는 건 DB 쪽 `handle_new_user` 트리거다.
 * 키 이름(`name`)이 그쪽과 같아야 하며, 바꾸면 이름이 조용히 사라진다.
 *
 * 여기 넘기는 건 사람 이름이다. 앱 이름(`profiles.app_name`)은 온보딩
 * "꾸미기"에서 따로 받는다.
 */
export async function signUpWithEmail(email: string, password: string, name: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name: name.trim() } },
  })
  if (error) throw error
  return data
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

/** 소셜 로그인으로 쓰는 제공자. Supabase가 기본으로 지원하는 것만 넣는다. */
export type SocialProvider = 'google' | 'kakao'

/**
 * 소셜 계정으로 가입/로그인한다. 가입과 로그인이 한 함수인 이유는 OAuth에는 그
 * 구분이 없어서다 — 처음 오는 계정이면 Supabase가 auth.users에 만들고, 이미
 * 있으면 그냥 로그인이 된다. 그래서 로그인·회원가입 화면이 같은 버튼을 쓴다.
 *
 * 이름은 폼에서 받지 않고 제공자가 준 메타데이터에서 온다. 그걸 profiles로
 * 옮기는 건 이메일 가입과 똑같이 DB의 `handle_new_user` 트리거이며, 제공자마다
 * 키가 달라서(구글 `name`/`full_name`, 카카오 닉네임) 그쪽에서 coalesce로
 * 받는다 (supabase/migrations/2026-08-12-social-signup.sql).
 *
 * 이 호출은 값을 돌려주지 않고 **페이지를 제공자에게 넘긴다**. 끝나면 브라우저가
 * redirectTo로 되돌아오고, 그때 supabase-js가 URL에 실려온 세션을 알아서 집어
 * 간다(`detectSessionInUrl` 기본값). 그러므로 호출한 쪽에서 navigate 하면 안 된다.
 *
 * @param redirectPath 로그인 후 돌아올 앱 내부 경로. 로그인 화면으로 튕겨온
 *   사람을 원래 가려던 곳으로 되돌려보낼 때 쓴다.
 */
export async function signInWithProvider(
  provider: SocialProvider,
  redirectPath = '/',
) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      // 절대 URL이어야 하고, Supabase 대시보드의 Redirect URLs에 등록된 것과
      // 맞아야 한다. 등록돼 있지 않으면 조용히 Site URL로 떨어진다.
      redirectTo: new URL(redirectPath, window.location.origin).toString(),
    },
  })
  if (error) throw error
}
