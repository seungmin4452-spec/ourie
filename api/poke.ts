// 콕 찌르기 — 한쪽이 버튼을 누르면 상대방 기기를 울린다.
//
// 매일 도는 api/notify-dday.ts와 달리 이건 사용자가 부르는 엔드포인트다. 그
// 차이가 이 파일의 거의 전부를 설명한다:
//
// 1. 인증이 CRON_SECRET이 아니라 사용자의 Supabase access token이다. **보내는
//    사람을 request body로 받지 않는다** — 받으면 아무나 남의 이름으로 알림을
//    쏠 수 있다. 신원은 오직 토큰을 검증해서 나온 id만 믿는다.
// 2. 상대방의 push_subscriptions를 읽어야 하는데, 그 테이블의 RLS는
//    `user_id = auth.uid()`라 사용자 세션으로는 자기 것밖에 안 보인다
//    (상대가 내 기기 알림을 켜고 끄지 못하게 하려는 정책이다). 그래서 조회는
//    service role 키로 한다.
// 3. 권한 검사(커플 연결, 상대방의 수신 동의)와 연타 방지는 여기가 아니라
//    public.send_poke가 한 트랜잭션에서 한다. 여러 번의 조회로 나누면 동시에
//    들어온 두 요청이 둘 다 통과하는데, 버튼 연타가 정확히 그 상황이다.
//    자세한 건 supabase/schema.sql의 그 함수 위 주석에 있다.
//
// 이 파일은 Node 런타임이다 (config를 두지 않으면 기본값). 발송을 맡는
// api/_push.ts가 web-push를 쓰고, 그게 Node의 crypto를 요구한다.
//
// **핸들러를 `export default`로 바꾸지 말 것.** Vercel의 Node 런타임은 HTTP
// 메서드 이름의 명명 export(`POST`)를 보고서야 Web 표준 시그니처
// (Request -> Response)로 호출한다. default export면 Node 스타일 (req, res)로
// 불러서 `request.headers.get is not a function`으로 죽는다.
//
// **아래 상대 import의 `.js` 확장자를 지우지 말 것.** Node 런타임 함수는
// 번들되지 않고 파일별로 .js로 트랜스파일된 뒤 ESM으로 로드되는데, ESM은
// 확장자 없는 상대 경로를 해석하지 못한다 (ERR_MODULE_NOT_FOUND). 자세한 건
// api/notify-dday.ts의 같은 주석 참고.

import { createClient } from '@supabase/supabase-js'

import {
  buildCustomPokeNotification,
  buildPokeNotification,
  isPokeKind,
} from '../src/features/poke/message.js'
import {
  configureWebPush,
  requiredEnv,
  sendPushToTargets,
  type PushTarget,
} from './_push.js'

/** 알림을 눌렀을 때 열 화면. */
const NOTIFICATION_URL = '/'

/**
 * 푸시 서비스가 알림을 들고 있을 시간. 디데이 알림(12시간)보다 훨씬 짧다 —
 * "보고싶어"는 지금 도착해야 의미가 있고, 몇 시간 뒤에 뒤늦게 뜨면 상대는
 * 무슨 상황인지 알 수 없다. 기기가 그만큼 꺼져 있었다면 그냥 버려지는 게 낫다.
 */
const TTL_SECONDS = 60 * 60

/**
 * 절전 중이어도 기기를 깨워 지금 띄운다. 이 앱에서 즉시성이 가장 중요한
 * 알림이다 — 버튼을 누르는 행위 자체가 "지금 이 순간 네 생각을 하고 있다"는
 * 뜻이라, 5분 뒤에 도착하면 상대는 그 순간을 놓친다. TTL을 1시간으로 줄여둔
 * 것만으로는 이게 해결되지 않는다 (_push.ts의 PushUrgency 주석 참고).
 */
const URGENCY = 'high' as const

/**
 * send_poke가 던지는 예외를 그대로 사용자에게 보여줄 수 없으니 여기서 옮긴다.
 *
 * code를 따로 내려주는 이유: 화면이 상황마다 다르게 반응해야 한다. 수신 동의가
 * 없으면 안내를 띄우고, 너무 빨리 눌렀으면 조용히 넘긴다.
 */
const FAILURES: Record<string, { status: number; message: string }> = {
  no_couple: { status: 409, message: '아직 커플이 연결되지 않았어요.' },
  not_opted_in: {
    status: 403,
    message: '상대방이 아직 콕 찌르기 알림을 켜지 않았어요.',
  },
  // 1초 창은 실수로 두 번 눌린 것을 거르는 용도다. 사용자가 뭘 잘못한 게
  // 아니므로 화면에서는 굳이 크게 알리지 않는다.
  too_soon: { status: 429, message: '조금 전에 보냈어요.' },
  invalid_kind: { status: 400, message: '보낼 수 없는 알림이에요.' },
}

