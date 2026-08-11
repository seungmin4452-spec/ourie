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
