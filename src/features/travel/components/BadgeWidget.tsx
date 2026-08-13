import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'

import type { Profile } from '@/features/onboarding/api/profile'
import { useRegionPhotos } from '../hooks/useRegionPhotos'
import { shelfProgresses, useTravelBadges } from '../hooks/useRegionBadges'
import { useTravelVisits } from '../hooks/useTravelVisits'
import { BadgeShelf } from './BadgeShelf'

interface BadgeWidgetProps {
  /** 홈이 이미 가져온 내 프로필. 같은 걸 또 조회하지 않으려고 받아 쓴다. */
  profile: Profile | null | undefined
}

/**
 * 홈 위젯 "우리의 뱃지"의 본문.
 *
 * 진열장만 보여준다. 뱃지를 따는 판정은 이 위젯이 아니라 BadgeTracker가 한다 —
 * 이 위젯을 홈에 올리지 않은 사람도 뱃지는 따야 하기 때문이다.
 *
 * 같은 진열장이 사진 지도 위젯의 뒷면에도 있다 (PhotoMapWidget의 뒤집기).
 * 거기서는 지도를 보다 바로 뒤집어 확인하는 것이고, 여기는 뱃지만 크게 보고
 * 싶을 때의 자리다.
 */
export function BadgeWidget({ profile }: BadgeWidgetProps) {
  const coupleId = profile?.couple_id

  const { visitedCodes } = useTravelVisits(coupleId)
  const { photos } = useRegionPhotos(coupleId)
  const { badges } = useTravelBadges(coupleId)

  if (coupleId == null) {
    return (
      <Text type="supporting" justify="center">
        커플이 연결되면 함께 뱃지를 모을 수 있어요.
      </Text>
    )
  }

  return (
    <VStack gap={3}>
      <BadgeShelf
        progresses={shelfProgresses(visitedCodes, photos, badges)}
        photos={photos}
      />
    </VStack>
  )
}
