import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { getExerciseBoard } from '../api/exercise'

export function exerciseBoardQueryKey(coupleId: string | null | undefined) {
  return ['exercise-board', coupleId] as const
}

/**
 * 재활운동 위젯이 보는 것 — 커플 두 사람의 오늘 상태와 연속 일수.
 *
 * `refresh()`는 소원권 쿼리도 같이 무효화한다. 30일째·60일째 종료로 소원권이 늘면
 * 홈의 소원권 위젯도 바로 맞춰져야 한다 (키는 wish/hooks/useWishBoard.ts의
 * wishQuotasQueryKey와 같은 모양 — 배럴을 거치면 홈과 순환 import가 되어
 * 문자열로 적는다).
 */
export function useExerciseBoard(coupleId: string | null | undefined) {
  const queryClient = useQueryClient()

  const board = useQuery({
    queryKey: exerciseBoardQueryKey(coupleId),
    queryFn: getExerciseBoard,
    enabled: coupleId != null,
  })

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: exerciseBoardQueryKey(coupleId) }),
      queryClient.invalidateQueries({ queryKey: ['wish-quotas', coupleId] }),
    ])
  }, [queryClient, coupleId])

  return {
    rows: board.data ?? [],
    isLoading: board.isLoading,
    refresh,
  }
}
