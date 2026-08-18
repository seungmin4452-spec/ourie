import { supabase } from '@/lib/supabase'

export interface SignupStats {
  /** 전체 가입자 수. */
  totalUsers: number
  /** 상대방까지 연결된 커플 수 — 초대 코드만 만들고 아직 아무도 안 들어온 건 안 센다. */
  connectedCouples: number
  /** limits.ts의 RECENT_SIGNUP_WINDOW_DAYS 기간 안에 가입한 사람 수. */
  recentSignups: number
  /** 알림을 받을 수 있는 기기(구독) 수 — 사람 수가 아니라 기기 수다. */
  pushSubscriptions: number
}

/**
 * 가입자 현황판이 보는 숫자 네 개.
 *
 * 서버(api/admin/stats.ts)가 이 토큰을 Supabase에 되물어 나온 이메일을
 * 다시 확인한다 — 관리자 계정이 아니면 여기서 403이 난다 (access.ts 참고).
 */
export async function getSignupStats(): Promise<SignupStats> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('로그인이 필요해요.')

  const response = await fetch('/api/admin/stats', {
    headers: { Authorization: `Bearer ${token}` },
  })

  const payload = (await response.json().catch(() => null)) as
    | (SignupStats & { message?: undefined })
    | { error: string; message: string }
    | null

  if (!response.ok || !payload) {
    throw new Error(
      payload && 'message' in payload && payload.message
        ? payload.message
        : '현황을 불러오지 못했어요.',
    )
  }

  return payload as SignupStats
}
