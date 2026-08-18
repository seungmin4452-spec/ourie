import { supabase } from '@/lib/supabase'

export interface BroadcastInput {
  title: string
  body: string
  /** 눌렀을 때 열릴 경로. 비우면 서버가 홈('/')으로 채운다. */
  url?: string
}

export interface BroadcastResult {
  /** 실제로 알림이 나간 기기 수. */
  delivered: number
  /** 더 이상 없는 구독이라 지운 것. */
  removed: number
  failed: number
  /** 시도한 전체 구독 수 — 결과 문구가 "N명 중 M명"을 말할 수 있게. */
  total: number
}

/**
 * 가입자 전체에게 푸시 알림을 즉시 보낸다.
 *
 * 서버(api/admin/broadcast.ts)가 이 토큰을 Supabase에 되물어 나온 이메일을
 * 다시 확인한다 — 관리자 계정이 아니면 여기서 403이 난다. 클라이언트 쪽의
 * 어떤 검사도 진짜 권한 검사가 아니다 (access.ts 참고).
 */
export async function sendBroadcast(input: BroadcastInput): Promise<BroadcastResult> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('로그인이 필요해요.')

  const response = await fetch('/api/admin/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  })

  const payload = (await response.json().catch(() => null)) as
    | (BroadcastResult & { message?: undefined })
    | { error: string; message: string }
    | null

  if (!response.ok || !payload) {
    throw new Error(
      payload && 'message' in payload && payload.message
        ? payload.message
        : '알림을 보내지 못했어요.',
    )
  }

  return payload as BroadcastResult
}
