import { supabase } from '@/lib/supabase'
import { WISH_TOTAL_MAX, type Wish, type WishQuota, type WishQuotaRequest } from '../types'

const WISH_COLUMNS = 'id, couple_id, owner_id, content, created_at'
const QUOTA_COLUMNS = 'owner_id, total'
const QUOTA_REQUEST_COLUMNS = 'id, couple_id, target_owner_id, requested_by, status, created_at'

/**
 * DB의 트리거·함수가 막은 것들 (supabase/schema.sql의 check_wish_quota /
 * check_wish_total / check_wish_total_increase_requires_approval /
 * request_wish_quota_add / resolve_wish_quota_request). 화면도 같은 조건을
 * 미리 막지만 두 기기가 동시에 쓰면 화면의 잠금은 둘 다 통과하므로, 여기까지
 * 올라오는 경우가 실제로 있다.
 */
export type WishErrorCode =
  | 'no_wish_left'
  | 'total_below_used'
  | 'request_already_pending'
  | 'invalid_request'
  | 'total_at_max'
  | 'increase_requires_request'

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
  if (error.message.includes('request_already_pending')) {
    return new WishError(
      'request_already_pending',
      '이미 대기 중인 추가 요청이 있어요.',
    )
  }
  if (error.message.includes('invalid_request')) {
    return new WishError('invalid_request', '이미 처리된 요청이에요.')
  }
  if (error.message.includes('wish_increase_requires_request')) {
    // setWishTotal은 줄이는 용도로만 부르게 되어 있으니 정상적인 사용에서는
    // 닿지 않는다 (check_wish_total_increase_requires_approval). 그래도 막힌
    // 이유를 사람이 읽을 말로 옮겨둔다.
    return new WishError(
      'increase_requires_request',
      '소원권을 늘리려면 "추가 요청"을 보내 상대방의 승인을 받아야 해요.',
    )
  }
  // wish_quotas.total의 check 제약(0-99). 승인이 거듭 쌓여야 닿는 값이라 흔한
  // 경우는 아니지만, 원래 메시지("violates check constraint...")를 그대로
  // 보여주는 것보다는 낫다.
  if (error.message.includes('wish_quotas') && error.message.includes('check constraint')) {
    return new WishError('total_at_max', `소원권은 최대 ${WISH_TOTAL_MAX}장까지만 정할 수 있어요.`)
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
 * 한 사람의 총 장수를 **줄인다.**
 *
 * 이름과 달리 늘리는 값을 넣으면 DB가 막는다
 * (check_wish_total_increase_requires_approval) — 늘리는 건
 * requestWishQuotaAdd → resolveWishQuotaRequest를 거쳐야 한다. 줄이는 건
 * 상대의 동의가 필요한 일이 아니라 그대로 즉시 반영이다.
 *
 * upsert인 이유: 처음 정하는 사람은 row가 없다. 커플의 두 사람 모두를 대상으로
 * 부를 수 있다 — 줄이는 것도 RLS는 커플 범위다 (schema.sql의 wish_quotas
 * 정책 주석).
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

/**
 * 아직 처리되지 않은 소원권 추가 요청 전부. 최근 요청이 위로 온다.
 *
 * `status = 'pending'`만 가져온다 — 이미 승인·거절된 요청은 목록에 남지
 * 않는다는 정책(PRD)이 여기서 결정된다. 화면은 이 값을 필터링하지 않는다.
 */
export async function listPendingWishQuotaRequests(
  coupleId: string,
): Promise<WishQuotaRequest[]> {
  const { data, error } = await supabase
    .from('wish_quota_requests')
    .select(QUOTA_REQUEST_COLUMNS)
    .eq('couple_id', coupleId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * 소원권 한 장을 늘려달라는 요청을 만든다.
 *
 * `targetOwnerId`가 늘어날 사람이다 — 나 자신일 수도, 상대일 수도 있다.
 * 실제 삽입은 `request_wish_quota_add`(security definer)가 한다: 신원을
 * auth.uid()에서 직접 읽으므로 남의 이름으로 요청을 만들 수 없고, 대기 중인
 * 요청이 이미 있으면 DB의 부분 유니크 인덱스가 막는다
 * (`request_already_pending`로 옮겨 던진다 — 위 toWishError).
 */
export async function requestWishQuotaAdd(targetOwnerId: string): Promise<WishQuotaRequest> {
  const { data, error } = await supabase.rpc('request_wish_quota_add', {
    p_target_owner_id: targetOwnerId,
  })
  if (error) throw toWishError(error)
  return data
}

/**
 * 소원권 추가 요청에 응답한다.
 *
 * **요청한 사람은 자기 요청에 응답할 수 없다** — `resolve_wish_quota_request`가
 * `requested_by <> auth.uid()`로 막는다(위반하면 이미 처리됐거나 남의 요청인
 * 것과 같은 `invalid_request`로 온다). 승인이면 그 함수가 같은 트랜잭션에서
 * `wish_quotas.total`을 1 늘린다 — 여기서 따로 setWishTotal을 부를 필요가
 * 없다.
 */
export async function resolveWishQuotaRequest(
  requestId: string,
  approve: boolean,
): Promise<WishQuotaRequest> {
  const { data, error } = await supabase.rpc('resolve_wish_quota_request', {
    p_request_id: requestId,
    p_approve: approve,
  })
  if (error) throw toWishError(error)
  return data
}

/**
 * 방금 만든 소원권 추가 요청을 상대방에게 알린다.
 *
 * notifyWish와 같은 모양이다: 요청은 이미 저장됐으므로 알림이 못 가도
 * 되돌리지 않는다(delivered 0으로 떨어질 뿐). 문구는 여기서 만들지 않고
 * requestId만 보낸다 — 서버가 DB에서 다시 조회한 값만 쓴다.
 */
export async function notifyWishQuotaRequest(requestId: string): Promise<WishNotifyResult> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return { delivered: 0 }

    const response = await fetch('/api/wish-quota-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ requestId }),
    })

    const payload = (await response.json().catch(() => null)) as WishNotifyResult | null
    if (!response.ok) return { delivered: 0 }
    return { delivered: payload?.delivered ?? 0, reason: payload?.reason }
  } catch {
    return { delivered: 0 }
  }
}
