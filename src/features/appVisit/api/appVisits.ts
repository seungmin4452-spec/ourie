import { supabase } from '@/lib/supabase'

/** 앱을 한 번 연 기록. 지금은 결산이 횟수를 세는 데만 쓴다 (DATABASE.md의 app_visits). */
export interface AppVisitRecord {
  user_id: string
  created_at: string
}

/**
 * 커플의 접속 기록 전부.
 *
 * RLS(`app_visits_select_couple`)가 이미 호출자의 커플로 범위를 좁히지만,
 * 명시적 필터가 있어야 app_visits_couple_created_idx 인덱스를 탄다.
 */
export async function listAppVisits(coupleId: string): Promise<AppVisitRecord[]> {
  const { data, error } = await supabase
    .from('app_visits')
    .select('user_id, created_at')
    .eq('couple_id', coupleId)
  if (error) throw error
  return data ?? []
}

/**
 * 앱을 열었다는 사실 한 줄을 남긴다.
 *
 * 실패해도 화면에 드러내지 않는다 — 사용자가 시킨 일이 아니라 우리가 조용히
 * 세는 일이라, 호출부(AppVisitTracker)가 에러를 삼킨다.
 */
export async function recordAppVisit(coupleId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('app_visits')
    .insert({ couple_id: coupleId, user_id: userId })
  if (error) throw error
}
