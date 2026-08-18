import { supabase } from '@/lib/supabase'
import type { Wish, WishQuota } from '../types'

const WISH_COLUMNS = 'id, couple_id, owner_id, content, created_at'
const QUOTA_COLUMNS = 'owner_id, total'

/**
 * DB의 트리거가 막은 것들 (supabase/schema.sql의 check_wish_quota /
 * check_wish_total). 화면도 같은 조건을 미리 막지만 두 기기가 동시에 쓰면
 * 화면의 잠금은 둘 다 통과하므로, 여기까지 올라오는 경우가 실제로 있다.
 */
export type WishErrorCode = 'no_wish_left' | 'total_below_used'

export class WishError extends Error {
  readonly code: WishErrorCode

  constructor(code: WishErrorCode, message: string) {
    super(message)
    this.name = 'WishError'
    this.code = code
  }
}

/**
 * Postgres가 `raise exception 'no_wish_left'`로 던진 것을 사람이 읽을 말로
 * 바꾼다. 우리가 아는 이름이 아니면 그대로 흘려보낸다 — 네트워크 오류까지
 * "소원권이 없어요"로 덮으면 원인을 찾을 수 없다.
 */
function toWishError(error: { message: string }): unknown {
  if (error.message.includes('no_wish_left')) {
    return new WishError('no_wish_left', '남은 소원권이 없어요.')
  }
  if (error.message.includes('wish_total_below_used')) {
    return new WishError(
      'total_below_used',
      '이미 쓴 소원권보다 적게 줄일 수는 없어요.',
    )
  }
  return error
}

/**
 * 커플이 쓴 소원권 전부. 최근에 쓴 것이 위로 온다.
 *
 * RLS가 이미 호출자의 커플로 범위를 좁히지만, 명시적 필터가 있어야
 * wishes_couple_created_idx 인덱스를 탄다.
 */
export async function listWishes(coupleId: string): Promise<Wish[]> {
  const { data, error } = await supabase
    .from('wishes')
    .select(WISH_COLUMNS)
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * 두 사람이 정해둔 총 장수. 정한 적 없는 사람은 여기 없다 — 그 사람 몫은
 * 화면이 WISH_DEFAULT_TOTAL로 채운다 (board.ts의 wishStatus).
 */
export async function listWishQuotas(coupleId: string): Promise<WishQuota[]> {
  const { data, error } = await supabase
    .from('wish_quotas')
    .select(QUOTA_COLUMNS)
    .eq('couple_id', coupleId)
  if (error) throw error
  return data ?? []
}

/**
 * 소원권 한 장을 쓴다.
 *
 * 차감하는 코드가 없는 것이 맞다. 남은 장수는 어디에도 저장되지 않고
 * "총 장수 - 쓴 소원 수"로 매번 세어지므로, 이 row 하나가 곧 차감이다.
 */
export async function createWish(
  coupleId: string,
  ownerId: string,
  content: string,
): Promise<Wish> {
  const { data, error } = await supabase
    .from('wishes')
    .insert({ couple_id: coupleId, owner_id: ownerId, content })
    .select(WISH_COLUMNS)
    .single()
  if (error) throw toWishError(error)
  return data
}

/** 알림이 왜 안 갔는지. 화면이 사실대로 말할 수 있게 서버가 함께 준다. */
export type WishNotifyReason = 'stale' | 'no_couple' | 'not_opted_in'

export interface WishNotifyResult {
  /** 실제로 알림이 나간 상대방 기기 수. 0이면 닿은 기기가 없다. */
  delivered: number
  reason?: WishNotifyReason
}

/**
 * 방금 쓴 소원을 상대방에게 알린다. "꼭 이뤄주세요"가 잠금화면에 뜬다.
 *
 * 소원을 만드는 일과 **일부러 나눠** 두었다. 알림이 못 가도 그 한 장은 쓰인
 * 것이 맞고, 알림 실패로 소원을 되돌리면 장수만 이상해진다. 그래서 이 함수는
 * 던지지 않는다 — 실패하면 delivered 0으로 떨어져서, 부르는 쪽은 "썼다"와
 * "닿았다"를 따로 말할 수 있다.
 *
 * **문구를 보내지 않고 id만 보낸다.** 서버가 DB에서 읽는다 — 여기서 보낸
 * 문구를 서버가 믿으면 아무 말이나 상대방 잠금화면에 띄울 수 있다
 * (api/poke.ts와 같은 원칙이다).
 */
export async function notifyWish(wishId: string): Promise<WishNotifyResult> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return { delivered: 0 }

    const response = await fetch('/api/wish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ wishId }),
    })

    const payload = (await response.json().catch(() => null)) as WishNotifyResult | null
    if (!response.ok) return { delivered: 0 }
    return { delivered: payload?.delivered ?? 0, reason: payload?.reason }
  } catch {
    // 오프라인이거나 함수가 죽은 경우. 소원은 이미 저장됐으므로 여기서
    // 던지면 사용자는 "안 써졌다"고 오해한다.
    return { delivered: 0 }
  }
}

/**
 * 한 사람의 총 장수를 정한다.
 *
 * upsert인 이유: 처음 정하는 사람은 row가 없다. 커플의 두 사람 모두를 대상으로
 * 부를 수 있다 — 장수는 둘이 같이 정하는 약속이라 RLS도 커플 범위다
 * (schema.sql의 wish_quotas 정책 주석).
 */
export async function setWishTotal(
  coupleId: string,
  ownerId: string,
  updatedBy: string,
  total: number,
): Promise<void> {
  const { error } = await supabase.from('wish_quotas').upsert(
    {
      couple_id: coupleId,
      owner_id: ownerId,
      total,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'couple_id,owner_id' },
  )
  if (error) throw toWishError(error)
}
