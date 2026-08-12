import { supabase } from '@/lib/supabase'

/**
 * 커플의 상대방.
 *
 * 이걸 클라이언트에서 읽을 수 있는 건 profiles의 select 정책이 본인뿐 아니라
 * 같은 커플까지 열어두기 때문이다(profiles_select_self_or_partner).
 */
export interface Partner {
  id: string
  /**
   * 상대방의 **사람 이름**(profiles.name). app_name은 앱 이름이라 여기 쓰면
   * "승민 ♥ 진선님이 아직 켜지 않았어요"가 된다.
   */
  name: string | null
  /**
   * 상대가 콕 찌르기 알림을 받겠다고 했는지. 덕분에 서버에 물어보지 않고도
   * 버튼을 눌러보기 전에 "상대가 아직 안 켰어요"를 미리 보여줄 수 있다.
   * 물론 실제 차단은 서버(send_poke)가 한다 — 이건 안내일 뿐이다.
   */
  poke_opt_in: boolean
}

export async function getPartner(
  coupleId: string,
  selfId: string,
): Promise<Partner | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, poke_opt_in')
    .eq('couple_id', coupleId)
    .neq('id', selfId)
    .maybeSingle()
  if (error) throw error
  return data
}
