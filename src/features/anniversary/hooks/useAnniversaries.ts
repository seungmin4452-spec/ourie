import { useQuery } from '@tanstack/react-query'

import { listAnniversaries } from '../api/anniversary'

export function anniversariesQueryKey(coupleId: string | null | undefined) {
  return ['anniversaries', coupleId] as const
}

export function useAnniversaries(coupleId: string | null | undefined) {
  return useQuery({
    queryKey: anniversariesQueryKey(coupleId),
    queryFn: () => listAnniversaries(coupleId!),
    enabled: coupleId != null,
  })
}
