import { supabase } from '@/lib/supabase'

/**
 * 브라우저가 발급한 구독을 저장한다.
 *
 * 키는 endpoint다 — 같은 사람이 여러 기기에서 켤 수 있고, 반대로 같은 기기가
 * 브라우저를 지웠다 다시 켜면 새 endpoint를 받는다. 그래서 endpoint 충돌 시
 * 갱신(upsert)한다. `last_notified_on`은 페이로드에 넣지 않으므로 기존 값이
 * 그대로 남는다 — 오늘 이미 받은 사람이 알림을 껐다 켜도 같은 날 두 번 오지
 * 않는다.
 */
export async function savePushSubscription(
  userId: string,
  subscription: PushSubscription,
): Promise<void> {
  const json = subscription.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!json.endpoint || !p256dh || !auth) {
    throw new Error('구독 정보를 읽지 못했어요.')
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: userId, endpoint: json.endpoint, p256dh, auth },
      { onConflict: 'endpoint' },
    )
  if (error) throw error
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
  if (error) throw error
}
