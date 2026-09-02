import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { recordAppVisit } from '@/features/appVisit'
import { useAuth } from '@/features/auth'
import { getProfile } from '@/features/onboarding/api/profile'

/**
 * 앱을 열 때마다 접속 기록 한 줄을 남긴다. 결산의 "앱 접속" 카드가 세는
 * 원본 로그다 (하루에 여러 번 열면 그만큼 쌓인다).
 *
 * 커플로 연결되기 전에는 남기지 않는다 — app_visits는 couple_id가 있어야
 * 하는 로그라, 그 전 접속은 셀 자리가 없다.
 *
 * PushSubscriptionSync와 같은 이유로 attempted ref를 둔다 — 프로필 쿼리가
 * 다시 실행돼도 매 렌더마다 insert가 나가면 "열 때마다 하나씩" 세려던 의도가
 * "렌더될 때마다"로 어긋난다. AppMetaSync·SocialAvatarSync 옆에 두는 이유도
 * 같다 — 어느 화면에서 앱을 열든 한 번은 돌아야 한다.
 */
export function AppVisitTracker() {
  const { user } = useAuth()
  const attempted = useRef(false)

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: user != null,
  })

  useEffect(() => {
    if (profile?.couple_id == null || attempted.current) return
    attempted.current = true

    void recordAppVisit(profile.couple_id, profile.id).catch(() => {
      // 조용히 넘어간다. 사용자가 시킨 일이 아니라 우리가 알아서 세는
      // 일이라, 실패했다고 화면에 띄우면 영문 모를 에러가 된다.
    })
  }, [profile])

  return null
}
