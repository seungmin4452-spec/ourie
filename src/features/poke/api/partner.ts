import { supabase } from '@/lib/supabase'

/**
 * 내 수신 동의를 켜고 끈다.
 *
 * 상대방 프로필을 읽는 쪽은 여기가 아니라 커플 기능이다
 * (`@/features/couple`의 `usePartner`) — 홈의 위젯 제목도 같은 값을 쓰기
 * 때문에 콕 찌르기 전용으로 두지 않았다.
 *
 * upsert가 아니라 update인 이유: 이 스위치는 커플이 연결된 뒤에만 보이고, 그
 * 시점엔 profiles row가 반드시 있다 (join_couple이 양쪽 row를 갱신한다).
 * 없는 row를 만들어낼 일이 없다.
 */
export async function setPokeOptIn(userId: string, optIn: boolean): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ poke_opt_in: optIn })
    .eq('id', userId)
  if (error) throw error
}
