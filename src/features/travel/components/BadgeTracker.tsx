import { useMemo, useState } from 'react'

import type { Profile } from '@/features/onboarding/api/profile'
import { allRegionBadges } from '../badges'
import { useRegionPhotos } from '../hooks/useRegionPhotos'
import {
  useClaimRegionBadges,
  useTravelBadges,
  type EarnedBadge,
} from '../hooks/useRegionBadges'
import { useTravelVisits } from '../hooks/useTravelVisits'
import { BadgeEarnedOverlay } from './BadgeEarnedOverlay'

interface BadgeTrackerProps {
  profile: Profile | null | undefined
}

/**
 * 다 채운 시도를 알아채 뱃지로 기록하고, 새로 딴 순간에만 연출을 띄운다.
 *
 * **화면에 아무것도 그리지 않는다** (연출이 뜰 때를 빼고). 뱃지 진열장이 아니라
 * 판정하는 쪽이다.
 *
 * 홈이 딱 한 번만 마운트한다. 지도 위젯과 뱃지 위젯이 각자 이 일을 하면 같은
 * 뱃지를 두세 번 청구하고 연출도 겹쳐 뜬다 — 판정은 한 군데서만 일어나야 한다.
 * 조회는 react-query 캐시를 위젯들과 공유하므로 여기서 또 읽어도 왕복이 늘지
 * 않는다.
 */
export function BadgeTracker({ profile }: BadgeTrackerProps) {
  const coupleId = profile?.couple_id
  const [earned, setEarned] = useState<EarnedBadge | null>(null)

  const { visitedCodes, isPending: isVisitsPending } = useTravelVisits(coupleId)
  const { photos, isPending: isPhotosPending } = useRegionPhotos(coupleId)
  const { badges, isPending: isBadgesPending } = useTravelBadges(coupleId)

  // 매 렌더 새 배열을 만들면 아래 effect가 계속 다시 돈다. 요청까지 늘지는
  // 않지만(이미 청구한 것을 기억한다) 16곳을 매번 훑을 이유가 없다.
  const progresses = useMemo(
    () => allRegionBadges(visitedCodes, photos),
    [visitedCodes, photos],
  )

  useClaimRegionBadges({
    coupleId,
    progresses,
    badges,
    // 셋 다 도착해야 판정할 수 있다. 하나라도 비어 있는 상태로 재면 "아직 못
    // 땄다"거나 "아무 데도 안 갔다"로 잘못 읽는다.
    isReady: coupleId != null && !isVisitsPending && !isPhotosPending && !isBadgesPending,
    onEarned: setEarned,
  })

  return (
    <BadgeEarnedOverlay earned={earned} onClose={() => setEarned(null)} photos={photos} />
  )
}