interface SendPokeResult {
  recipient_id: string
  /**
   * 보낸 사람의 **사람 이름**(profiles.name)이다. profiles.app_name은
   * 앱 이름("승민 ♥ 진선")이라 여기 쓰면 알림이 "승민 ♥ 진선님이 보고 싶대요"가
   * 된다. 키 이름은 supabase/schema.sql의 send_poke 반환값과 같아야 한다.
   */
  sender_name: string | null
  /**
   * 커플이 만든 버튼이었다면 그 버튼의 문구. 기본 버튼일 때는 둘 다 null이고,
   * 그때 문구는 코드(message.ts)가 들고 있다.
   *
   * **이 값이 요청 본문이 아니라 여기서 오는 것이 중요하다.** 클라이언트가 보낸
   * 문구를 그대로 쓰면 누구든 아무 말이나 상대방 잠금화면에 띄울 수 있다.
   */
  preset_label: string | null
  preset_body: string | null
}

/**
 * 커플이 만든 버튼의 id 형태만 본다. 여기서 안 거르면 아무 문자열이나 그대로
 * Postgres로 가서 uuid 캐스팅 에러(22P02)가 나고, 그건 우리가 아는 실패 코드가
 * 아니라 사용자에게 500으로 보인다.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function failure(code: string): Response {
  const known = FAILURES[code]
  if (!known) {
    console.error('send_poke failed', code)
    return Response.json(
      { error: 'unknown', message: '알림을 보내지 못했어요.' },
      { status: 500 },
    )
  }
  return Response.json({ error: code, message: known.message }, { status: known.status })
}

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

  // 본문이 비었거나 JSON이 아닌 경우까지 여기서 걸러진다.
  const body = (await request.json().catch(() => null)) as
    | { kind?: unknown; presetId?: unknown }
    | null

  // 기본 버튼(kind)이거나 커플이 만든 버튼(presetId)이거나, 둘 중 정확히
  // 하나여야 한다. 둘 다 오면 무엇을 보내려는 건지 알 수 없다.
  const kind = isPokeKind(body?.kind) ? body.kind : null
  const presetId =
    typeof body?.presetId === 'string' && UUID_PATTERN.test(body.presetId)
      ? body.presetId
      : null
  if ((kind == null) === (presetId == null)) {
    return failure('invalid_kind')
  }

  // service role 키. 위 주석 2번의 이유이며, 이 키는 서버 환경변수로만 존재해야
  // 한다 (VITE_ 접두사 금지 — 붙이면 클라이언트 번들에 그대로 실린다).
  const supabase = createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  )

  // 토큰을 Supabase에 확인시킨다. 여기서 나온 id만이 "보낸 사람"이다.
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  const senderId = userData?.user?.id
  if (userError || !senderId) {
    return Response.json(
      { error: 'unauthorized', message: '로그인이 만료됐어요. 다시 로그인해주세요.' },
      { status: 401 },
    )
  }

  const { data: sendResult, error: sendError } = await supabase.rpc('send_poke', {
    p_sender: senderId,
    p_kind: kind,
    p_preset: presetId,
  })

  if (sendError) {
    // PostgREST는 RAISE EXCEPTION 'too_soon'의 문구를 message에 담아 준다.
    // 완전 일치가 아니라 포함으로 보는 이유는 앞뒤에 컨텍스트가 붙는 경우가
    // 있어서다.
    const code = Object.keys(FAILURES).find((key) => sendError.message.includes(key))
    return failure(code ?? sendError.message)
  }

  const {
    recipient_id: recipientId,
    sender_name: senderName,
    preset_label: presetLabel,
    preset_body: presetBody,
  } = sendResult as SendPokeResult

  // 커플이 만든 버튼인데 문구가 안 왔다면 send_poke가 우리가 아는 모양이
  // 아니라는 뜻이다 (마이그레이션이 덜 돌았거나). 빈 알림을 쏘느니 여기서 멈춘다.
  if (presetId && (presetLabel == null || presetBody == null)) {
    console.error('send_poke returned no preset text', presetId)
    return Response.json(
      { error: 'unknown', message: '알림을 보내지 못했어요.' },
      { status: 500 },
    )
  }

  // 상대방이 켜둔 기기 전부. 아이폰과 노트북에서 각각 켰으면 둘 다 울린다.
  const { data: subscriptionRows, error: subscriptionError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', recipientId)

  if (subscriptionError) {
    return Response.json({ error: 'db', message: subscriptionError.message }, { status: 500 })
  }

  const subscriptions = (subscriptionRows ?? []) as PushTarget[]
  const payload = {
    // 커플이 만든 버튼의 문구는 요청 본문이 아니라 위 send_poke 반환값에서
    // 온다 — SendPokeResult 주석 참고.
    ...(presetId
      ? buildCustomPokeNotification(presetId, presetLabel!, presetBody!)
      : buildPokeNotification(kind!, senderName)),
    url: NOTIFICATION_URL,
  }

  configureWebPush()
  const { sentIds, staleIds, failed } = await sendPushToTargets(
    subscriptions,
    () => payload,
    TTL_SECONDS,
    URGENCY,
  )

  if (staleIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', staleIds)
  }

  // 여기까지 왔으면 pokes에는 이미 기록이 남았다. 닿은 기기가 하나도 없어도
  // 되돌리지 않는다 — 보낸 건 보낸 것이고, 대신 delivered를 그대로 내려서
  // 화면이 "상대방 기기에 닿지 않았어요"를 말할 수 있게 한다. 수신 동의를
  // 켜려면 알림을 먼저 켜야 하므로(화면에서 강제한다) 흔한 경우는 아니다.
  return Response.json({ delivered: sentIds.length, removed: staleIds.length, failed })
}
