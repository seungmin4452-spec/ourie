// 소원권 추가 요청 — 한쪽이 "소원권 추가" 버튼을 누르면 승인해야 하는
// 상대방에게 알림이 간다.
//
// api/wish.ts와 형제이자 거의 같은 모양이다. 겹치는 설명은 그쪽 파일 머리말을
// 보면 된다. 여기서는 **다른 점**만 적는다.
//
// 1. 이 함수는 요청을 **만들지 않는다.** 요청 자체는 브라우저가
//    request_wish_quota_add RPC로 이미 만들고(src/features/wish/api/wish.ts),
//    여기는 이미 들어간 row를 두고 알림만 쏜다.
// 2. 받는 사람은 **항상 요청하지 않은 다른 한 사람**이다. target_owner_id(늘어날
//    사람)와 무관하다 — 내 소원권을 늘려달라는 요청이든 상대 소원권을
//    늘려주겠다는 요청이든, 승인은 요청한 사람이 아닌 쪽이 한다
//    (resolve_wish_quota_request와 같은 규칙).
// 3. 문구는 요청이 나를 위한 것인지 상대를 위한 것인지에 따라 갈린다
//    (buildWishQuotaRequestNotification의 isForRequesterThemself).
//
// **핸들러를 `export default`로 바꾸지 말 것**, **아래 상대 import의 `.js`
// 확장자를 지우지 말 것.** 둘 다 api/poke.ts의 같은 주석 참고.

import { createClient } from '@supabase/supabase-js'

import { buildWishQuotaRequestNotification } from '../src/features/wish/message.js'
import {
  configureWebPush,
  requiredEnv,
  sendPushToTargets,
  type PushTarget,
} from './_push.js'

/** 알림을 눌렀을 때 열 화면. */
const NOTIFICATION_URL = '/'

/**
 * 푸시 서비스가 알림을 들고 있을 시간. 소원권 알림(api/wish.ts)과 같은 이유로
 * 12시간이다 — 승인 요청도 오늘 안에만 닿으면 되고, 몇 시간 뒤에 떠도 "1장
 * 늘려달라는 요청"은 그대로 읽힌다.
 */
const TTL_SECONDS = 12 * 60 * 60

/** urgency는 소원권과 같은 이유로 high다 (api/wish.ts 참고). */
const URGENCY = 'high' as const

/**
 * 방금 만든 요청만 알릴 수 있다. 화면은 요청을 만든 직후에 한 번 부르므로
 * 넉넉히 5분이면 느린 회선까지 덮는다.
 */
const FRESH_WINDOW_MS = 5 * 60 * 1000

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `Authorization: Bearer <token>`에서 토큰만. 형식이 아니면 null. */
function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token || null
}

/**
 * 알림이 나가지 않았다는 답. 요청은 이미 만들어졌으므로 이건 실패가 아니라
 * "몇 대에 닿았는지"의 0이다 — 화면이 사실대로 말할 수 있게 이유를 함께 준다.
 */
function undelivered(reason: string): Response {
  return Response.json({ delivered: 0, reason })
}

export async function POST(request: Request): Promise<Response> {
  const token = bearerToken(request)
  if (!token) {
    return Response.json({ error: 'unauthorized', message: '로그인이 필요해요.' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { requestId?: unknown } | null
  const requestId =
    typeof body?.requestId === 'string' && UUID_PATTERN.test(body.requestId)
      ? body.requestId
      : null
  if (!requestId) {
    return Response.json(
      { error: 'invalid_request', message: '알 수 없는 요청이에요.' },
      { status: 400 },
    )
  }

  const supabase = createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  )

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  const senderId = userData?.user?.id
  if (userError || !senderId) {
    return Response.json(
      { error: 'unauthorized', message: '로그인이 만료됐어요. 다시 로그인해주세요.' },
      { status: 401 },
    )
  }

  // service role이라 RLS가 없다. 그래서 "내가 만든 요청인지"를 여기서 직접
  // 본다 — 남의 요청 id로 불러 상대방 기기를 울리는 길을 막는 것이 이 한 줄이다.
  const { data: quotaRequest, error: requestError } = await supabase
    .from('wish_quota_requests')
    .select('id, couple_id, target_owner_id, requested_by, created_at')
    .eq('id', requestId)
    .maybeSingle()

  if (requestError) {
    return Response.json({ error: 'db', message: requestError.message }, { status: 500 })
  }
  if (!quotaRequest || quotaRequest.requested_by !== senderId) {
    return Response.json(
      { error: 'invalid_request', message: '알 수 없는 요청이에요.' },
      { status: 404 },
    )
  }
  if (Date.now() - new Date(quotaRequest.created_at).getTime() > FRESH_WINDOW_MS) {
    return undelivered('stale')
  }

  const { data: couple, error: coupleError } = await supabase
    .from('couples')
    .select('user_a, user_b')
    .eq('id', quotaRequest.couple_id)
    .maybeSingle()

  if (coupleError) {
    return Response.json({ error: 'db', message: coupleError.message }, { status: 500 })
  }

  // 승인은 항상 요청하지 않은 다른 한 사람이 한다 — target_owner_id(늘어날
  // 사람)와 무관하다.
  const recipientId = couple?.user_a === senderId ? couple?.user_b : couple?.user_a
  if (!recipientId) return undelivered('no_couple')

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, name, poke_opt_in')
    .in('id', [senderId, recipientId])

  if (profileError) {
    return Response.json({ error: 'db', message: profileError.message }, { status: 500 })
  }

  const recipient = profiles?.find((profile) => profile.id === recipientId)
  if (!recipient?.poke_opt_in) return undelivered('not_opted_in')

  const senderName = profiles?.find((profile) => profile.id === senderId)?.name ?? null

  const { data: subscriptionRows, error: subscriptionError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', recipientId)

  if (subscriptionError) {
    return Response.json({ error: 'db', message: subscriptionError.message }, { status: 500 })
  }

  const payload = {
    ...buildWishQuotaRequestNotification(
      quotaRequest.id,
      senderName,
      quotaRequest.target_owner_id === quotaRequest.requested_by,
    ),
    url: NOTIFICATION_URL,
  }

  configureWebPush()
  const { sentIds, staleIds, failed } = await sendPushToTargets(
    (subscriptionRows ?? []) as PushTarget[],
    () => payload,
    TTL_SECONDS,
    URGENCY,
  )

  if (staleIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', staleIds)
  }

  return Response.json({ delivered: sentIds.length, removed: staleIds.length, failed })
}
