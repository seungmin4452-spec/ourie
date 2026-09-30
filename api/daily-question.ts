// 1일 1문답 — 오늘의 질문에 답하면 상대방에게 알린다.
//
// api/wish.ts / api/calendar.ts와 형제다. 겹치는 설명은 그쪽 파일 머리말에
// 다 있고, 여기서는 다른 점만 적는다.
//
// 1. 이 함수는 답을 만들지도 고치지도 않는다. 답 자체는 브라우저가 RLS 아래
//    직접 upsert하고(src/features/dailyQuestion/api/dailyQuestion.ts), 여기는
//    이미 저장된 row를 두고 알림만 쏜다.
// 2. 요청 본문은 questionDate 하나다. 답은 wish/calendar처럼 단일 id를 갖지
//    않는다 — 기본키가 (couple_id, owner_id, question_date)라, sender의
//    couple_id를 조회한 뒤 그 복합키로 직접 찾는다.
// 3. **"오늘 처음 답한 것"만 알린다.** 자정 전까지는 몇 번이든 고쳐 쓸 수
//    있는데, 고칠 때마다 알림이 다시 가면 안 된다. created_at과 updated_at이
//    같으면 방금 insert된 것이고(둘 다 같은 INSERT 문에서 now()로 채워진다),
//    다르면 이미 한 번 이상 update를 거친 것이다 — 그 차이로 판정한다.
// 4. 알림 문구에 답 내용을 싣지 않는다 — src/features/dailyQuestion/message.ts
//    머리말 참고. eventId/wishId처럼 조회한 내용을 신뢰하는 것과는 별개로,
//    이 기능은 앱에서 직접 확인하게 하는 쪽을 택했다.
//
// **핸들러를 `export default`로 바꾸지 말 것**, **아래 상대 import의 `.js`
// 확장자를 지우지 말 것.** 둘 다 api/poke.ts의 같은 주석 참고.

import { createClient } from '@supabase/supabase-js'

import { buildDailyQuestionNotification } from '../src/features/dailyQuestion/message.js'
import {
  configureWebPush,
  requiredEnv,
  sendPushToTargets,
  type PushTarget,
} from './_push.js'

/** 알림을 눌렀을 때 열 화면. */
const NOTIFICATION_URL = '/'

/**
 * 푸시 서비스가 알림을 들고 있을 시간. 소원권·캘린더와 같은 12시간이다.
 * 오늘 답한 것은 오늘 안에만 닿으면 되고, 몇 시간 뒤에 떠도 "답했어요"는
 * 그대로 읽힌다.
 */
const TTL_SECONDS = 12 * 60 * 60

/** TTL은 길지만 urgency는 높다 (_push.ts의 PushUrgency 주석 참고). */
const URGENCY = 'high' as const

/**
 * 방금 저장한 답만 알릴 수 있다. 화면은 저장 직후에 한 번 부르므로 넉넉히
 * 5분이면 느린 회선까지 덮는다 (wish/calendar와 동일).
 */
const FRESH_WINDOW_MS = 5 * 60 * 1000

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** `Authorization: Bearer <token>`에서 토큰만. 형식이 아니면 null. */
function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token || null
}

/**
 * 알림이 나가지 않았다는 답. 답은 이미 저장된 것이므로 이건 실패가 아니라
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

  const body = (await request.json().catch(() => null)) as { questionDate?: unknown } | null
  const questionDate =
    typeof body?.questionDate === 'string' && DATE_PATTERN.test(body.questionDate)
      ? body.questionDate
      : null
  if (!questionDate) {
    return Response.json(
      { error: 'invalid_question_date', message: '알 수 없는 날짜예요.' },
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

  // service role이라 RLS가 없다. sender의 couple_id부터 찾는다 — wish/calendar와
  // 달리 답에는 자기 id 하나만 가진 컬럼이 없어서, 먼저 커플을 알아야 그
  // 복합키(couple_id, owner_id, question_date)로 답을 찾을 수 있다.
  const { data: senderProfile, error: senderProfileError } = await supabase
    .from('profiles')
    .select('couple_id')
    .eq('id', senderId)
    .maybeSingle()

  if (senderProfileError) {
    return Response.json({ error: 'db', message: senderProfileError.message }, { status: 500 })
  }
  const coupleId = senderProfile?.couple_id
  if (!coupleId) return undelivered('no_couple')

  const { data: answer, error: answerError } = await supabase
    .from('daily_question_answers')
    .select('couple_id, owner_id, question_date, content, created_at, updated_at')
    .eq('couple_id', coupleId)
    .eq('owner_id', senderId)
    .eq('question_date', questionDate)
    .maybeSingle()

  if (answerError) {
    return Response.json({ error: 'db', message: answerError.message }, { status: 500 })
  }
  if (!answer) {
    return Response.json(
      { error: 'invalid_answer', message: '알 수 없는 답변이에요.' },
      { status: 404 },
    )
  }
  // 방금 처음 저장된 것만 알린다 — 위 머리말 3번 참고.
  if (answer.created_at !== answer.updated_at) return undelivered('not_first_answer')
  if (Date.now() - new Date(answer.updated_at).getTime() > FRESH_WINDOW_MS) {
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

  // 보내는 사람의 이름과 받는 사람의 수신 동의를 한 번에 읽는다.
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, name, poke_opt_in')
    .in('id', [senderId, recipientId])

  if (profileError) {
    return Response.json({ error: 'db', message: profileError.message }, { status: 500 })
  }

  // 수신 동의는 콕 찌르기·소원권·캘린더와 같은 값을 본다.
  const recipient = profiles?.find((profile) => profile.id === recipientId)
  if (!recipient?.poke_opt_in) return undelivered('not_opted_in')

  // app_name이 아니라 name이다 — DATABASE.md §2.1 참고.
  const senderName = profiles?.find((profile) => profile.id === senderId)?.name ?? null

  const { data: subscriptionRows, error: subscriptionError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', recipientId)

  if (subscriptionError) {
    return Response.json({ error: 'db', message: subscriptionError.message }, { status: 500 })
  }

  const payload = {
    ...buildDailyQuestionNotification(questionDate, senderName),
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
