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
   * 상대방 프로필 사진. 소셜 가입이면 제공자가 준 것이고(구글·카카오), 직접
   * 올렸으면 Storage 주소다. 없을 수 있으므로 화면은 이름 첫 글자로 떨어진다.
   */
  avatar_url: string | null
  /**
   * 상대가 "상대방이 보내는 알림"을 받겠다고 했는지. 컬럼 이름은 콕 찌르기에서
   * 왔지만 소원권 알림도 같은 값을 본다 (notification/api/partnerAlerts.ts).
   * 덕분에 서버에 물어보지 않고도 버튼을 눌러보기 전에 "상대가 아직 안 켰어요"를
   * 미리 보여줄 수 있다. 물론 실제 차단은 서버가 한다 — 이건 안내일 뿐이다.
   */
  poke_opt_in: boolean
}

export async function getPartner(
  coupleId: string,
  selfId: string,
): Promise<Partner | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, avatar_url, poke_opt_in')
    .eq('couple_id', coupleId)
    .neq('id', selfId)
    .maybeSingle()
  if (error) throw error
  return data
}
