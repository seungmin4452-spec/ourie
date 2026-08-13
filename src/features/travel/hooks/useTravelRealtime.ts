import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { supabase } from '@/lib/supabase'
import { travelRegionPhotosQueryKey } from './useRegionPhotos'
import { travelMapPhotoQueryKey } from './useTravelMapPhoto'
import { travelVisitsQueryKey } from './useTravelVisits'

/**
 * 상대가 지도를 바꾸면 그 순간 내 화면도 따라 바뀌게 한다.
 *
 * 조회 주기를 줄이는 것으로는 여기까지 못 온다. 홈을 켜둔 채로는 다음 주기가
 * 올 때까지 아무 일도 안 일어나고, 주기를 짧게 할수록 대부분 아무것도 안 바뀐
 * 왕복만 늘어난다. 바뀐 쪽이 알려주게 두는 편이 맞다.
 *
 * 알림을 받으면 다시 읽기만 한다. 이벤트에 실려 온 값을 그대로 캐시에 넣지
 * 않는 이유는, 사진의 경우 필요한 것이 경로가 아니라 **서명 URL**이라 어차피
 * 한 번 더 물어봐야 하기 때문이다. 다시 읽는 값은 싸다 — 서명은 경로 단위로
 * 캐시되므로(api/signedUrlCache.ts) 새로 걸린 사진만 서명을 받는다.
 *
 * 내가 한 변경도 나에게 돌아온다. 걸러내지 않는 이유는 그래봤자 방금 읽은 값을
 * 한 번 더 읽는 것뿐이고, 보내는 사람을 비교하려면 이벤트 모양에 기대야 해서다.
 *
 * 구독이 끊긴 사이의 변경은 오지 않는다(postgres_changes에는 밀린 것을 몰아
 * 주는 개념이 없다). 그래서 훅들의 주기적 재조회를 없애지 않고 남겨뒀다 —
 * 그쪽이 끊긴 구간을 메운다.
 */
export function useTravelRealtime(coupleId: string | null | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (coupleId == null) return

    // RLS가 이미 우리 커플로 막지만 필터도 같이 건다. 서버에서 걸러야 남의
    // 커플 변경이 브라우저까지 왔다 버려지는 일이 없다.
    const filter = `couple_id=eq.${coupleId}`
    const invalidate = (queryKey: readonly unknown[]) => () => {
      void queryClient.invalidateQueries({ queryKey })
    }

    const channel = supabase
      .channel(`travel:${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'travel_region_photos', filter },
        invalidate(travelRegionPhotosQueryKey(coupleId)),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'travel_maps', filter },
        invalidate(travelMapPhotoQueryKey(coupleId)),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'travel_visits', filter },
        invalidate(travelVisitsQueryKey(coupleId)),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [coupleId, queryClient])
}
