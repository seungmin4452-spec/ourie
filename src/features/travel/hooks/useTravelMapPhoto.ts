import { useQuery } from '@tanstack/react-query'

import { getTravelMapPhotoUrl } from '../api/map'

export function travelMapPhotoQueryKey(coupleId: string | null | undefined) {
  return ['travel-map-photo', coupleId] as const
}

/**
 * 이 시간이 지나면 홈에 돌아오거나 앱을 다시 켤 때 다시 확인한다. 예전에는
 * 서명 수명의 절반(30분)이라, 상대가 배경을 바꿔도 한참 뒤에야 보였다.
 * 서명이 경로 단위로 캐시되므로(api/signedUrlCache.ts) 짧게 잡아도 안 바뀐
 * 사진을 다시 내려받지 않는다. (useRegionPhotos와 같은 이유·같은 값)
 */
const FRESH_MS = 30 * 1000

/**
 * 홈을 켜둔 채로도 이 주기로 확인한다. 상대가 바꾼 배경을 따라오는 일과,
 * 서명이 수명 절반을 넘겼을 때 갈아 끼우는 일을 같이 맡는다 — 서명이 죽으면
 * 사진 자리가 아무 단서 없이 빈칸이 된다.
 */
const POLL_MS = 5 * 60 * 1000

export function useTravelMapPhoto(coupleId: string | null | undefined) {
  return useQuery({
    queryKey: travelMapPhotoQueryKey(coupleId),
    queryFn: () => getTravelMapPhotoUrl(coupleId!),
    enabled: coupleId != null,
    staleTime: FRESH_MS,
    refetchInterval: POLL_MS,
  })
}
