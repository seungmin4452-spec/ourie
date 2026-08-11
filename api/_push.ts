// Web Push 발송의 공통부. 알림을 보내는 함수가 둘이 되면서(매일 디데이,
// 콕 찌르기) VAPID 설정·전송·죽은 구독 정리가 그대로 겹쳐 여기로 모았다.
//
// 라우트가 아니다. Vercel은 api/ 아래 파일을 엔드포인트로 만들지만 `_`로
// 시작하는 파일은 건너뛴다 (api/_shared.ts와 같은 취급이다). 그래서 HTTP
// 메서드 이름의 export를 두면 안 된다.
//
// **Node 런타임 전용이다.** web-push가 VAPID 서명과 페이로드 암호화에 Node의
// crypto를 쓰기 때문에 edge에서는 동작하지 않는다. 이 파일을 import하는
// 함수는 config를 두지 말 것 (기본값이 Node다).
//
// **web-push는 반드시 기본 임포트여야 한다.** CJS 모듈이고 module.exports에
// 담기는 값이 정적으로 읽히지 않는 형태(메서드 참조, .bind())라, Node의 ESM
// 로더가 명명 임포트를 링크하지 못한다 — `import { sendNotification }`으로
// 쓰면 함수가 실행되기도 전에 모듈 로드 단계에서 죽는다.
import webpush from 'web-push'

/** 서비스워커(src/sw.ts)가 그대로 받아 읽는 모양. */
export interface PushPayload {
  title: string
  body: string
  /** 알림을 눌렀을 때 열 화면. 기본값은 홈. */
  url?: string
  /** 같은 이름의 알림은 쌓이지 않고 마지막 하나로 덮인다. */
  tag?: string
  /** 덮어쓸 때도 소리·진동을 다시 낼지. tag가 있어야 의미가 있다. */
  renotify?: boolean
}

/** 발송 대상 구독 하나. push_subscriptions의 한 row에서 필요한 것만. */
export interface PushTarget {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushOutcome {
  /** 실제로 보낸 구독의 id. 호출한 쪽이 발송 기록을 남기는 데 쓴다. */
  sentIds: string[]
  /** 푸시 서비스가 "이제 없는 구독"이라고 답한 것들. 지워야 한다. */
  staleIds: string[]
  /** 그 밖의 실패. 다음에 다시 시도될 수 있으므로 지우지 않는다. */
  failed: number
}

export function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

/**
 * VAPID 자격을 web-push에 물린다. 발송 전에 한 번 불러야 한다.
 *
 * 모듈 로드 시점이 아니라 함수 안에서 부르는 이유: 환경변수가 빠졌을 때
 * 모듈이 통째로 못 뜨면 요청이 코드에 닿기도 전에 500이 나서, 로그만 보고는
 * 원인을 알 수 없다.
 */
export function configureWebPush(): void {
  webpush.setVapidDetails(
    // mailto: 주소는 규격상 필수다. 푸시 서비스가 문제 생겼을 때 연락할 곳이다.
    requiredEnv('VAPID_SUBJECT'),
    requiredEnv('VAPID_PUBLIC_KEY'),
    requiredEnv('VAPID_PRIVATE_KEY'),
  )
}

/**
 * 대상들에게 하나씩 보낸다.
 *
 * 페이로드를 값이 아니라 함수로 받는 이유: 디데이 알림은 구독마다 커플이
 * 다르고 따라서 문구도 다르다. null을 돌려주면 그 구독은 건너뛴다 (보낼 말이
 * 없는 경우 — 커플 연결이 끊겼거나 기념일을 다 지운 사람).
 *
 * 한 명이 실패해도 나머지는 계속 보낸다. 여기서 던지면 앞에서 보낸 것들의
 * 발송 기록이 남지 않아, 다음 실행 때 같은 사람이 두 번 받는다.
 */
export async function sendPushToTargets<T extends PushTarget>(
  // 제네릭인 이유는 호출하는 쪽이 구독 row에 자기 필요한 필드를 더 얹어 넘기기
  // 때문이다 (디데이 함수는 embed한 couple_id를 payloadFor 안에서 다시 읽는다).
  // PushTarget으로 좁혀 받으면 그 필드가 콜백 안에서 사라진다.
  targets: T[],
  payloadFor: (target: T) => PushPayload | null,
  ttlSeconds: number,
): Promise<PushOutcome> {
  const sentIds: string[] = []
  const staleIds: string[] = []
  let failed = 0

  for (const target of targets) {
    const payload = payloadFor(target)
    if (!payload) continue

    try {
      await webpush.sendNotification(
        {
          endpoint: target.endpoint,
          keys: { p256dh: target.p256dh, auth: target.auth },
        },
        JSON.stringify(payload),
        { TTL: ttlSeconds },
      )
      sentIds.push(target.id)
    } catch (error) {
      // 404/410은 "이 구독은 이제 없다"는 뜻이다 (앱 삭제, 브라우저 데이터
      // 정리 등). 지우지 않으면 같은 실패를 영원히 반복한다.
      if (
        error instanceof webpush.WebPushError &&
        (error.statusCode === 404 || error.statusCode === 410)
      ) {
        staleIds.push(target.id)
        continue
      }
      failed += 1
      console.error('push failed', target.id, error)
    }
  }

  return { sentIds, staleIds, failed }
}
