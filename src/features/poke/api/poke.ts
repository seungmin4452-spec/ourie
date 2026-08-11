import { supabase } from '@/lib/supabase'
import type { PokeTarget } from '../types'

/**
 * 서버가 알려준 실패 이유. 화면이 상황마다 다르게 반응해야 해서 문구가 아니라
 * 코드로 구분한다 (api/poke.ts의 FAILURES와 같은 값이다).
 *
 * `erasableSyntaxOnly`가 켜져 있어 생성자 파라미터 프로퍼티를 쓸 수 없다.
 * code를 필드로 따로 선언하고 대입하는 이유다.
 */
export class PokeError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'PokeError'
    this.code = code
  }
}

export interface PokeSendResult {
  /** 실제로 알림이 나간 상대방 기기 수. 0이면 상대가 켜둔 기기가 없다. */
  delivered: number
}

/**
 * 상대방에게 콕 찌르기 하나를 보낸다.
 *
 * 클라이언트가 직접 상대방의 구독을 읽어 보낼 수는 없다 (RLS가 자기 것만
 * 보여준다). 그래서 서버 함수를 부르고, 신원 증명으로 지금 세션의 access
 * token을 싣는다 — 보내는 사람이 누구인지는 서버가 그 토큰에서 읽는다.
 *
 * 커플이 만든 버튼일 때도 **문구는 보내지 않는다**. id만 넘기고 서버가 DB에서
 * 읽는다 — 여기서 보낸 문구를 서버가 믿으면 아무 말이나 상대방 잠금화면에
 * 띄울 수 있다.
 */
export async function sendPoke(target: PokeTarget): Promise<PokeSendResult> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) {
    throw new PokeError('unauthorized', '로그인이 필요해요.')
  }

  const response = await fetch('/api/poke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(
      target.type === 'builtin' ? { kind: target.kind } : { presetId: target.preset.id },
    ),
  })

  // 서버가 500으로 죽었거나 프록시가 HTML을 돌려준 경우 JSON 파싱이 실패한다.
  const payload = (await response.json().catch(() => null)) as
    | (Partial<PokeSendResult> & { error?: string; message?: string })
    | null

  if (!response.ok) {
    throw new PokeError(
      payload?.error ?? 'unknown',
      payload?.message ?? '알림을 보내지 못했어요.',
    )
  }

  return { delivered: payload?.delivered ?? 0 }
}
