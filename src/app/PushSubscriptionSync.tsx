import { useEffect, useRef } from 'react'

import { useAuth } from '@/features/auth'
import { savePushSubscription } from '@/features/notification/api/pushSubscription'
import { resubscribeIfGranted } from '@/features/notification/push'

/**
 * 알림 권한은 남아 있는데 구독만 조용히 사라진 기기를 앱을 열 때마다 고쳐준다.
 *
 * 오래 앱을 켜지 않은 기기의 구독을 브라우저가 스스로 회수해버리는 일이
 * 있다(push.ts의 resubscribeIfGranted 주석). 회수된 뒤로는 마이페이지에서
 * 스위치를 직접 껐다 켜기 전까지 관리자 전체 알림을 포함한 모든 알림이
 * 그 기기에 닿지 않는데, 스위치가 이미 "켜짐"으로 보이는 화면에서는 무엇이
 * 잘못됐는지 알아챌 방법이 없었다. 매번 앱을 열 때 조용히 다시 구독해서 이
 * 격차가 벌어진 채로 남지 않게 한다.
 *
 * AppMetaSync·SocialAvatarSync 옆에 두는 이유는 같다 — 어느 화면에서 앱을
 * 열든 한 번은 돌아야 한다.
 */
export function PushSubscriptionSync() {
  const { user } = useAuth()
  const attempted = useRef(false)

  useEffect(() => {
    if (user == null || attempted.current) return
    attempted.current = true

    void resubscribeIfGranted()
      .then((subscription) => {
        if (subscription) return savePushSubscription(user.id, subscription)
      })
      .catch(() => {
        // 조용히 넘어간다. 사용자가 시킨 일이 아니라 우리가 알아서 맞추는
        // 일이라, 실패했다고 화면에 띄우면 영문 모를 에러가 된다. 다음에 앱을
        // 열 때 다시 시도된다.
      })
  }, [user])

  return null
}
