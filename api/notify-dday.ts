// 하루 한 번, 알림을 켠 사람들에게 "오늘 며칠째"를 보내는 함수.
//
// **부르는 쪽은 Vercel Cron이 아니라 Supabase의 pg_cron이다**
// (supabase/migrations/2026-08-12-notify-cron.sql). 매일 UTC 00:00 = KST 오전
// 9시에 pg_net이 이 엔드포인트를 GET으로 친다. Vercel Cron을 걷어낸 이유는 그
// cron이 현재 프로덕션 배포에 묶여서, 발동 구간에 배포가 올라가면 그날 몫이
// 통째로 유실되기 때문이다 (2026-08-12에 실제로 겪었다). 발송 시각을 바꾸려면
// 그 마이그레이션의 cron.schedule 하나만 고치면 된다 — 이 파일은 자기가 몇 시에
// 불리는지 모르고, 아래 KST_OFFSET은 시각이 아니라 날짜 기준이라 무관하다.
//
// 이 파일은 edge가 아니라 Node 런타임이다 (config를 두지 않으면 Node가
// 기본값이다). web-push가 VAPID 서명과 페이로드 암호화에 Node의 crypto를 쓰기
// 때문이다. 실제 발송은 같은 제약을 공유하는 api/_push.ts가 맡는다.
//
// **핸들러를 `export default`로 바꾸지 말 것.** 다른 api/ 파일들은 default
// export지만 이 파일은 HTTP 메서드 이름의 명명 export(`GET`)여야 한다. Vercel의
// Node 런타임은 그 이름을 보고서야 Web 표준 시그니처(Request -> Response)로
// 호출하고, default export면 Node 스타일 (req, res)로 부른다 -- 그러면 아래
// isAuthorized에서 `request.headers.get is not a function`으로 죽는다
// (실제로 겪었던 문제).
//
// **아래 상대 import의 `.js` 확장자를 지우지 말 것.** edge 런타임 파일들(invite,
// manifest, pwa-install)은 하나로 번들되므로 확장자가 없어도 되지만, Node 런타임
// 함수는 번들되지 않고 파일별로 .js로 트랜스파일된 뒤 그대로 실행된다. 이
// package.json은 `"type": "module"`이라 그 .js들은 ESM으로 로드되고, ESM은
// 확장자 없는 상대 경로를 해석하지 못한다 -- 파일이 번들에 멀쩡히 들어 있어도
// ERR_MODULE_NOT_FOUND로 죽는다 (요청이 코드에 닿기도 전에 나던
// FUNCTION_INVOCATION_FAILED 500의 원인이었다). TypeScript 소스는 .ts지만 ESM
// 규약대로 컴파일 결과의 확장자인 `.js`를 쓴다. 이 함수가 타고 들어가는
// src/features/notification/message.ts에도 같은 규칙이 적용된다.

import { createClient } from '@supabase/supabase-js'

import { pickBaseAnniversary } from '../src/features/notification/baseAnniversary.js'
import { buildDdayNotification } from '../src/features/notification/message.js'
import {
  configureWebPush,
  requiredEnv,
  sendPushToTargets,
  type PushTarget,
} from './_push.js'

/** 알림이 향하는 화면. 눌러서 열면 오늘 숫자가 크게 보이는 홈이 맞다. */
const NOTIFICATION_URL = '/'

/**
 * 커플이 사는 달력. 발송 시각이 KST 아침으로 고정이라 날짜 기준도 KST다.
 *
 * 서버는 UTC로 도니 그대로 읽으면 KST 새벽·아침 시간대에 어제 날짜가 나올 수
 * 있다. 절대 시각에 9시간을 더해 읽으면 언제 깨어나도 사용자가 맞이하는 오늘이
 * 나온다. 발송 시각을 옮겨도 이 값은 그대로 둔다 — 이건 "몇 시에 보내나"가
 * 아니라 "누구의 달력인가"다.
 *
 * (사용자별 타임존을 지원하려면 구독마다 타임존을 저장하고 cron을 매시간
 * 돌려야 한다. pg_cron으로 옮겨 왔으니 이제 플랜 제약은 없다.)
 */
const KST_OFFSET_MINUTES = 9 * 60

/**
 * 푸시 서비스가 알림을 들고 있을 시간. 오늘 하루가 지나면 의미가 없어지는
 * 내용이라, 기기가 하루 넘게 꺼져 있었다면 그냥 버려지는 편이 낫다.
 */
const TTL_SECONDS = 12 * 60 * 60

