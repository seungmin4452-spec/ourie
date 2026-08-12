import { useQuery } from '@tanstack/react-query'

import { getTravelMapPhotoUrl, SIGNED_URL_TTL_SECONDS } from '../api/map'

export function travelMapPhotoQueryKey(coupleId: string | null | undefined) {
  return ['travel-map-photo', coupleId] as const
}

/**
 * 만료보다 넉넉히 앞서 다시 받아온다. 홈을 켜둔 채 한 시간이 지나면 서명이
 * 죽어서 사진 자리가 빈칸이 되는데, 그때 화면에는 아무 단서도 남지 않는다.
 */
const REFRESH_MS = (SIGNED_URL_TTL_SECONDS * 1000) / 2

export function useTravelMapPhoto(coupleId: string | null | undefined) {
  return useQuery({
    queryKey: travelMapPhotoQueryKey(coupleId),
    queryFn: () => getTravelMapPhotoUrl(coupleId!),
    enabled: coupleId != null,
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
  })
}
