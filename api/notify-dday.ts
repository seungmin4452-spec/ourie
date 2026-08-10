// 하루 한 번, 알림을 켠 사람들에게 "오늘 며칠째"를 보내는 함수.
//
// Vercel Cron이 매일 UTC 00:00(= KST 오전 9시)에 이 엔드포인트를 부른다
// (vercel.json의 crons). 시간대를 바꾸려면 그쪽 schedule과 아래 KST_OFFSET을
// 같이 고쳐야 한다.
//
// 이 파일만 edge가 아니라 Node 런타임이다 (config를 두지 않으면 Node가
// 기본값이다). web-push가 VAPID 서명과 페이로드 암호화에 Node의 crypto를 쓰기
// 때문이다. 대신 Web 표준 시그니처(GET(request))를 그대로 쓸 수 있어서 다른
// api/ 파일들과 모양은 같다.

import { createClient } from '@supabase/supabase-js'
// 반드시 기본 임포트여야 한다. web-push는 CJS 모듈이고 `module.exports`에
// 담기는 값이 정적으로 읽히지 않는 형태(메서드 참조, .bind())라, Node의 ESM
// 로더가 명명 임포트를 링크하지 못한다 -- `import { sendNotification }`으로
// 쓰면 함수가 실행되기도 전에 모듈 로드 단계에서 죽는다 (배포 후 인증 검사에
// 닿지도 못하고 FUNCTION_INVOCATION_FAILED가 났던 원인).
import webpush from 'web-push'

import { pickBaseAnniversary } from '../src/features/notification/baseAnniversary'
import { buildDdayNotification } from '../src/features/notification/message'

/** 알림이 향하는 화면. 눌러서 열면 오늘 숫자가 크게 보이는 홈이 맞다. */
const NOTIFICATION_URL = '/'

/**
 * 커플이 사는 달력. 발송 시각이 KST 오전 9시로 고정이라 날짜 기준도 KST다.
 * (사용자별 타임존을 지원하려면 구독마다 타임존을 저장하고 cron을 매시간
 * 돌려야 한다 — Vercel Hobby 플랜은 하루 1회만 허용한다.)
 */
const KST_OFFSET_MINUTES = 9 * 60

/**
 * 푸시 서비스가 알림을 들고 있을 시간. 오늘 하루가 지나면 의미가 없어지는
 * 내용이라, 기기가 하루 넘게 꺼져 있었다면 그냥 버려지는 편이 낫다.
 */
const TTL_SECONDS = 12 * 60 * 60

interface SubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  // PostgREST의 embed 결과. to-one 관계라 객체 하나지만, 배열로 오는 경우도
  // 있어 둘 다 받아 넘긴다.
  profiles: { couple_id: string | null } | { couple_id: string | null }[] | null
}

interface AnniversaryRow {
  couple_id: string
  title: string
  date: string
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

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
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

  webpush.setVapidDetails(
    // mailto: 주소는 규격상 필수다. 푸시 서비스가 문제 생겼을 때 연락할 곳이다.
    requiredEnv('VAPID_SUBJECT'),
    requiredEnv('VAPID_PUBLIC_KEY'),
    requiredEnv('VAPID_PRIVATE_KEY'),
  )

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
    .select('couple_id, title, date')
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

  const notifiedIds: string[] = []
  const staleIds: string[] = []
  let failed = 0

  for (const subscription of subscriptions) {
    const coupleId = coupleIdOf(subscription)
    const base = coupleId ? baseByCouple.get(coupleId) : undefined
    // 커플 연결이 끊겼거나 기념일을 다 지운 경우. 보낼 말이 없으니 조용히
    // 넘긴다 — 구독은 남겨두고, 기념일이 다시 생기면 내일부터 알아서 간다.
    if (!base) continue

    const message = buildDdayNotification({
      anniversaryTitle: base.title,
      date: base.date,
      today,
    })

    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify({ ...message, url: NOTIFICATION_URL }),
        { TTL: TTL_SECONDS },
      )
      notifiedIds.push(subscription.id)
    } catch (error) {
      // 404/410은 "이 구독은 이제 없다"는 뜻이다 (앱 삭제, 브라우저 데이터
      // 정리 등). 지우지 않으면 매일 같은 실패를 반복한다.
      if (error instanceof webpush.WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
        staleIds.push(subscription.id)
        continue
      }
      failed += 1
      console.error('push failed', subscription.id, error)
    }
  }

  if (notifiedIds.length > 0) {
    await supabase
      .from('push_subscriptions')
      .update({ last_notified_on: today })
      .in('id', notifiedIds)
  }

  if (staleIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', staleIds)
  }

  return Response.json({
    today,
    sent: notifiedIds.length,
    removed: staleIds.length,
    failed,
  })
}
