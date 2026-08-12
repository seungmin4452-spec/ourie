import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  listRegionPhotoUrls,
  REGION_PHOTO_TTL_SECONDS,
  removeRegionPhoto,
  setRegionPhoto,
} from '../api/regionPhotos'

export function travelRegionPhotosQueryKey(coupleId: string | null | undefined) {
  return ['travel-region-photos', coupleId] as const
}

/**
 * 만료보다 넉넉히 앞서 다시 받아온다. 홈을 켜둔 채 서명이 죽으면 채워둔 칸이
 * 통째로 빈칸이 되는데, 화면에는 아무 단서도 남지 않는다.
 */
const REFRESH_MS = (REGION_PHOTO_TTL_SECONDS * 1000) / 2

/** 조회 전이거나 아직 한 장도 없을 때. 매번 새 Map을 만들면 지도가 계속 다시 그려진다. */
const EMPTY = new Map<string, string>()

/** 시군구 코드 -> 그 지역에 걸어둔 사진 URL. */
export function useRegionPhotos(coupleId: string | null | undefined) {
  const query = useQuery({
    queryKey: travelRegionPhotosQueryKey(coupleId),
    queryFn: () => listRegionPhotoUrls(coupleId!),
    enabled: coupleId != null,
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
  })

  return { ...query, photos: query.data ?? EMPTY }
}

/**
 * 지역 한 곳의 사진을 걸거나 뗀다.
 *
 * 스크래치 지도의 칠하기(useToggleTravelVisit)와 달리 낙관적으로 먼저 그리지
 * 않는다. 그쪽은 결과가 "코팅이 벗겨진다"뿐이라 미리 보여줄 수 있지만, 여기서
 * 보여줄 것은 **올라간 사진 자체**여서 업로드가 끝나기 전에는 그릴 그림이 없다.
 * 대신 버튼이 로딩 상태로 기다린다.
 */
export function useSetRegionPhoto(
  coupleId: string | null | undefined,
  userId: string | null | undefined,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ regionCode, file }: { regionCode: string; file: File }) =>
      setRegionPhoto(coupleId!, userId!, regionCode, file),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: travelRegionPhotosQueryKey(coupleId) }),
  })
}

export function useRemoveRegionPhoto(coupleId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (regionCode: string) => removeRegionPhoto(coupleId!, regionCode),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: travelRegionPhotosQueryKey(coupleId) }),
  })
}
