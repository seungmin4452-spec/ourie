// 재활운동 — 운동을 시작하거나 끝냈다고 상대방에게 알린다.
//
// api/daily-question.ts와 형제다. 겹치는 설명은 그쪽 파일 머리말에 다 있고,
// 여기서는 다른 점만 적는다.
//
// 1. 이 함수는 기록을 만들지 않는다. 시작/종료는 브라우저가 RPC
//    (start_exercise / finish_exercise)로 이미 저장했고, 여기는 그 기록을 두고
//    알림만 쏜다.
// 2. 요청 본문은 action('start' | 'finish') 하나다. 보낸 사람의 가장 최근 운동
//    기록을 찾아, 그 action의 시각(started_at / ended_at)이 방금 찍힌 것일 때만
//    보낸다 — 아무 때나 불러 "운동 시작" 알림을 반복해서 쏘는 길을 막는다.
// 3. 종료 알림에는 연속 일수와 소원권 달성 여부를 싣는다 (message.ts).
//
// **핸들러를 `export default`로 바꾸지 말 것**, **아래 상대 import의 `.js`
// 확장자를 지우지 말 것.** 둘 다 api/poke.ts의 같은 주석 참고.
//
// 이 파일로 api/ 아래 함수가 12개(Hobby 플랜 한도)가 됐다. 다음에 함수를
// 늘려야 하면 api/admin/[action].ts처럼 묶을 것.

import { createClient } from '@supabase/supabase-js'

import { buildExerciseNotification, type ExerciseAction } from '../src/features/exercise/message.js'
import {
  configureWebPush,
  requiredEnv,
  sendPushToTargets,
  type PushTarget,
} from './_push.js'

const NOTIFICATION_URL = '/'

/** 운동 중이라는 소식은 몇 시간 뒤에 닿으면 의미가 없다. 종료도 같은 날 안이면 충분하다. */
const TTL_SECONDS = 2 * 60 * 60

const URGENCY = 'high' as const

/** 화면은 기록 직후에 한 번 부른다 (daily-question과 같은 5분). */
const FRESH_WINDOW_MS = 5 * 60 * 1000

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token || null
}

function undelivered(reason: string): Response {
  return Response.json({ delivered: 0, reason })
}

function isExerciseAction(value: unknown): value is ExerciseAction {
  return value === 'start' || value === 'finish'
}

export async function POST(request: Request): Promise<Response> {
  const token = bearerToken(request)
  if (!token) {
    return Response.json({ error: 'unauthorized', message: '로그인이 필요해요.' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { action?: unknown } | null
  const action = body?.action
  if (!isExerciseAction(action)) {
    return Response.json({ error: 'invalid_action', message: '알 수 없는 요청이에요.' }, { status: 400 })
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

  // 보낸 사람의 가장 최근 기록. 어제 밤에 시작해 자정 넘어 끝낸 경우도
  // finish_exercise가 어제 줄에 ended_at을 찍으므로, 날짜가 아니라 최근 순으로 본다.
  const { data: session, error: sessionError } = await supabase
    .from('exercise_logs')
    .select('couple_id, exercise_date, started_at, ended_at')
    .eq('owner_id', senderId)
    .order('exercise_date', { ascending: false })
    .limit(2)

  if (sessionError) {
    return Response.json({ error: 'db', message: sessionError.message }, { status: 500 })
  }

  const stampOf = (row: { started_at: string | null; ended_at: string | null }) =>
    action === 'start' ? row.started_at : row.ended_at
  const log = (session ?? []).find((row) => {
    const stamp = stampOf(row)
    return stamp != null && Date.now() - new Date(stamp).getTime() <= FRESH_WINDOW_MS
  })
  if (!log) return undelivered((session ?? []).length === 0 ? 'no_session' : 'stale')

  const { data: couple, error: coupleError } = await supabase
    .from('couples')
    .select('user_a, user_b')
    .eq('id', log.couple_id)
    .maybeSingle()

  if (coupleError) {
    return Response.json({ error: 'db', message: coupleError.message }, { status: 500 })
  }

  const recipientId = couple?.user_a === senderId ? couple?.user_b : couple?.user_a
  if (!recipientId) return undelivered('no_couple')

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, name, poke_opt_in')
    .in('id', [senderId, recipientId])

  if (profileError) {
    return Response.json({ error: 'db', message: profileError.message }, { status: 500 })
  }

  // 수신 동의는 콕 찌르기·소원권·오늘의 질문과 같은 값을 본다.
  const recipient = profiles?.find((profile) => profile.id === recipientId)
  if (!recipient?.poke_opt_in) return undelivered('not_opted_in')

  const senderName = profiles?.find((profile) => profile.id === senderId)?.name ?? null

  // 종료일 때만: 지금의 연속 일수와 방금 늘어난 소원권 장수.
  let streak = 0
  let rewardedTickets = 0
  if (action === 'finish') {
    const [{ data: streakRows }, { data: rewardRows }] = await Promise.all([
      supabase.rpc('exercise_streak', { p_owner_id: senderId }),
      supabase
        .from('exercise_rewards')
        .select('tickets')
        .eq('owner_id', senderId)
        .gte('created_at', new Date(Date.now() - FRESH_WINDOW_MS).toISOString()),
    ])
    streak = (streakRows as { streak: number }[] | null)?.[0]?.streak ?? 0
    rewardedTickets = ((rewardRows ?? []) as { tickets: number }[]).reduce(
      (sum, row) => sum + row.tickets,
      0,
    )
  }

  const { data: subscriptionRows, error: subscriptionError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', recipientId)

  if (subscriptionError) {
    return Response.json({ error: 'db', message: subscriptionError.message }, { status: 500 })
  }

  const payload = {
    ...buildExerciseNotification(action, log.exercise_date, senderName, streak, rewardedTickets),
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
