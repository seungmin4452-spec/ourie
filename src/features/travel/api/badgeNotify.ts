import { supabase } from '@/lib/supabase'
import type { BadgeTier } from '../badges'

/**
 * 뱃지를 땄다고 상대에게 알린다.
 *
 * 둘이 따로 앱을 보고 있어서 이게 없으면 한쪽만 아는 성취가 된다
 * (docs/REGION_BADGE.md §2 "받는 순간에 투자한다").
 *
 * **던지지 않는다.** 뱃지는 이미 딴 것이고 알림은 곁다리다 — 여기서 던지면
 * 성취의 순간에 에러 토스트가 뜬다. 소원권 알림(api/wish.ts)과 같은 판단이다.
 *
 * 문구는 보내지 않는다. 시도 코드와 등급만 넘기고 서버가 이름을 붙인다 —
 * 받으면 아무 말이나 상대방 잠금화면에 띄울 수 있다.
 */
export async function notifyBadge(
  sidoCode: string,
  tier: Exclude<BadgeTier, 'locked'>,
): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return

    await fetch('/api/badge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sidoCode, tier }),
    })
  } catch {
    // 오프라인이거나 함수가 죽은 경우. 뱃지는 이미 기록됐다.
  }
}
