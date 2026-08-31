import { supabase } from '@/lib/supabase'
import { downscaleImage } from '@/lib/image'
import { getSignedUrl, pruneSignedUrls, putSignedUrl } from './signedUrlCache'

/**
 * 스크래치 지도의 배경 사진과 같은 버킷이다. 둘 다 "커플 사진 원본"이라 성격이
 * 같고, `{couple_id}/...` 하나로 걸린 Storage 정책도 그대로 쓸 수 있다.
 * 구분은 경로로 한다 — 배경은 `{couple_id}/map-*.jpg`, 이쪽은
 * `{couple_id}/regions/{시군구코드}-*.jpg`.
 */
const BUCKET = 'travel-maps'

/** 서명 캐시에서 배경 사진과 섞이지 않게 하는 이름 (signedUrlCache.ts). */
const SCOPE = 'travel-region-photos' as const

/**
 * 서명 URL의 수명.
 *
 * 배경 사진(1시간, api/map.ts)보다 길다. 이쪽은 한 장이 아니라 **채운 구역
 * 수만큼** 이고, 서명이 갱신되면 URL이 통째로 바뀌어 브라우저 캐시가 무효가
 * 된다 — 짧게 잡으면 홈을 켜둔 채로 지도 전체를 몇십 분마다 다시 받는다.
 *
 * 이 수명이 곧 "목록을 얼마나 자주 보나"는 아니다. 서명은 경로 단위로
 * 캐시되므로(signedUrlCache.ts) 목록은 자주 봐도 사진은 다시 받지 않는다.
 */
export const REGION_PHOTO_TTL_SECONDS = 6 * 60 * 60

/**
 * 저장할 사진의 긴 변 최대 길이.
 *
 * 배경 사진(1600)보다 작다. 한 장이 지도 전체가 아니라 시군구 한 칸을
 * 채우기 때문이다 — 상세 화면에서 제일 큰 구역도 폭 420px 안쪽이라,
 * 고해상도 화면을 감안해도 720이면 남는다. 채울수록 장수가 늘어나는 물건이라
 * 한 장의 무게가 그대로 지도 여는 속도가 된다.
 */
const MAX_PHOTO_SIDE = 720

interface RegionPhotoRow {
  region_code: string
  photo_path: string
}

/** 지역 한 곳에 **처음** 사진을 건 시각. 그 뒤로 사진을 바꿔도 그대로다
 * (schema.sql의 travel_region_photos.created_at 주석 참고). */
export interface RegionPhotoDate {
  region_code: string
  created_at: string
}

/**
 * 지역별 사진의 최초 게시 시각만. 연간 결산이 "이 해에 몇 칸을 **새로**
 * 채웠나"를 세는 데만 쓴다 — updated_at을 썼다면 이미 채운 지역의 사진을
 * 다른 해에 바꿔 끼울 때마다 그 해에도 "새로 채운 곳"으로 다시 잡힌다.
 * 서명 URL을 받는 `listRegionPhotoUrls`의 캐시·서명 왕복도 거치지 않는다.
 */
export async function listRegionPhotoDates(coupleId: string): Promise<RegionPhotoDate[]> {
  const { data, error } = await supabase
    .from('travel_region_photos')
    .select('region_code, created_at')
    .eq('couple_id', coupleId)
  if (error) throw error
  return data ?? []
}

/**
 * 커플이 지역마다 걸어둔 사진의 볼 수 있는 URL. 시군구 코드 -> URL.
 *
 * 서명을 한 장씩 받지 않고 `createSignedUrls`로 한 번에 받는다. 191곳까지
 * 늘어날 수 있는 목록이라, 장당 왕복이면 지도가 뜨는 데 그 수만큼 걸린다.
 *
 * 이미 서명해둔 경로는 다시 서명하지 않는다(signedUrlCache.ts). 그래서 이
 * 함수를 자주 불러도 오가는 것은 row 목록뿐이고, 새 서명이 필요한 것은 상대가
 * 방금 건 사진처럼 **처음 보는 경로**뿐이다.
 */
