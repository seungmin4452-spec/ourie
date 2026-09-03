import { useQuery } from '@tanstack/react-query'

import { useAiAvatarGenerations } from '@/features/aiAvatar'
import { useAppVisitHistory } from '@/features/appVisit'
import { useCalendarEvents } from '@/features/calendar'
import { getCoupleCreatedAt } from '@/features/couple'
import { usePokeHistory } from '@/features/poke'
import { useRegionPhotoDates, useTravelBadges, useTravelVisits } from '@/features/travel'
import { useWishBoard } from '@/features/wish'

export function coupleCreatedAtQueryKey(coupleId: string | null | undefined) {
  return ['couple-created-at', coupleId] as const
}

/**
 * 결산이 필요로 하는 모든 데이터. 화면마다 흩어진 훅을 한 자리에
 * 모으기만 한다 — 각 훅은 이미 자기 캐시 키로 다른 화면과 공유되므로, 결산
 * 화면을 연다고 같은 데이터를 두 번 받지 않는다.
 */
export function useRecapData(
  coupleId: string | null | undefined,
  selfId: string | null | undefined,
) {
  const calendarEvents = useCalendarEvents(coupleId)
  const travelVisits = useTravelVisits(coupleId)
  const regionPhotoDates = useRegionPhotoDates(coupleId)
  const travelBadges = useTravelBadges(coupleId)
  const wishBoard = useWishBoard(coupleId)
  const pokeHistory = usePokeHistory(coupleId)
  const appVisitHistory = useAppVisitHistory(coupleId)
  const aiAvatarGenerations = useAiAvatarGenerations(coupleId)
  const coupleCreatedAt = useQuery({
    queryKey: coupleCreatedAtQueryKey(coupleId),
    queryFn: () => getCoupleCreatedAt(coupleId!),
    enabled: coupleId != null,
  })

  const isLoading =
    selfId == null ||
    calendarEvents.isLoading ||
    travelVisits.isLoading ||
    regionPhotoDates.isLoading ||
    travelBadges.isLoading ||
    wishBoard.isLoading ||
    pokeHistory.isLoading ||
    appVisitHistory.isLoading ||
    aiAvatarGenerations.isLoading ||
    coupleCreatedAt.isLoading

  return {
    isLoading,
    coupleCreatedAt: coupleCreatedAt.data ?? null,
    calendarEvents: calendarEvents.data ?? [],
    travelVisits: travelVisits.data ?? [],
    regionPhotoDates: regionPhotoDates.data ?? [],
    travelBadges: travelBadges.badges,
    wishes: wishBoard.wishes,
    pokes: pokeHistory.data ?? [],
    appVisits: appVisitHistory.data ?? [],
    aiImageGenerations: aiAvatarGenerations.generations,
  }
}
