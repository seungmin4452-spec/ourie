import { useCallback, useEffect, useState } from 'react'

import { deletePushSubscription, savePushSubscription } from '../api/pushSubscription'
import { disablePush, enablePush, readPushStatus, type PushStatus } from '../push'

/** 브라우저 상태를 아직 확인하는 중. */
export type PushState = PushStatus | 'loading'

/**
 * 알림 스위치 하나를 굴리는 데 필요한 전부.
 *
 * 브라우저 권한과 서버에 저장된 구독은 서로 다른 곳에 있고 어긋날 수 있다
 * (기기에서 알림을 껐거나, 브라우저가 구독을 회수했거나). 켜고 끌 때 항상 둘을
 * 같이 움직여서 어긋난 채로 남지 않게 한다.
 */
export function usePushNotifications(userId: string | undefined) {
  const [state, setState] = useState<PushState>('loading')

  // 토글의 finally에서 부르므로 스스로 던지지 않는다. 여기서 던지면 원래
  // 실패 이유가 이 예외로 덮여 사용자에게 엉뚱한 메시지가 간다.
  const refresh = useCallback(async () => {
    setState(await readPushStatus().catch(() => 'unsupported' as const))
  }, [])

  useEffect(() => {
    let isActive = true
    readPushStatus()
      .then((status) => {
        if (isActive) setState(status)
      })
      .catch(() => {
        if (isActive) setState('unsupported')
      })
    return () => {
      isActive = false
    }
  }, [])

  /**
   * 스위치가 움직였을 때. 실패하면 던져서 호출한 쪽이 토스트를 띄우게 하고,
   * 상태는 실제 브라우저 상태로 되돌린다 (Switch의 낙관적 UI가 켜진 채로
   * 남지 않게).
   */
  const toggle = useCallback(
    async (next: boolean) => {
      if (!userId) throw new Error('로그인이 필요해요.')

      try {
        if (next) {
          const subscription = await enablePush()
          // 구독을 저장하지 못하면 서버는 이 기기를 모른다. 브라우저에만 켜진
          // 채로 두면 "켰는데 안 오는" 상태가 되므로 되돌린다.
          try {
            await savePushSubscription(userId, subscription)
          } catch (error) {
            await subscription.unsubscribe().catch(() => undefined)
            throw error
          }
        } else {
          const endpoint = await disablePush()
          if (endpoint) await deletePushSubscription(endpoint)
        }
      } finally {
        await refresh()
      }
    },
    [refresh, userId],
  )

  return { state, toggle, refresh }
}
