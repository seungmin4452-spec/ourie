import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { listRegionPhotoUrls, removeRegionPhoto, setRegionPhoto } from '../api/regionPhotos'

export function travelRegionPhotosQueryKey(coupleId: string | null | undefined) {
  return ['travel-region-photos', coupleId] as const
}

/**
 * 이 시간이 지나면 홈에 돌아오거나 앱을 다시 켤 때 목록을 다시 확인한다.
 *
 * 예전에는 이 값이 서명 수명의 절반(3시간)이었다. 서명을 다시 받으면 URL이
 * 통째로 바뀌어 지도의 사진을 전부 다시 내려받기 때문에 조회 자체를 묶어둔
 * 것이었는데, 그 바람에 **상대가 건 사진이 최대 3시간 뒤에야 보였다.**
 *
 * 이제 서명은 경로 단위로 캐시되므로(api/signedUrlCache.ts) 다시 조회해도
 * 안 바뀐 사진은 다시 받지 않는다. 그래서 짧게 잡을 수 있다. 0이 아닌 이유는
 * 위젯을 열고 닫을 때마다 왕복하지 않기 위해서다.
 */
const FRESH_MS = 30 * 1000

/**
 * 홈을 켜둔 채로도 이 주기로 다시 확인한다. 두 가지를 같이 맡는다 — 상대가
 * 방금 건 사진이 보이는 것, 그리고 서명이 수명 절반을 넘겼을 때 갈아 끼우는
 * 것(서명이 죽으면 채워둔 칸이 아무 단서 없이 빈칸이 된다).
 *
 * 서명 수명(6시간)이 아니라 이 주기가 짧아야 갱신 시점을 놓치지 않는다.
 * 탭이 뒤에 있는 동안에는 react-query가 이 타이머를 쉬게 한다.
 */
const POLL_MS = 5 * 60 * 1000

/** 조회 전이거나 아직 한 장도 없을 때. 매번 새 Map을 만들면 지도가 계속 다시 그려진다. */
const EMPTY = new Map<string, string>()

/** 시군구 코드 -> 그 지역에 걸어둔 사진 URL. */
export function useRegionPhotos(coupleId: string | null | undefined) {
  const query = useQuery({
    queryKey: travelRegionPhotosQueryKey(coupleId),
    queryFn: () => listRegionPhotoUrls(coupleId!),
    enabled: coupleId != null,
    staleTime: FRESH_MS,
    refetchInterval: POLL_MS,
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