export async function listRegionPhotoUrls(coupleId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('travel_region_photos')
    .select('region_code, photo_path')
    .eq('couple_id', coupleId)
  if (error) throw error

  const rows: RegionPhotoRow[] = data ?? []
  if (rows.length === 0) {
    pruneSignedUrls(SCOPE, [])
    return new Map()
  }

  const unsigned = rows
    .map((row) => row.photo_path)
    .filter((path) => getSignedUrl(SCOPE, path) == null)

  if (unsigned.length > 0) {
    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(unsigned, REGION_PHOTO_TTL_SECONDS)
    if (signError) throw signError

    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) {
        putSignedUrl(SCOPE, item.path, item.signedUrl, REGION_PHOTO_TTL_SECONDS)
      }
    }
  }

  // 서명이 안 나온 경로는 그냥 뺀다. 파일이 지워졌는데 row만 남은 경우인데,
  // 그 한 칸 때문에 지도 전체를 에러로 만들 이유가 없다 — 화면에서는 아직
  // 안 채운 지역으로 보인다.
  const urlByRegion = new Map<string, string>()
  for (const row of rows) {
    const url = getSignedUrl(SCOPE, row.photo_path)
    if (url) urlByRegion.set(row.region_code, url)
  }

  // 사진을 바꾸거나 뺀 뒤의 옛 경로를 여기서 버린다.
  pruneSignedUrls(
    SCOPE,
    rows.map((row) => row.photo_path),
  )

  return urlByRegion
}

/**
 * 시군구 한 곳에 사진을 건다. 이미 있으면 갈아 끼운다.
 *
 * 파일 이름에 시각을 넣어 매번 새 경로에 쓰는 이유는 배경 사진과 같다 —
 * 같은 경로에 덮어쓰면 CDN과 브라우저가 들고 있던 예전 사진이 한동안 그대로
 * 보여서, 바꾼 사람에게는 아무 일도 안 일어난 것처럼 보인다 (api/map.ts).
 */
export async function setRegionPhoto(
  coupleId: string,
  userId: string,
  regionCode: string,
  file: File,
): Promise<void> {
  const { data: previous } = await supabase
    .from('travel_region_photos')
    .select('photo_path')
    .eq('couple_id', coupleId)
    .eq('region_code', regionCode)
    .maybeSingle()

  const blob = await downscaleImage(file, MAX_PHOTO_SIDE)
  const path = `${coupleId}/regions/${regionCode}-${Date.now()}.jpg`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg' })
  if (uploadError) throw uploadError

  const { error } = await supabase.from('travel_region_photos').upsert(
    {
      couple_id: coupleId,
      region_code: regionCode,
      photo_path: path,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'couple_id,region_code' },
  )
  if (error) throw error

  // 실패해도 무시한다. 이미 새 사진이 걸린 뒤라 사용자가 원한 일은 끝났고,
  // 남는 건 안 쓰이는 파일 하나다.
  if (previous?.photo_path) {
    await supabase.storage.from(BUCKET).remove([previous.photo_path])
  }
}

/**
 * 지역에 건 사진을 뗀다. 그 칸은 다시 코팅으로 덮인다.
 *
 * 파일까지 지운다. 배경 사진처럼 "다음에 올릴 것으로 대체되는" 물건이 아니라,
 * 여기서 빼면 어디서도 다시 쓰이지 않는다.
 */
export async function removeRegionPhoto(coupleId: string, regionCode: string): Promise<void> {
  const { data: current } = await supabase
    .from('travel_region_photos')
    .select('photo_path')
    .eq('couple_id', coupleId)
    .eq('region_code', regionCode)
    .maybeSingle()

  const { error } = await supabase
    .from('travel_region_photos')
    .delete()
    .eq('couple_id', coupleId)
    .eq('region_code', regionCode)
  if (error) throw error

  if (current?.photo_path) {
    await supabase.storage.from(BUCKET).remove([current.photo_path])
  }
}
