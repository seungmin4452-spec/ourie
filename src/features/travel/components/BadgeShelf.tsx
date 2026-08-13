import { HStack } from '@astryxdesign/core/HStack'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'

import type { RegionBadgeProgress } from '../badges'
import { RegionBadge } from './RegionBadge'

interface BadgeShelfProps {
  progresses: RegionBadgeProgress[]
  /** 시군구마다 걸린 사진. `photo` 등급 뱃지가 모자이크로 쓴다. */
  photos?: ReadonlyMap<string, string>
}

/**
 * 뱃지 16개를 늘어놓는 진열장.
 *
 * **못 얻은 칸도 남긴다.** 빈 칸이 보여야 모으고 싶어진다 — 얻은 것만 보여주면
 * 진열장이 아니라 그냥 목록이다 (docs/REGION_BADGE.md §2).
 *
 * 순서는 `TRAVEL_REGIONS` 그대로다. 얻은 것을 앞으로 당기지 않는 이유는 자리가
 * 고정돼야 "저기 비어 있던 게 채워졌다"가 보이기 때문이다.
 *
 * Grid가 아니라 wrap하는 HStack으로 흘린다. 뱃지 지름이 셋(60·84·112px)이라
 * 균일한 격자에 넣으면 작은 칸 주위에 큰 여백이 생기는데, 크기 차이 자체가
 * "이건 쉬운 거였지"를 말하는 장치라 그걸 격자로 눌러 없앨 이유가 없다.
 */
export function BadgeShelf({ progresses, photos }: BadgeShelfProps) {
  const earned = progresses.filter((item) => item.tier !== 'locked').length

  return (
    <VStack gap={3}>
      <HStack gap={3} wrap="wrap" hAlign="center" vAlign="center">
        {progresses.map((progress) => (
          <RegionBadge key={progress.region.code} progress={progress} photos={photos} />
        ))}
      </HStack>

      <Text type="supporting" justify="center">
        {earned === 0
          ? '시·도 한 곳을 다 채우면 그 모양의 뱃지가 생겨요.'
          : earned === progresses.length
            ? '전국을 다 모았어요.'
            : `${progresses.length}곳 중 ${earned}곳`}
      </Text>
    </VStack>
  )
}
