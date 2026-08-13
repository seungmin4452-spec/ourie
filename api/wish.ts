// 소원권 — 한쪽이 한 장을 쓰면 상대방에게 "꼭 이뤄주세요"가 간다.
//
// api/poke.ts와 형제다. 인증도 service role 사용 이유도 같으므로, 겹치는
// 설명은 그쪽 파일 머리말을 보면 된다. 여기서는 **다른 점**만 적는다.
//
// 1. 이 함수는 소원을 **만들지 않는다.** 소원 자체는 브라우저가 RLS 아래에서
//    직접 넣고(src/features/wish/api/wish.ts), 여기는 이미 들어간 row를 두고
//    알림만 쏜다. 콕 찌르기와 갈리는 지점이 여기다 — 그쪽은 기록과 발송이
//    한 몸이라 서버가 둘 다 해야 했지만, 소원권은 알림이 못 가도 그 한 장은
//    쓰인 것이 맞다. 알림 실패로 소원을 되돌리면 장수만 이상해진다.
// 2. 그래서 요청 본문은 wishId 하나다. **문구는 받지 않는다** — 여기서 조회한
//    값만 쓴다. 받으면 아무 말이나 상대방 잠금화면에 띄울 수 있다.
// 3. 수신 동의는 profiles.poke_opt_in을 그대로 쓴다. 컬럼 이름은 콕 찌르기에서
//    왔지만 뜻은 "상대방이 내 기기를 울리는 걸 허락한다"이고, 소원권 알림이
//    정확히 그것이다. 스위치 문구도 둘을 함께 가리키도록 고쳤다
//    (src/features/poke/components/PokeWidget.tsx).
//
// **핸들러를 `export default`로 바꾸지 말 것**, **아래 상대 import의 `.js`
// 확장자를 지우지 말 것.** 둘 다 api/poke.ts의 같은 주석 참고.

import { createClient } from '@supabase/supabase-js'

import { buildWishNotification } from '../src/features/wish/message.js'
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
 * 콕 찌르기(1시간)보다 훨씬 길다. "보고싶어"는 지금 도착해야 의미가 있지만
 * 소원은 오늘 안에만 닿으면 되고, 몇 시간 뒤에 떠도 "꼭 이뤄주세요"는 그대로
 * 읽힌다. 매일 디데이 알림과 같은 12시간으로 맞췄다.
 */
const TTL_SECONDS = 12 * 60 * 60

/**
 * 방금 쓴 소원만 알릴 수 있다.
 *
 * 이 창이 없으면 지난달에 쓴 소원의 id로 이 엔드포인트를 계속 불러 상대방
 * 기기를 울릴 수 있다. 화면은 소원을 만든 직후에 한 번 부르므로 넉넉히
 * 5분이면 느린 회선까지 덮는다.
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
 * 알림이 나가지 않았다는 답. 소원은 이미 쓰였으므로 이건 실패가 아니라
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

  const body = (await request.json().catch(() => null)) as { wishId?: unknown } | null
  const wishId =
    typeof body?.wishId === 'string' && UUID_PATTERN.test(body.wishId) ? body.wishId : null
  if (!wishId) {
    return Response.json({ error: 'invalid_wish', message: '알 수 없는 소원이에요.' }, { status: 400 })
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

  // service role이라 RLS가 없다. 그래서 "내 소원인지"를 여기서 직접 본다 —
  // 남의 소원 id로 불러 상대방 기기를 울리는 길을 막는 것이 이 한 줄이다.
  const { data: wish, error: wishError } = await supabase
    .from('wishes')
    .select('id, couple_id, owner_id, content, created_at')
    .eq('id', wishId)
    .maybeSingle()

  if (wishError) {
    return Response.json({ error: 'db', message: wishError.message }, { status: 500 })
  }
  if (!wish || wish.owner_id !== senderId) {
    return Response.json({ error: 'invalid_wish', message: '알 수 없는 소원이에요.' }, { status: 404 })
  }
  if (Date.now() - new Date(wish.created_at).getTime() > FRESH_WINDOW_MS) {
    return undelivered('stale')
  }

  const { data: couple, error: coupleError } = await supabase
    .from('couples')
    .select('user_a, user_b')
    .eq('id', wish.couple_id)
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

  const recipient = profiles?.find((profile) => profile.id === recipientId)
  if (!recipient?.poke_opt_in) return undelivered('not_opted_in')

  // app_name이 아니라 name이다. app_name은 앱 이름이라 알림에 쓰면
  // "승민 ♥ 진선님이 소원권을 썼어요"가 된다.
  const senderName = profiles?.find((profile) => profile.id === senderId)?.name ?? null

  const { data: subscriptionRows, error: subscriptionError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', recipientId)

  if (subscriptionError) {
    return Response.json({ error: 'db', message: subscriptionError.message }, { status: 500 })
  }

  const payload = {
    // 문구는 요청 본문이 아니라 위에서 조회한 wish.content에서 온다 —
    // 이 파일 머리말 2번 참고.
    ...buildWishNotification(wish.id, senderName, wish.content),
    url: NOTIFICATION_URL,
  }

  configureWebPush()
  const { sentIds, staleIds, failed } = await sendPushToTargets(
    (subscriptionRows ?? []) as PushTarget[],
    () => payload,
    TTL_SECONDS,
  )

  if (staleIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', staleIds)
  }

  return Response.json({ delivered: sentIds.length, removed: staleIds.length, failed })
}
