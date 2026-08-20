import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { supabase } from '@/lib/supabase'
import { listAppEffects } from '../api/appEffects'
import { APP_EFFECTS_EMPTY } from '../types'

export const APP_EFFECTS_QUERY_KEY = ['app-effects'] as const

/**
 * 지금 켜져 있는 특수효과들, 관리자가 켜고 끄는 순간 그대로 따라 바뀐다.
 *
 * 조회 주기를 줄이는 것으로는 "관리자가 켜는 순간 홈이 바로 반응"까지 못
 * 온다. app_effects의 모든 변경을 구독해(Realtime), 알림이 오면 다시
 * 읽는다 — 바뀐 값을 이벤트에서 직접 꺼내 쓰지 않는 이유는 useTravelRealtime과
 * 같다: 다시 읽는 왕복이 이미 싸고(row 두 개), 그 편이 항상 DB의 진짜 값과
 * 맞는다.
 *
 * 커플 범위가 아니라 필터가 없다 — 이 값은 전체 사용자 공용이다.
 */
export function useAppEffects() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: APP_EFFECTS_QUERY_KEY,
    queryFn: listAppEffects,
    // 실패해도 홈이 죽으면 안 된다 — 장식일 뿐이다. 기본값(전부 꺼짐)으로
    // 떨어지도록 placeholderData를 둔다.
    placeholderData: APP_EFFECTS_EMPTY,
  })

  useEffect(() => {
    const channel = supabase
      .channel('app-effects')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_effects' },
        () => void queryClient.invalidateQueries({ queryKey: APP_EFFECTS_QUERY_KEY }),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient])

  return query
}
