import { Text } from '@astryxdesign/core/Text'

import { allRegionBadges, nearestBadge } from '../badges'

interface NearestBadgeLineProps {
  visitedCodes: { has(code: string): boolean }
  photoCodes: { has(code: string): boolean }
}

/**
 * 지도 위젯 아래에 붙는 뱃지 진행 한 줄 — "강원 15/18 · 3곳 남았어요".
 *
 * **가장 가까운 하나만** 보여준다. 16곳의 진행을 다 늘어놓으면 그건 진행
 * 표시가 아니라 표가 되고, 위젯은 이미 지도 하나로 꽉 차 있다
 * (docs/REGION_BADGE.md §2).
 *
 * 다 채운 곳과 아직 손도 안 댄 곳은 후보에서 빠진다 (badges.ts의 nearestBadge)
 * — 전자는 뱃지가 이미 말해주고, 후자는 "0/25"를 볼 이유가 없다. 그래서 아무
 * 데도 시작하지 않았거나 전부 끝냈으면 이 줄 자체가 사라진다.
 */
export function NearestBadgeLine({ visitedCodes, photoCodes }: NearestBadgeLineProps) {
  const nearest = nearestBadge(allRegionBadges(visitedCodes, photoCodes))
  if (!nearest) return null

  const remaining = nearest.total - nearest.visited

  return (
    <Text type="supporting" justify="center">
      {nearest.region.shortName} {nearest.visited}/{nearest.total} — {remaining}곳 남았어요
    </Text>
  )
}
