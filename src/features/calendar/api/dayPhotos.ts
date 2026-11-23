import { cropImageToSquare, downscaleImage } from '@/lib/image'
import { supabase } from '@/lib/supabase'
import { getSignedUrl, putSignedUrl } from '@/features/travel/api/signedUrlCache'
import type { DateKey } from '../types'

const BUCKET = 'memory-photos'
const SCOPE = 'calendar-day-photos' as const
const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60

/** 전체 화면으로 볼 사진의 긴 변. 원본을 두면 무료 용량이 금방 찬다. */
const FULL_MAX_SIDE = 1600
const FULL_QUALITY = 0.82
/** 3열 격자를 고해상도 화면에서 봐도 충분한 크기. 달력 칸도 이걸 쓴다. */
const THUMB_SIZE = 320
const THUMB_QUALITY = 0.75

/** 하루에 올릴 수 있는 사진 수. 화면에서만 막는다 (poke_presets 개수와 같은 판단). */
export const DAY_PHOTO_MAX = 10
export const DAY_TITLE_MAX = 40
export const DAY_CONTENT_MAX = 500

/**
 * memories와 photos 사이에는 외래 키가 둘이다 (photos.memory_id,
 * memories.cover_photo_id). 어느 쪽인지 적지 않으면 PostgREST가 PGRST201로
 * 조회를 거부한다.
 */
const PHOTOS_EMBED = 'photos!photos_memory_id_fkey(id, storage_path, sort_order)'

interface PhotoRow {
  id: string
  storage_path: string
  sort_order: number
}

export interface DayPhoto {
  id: string
  path: string
  thumbUrl: string
  fullUrl: string
}

export interface DayRecord {
  memoryId: string
  date: DateKey
  title: string | null
  content: string | null
  coverPhotoId: string | null
  photos: DayPhoto[]
}

/** 달력 칸 하나에 필요한 것. `extraCount`는 대표 사진을 뺀 나머지 장수다. */
export interface DayCover {
  url: string
  extraCount: number
}

export interface AddDayPhotosResult {
  addedCount: number
  failedFiles: File[]
}

function thumbPathOf(path: string) {
  return path.replace(/\.jpg$/, '-thumb.jpg')
}

function bySortOrder(a: PhotoRow, b: PhotoRow) {
  return a.sort_order - b.sort_order
}

/** 서명은 경로 단위로 재사용한다 — URL이 바뀌면 브라우저가 사진을 다시 받는다. */
async function signPaths(paths: string[]): Promise<void> {
  const unsigned = paths.filter((path) => getSignedUrl(SCOPE, path) == null)
  if (unsigned.length === 0) return

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(unsigned, SIGNED_URL_TTL_SECONDS)
  if (error) throw error

  for (const item of data ?? []) {
    if (item.path && item.signedUrl) {
      putSignedUrl(SCOPE, item.path, item.signedUrl, SIGNED_URL_TTL_SECONDS)
    }
  }
}

/** 달력에 보이는 범위의 날짜별 대표 사진 URL. */
export async function listDayCovers(
  coupleId: string,
  from: DateKey,
  to: DateKey,
): Promise<Map<DateKey, DayCover>> {
  const { data, error } = await supabase
    .from('memories')
    .select(`memory_date, cover_photo_id, ${PHOTOS_EMBED}`)
    .eq('couple_id', coupleId)
    .gte('memory_date', from)
    .lte('memory_date', to)
  if (error) throw error

  const coverPaths = new Map<DateKey, { path: string; extraCount: number }>()
  for (const row of data ?? []) {
    const photos = [...((row.photos ?? []) as PhotoRow[])].sort(bySortOrder)
    const cover = photos.find((photo) => photo.id === row.cover_photo_id) ?? photos[0]
    if (cover) {
      coverPaths.set(row.memory_date as DateKey, {
        path: thumbPathOf(cover.storage_path),
        extraCount: photos.length - 1,
      })
    }
  }

  await signPaths([...coverPaths.values()].map(({ path }) => path))

  const covers = new Map<DateKey, DayCover>()
  for (const [date, { path, extraCount }] of coverPaths) {
    const url = getSignedUrl(SCOPE, path)
    if (url) covers.set(date, { url, extraCount })
  }
  return covers
}

export async function getDayRecord(coupleId: string, date: DateKey): Promise<DayRecord | null> {
  const { data, error } = await supabase
    .from('memories')
    .select(`id, memory_date, title, content, cover_photo_id, ${PHOTOS_EMBED}`)
    .eq('couple_id', coupleId)
    .eq('memory_date', date)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const rows = [...((data.photos ?? []) as PhotoRow[])].sort(bySortOrder)
  await signPaths(rows.flatMap((row) => [row.storage_path, thumbPathOf(row.storage_path)]))

  const photos: DayPhoto[] = []
  for (const row of rows) {
    const fullUrl = getSignedUrl(SCOPE, row.storage_path)
    const thumbUrl = getSignedUrl(SCOPE, thumbPathOf(row.storage_path))
    // 파일이 없는 row 한 장 때문에 그날 전체를 에러로 만들지 않는다.
    if (fullUrl && thumbUrl) {
      photos.push({ id: row.id, path: row.storage_path, fullUrl, thumbUrl })
    }
  }

  return {
    memoryId: data.id,
    date,
    title: data.title,
    content: data.content,
    coverPhotoId: data.cover_photo_id,
    photos,
  }
}

