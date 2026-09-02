import { useQuery } from '@tanstack/react-query'

import { listAppVisits } from '../api/appVisits'

export function appVisitHistoryQueryKey(coupleId: string | null | undefined) {
  return ['app-visits', coupleId] as const
}

/** 커플이 앱을 연 기록 전부. 지금은 결산이 유일한 사용처다. */
export function useAppVisitHistory(coupleId: string | null | undefined) {
  return useQuery({
    queryKey: appVisitHistoryQueryKey(coupleId),
    queryFn: () => listAppVisits(coupleId!),
    enabled: coupleId != null,
  })
}
