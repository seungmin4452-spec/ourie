import { supabase } from '@/lib/supabase'
import type { AiAvatarGeneration } from '../types'

const BUCKET = 'ai-avatars'
const GENERATION_COLUMNS = 'id, couple_id, requested_by, theme_id, storage_path, created_at'

/**
 * 서명 URL의 수명. travel-region-photos(6시간)보다 짧다 — 이 갤러리는 다이얼로그를
 * 열 때만 조회하는 물건이라 travel처럼 홈에 계속 떠 있는 사진들과 달리 몇 시간씩
 * 캐시해둘 이유가 없다. 그래도 다이얼로그를 열어둔 채 한참 보는 경우를 감안해
 * 1시간으로 넉넉히 잡는다.
 */
export const RESULT_TTL_SECONDS = 60 * 60

export interface AiAvatarGenerationWithUrl extends AiAvatarGeneration {
  /** 파일이 지워졌는데 row만 남은 경우 등 서명이 안 나오면 null. */
  url: string | null
}

/**
 * 커플이 만든 아바타 전부, 최신순.
 *
 * travel의 listRegionPhotoUrls처럼 서명을 한 번에 받는다 — 갯수가 늘어나도
 * 왕복은 그대로 두 번(목록 조회 + 서명 일괄 발급)이다.
 */
export async function listAiAvatarGenerations(
  coupleId: string,
): Promise<AiAvatarGenerationWithUrl[]> {
  const { data, error } = await supabase
    .from('ai_avatar_generations')
    .select(GENERATION_COLUMNS)
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: false })
  if (error) throw error

  const rows: AiAvatarGeneration[] = data ?? []
  if (rows.length === 0) return []

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(
      rows.map((row) => row.storage_path),
      RESULT_TTL_SECONDS,
    )
  if (signError) throw signError

  const urlByPath = new Map<string, string>()
  for (const item of signed ?? []) {
    if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl)
  }

  return rows.map((row) => ({ ...row, url: urlByPath.get(row.storage_path) ?? null }))
}

/** 방금 만든 이미지를 올리고 이력을 남긴다. */
export async function saveAiAvatarGeneration(
  coupleId: string,
  requestedBy: string,
  themeId: string,
  image: Blob,
): Promise<AiAvatarGeneration> {
  const path = `${coupleId}/${Date.now()}-${themeId}.png`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, image, { contentType: 'image/png' })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('ai_avatar_generations')
    .insert({
      couple_id: coupleId,
      requested_by: requestedBy,
      theme_id: themeId,
      storage_path: path,
    })
    .select(GENERATION_COLUMNS)
    .single()
  if (error) throw error
  return data
}

/**
 * 만든 아바타 하나를 지운다. row를 먼저 지우고 나서 파일을 지우는 이유는
 * removeRegionPhoto(travel)와 같다 — row가 사라지면 사용자가 원한 일은 이미
 * 끝난 것이고, 파일 삭제가 실패해도 안 쓰이는 파일 하나만 남을 뿐 되돌릴
 * 필요는 없다.
 */
export async function deleteAiAvatarGeneration(id: string, storagePath: string): Promise<void> {
  const { error } = await supabase.from('ai_avatar_generations').delete().eq('id', id)
  if (error) throw error

  await supabase.storage.from(BUCKET).remove([storagePath])
}
