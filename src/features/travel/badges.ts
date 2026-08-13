import { districtsOf } from './districtIndex'
import { TRAVEL_REGIONS, type TravelRegion } from './regions'

/**
 * 시도별 뱃지 진행 상태 계산. 순수 함수만 둔다.
 *
 * **판정을 DB가 아니라 여기서 하는 것이 이 기능의 설계 판단이다.** 트리거로
 * 하려면 시도별 시군구 총개수(분모)를 DB가 알아야 하는데, 이 프로젝트는 이미
 * 반대를 정했다 — travel_visits.region_code는 형식만 검사하고 코드를 아는 쪽은
 * 화면이다 (행정구역이 실제로 바뀐다. 2026년 7월 광주·전남 통합). 분모만 DB로
 * 옮기면 그 결정이 반쪽이 되고, 행정구역이 바뀔 때마다 마이그레이션이 하나 더
 * 붙는다. 자세한 건 docs/REGION_BADGE.md §4.
 */

/**
 * 뱃지 한 칸의 등급.
 *
 * 사진을 걸었다는 건 다녀왔다는 뜻이므로 `photo`가 `visited`의 위다. 비어
 * 있다 → 채워진다 → 사진이 된다로 나아가고, 최종 상태가 금색 쪼가리가 아니라
 * 우리 사진이다 (UI_GUIDE §1 "사진이 주인공").
 */
export type BadgeTier = 'locked' | 'visited' | 'photo'

export interface RegionBadgeProgress {
  region: TravelRegion
  tier: BadgeTier
  /** 그 시도의 시군구 총 개수. 진행률의 분모다. */
  total: number
  /** 그중 다녀온 곳. */
  visited: number
  /** 그중 사진까지 건 곳. visited의 부분집합이다 (사진을 걸려면 지역이 있어야 한다). */
  photographed: number
}

/**
 * 코드가 들어 있는지만 묻는다.
 *
 * `Set`(긁은 곳)과 `Map`(지역별 사진) 둘 다 그대로 받으려고 이 모양이다 —
 * districtIndex.ts의 countKnownVisits와 같은 이유다.
 */
export interface CodeLookup {
  has(code: string): boolean
}

/**
 * 시도 하나의 진행 상태.
 *
 * 분모는 저장된 코드가 아니라 **지금 지도가 아는 시군구**에서 센다. 사라진
 * 코드가 travel_visits에 남아 있어도 "18곳 중 19곳"이 되지 않는다.
 */
export function regionBadgeProgress(
  region: TravelRegion,
  visitedCodes: CodeLookup,
  photoCodes: CodeLookup,
): RegionBadgeProgress {
  const districts = districtsOf(region.code)

  let visited = 0
  let photographed = 0
  for (const district of districts) {
    // 사진이 걸렸는데 다녀온 표시가 없을 수 있다. 둘은 사용자가 따로 하는
    // 말이라 서로를 자동으로 켜지 않기 때문이다 (schema.sql의
    // travel_region_photos 주석). 뱃지에서는 사진이 곧 다녀온 증거이므로
    // 여기서 한쪽으로 모은다 — 아니면 "사진은 다 걸었는데 visited가 아니라
    // 뱃지가 안 나오는" 상태가 생긴다.
    const hasPhoto = photoCodes.has(district.code)
    if (hasPhoto) photographed += 1
    if (hasPhoto || visitedCodes.has(district.code)) visited += 1
  }

  const total = districts.length
  // 시군구가 하나도 없는 시도는 없지만, 데이터가 갱신되는 도중이라면 0이
  // 될 수 있다. 그때 "0곳을 다 채웠으니 뱃지"는 말이 안 된다.
  const isComplete = total > 0 && visited === total

  return {
    region,
    tier: isComplete ? (photographed === total ? 'photo' : 'visited') : 'locked',
    total,
    visited,
    photographed,
  }
}

/**
 * 뱃지 지름(px). 시군구 수에 따라 세 덩어리로 끊는다.
 *
 * 그대로 비례시키면 세종(1곳)이 경기(31곳)의 1/31이 되어 안 보인다. 실제
 * 분포가 자연스럽게 셋으로 갈라진다 — 1~3 / 11~18 / 22~31 (docs/REGION_BADGE.md §2).
 *
 * 크기를 **다르게** 두는 것이 핵심이다. "이건 쉬운 거였지"가 한눈에 보여서,
 * 난이도 불균형을 공정해 보이게 숨길 필요가 없어진다.
 *
 * 절대 크기는 처음 정했던 60/84/112에서 한 단계 줄였다. 진열장이 사진 지도
 * 위젯의 뒷면이기도 한데, 폰 폭에서 16개가 여러 줄로 접히면 앞면(지도)보다
 * 키가 커져서 뒤집을 때마다 카드가 늘었다 줄었다 했다. 비율은 그대로라
 * 위 구분은 살아 있다.
 */
export function badgeSize(total: number): number {
  if (total <= 3) return 48
  if (total <= 18) return 68
  return 90
}

/** 시도 16곳 전부. 진열장이 그리는 순서가 곧 이 순서다. */
export function allRegionBadges(
  visitedCodes: CodeLookup,
  photoCodes: CodeLookup,
): RegionBadgeProgress[] {
  return TRAVEL_REGIONS.map((region) => regionBadgeProgress(region, visitedCodes, photoCodes))
}

/**
 * 지도 위젯 아래에 한 줄로 붙일 말 — "강원 15/18 · 3곳 남았어요".
 *
 * **가장 가까운 하나만** 고른다. 16곳의 진행을 다 늘어놓으면 그건 진행 표시가
 * 아니라 표가 된다. 다 채운 곳과 아직 손도 안 댄 곳은 뺀다 — 전자는 이미
 * 뱃지가 말해주고, 후자는 "0/25"를 봐야 할 이유가 없다.
 *
 * 남은 곳이 적은 순으로, 같으면 많이 채운 순으로 고른다.
 */
export function nearestBadge(
  progresses: RegionBadgeProgress[],
): RegionBadgeProgress | null {
  const inProgress = progresses.filter(
    (item) => item.tier === 'locked' && item.visited > 0,
  )
  if (inProgress.length === 0) return null

  return inProgress.reduce((best, item) => {
    const remaining = item.total - item.visited
    const bestRemaining = best.total - best.visited
    if (remaining !== bestRemaining) return remaining < bestRemaining ? item : best
    return item.visited > best.visited ? item : best
  })
}
