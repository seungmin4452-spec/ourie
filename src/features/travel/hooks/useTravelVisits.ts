import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import { listTravelVisits, markVisited, unmarkVisited, type TravelVisit } from '../api/visits'

export function travelVisitsQueryKey(coupleId: string | null | undefined) {
  return ['travel-visits', coupleId] as const
}

/** 커플이 칠해둔 시도 코드 집합. 지도가 매 지역마다 물어보므로 Set으로 준다. */
export function useTravelVisits(coupleId: string | null | undefined) {
  const query = useQuery({
    queryKey: travelVisitsQueryKey(coupleId),
    queryFn: () => listTravelVisits(coupleId!),
    enabled: coupleId != null,
    // 앱으로 돌아올 때는 앱 전역 기본값(60초)을 기다리지 않고 다시 읽는다.
    // 뒤에 있는 동안 상대가 긁은 지역은 구독이 놓치기 때문이다
    // (useTravelRealtime 주석). 코드 목록 한 벌이라 값이 싸다.
    staleTime: 0,
  })

  const visitedCodes = useMemo(
    () => new Set((query.data ?? []).map((visit) => visit.region_code)),
    [query.data],
  )

  return { ...query, visitedCodes }
}

/**
 * 지역 하나를 칠하거나 되돌린다.
 *
 * 낙관적으로 먼저 칠한다. 이 화면에서 손가락이 닿는 순간 코팅이 벗겨지는
 * 반응이 곧 기능 그 자체라, 왕복을 기다리면 "안 눌렸나?" 하고 한 번 더 누르게
 * 된다. 실패하면 눌리기 전 상태로 되돌린다.
 */
export function useToggleTravelVisit(
  coupleId: string | null | undefined,
  userId: string | null | undefined,
) {
  const queryClient = useQueryClient()
  const queryKey = travelVisitsQueryKey(coupleId)

  return useMutation({
    mutationFn: async ({ regionCode, isVisited }: { regionCode: string; isVisited: boolean }) => {
      if (isVisited) await unmarkVisited(coupleId!, regionCode)
      else await markVisited(coupleId!, userId!, regionCode)
    },

    onMutate: async ({ regionCode, isVisited }) => {
      // 진행 중인 조회가 나중에 끝나면서 방금 칠한 것을 덮어쓰지 않게 막는다.
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<TravelVisit[]>(queryKey)

      queryClient.setQueryData<TravelVisit[]>(queryKey, (current = []) =>
        isVisited
          ? current.filter((visit) => visit.region_code !== regionCode)
          : [
              ...current,
              {
                region_code: regionCode,
                visited_on: null,
                created_by: userId!,
                created_at: new Date().toISOString(),
              },
            ],
      )

      return { previous }
    },

    // previous가 없을 때 그냥 넘어가면 안 된다. 목록 조회 자체가 실패한 상태
    // (예: 아직 마이그레이션 전)에서는 previous가 undefined인데, 그때 되돌리지
    // 않으면 저장에 실패한 지역이 긁힌 채로 남는다 — 실제로 그랬다.
    onError: (_error, _variables, context) => {
      queryClient.setQueryData<TravelVisit[]>(queryKey, context?.previous ?? [])
    },

    // 성공이든 실패든 서버 값으로 한 번 맞춘다. 상대방이 같은 사이에 칠한
    // 지역도 이때 따라 들어온다.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey })
    },
  })
}
