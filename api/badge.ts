// 지역 뱃지 — 시도 하나를 다 채우면 상대에게 알린다.
//
// api/wish.ts와 형제다. 뱃지를 **만들지 않고** 이미 기록된 것을 두고 알림만
// 쏜다 (기록은 브라우저가 claim_region_badge RPC로 한다). 겹치는 설명은
// api/poke.ts 머리말에 다 있고, 여기서는 다른 점만 적는다.
//
// 1. 요청 본문은 시도 코드와 등급뿐이다. **지역 이름과 문구는 받지 않는다** —
//    받으면 아무 말이나 상대방 잠금화면에 띄울 수 있다. 이름은 아래에서
//    regions.ts를 찾아 붙인다.
// 2. **정말 딴 뱃지인지 DB에서 확인한다.** 화면이 판정하는 구조라(뱃지 분모를
//    화면만 안다) 이 엔드포인트가 유일한 관문이 아니지만, 적어도 travel_badges에
//    실제로 있는 것만 알린다.
// 3. 방금 딴 것만 알린다 — 오래된 뱃지 코드로 계속 부르면 상대방 기기가 계속
//    울린다.
//
// **핸들러를 `export default`로 바꾸지 말 것**, **아래 상대 import의 `.js`
// 확장자를 지우지 말 것.** 둘 다 api/poke.ts의 같은 주석 참고.

import { createClient } from '@supabase/supabase-js'

import { buildBadgeNotification, type EarnedTier } from '../src/features/travel/badgeMessage.js'
import { TRAVEL_REGIONS } from '../src/features/travel/regions.js'
import {
  configureWebPush,
  requiredEnv,
  sendPushToTargets,
  type PushTarget,
} from './_push.js'

/** 알림을 눌렀을 때 열 화면. */
const NOTIFICATION_URL = '/'

/**
 * 푸시 서비스가 알림을 들고 있을 시간.
 *
 * 성취는 오늘 안에 닿으면 된다. 매일 디데이 알림과 같은 12시간으로 맞췄다
 * (콕 찌르기 1시간처럼 짧을 이유가 없다 — "우리가 강원도를 다 다녀왔어요"는
 * 몇 시간 뒤에 떠도 그대로 읽힌다).
 */
const TTL_SECONDS = 12 * 60 * 60

/**
 * 소원과 같은 이유로 TTL은 길고 urgency는 높다 (api/wish.ts 참고). 뱃지는 방금
 * 사진을 건 순간에 딴 것이라, 그 사진을 같이 보고 있을 상대에게 지금 닿아야
 * "우리가 방금 해냈다"가 된다.
 */
const URGENCY = 'high' as const

/**
 * 방금 딴 뱃지만 알릴 수 있다. 화면은 딴 직후에 한 번 부르므로 넉넉히 5분이면
 * 느린 회선까지 덮는다.
 */
const FRESH_WINDOW_MS = 5 * 60 * 1000

const SIDO_PATTERN = /^[0-9]{2}$/

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token || null
}

/** 알림이 나가지 않았다는 답. 뱃지는 이미 딴 것이라 실패가 아니다. */
function undelivered(reason: string): Response {
  return Response.json({ delivered: 0, reason })
}

export async function POST(request: Request): Promise<Response> {
  const token = bearerToken(request)
  if (!token) {
    return Response.json({ error: 'unauthorized', message: '로그인이 필요해요.' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as
    | { sidoCode?: unknown; tier?: unknown }
    | null

  const sidoCode =
    typeof body?.sidoCode === 'string' && SIDO_PATTERN.test(body.sidoCode) ? body.sidoCode : null
  const tier: EarnedTier | null =
    body?.tier === 'visited' || body?.tier === 'photo' ? body.tier : null

  if (!sidoCode || !tier) {
    return Response.json({ error: 'invalid_badge', message: '알 수 없는 뱃지예요.' }, { status: 400 })
  }

  const region = TRAVEL_REGIONS.find((item) => item.code === sidoCode)
  if (!region) {
    // 행정구역이 바뀌어 사라진 코드. 이름을 붙일 수 없으니 알리지 않는다.
    return undelivered('unknown_region')
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

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('couple_id')
    .eq('id', senderId)
    .maybeSingle()

  if (profileError) {
    return Response.json({ error: 'db', message: profileError.message }, { status: 500 })
  }
  const coupleId = profile?.couple_id
  if (!coupleId) return undelivered('no_couple')

  // 정말 딴 뱃지인지, 그리고 방금 딴 것인지. service role이라 RLS가 없으므로
  // couple_id를 직접 건다.
  const { data: badge, error: badgeError } = await supabase
    .from('travel_badges')
    .select('earned_at')
    .eq('couple_id', coupleId)
    .eq('sido_code', sidoCode)
    .eq('tier', tier)
    .maybeSingle()

  if (badgeError) {
    return Response.json({ error: 'db', message: badgeError.message }, { status: 500 })
  }
  if (!badge) {
    return Response.json({ error: 'invalid_badge', message: '아직 얻지 않은 뱃지예요.' }, { status: 404 })
  }
  if (Date.now() - new Date(badge.earned_at).getTime() > FRESH_WINDOW_MS) {
    return undelivered('stale')
  }

  const { data: couple, error: coupleError } = await supabase
    .from('couples')
    .select('user_a, user_b')
    .eq('id', coupleId)
    .maybeSingle()

  if (coupleError) {
    return Response.json({ error: 'db', message: coupleError.message }, { status: 500 })
  }

  const recipientId = couple?.user_a === senderId ? couple?.user_b : couple?.user_a
  if (!recipientId) return undelivered('no_couple')

  // 수신 동의는 콕 찌르기·소원권과 같은 값을 본다 — 뜻이 "상대방이 내 기기를
  // 울려도 된다"이고 이것도 정확히 그것이다
  // (src/features/notification/api/partnerAlerts.ts).
  const { data: recipient, error: recipientError } = await supabase
    .from('profiles')
    .select('poke_opt_in')
    .eq('id', recipientId)
    .maybeSingle()

  if (recipientError) {
    return Response.json({ error: 'db', message: recipientError.message }, { status: 500 })
  }
  if (!recipient?.poke_opt_in) return undelivered('not_opted_in')

  const { data: subscriptionRows, error: subscriptionError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', recipientId)

  if (subscriptionError) {
    return Response.json({ error: 'db', message: subscriptionError.message }, { status: 500 })
  }

  const payload = {
    ...buildBadgeNotification(region.shortName, tier),
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
