import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { listRegionPhotoUrls, removeRegionPhoto, setRegionPhoto } from '../api/regionPhotos'

export function travelRegionPhotosQueryKey(coupleId: string | null | undefined) {
  return ['travel-region-photos', coupleId] as const
}

/**
 * 홈을 켜둔 채로도 이 주기로 다시 확인한다.
 *
 * 평소에 상대의 사진을 데려오는 것은 구독 쪽이다(useTravelRealtime). 이 주기는
 * 두 가지를 맡는다 — 구독이 끊겼던 구간을 메우는 것, 그리고 서명이 수명 절반을
 * 넘겼을 때 갈아 끼우는 것(서명이 죽으면 채워둔 칸이 아무 단서 없이 빈칸이
 * 된다). 서명 수명(6시간)이 아니라 이 주기가 짧아야 갱신 시점을 놓치지 않는다.
 *
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
    // 앱으로 돌아올 때는 조건 없이 다시 읽는다. 뒤에 있는 동안 온 변경은
    // 구독이 놓치는데(밀린 것을 몰아 주지 않는다), 여기서 "몇 초 안 지났으니
    // 넘어간다"고 하면 그 구간에 상대가 건 사진이 그대로 안 보인다.
    // 다시 읽어도 값은 싸다 — 서명이 캐시돼 있어 사진을 다시 받지는 않는다.
    staleTime: 0,
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
