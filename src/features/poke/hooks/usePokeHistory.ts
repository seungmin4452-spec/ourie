import { useQuery } from '@tanstack/react-query'

import { listPokes } from '../api/poke'

export function pokeHistoryQueryKey(coupleId: string | null | undefined) {
  return ['pokes', coupleId] as const
}

/** 커플이 주고받은 콕 찌르기 전부. 지금은 결산이 유일한 사용처다. */
export function usePokeHistory(coupleId: string | null | undefined) {
  return useQuery({
    queryKey: pokeHistoryQueryKey(coupleId),
    queryFn: () => listPokes(coupleId!),
    enabled: coupleId != null,
  })
}