interface SubscriptionRow extends PushTarget {
  // PostgREST의 embed 결과. to-one 관계라 객체 하나지만, 배열로 오는 경우도
  // 있어 둘 다 받아 넘긴다.
  profiles: { couple_id: string | null } | { couple_id: string | null }[] | null
}

interface AnniversaryRow {
  couple_id: string
  title: string
  date: string
  /** 커플이 직접 고른 기준. pickBaseAnniversary가 이걸 가장 먼저 본다. */
  is_primary: boolean
}

/** 커플의 달력 기준 오늘 (YYYY-MM-DD). */
function todayKey(): string {
  // getTime()은 타임존과 무관한 절대 시각이므로, 9시간을 더한 뒤 UTC로 읽으면
  // 서버가 어디서 돌든 KST 달력의 날짜가 나온다.
  const shifted = new Date(Date.now() + KST_OFFSET_MINUTES * 60_000)
  return shifted.toISOString().slice(0, 10)
}

function coupleIdOf(row: SubscriptionRow): string | null {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
  return profile?.couple_id ?? null
}

/**
 * Vercel Cron은 CRON_SECRET이 설정돼 있으면 Authorization 헤더에 실어 보낸다.
 * 비밀값이 없으면 아무나 부를 수 있는 발송 버튼이 되므로, 그 경우엔 아예
 * 거절한다.
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return new Response('Unauthorized', { status: 401 })
  }

  configureWebPush()

  // service role 키를 쓴다 — 이 함수는 특정 사용자의 요청이 아니라 모두를 대신해
  // 도는 작업이라 RLS로는 아무 row도 볼 수 없다. 이 키는 서버 환경변수로만
  // 존재해야 하며 클라이언트 번들에 절대 들어가면 안 된다 (VITE_ 접두사 금지).
  const supabase = createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  )

  const today = todayKey()

  // 오늘 이미 보낸 구독은 빼고 가져온다. cron이 재시도되거나 손으로 한 번 더
  // 불러도 같은 날 두 번 울리지 않게 하는 자물쇠다.
  const { data: subscriptionRows, error: subscriptionError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, profiles!inner(couple_id)')
    .or(`last_notified_on.is.null,last_notified_on.neq.${today}`)

  if (subscriptionError) {
    return Response.json({ error: subscriptionError.message }, { status: 500 })
  }

  const subscriptions = (subscriptionRows ?? []) as unknown as SubscriptionRow[]
  const coupleIds = [
    ...new Set(subscriptions.map(coupleIdOf).filter((id): id is string => id != null)),
  ]

  if (coupleIds.length === 0) {
    return Response.json({ today, sent: 0, skipped: subscriptions.length })
  }

  const { data: anniversaryRows, error: anniversaryError } = await supabase
    .from('anniversaries')
    .select('couple_id, title, date, is_primary')
    .in('couple_id', coupleIds)

  if (anniversaryError) {
    return Response.json({ error: anniversaryError.message }, { status: 500 })
  }

  // 커플마다 기준 기념일 하나. 고르는 규칙은 화면(설정 미리보기)과 공유한다.
  const baseByCouple = new Map<string, AnniversaryRow>()
  for (const coupleId of coupleIds) {
    const owned = (anniversaryRows ?? []).filter(
      (row: AnniversaryRow) => row.couple_id === coupleId,
    )
    const base = pickBaseAnniversary(owned)
    if (base) baseByCouple.set(coupleId, base)
  }

  const { sentIds, staleIds, failed } = await sendPushToTargets(
    subscriptions,
    (subscription) => {
      const coupleId = coupleIdOf(subscription)
      const base = coupleId ? baseByCouple.get(coupleId) : undefined
      // 커플 연결이 끊겼거나 기념일을 다 지운 경우. 보낼 말이 없으니 조용히
      // 넘긴다 — 구독은 남겨두고, 기념일이 다시 생기면 내일부터 알아서 간다.
      if (!base) return null

      return {
        ...buildDdayNotification({ anniversaryTitle: base.title, date: base.date, today }),
        url: NOTIFICATION_URL,
        // 재발송이 있어도 알림이 쌓이지 않고 마지막 하나로 덮이게 한다.
        // 콕 찌르기는 다른 tag를 쓰므로 서로 덮지 않는다
        // (src/features/poke/message.ts).
        tag: 'ourie-dday',
      }
    },
    TTL_SECONDS,
  )

  if (sentIds.length > 0) {
    await supabase
      .from('push_subscriptions')
      .update({ last_notified_on: today })
      .in('id', sentIds)
  }

  if (staleIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', staleIds)
  }

  return Response.json({
    today,
    sent: sentIds.length,
    removed: staleIds.length,
    failed,
  })
}
