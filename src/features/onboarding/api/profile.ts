import { supabase } from '@/lib/supabase'

export interface Profile {
  id: string
  couple_id: string | null
  /**
   * **사람 이름**. 상대방에게 내가 누구인지 보여줄 때 쓴다 (콕 찌르기 알림).
   * 회원가입에서 받는다. 이 필드가 생기기 전에 가입한 계정은 비어 있다.
   */
  name: string | null
  /**
   * **앱 이름** ("승민 ♥ 진선"). 홈 화면 아이콘 라벨과 홈 상단 제목이 이
   * 값이다. 온보딩 "꾸미기"에서 받는다.
   */
  app_name: string | null
  avatar_url: string | null
  /** 상대방이 보내는 콕 찌르기 알림을 받겠다는 동의. src/features/poke 참고. */
  poke_opt_in: boolean
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, couple_id, name, app_name, avatar_url, poke_opt_in')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const fileExt = file.name.split('.').pop() ?? 'jpg'
  const path = `${userId}/avatar-${Date.now()}.${fileExt}`

  const { error: uploadError } = await supabase.storage
    .from('profile-avatars')
    .upload(path, file, { upsert: true })
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('profile-avatars').getPublicUrl(path)
  return data.publicUrl
}

export async function updateProfile(
  userId: string,
  // name이 null도 받는 이유: 비워둔 것과 공백만 넣은 것을 DB에서 한 가지 값으로
  // 모으기 위해서다 (가입 트리거의 nullif와 같은 규칙). 표현이 둘이면
  // "이름 없음"을 확인하는 곳마다 분기가 갈라진다.
  updates: { name?: string | null; app_name?: string; avatar_url?: string },
) {
  // upsert, not update: some accounts don't have a profiles row yet (e.g. the
  // handle_new_user signup trigger not having run for them), and .update()
  // silently succeeds with zero rows affected when there's nothing to match.
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...updates })
  if (error) throw error
}
