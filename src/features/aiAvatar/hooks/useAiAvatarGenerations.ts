import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { listAiAvatarGenerations } from '../api/aiAvatar'

export function aiAvatarGenerationsQueryKey(coupleId: string | null | undefined) {
  return ['ai-avatar-generations', coupleId] as const
}

/** 위젯과 다이얼로그가 같이 보는 갤러리. wish처럼 캐시 키를 공유해서, 하나를
 * 새로 만들면 refresh() 한 번으로 위젯의 미리보기까지 같이 맞춰진다. */
export function useAiAvatarGenerations(coupleId: string | null | undefined) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: aiAvatarGenerationsQueryKey(coupleId),
    queryFn: () => listAiAvatarGenerations(coupleId!),
    enabled: coupleId != null,
  })

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: aiAvatarGenerationsQueryKey(coupleId) }),
    [queryClient, coupleId],
  )

  return { generations: query.data ?? [], isLoading: query.isLoading, refresh }
}
