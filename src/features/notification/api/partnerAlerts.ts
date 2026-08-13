import { supabase } from '@/lib/supabase'

/**
 * "상대방이 보내는 알림"을 받겠다는 동의를 켜고 끈다.
 *
 * 컬럼 이름이 `poke_opt_in`인 것은 역사다 — 처음에는 콕 찌르기뿐이었다. 지금은
 * 소원권 알림(api/wish.ts)도 같은 값을 보므로 동의의 뜻은 "상대방이 내 기기를
 * 울려도 된다" 전체다. 컬럼을 rename하지 않은 이유는 이 이름을 참조하는 서버
 * 함수(`send_poke`)와 API가 여럿이라 얻는 것보다 흔들 것이 많아서다.
 *
 * 이 파일이 poke가 아니라 notification 아래 있는 것도 같은 이유다. 스위치가
 * 가리키는 범위가 콕 찌르기보다 넓어졌다.
 *
 * upsert가 아니라 update인 이유: 이 스위치는 로그인한 사람에게만 보이고, 그
 * 시점엔 profiles row가 반드시 있다 (가입 트리거가 만든다). 없는 row를
 * 만들어낼 일이 없다.
 */
export async function setPartnerAlertOptIn(userId: string, optIn: boolean): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ poke_opt_in: optIn })
    .eq('id', userId)
  if (error) throw error
}
