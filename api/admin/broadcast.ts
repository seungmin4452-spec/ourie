// 관리자 전용 — 가입자 전체에게 푸시 알림을 즉시 보낸다.
//
// api/poke.ts와 거의 같은 뼈대다: 인증은 요청 본문이 아니라 사용자의 Supabase
// access token으로 하고, push_subscriptions 조회는 service role 키로 한다
// (그 테이블의 RLS는 user_id = auth.uid()라 사용자 세션으로는 자기 것밖에
// 못 본다 — poke.ts와 같은 이유).
//
// 다른 점은 "누구에게" 보내느냐다. 콕 찌르기는 send_poke가 커플 범위·수신
// 동의·연타 방지를 한 트랜잭션에서 판정하지만, 이건 그런 게 없다 — 관리자
// 이메일 하나로만 막는다. **클라이언트가 보낸 어떤 값도 신원으로 믿지 않는다.**
// Authorization 헤더의 토큰을 Supabase에 되물어 나온 이메일만 믿는다
// (src/features/admin/access.ts의 isAdminEmail).
//
// Node 런타임이다 (config를 두지 않으면 기본값 — web-push가 Node의 crypto를
// 요구해서 edge에서는 안 된다). 핸들러는 반드시 `export const POST`가 아니라
// 명명 export `POST` (Web 표준 Request -> Response 시그니처)여야 Vercel의
// Node 런타임이 올바르게 불러준다 — default export면 Node 스타일 (req, res)로
// 불러서 죽는다 (api/poke.ts와 같은 주의사항).
//
// 아래 상대 import의 `.js` 확장자를 지우지 말 것 — Node 런타임 함수는
// 번들되지 않고 파일별로 .js로 트랜스파일된 뒤 ESM으로 로드되는데, ESM은
// 확장자 없는 상대 경로를 해석하지 못한다.

import { createClient } from '@supabase/supabase-js'

import { isAdminEmail } from '../../src/features/admin/access.js'
import { BROADCAST_BODY_MAX, BROADCAST_TITLE_MAX } from '../../src/features/admin/limits.js'
import {
  configureWebPush,
  requiredEnv,
  sendPushToTargets,
  type PushTarget,
} from '../_push.js'

/** 알림을 눌렀을 때 열 화면의 기본값. */
const DEFAULT_URL = '/'

/**
 * 푸시 서비스가 이 알림을 들고 있을 시간. 콕 찌르기(1시간)보다 길게 뒀다 —
 * 이건 "지금 이 순간"의 알림이 아니라 공지라, 몇 시간 뒤에 기기를 켜도 여전히
 * 의미가 있다.
 */
const TTL_SECONDS = 60 * 60 * 12

/** `Authorization: Bearer <token>`에서 토큰만. 형식이 아니면 null. */
function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token || null
}

export async function POST(request: Request): Promise<Response> {
  const token = bearerToken(request)
  if (!token) {
    return Response.json({ error: 'unauthorized', message: '로그인이 필요해요.' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as
    | { title?: unknown; body?: unknown; url?: unknown }
    | null

  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const message = typeof body?.body === 'string' ? body.body.trim() : ''
  const url = typeof body?.url === 'string' && body.url.trim() ? body.url.trim() : DEFAULT_URL

  if (
    title.length === 0 ||
    title.length > BROADCAST_TITLE_MAX ||
    message.length === 0 ||
    message.length > BROADCAST_BODY_MAX
  ) {
    return Response.json(
      { error: 'invalid_body', message: '제목과 본문을 확인해주세요.' },
      { status: 400 },
    )
  }

  // service role 키. 서버 환경변수로만 존재해야 한다 (VITE_ 접두사 금지 —
  // 붙이면 클라이언트 번들에 그대로 실린다).
  const supabase = createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  )

  // 토큰을 Supabase에 확인시킨다. 여기서 나온 이메일만이 "누가 부르는지"다.
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  const callerEmail = userData?.user?.email
  if (userError || !callerEmail) {
    return Response.json(
      { error: 'unauthorized', message: '로그인이 만료됐어요. 다시 로그인해주세요.' },
      { status: 401 },
    )
  }

  if (!isAdminEmail(callerEmail)) {
    return Response.json(
      { error: 'forbidden', message: '관리자만 쓸 수 있어요.' },
      { status: 403 },
    )
  }

  // 커플 범위가 아니라 앱 전체 — user_id 필터를 걸지 않는다 (poke.ts는
  // 여기서 .eq('user_id', recipientId)를 건다).
  const { data: subscriptionRows, error: subscriptionError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')

  if (subscriptionError) {
    return Response.json({ error: 'db', message: subscriptionError.message }, { status: 500 })
  }

  const subscriptions = (subscriptionRows ?? []) as PushTarget[]
  const payload = { title, body: message, url, tag: 'admin-broadcast' }

  configureWebPush()
  const { sentIds, staleIds, failed } = await sendPushToTargets(
    subscriptions,
    () => payload,
    TTL_SECONDS,
    'high',
  )

  if (staleIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', staleIds)
  }

  return Response.json({
    delivered: sentIds.length,
    removed: staleIds.length,
    failed,
    total: subscriptions.length,
  })
}
