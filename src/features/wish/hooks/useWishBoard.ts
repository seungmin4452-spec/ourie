import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { listWishes, listWishQuotas } from '../api/wish'

export function wishesQueryKey(coupleId: string | null | undefined) {
  return ['wishes', coupleId] as const
}

export function wishQuotasQueryKey(coupleId: string | null | undefined) {
  return ['wish-quotas', coupleId] as const
}

/**
 * 소원권 현황판이 보는 것 — 쓴 소원 목록과 두 사람의 총 장수.
 *
 * 위젯과 다이얼로그가 같은 훅을 부른다. 캐시 키를 공유하므로 다이얼로그를
 * 열어도 조회가 다시 나가지 않고, 소원을 하나 쓰면 `refresh()` 한 번으로
 * 뒤에 있는 위젯의 남은 장수까지 같이 맞춰진다.
 *
 * 둘을 따로 읽는 이유: 장수는 어쩌다 한 번 바뀌고 소원은 자주 늘어난다. 한
 * 쿼리로 묶으면 소원 하나를 쓸 때마다 장수까지 다시 읽게 된다.
 */
export function useWishBoard(coupleId: string | null | undefined) {
  const queryClient = useQueryClient()

  const wishes = useQuery({
    queryKey: wishesQueryKey(coupleId),
    queryFn: () => listWishes(coupleId!),
    enabled: coupleId != null,
  })

  const quotas = useQuery({
    queryKey: wishQuotasQueryKey(coupleId),
    queryFn: () => listWishQuotas(coupleId!),
    enabled: coupleId != null,
  })

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: wishesQueryKey(coupleId) }),
      queryClient.invalidateQueries({ queryKey: wishQuotasQueryKey(coupleId) }),
    ])
  }, [queryClient, coupleId])

  return {
    wishes: wishes.data ?? [],
    quotas: quotas.data ?? [],
    isLoading: wishes.isLoading || quotas.isLoading,
    refresh,
  }
}
