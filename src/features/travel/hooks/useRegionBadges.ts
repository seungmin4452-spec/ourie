import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { claimRegionBadge, listTravelBadges, type TravelBadge } from '../api/badges'
import { allRegionBadges, type BadgeTier, type RegionBadgeProgress } from '../badges'
import { notifyBadge } from '../api/badgeNotify'

export function travelBadgesQueryKey(coupleId: string | null | undefined) {
  return ['travel-badges', coupleId] as const
}

/** 조회 전이거나 아직 하나도 없을 때. 매번 새 배열을 만들면 아래 effect가 계속 돈다. */
const EMPTY: TravelBadge[] = []

/** 커플이 딴 뱃지 목록. */
export function useTravelBadges(coupleId: string | null | undefined) {
  const query = useQuery({
    queryKey: travelBadgesQueryKey(coupleId),
    queryFn: () => listTravelBadges(coupleId!),
    enabled: coupleId != null,
  })

  return { ...query, badges: query.data ?? EMPTY }
}

/** 방금 딴 뱃지. 연출을 띄우는 쪽이 받아 쓴다. */
export interface EarnedBadge {
  progress: RegionBadgeProgress
  tier: Exclude<BadgeTier, 'locked'>
}

interface ClaimOptions {
  coupleId: string | null | undefined
  /** 지금 화면이 계산한 시도별 진행 상태. */
  progresses: RegionBadgeProgress[]
  /** 이미 딴 뱃지 목록 (서버). */
  badges: TravelBadge[]
  /** 아직 조회 중이면 판정하지 않는다 — 빈 목록을 "아직 못 땄다"로 오해한다. */
  isReady: boolean
  onEarned: (earned: EarnedBadge) => void
}

/** 'sido:tier' 한 줄로 만들어 이미 딴 것을 빠르게 확인한다. */
function badgeKey(sidoCode: string, tier: string): string {
  return `${sidoCode}:${tier}`
}

/**
 * 다 채운 시도를 발견하면 조용히 딴 것으로 기록하고, **새로 생겼을 때만**
 * 연출을 띄운다.
 *
 * 판정이 화면에 있는 이유는 분모(시도별 시군구 수)를 화면만 알기 때문이다
 * (docs/REGION_BADGE.md §4). 그래서 "다 채웠다"를 알아채는 자리도 여기다.
 *
 * **딴 적 있는지는 서버 목록으로 판단한다.** 진행 상태만 보면 앱을 열 때마다
 * 이미 딴 뱃지를 다시 따게 되고, 그때마다 연출이 뜬다. RPC가 중복을 막아주긴
 * 하지만 그건 마지막 방어선이지 매번 두드려도 되는 문이 아니다.
 *
 * 요청은 한 번에 하나씩 보낸다 — 여행 다녀와서 한꺼번에 칠하면 시도 여러 곳이
 * 동시에 완성될 수 있는데, 연출을 겹쳐 띄우면 무엇을 땄는지 알 수 없다.
 */
export function useClaimRegionBadges({
  coupleId,
  progresses,
  badges,
  isReady,
  onEarned,
}: ClaimOptions) {
  const queryClient = useQueryClient()

  // 이번 세션에서 이미 요청한 것. 서버 목록이 갱신되기 전에 effect가 다시
  // 돌면 같은 뱃지를 두 번 보내게 된다.
  const requested = useRef(new Set<string>())

  // onEarned는 부모가 매 렌더 새로 만들 수 있다. 의존성에 넣으면 그때마다
  // effect가 다시 도므로 최신 것만 붙들어 둔다. 렌더 중에 ref를 건드리면
  // 안 되므로(react-hooks/refs) 대입도 effect에서 한다.
  const onEarnedRef = useRef(onEarned)
  useEffect(() => {
    onEarnedRef.current = onEarned
  }, [onEarned])

  useEffect(() => {
    if (!isReady || coupleId == null) return

    const owned = new Set(badges.map((badge) => badgeKey(badge.sido_code, badge.tier)))

    // 'visited'와 'photo'를 각각 본다. 사진까지 채운 시도는 둘 다 딴 것이다 —
    // 사진을 걸었다는 건 다녀왔다는 뜻이라 visited를 건너뛰면 연대기에 구멍이
    // 생긴다.
    const pending: EarnedBadge[] = []
    for (const progress of progresses) {
      if (progress.tier === 'locked') continue

      const tiers: Exclude<BadgeTier, 'locked'>[] =
        progress.tier === 'photo' ? ['visited', 'photo'] : ['visited']

      for (const tier of tiers) {
        const key = badgeKey(progress.region.code, tier)
        if (owned.has(key) || requested.current.has(key)) continue
        pending.push({ progress, tier })
      }
    }

    if (pending.length === 0) return

    const next = pending[0]
    const key = badgeKey(next.progress.region.code, next.tier)
    requested.current.add(key)

    void claimRegionBadge(next.progress.region.code, next.tier)
      .then(async (isNew) => {
        await queryClient.invalidateQueries({ queryKey: travelBadgesQueryKey(coupleId) })
        if (!isNew) return

        onEarnedRef.current(next)
        // 상대에게 알린다. 둘이 따로 앱을 보고 있어서 이게 없으면 한쪽만 아는
        // 성취가 된다. 실패해도 뱃지는 이미 딴 것이라 조용히 넘어간다.
        void notifyBadge(next.progress.region.code, next.tier)
      })
      .catch(() => {
        // 다음 기회에 다시 시도할 수 있게 표시를 지운다. 커플이 막 연결된
        // 직후처럼 일시적으로 실패하는 경우가 있다.
        requested.current.delete(key)
      })
  }, [isReady, coupleId, progresses, badges, queryClient])
}

/**
 * 진열장이 그릴 것 — 시도 16곳의 지금 상태.
 *
 * 서버에 기록된 뱃지를 **덮어씌운다**. 한 번 딴 뱃지는 회수하지 않으므로,
 * 나중에 한 칸을 취소해도 진열장에서는 그대로 남아 있어야 한다
 * (supabase/schema.sql의 travel_badges 주석).
 */
export function shelfProgresses(
  visitedCodes: { has(code: string): boolean },
  photoCodes: { has(code: string): boolean },
  badges: TravelBadge[],
): RegionBadgeProgress[] {
  const owned = new Set(badges.map((badge) => badgeKey(badge.sido_code, badge.tier)))

  return allRegionBadges(visitedCodes, photoCodes).map((progress) => {
    const code = progress.region.code
    if (owned.has(badgeKey(code, 'photo'))) return { ...progress, tier: 'photo' }
    if (progress.tier === 'locked' && owned.has(badgeKey(code, 'visited'))) {
      return { ...progress, tier: 'visited' }
    }
    return progress
  })
}
