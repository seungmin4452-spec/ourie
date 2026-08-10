// 브라우저 알림 권한과 Web Push 구독을 다루는 얇은 층.
//
// iOS는 홈 화면에 추가한 앱에서만 Web Push를 지원한다 (Safari 탭에서는
// PushManager 자체가 없다). 그래서 "지원 안 함"과 "아직 설치를 안 함"을 나눠서
// 알려준다 — 후자는 홈 화면에 추가하면 바로 풀리는 상태라, 같은 말로 뭉뚱그리면
// 커플이 켤 수 있는 기능을 못 켜게 된다.

import { isStandalone } from '@/features/onboarding/pwaInstall'

/** 알림 스위치가 지금 어떤 상태인지. */
export type PushStatus =
  /** 이 브라우저는 Web Push를 지원하지 않는다. */
  | 'unsupported'
  /** 홈 화면에 추가하면 켤 수 있다 (iOS Safari 탭). */
  | 'needs-install'
  /** 사용자가 브라우저 설정에서 알림을 차단했다. 앱에서 되돌릴 수 없다. */
  | 'blocked'
  /** 켤 수 있고, 아직 꺼져 있다. */
  | 'off'
  | 'on'

function hasPushApis(): boolean {
  return (
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  )
}

/** 구독 여부까지 확인한 현재 상태. */
export async function readPushStatus(): Promise<PushStatus> {
  if (!hasPushApis()) return isStandalone() ? 'unsupported' : 'needs-install'
  if (Notification.permission === 'denied') return 'blocked'
  if (Notification.permission !== 'granted') return 'off'

  // 권한이 있어도 구독이 없을 수 있다 — 브라우저가 구독을 회수하거나(iOS는
  // 조용한 푸시를 보내면 그렇게 한다) 다른 기기에서 껐다 켠 경우다.
  const subscription = await currentSubscription()
  return subscription ? 'on' : 'off'
}

/**
 * 준비된 서비스워커. 아직 등록조차 안 됐으면 null.
 *
 * `navigator.serviceWorker.ready`만 기다리면 등록이 하나도 없을 때 영원히
 * 멈춘다 (개발 서버에는 서비스워커가 없다 — vite-plugin-pwa는 빌드에서만
 * 넣는다). 등록 여부를 먼저 확인해서 화면이 "확인 중"에 갇히지 않게 한다.
 */
async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  const existing = await navigator.serviceWorker.getRegistration()
  if (!existing) return null
  return navigator.serviceWorker.ready
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await readyRegistration()
  return registration?.pushManager.getSubscription() ?? null
}

/**
 * VAPID 공개 키는 base64url 문자열로 들어오는데 pushManager.subscribe는 바이트
 * 배열만 받는다.
 */
// 반환 타입에 ArrayBuffer를 명시한다. 그냥 Uint8Array라고 쓰면 버퍼가
// ArrayBufferLike(SharedArrayBuffer 포함)로 넓어져서 applicationServerKey가
// 요구하는 BufferSource에 맞지 않는다.
function decodeVapidKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/**
 * 권한을 묻고 구독을 만든다. 반드시 사용자의 클릭에서 호출해야 한다 — 브라우저는
 * 사용자 제스처 없이 부른 requestPermission을 그냥 거절한다.
 */
export async function enablePush(): Promise<PushSubscription> {
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidKey) {
    throw new Error('알림 키가 설정되지 않았어요. (VITE_VAPID_PUBLIC_KEY)')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('알림 권한이 필요해요.')
  }

  const registration = await readyRegistration()
  if (!registration) {
    throw new Error('알림을 켜려면 설치된 앱에서 열어주세요.')
  }

  const existing = await registration.pushManager.getSubscription()
  if (existing) return existing

  return registration.pushManager.subscribe({
    // 이 값이 false면 브라우저가 구독을 거부한다. 우리는 어차피 눈에 보이는
    // 알림만 보내므로 문제될 게 없다.
    userVisibleOnly: true,
    applicationServerKey: decodeVapidKey(vapidKey),
  })
}

/**
 * 구독을 해지한다. 해지된 endpoint를 서버에서도 지워야 하므로 그 값을 돌려준다.
 * 구독이 이미 없으면 null.
 */
export async function disablePush(): Promise<string | null> {
  const subscription = await currentSubscription()
  if (!subscription) return null

  const { endpoint } = subscription
  await subscription.unsubscribe()
  return endpoint
}
