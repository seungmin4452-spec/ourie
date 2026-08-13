import { useQuery } from '@tanstack/react-query'

import { getTravelMapPhotoUrl } from '../api/map'

export function travelMapPhotoQueryKey(coupleId: string | null | undefined) {
  return ['travel-map-photo', coupleId] as const
}

/**
 * 홈을 켜둔 채로도 이 주기로 확인한다. 평소에 상대가 바꾼 배경을 데려오는 것은
 * 구독 쪽이고(useTravelRealtime), 이 주기는 구독이 끊겼던 구간을 메우는 일과
 * 서명이 수명 절반을 넘겼을 때 갈아 끼우는 일을 맡는다 — 서명이 죽으면 사진
 * 자리가 아무 단서 없이 빈칸이 된다. (useRegionPhotos와 같은 판단·같은 값)
 */
const POLL_MS = 5 * 60 * 1000

export function useTravelMapPhoto(coupleId: string | null | undefined) {
  return useQuery({
    queryKey: travelMapPhotoQueryKey(coupleId),
    queryFn: () => getTravelMapPhotoUrl(coupleId!),
    enabled: coupleId != null,
    // 앱으로 돌아올 때는 조건 없이 다시 읽는다 (useRegionPhotos의 주석 참고).
    staleTime: 0,
    refetchInterval: POLL_MS,
  })
}
