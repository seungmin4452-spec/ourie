import { supabase } from '@/lib/supabase'

/**
 * 콕 찌르기를 보낼 상대. 화면이 알아야 하는 건 이름과 "받겠다고 했는지"뿐이다.
 *
 * 이걸 클라이언트에서 읽을 수 있는 건 profiles의 select 정책이 본인뿐 아니라
 * 같은 커플까지 열어두기 때문이다(profiles_select_self_or_partner). 덕분에
 * 서버에 물어보지 않고도 버튼을 눌러보기 전에 "상대가 아직 안 켰어요"를 미리
 * 보여줄 수 있다. 물론 실제 차단은 서버(send_poke)가 한다 — 이건 안내일 뿐이다.
 */
export interface PokePartner {
  id: string
  /**
   * 상대방의 **사람 이름**(profiles.name). app_name은 앱 이름이라 여기 쓰면
   * "승민 ♥ 진선님이 아직 켜지 않았어요"가 된다.
   */
  name: string | null
  poke_opt_in: boolean
}

export async function getPokePartner(
  coupleId: string,
  selfId: string,
): Promise<PokePartner | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, poke_opt_in')
    .eq('couple_id', coupleId)
    .neq('id', selfId)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * 내 수신 동의를 켜고 끈다.
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
