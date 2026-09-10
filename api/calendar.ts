// 캘린더 "우리 약속" — 등록하면 상대방에게 알린다.
//
// api/wish.ts와 형제다. 일정 자체는 만들지 않는다 — 이미 브라우저가 RLS
// 아래에서 직접 넣었다(src/features/calendar/api/calendar.ts). 여기는
// 이미 들어간 row를 두고 알림만 쏜다. 겹치는 설명은 api/poke.ts, api/wish.ts
// 머리말에 다 있고, 여기서는 다른 점만 적는다.
//
// 1. 요청 본문은 eventId 하나다. **제목·날짜·장소는 받지 않는다** — 받으면
//    아무 말이나 상대방 잠금화면에 띄울 수 있다. 여기서 조회한 값만 쓴다.
// 2. **"우리 약속"으로 등록한 사람 본인의 요청인지 확인한다.** is_shared를
//    켤 수 있는 사람은 created_by뿐이다 (화면의 canToggleShared,
//    calendar_events_update_shared_or_own RLS와 같은 규칙) — 남의 일정
//    id로 이 엔드포인트를 불러 파트너 기기를 대신 울리는 길을 막는다.
// 3. is_shared가 꺼진 일정(개인 일정)은 알리지 않는다 — "우리 약속"만의
//    알림이다.
// 4. 방금 그렇게 된 것만 알린다 (updated_at 기준). 새로 등록했든, 기존
//    개인 일정을 "우리 약속"으로 막 켰든 둘 다 그 순간 updated_at이
//    now()로 갱신된다 (calendar_events_set_updated_at 트리거). 이 창이
//    없으면 예전 일정 id로 계속 불러 상대방 기기를 울릴 수 있다.
//
// **핸들러를 `export default`로 바꾸지 말 것.** Vercel의 Node 런타임은 HTTP
// 메서드 이름의 명명 export(`POST`)를 보고서야 Web 표준 시그니처
// (Request -> Response)로 호출한다.
//
// **아래 상대 import의 `.js` 확장자를 지우지 말 것.** Node 런타임 함수는
// 번들되지 않고 파일별로 .js로 트랜스파일된 뒤 ESM으로 로드되는데, ESM은
// 확장자 없는 상대 경로를 해석하지 못한다.

import { createClient } from '@supabase/supabase-js'

import { buildCalendarNotification } from '../src/features/calendar/message.js'
import { formatEventDate, formatEventTime } from '../src/features/calendar/schedule.js'
import {
  configureWebPush,
  requiredEnv,
  sendPushToTargets,
  type PushTarget,
} from './_push.js'

/** 알림을 눌렀을 때 열 화면. */
const NOTIFICATION_URL = '/'

/**
 * 푸시 서비스가 알림을 들고 있을 시간. 지역 뱃지·소원권과 같은 12시간이다.
 * 오늘 잡은 약속은 오늘 안에만 닿으면 되고, 몇 시간 뒤에 떠도 "언제 어디서
 * 보자"는 그대로 읽힌다.
 */
const TTL_SECONDS = 12 * 60 * 60

/** TTL은 길지만 urgency는 높다 (_push.ts의 PushUrgency 주석 참고). */
const URGENCY = 'high' as const

/**
 * 방금 그렇게 된 일정만 알릴 수 있다. 화면은 등록/토글 직후에 한 번 부르므로
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
 * 알림이 나가지 않았다는 답. 일정은 이미 등록된 것이므로 이건 실패가 아니라
 * "몇 대에 닿았는지"의 0이다.
 */
function undelivered(reason: string): Response {
  return Response.json({ delivered: 0, reason })
}

export async function POST(request: Request): Promise<Response> {
  const token = bearerToken(request)
  if (!token) {
    return Response.json({ error: 'unauthorized', message: '로그인이 필요해요.' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { eventId?: unknown } | null
  const eventId =
    typeof body?.eventId === 'string' && UUID_PATTERN.test(body.eventId) ? body.eventId : null
  if (!eventId) {
    return Response.json(
      { error: 'invalid_event', message: '알 수 없는 일정이에요.' },
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

  // service role이라 RLS가 없다. "내가 등록한 일정인지"를 여기서 직접 본다 —
  // 위 머리말 2번 참고.
  const { data: event, error: eventError } = await supabase
    .from('calendar_events')
    .select('id, couple_id, created_by, title, event_date, event_time, location, is_shared, updated_at')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError) {
    return Response.json({ error: 'db', message: eventError.message }, { status: 500 })
  }
  if (!event || event.created_by !== senderId) {
    return Response.json(
      { error: 'invalid_event', message: '알 수 없는 일정이에요.' },
      { status: 404 },
    )
  }
  if (!event.is_shared) return undelivered('not_shared')
  if (Date.now() - new Date(event.updated_at).getTime() > FRESH_WINDOW_MS) {
    return undelivered('stale')
  }

  const { data: couple, error: coupleError } = await supabase
    .from('couples')
    .select('user_a, user_b')
    .eq('id', event.couple_id)
    .maybeSingle()

  if (coupleError) {
    return Response.json({ error: 'db', message: coupleError.message }, { status: 500 })
  }

  const recipientId = couple?.user_a === senderId ? couple?.user_b : couple?.user_a
  if (!recipientId) return undelivered('no_couple')

  // 보내는 사람의 이름과 받는 사람의 수신 동의를 한 번에 읽는다.
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, name, poke_opt_in')
    .in('id', [senderId, recipientId])

  if (profileError) {
    return Response.json({ error: 'db', message: profileError.message }, { status: 500 })
  }

  // 수신 동의는 콕 찌르기·소원권·지역 뱃지와 같은 값을 본다 — 뜻이 "상대방이
  // 내 기기를 울려도 된다"이고 이것도 정확히 그것이다.
  const recipient = profiles?.find((profile) => profile.id === recipientId)
  if (!recipient?.poke_opt_in) return undelivered('not_opted_in')

  // app_name이 아니라 name이다. app_name은 앱 이름이라 알림에 쓰면
  // "승민 ♥ 진선님이 우리 약속을 등록했어요"가 된다.
  const senderName = profiles?.find((profile) => profile.id === senderId)?.name ?? null

  const { data: subscriptionRows, error: subscriptionError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', recipientId)

  if (subscriptionError) {
    return Response.json({ error: 'db', message: subscriptionError.message }, { status: 500 })
  }

  const detail = [formatEventDate(event.event_date), formatEventTime(event.event_time), event.location]
    .filter(Boolean)
    .join(' · ')

  const payload = {
    // 문구는 요청 본문이 아니라 위에서 조회한 event 값에서 온다 — 이 파일
    // 머리말 1번 참고.
    ...buildCalendarNotification(event.id, senderName, event.title, detail),
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
