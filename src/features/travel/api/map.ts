import { supabase } from '@/lib/supabase'
import { downscaleImage } from '@/lib/image'
import { getSignedUrl, pruneSignedUrls, putSignedUrl } from './signedUrlCache'

const BUCKET = 'travel-maps'

/** 서명 캐시에서 지역별 사진과 섞이지 않게 하는 이름 (signedUrlCache.ts). */
const SCOPE = 'travel-map-photo' as const

/** 서명 URL의 수명. 훅이 이보다 짧은 주기로 다시 받아온다 (useTravelMapPhoto). */
export const SIGNED_URL_TTL_SECONDS = 60 * 60

/** 저장할 사진의 긴 변 최대 길이. 지도 배경이라 원본 해상도까지 필요하지 않다. */
const MAX_PHOTO_SIDE = 1600

/**
 * 지도 밑에 깔린 사진을 볼 수 있는 URL. 아직 안 골랐으면 null.
 *
 * profile-avatars와 달리 이 버킷은 비공개라 getPublicUrl이 없다. 커플 사진
 * 원본을 URL만 알면 누구나 열 수 있는 자리에 두지 않기 위한 선택이고,
 * 그 대가로 URL이 만료된다 (supabase/schema.sql의 Storage 절 참고).
 *
 * 경로가 그대로면 서명도 다시 받지 않는다(signedUrlCache.ts). 이 함수를 자주
 * 불러도 URL이 안 바뀌므로, 상대가 배경을 바꿨는지 자주 확인하면서도 안 바뀐
 * 사진을 다시 내려받지는 않는다.
 */
export async function getTravelMapPhotoUrl(coupleId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('travel_maps')
    .select('photo_path')
    .eq('couple_id', coupleId)
    .maybeSingle()
  if (error) throw error

  const path = data?.photo_path
  if (!path) {
    pruneSignedUrls(SCOPE, [])
    return null
  }

  // 배경을 바꾸면 경로가 바뀌므로, 여기서 옛 경로의 서명이 버려진다.
  pruneSignedUrls(SCOPE, [path])

  const cached = getSignedUrl(SCOPE, path)
  if (cached) return cached

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (signError) throw signError

  putSignedUrl(SCOPE, path, signed.signedUrl, SIGNED_URL_TTL_SECONDS)
  return signed.signedUrl
}

/**
 * 지도 배경 사진을 새로 올리고 커플의 지도에 건다.
 *
 * 파일 이름에 시각을 넣어 매번 새 경로에 쓴다. 같은 경로에 덮어쓰면 CDN과
 * 브라우저가 들고 있던 예전 사진이 한동안 그대로 보인다 — 사진을 바꾼
 * 사람에게는 아무 일도 안 일어난 것처럼 보인다.
 *
 * 이전 사진은 지운다. 실패해도 무시하는데, 그건 이미 새 사진이 걸린 뒤라
 * 사용자가 원한 일은 끝났고 남은 건 안 쓰이는 파일 하나이기 때문이다.
 */
export async function setTravelMapPhoto(
  coupleId: string,
  userId: string,
  file: File,
): Promise<void> {
  const { data: previous } = await supabase
    .from('travel_maps')
    .select('photo_path')
    .eq('couple_id', coupleId)
    .maybeSingle()

  const blob = await downscaleImage(file, MAX_PHOTO_SIDE)
  const path = `${coupleId}/map-${Date.now()}.jpg`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg' })
  if (uploadError) throw uploadError

  const { error } = await supabase.from('travel_maps').upsert({
    couple_id: coupleId,
    photo_path: path,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error

  if (previous?.photo_path) {
    await supabase.storage.from(BUCKET).remove([previous.photo_path])
  }
}
