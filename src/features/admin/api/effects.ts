import { supabase } from '@/lib/supabase'
import type { AppEffectId } from '@/features/effects'

/**
 * 특수효과 하나를 켜거나 끈다. 성공하면 모든 사용자의 홈 화면에 그 순간
 * 반영된다 (Realtime 구독 — src/features/effects/hooks/useAppEffects.ts).
 *
 * 서버(api/admin/effects.ts)가 이 토큰을 Supabase에 되물어 나온 이메일을
 * 다시 확인한다 — 관리자 계정이 아니면 여기서 403이 난다. 클라이언트 쪽의
 * 어떤 검사도 진짜 권한 검사가 아니다 (access.ts 참고).
 */
export async function setAppEffect(id: AppEffectId, isEnabled: boolean): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('로그인이 필요해요.')

  const response = await fetch('/api/admin/effects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id, isEnabled }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(payload?.message ?? '효과를 바꾸지 못했어요.')
  }
}