/** 그날의 기록을 찾거나 만든다. 둘이 동시에 만들어도 유니크 인덱스가 하나로 묶는다. */
async function ensureDayMemory(coupleId: string, userId: string, date: DateKey): Promise<string> {
  const { error: upsertError } = await supabase
    .from('memories')
    .upsert(
      { couple_id: coupleId, created_by: userId, memory_date: date },
      { onConflict: 'couple_id,memory_date', ignoreDuplicates: true },
    )
  if (upsertError) throw upsertError

  const { data, error } = await supabase
    .from('memories')
    .select('id')
    .eq('couple_id', coupleId)
    .eq('memory_date', date)
    .single()
  if (error) throw error
  return data.id
}

async function uploadOnePhoto(
  coupleId: string,
  memoryId: string,
  date: DateKey,
  file: File,
  sortOrder: number,
): Promise<void> {
  const [full, thumb] = await Promise.all([
    downscaleImage(file, FULL_MAX_SIDE, FULL_QUALITY),
    cropImageToSquare(file, THUMB_SIZE, THUMB_QUALITY),
  ])

  const id = crypto.randomUUID()
  const path = `${coupleId}/${date}/${id}.jpg`
  const thumbPath = thumbPathOf(path)
  const storage = supabase.storage.from(BUCKET)

  const { error: fullError } = await storage.upload(path, full, { contentType: 'image/jpeg' })
  if (fullError) throw fullError

  const { error: thumbError } = await storage.upload(thumbPath, thumb, {
    contentType: 'image/jpeg',
  })
  if (thumbError) {
    await storage.remove([path])
    throw thumbError
  }

  const { error } = await supabase
    .from('photos')
    .insert({ id, memory_id: memoryId, storage_path: path, sort_order: sortOrder })
  if (error) {
    await storage.remove([path, thumbPath])
    throw error
  }
}

/**
 * 고른 사진을 한 장씩 올린다. 한 장이 실패해도 나머지는 계속 올리고, 실패한
 * 파일을 돌려줘서 화면이 그것만 다시 시도할 수 있게 한다.
 */
export async function addDayPhotos(
  coupleId: string,
  userId: string,
  date: DateKey,
  files: File[],
): Promise<AddDayPhotosResult> {
  const memoryId = await ensureDayMemory(coupleId, userId, date)

  const { data: existing, error } = await supabase
    .from('photos')
    .select('sort_order')
    .eq('memory_id', memoryId)
    .order('sort_order', { ascending: false })
  if (error) throw error

  const room = Math.max(0, DAY_PHOTO_MAX - (existing?.length ?? 0))
  let nextOrder = (existing?.[0]?.sort_order ?? -1) + 1
  let addedCount = 0
  const failedFiles: File[] = []

  for (const file of files.slice(0, room)) {
    try {
      await uploadOnePhoto(coupleId, memoryId, date, file, nextOrder)
      nextOrder += 1
      addedCount += 1
    } catch {
      failedFiles.push(file)
    }
  }

  // 전부 실패해서 빈 기록만 남았다면 치운다.
  if (addedCount === 0 && (existing?.length ?? 0) === 0) {
    await supabase
      .from('memories')
      .delete()
      .eq('id', memoryId)
      .is('title', null)
      .is('content', null)
  }

  return { addedCount, failedFiles }
}

export async function updateDayPost(
  memoryId: string,
  title: string | null,
  content: string | null,
): Promise<void> {
  const { error } = await supabase.from('memories').update({ title, content }).eq('id', memoryId)
  if (error) throw error
}

export async function setDayCover(memoryId: string, photoId: string): Promise<void> {
  const { error } = await supabase
    .from('memories')
    .update({ cover_photo_id: photoId })
    .eq('id', memoryId)
  if (error) throw error
}

/**
 * 사진을 지운다. 마지막 사진이면 그날의 게시물도 지운다 — 사진 없는 게시물은
 * 달력에서 열 길이 없어 글만 보이지 않게 남는다. 화면이 지우기 전에 알린다.
 */
export async function deleteDayPhoto(record: DayRecord, photo: DayPhoto): Promise<void> {
  const { error } = await supabase.from('photos').delete().eq('id', photo.id)
  if (error) throw error

  // 실패해도 무시한다. 사진은 이미 화면에서 빠졌고 남는 건 안 쓰이는 파일이다.
  await supabase.storage.from(BUCKET).remove([photo.path, thumbPathOf(photo.path)])

  const { count } = await supabase
    .from('photos')
    .select('id', { count: 'exact', head: true })
    .eq('memory_id', record.memoryId)
  if (count === 0) {
    await supabase.from('memories').delete().eq('id', record.memoryId)
  }
}
