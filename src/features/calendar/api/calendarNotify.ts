import { supabase } from '@/lib/supabase'

/**
 * "우리 약속"을 등록했다고 상대에게 알린다.
 *
 * 둘이 따로 앱을 보고 있어서 이게 없으면 한쪽만 아는 약속이 된다
 * (지역 뱃지 알림 — src/features/travel/api/badgeNotify.ts — 와 같은 이유).
 *
 * **던지지 않는다.** 일정은 이미 등록된 것이고 알림은 곁다리다 — 여기서
 * 던지면 등록 성공 토스트 대신 에러 토스트가 뜬다.
 *
 * 문구는 보내지 않는다. eventId만 넘기고 서버가 조회한 값으로 문구를
 * 붙인다 — 받으면 아무 말이나 상대방 잠금화면에 띄울 수 있다.
 */
export async function notifyCalendarEvent(eventId: string): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return

    await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ eventId }),
    })
  } catch {
    // 오프라인이거나 함수가 죽은 경우. 일정은 이미 등록됐다.
  }
}
