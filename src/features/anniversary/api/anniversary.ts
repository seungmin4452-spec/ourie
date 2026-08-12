import { supabase } from '@/lib/supabase'
import type { Anniversary, AnniversaryInput } from '../types'

const COLUMNS =
  'id, couple_id, created_by, title, date, repeat_yearly, is_primary, created_at'

export async function listAnniversaries(coupleId: string): Promise<Anniversary[]> {
  // 등록한 순서 그대로다. 날짜순이나 D-day순으로 정렬하면 방금 추가한 기념일이
  // 목록 어딘가로 사라져서, 제대로 저장됐는지 눈으로 찾아야 한다. 새로 만든 건
  // 언제나 맨 아래에 붙는다.
  //
  // RLS가 이미 호출자의 커플로 범위를 좁히지만, 명시적 필터가 있어야
  // anniversaries_couple_id_date_idx 인덱스로 행을 추려낸다.
  const { data, error } = await supabase
    .from('anniversaries')
    .select(COLUMNS)
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createAnniversary(
  coupleId: string,
  userId: string,
  input: AnniversaryInput,
): Promise<Anniversary> {
  const { data, error } = await supabase
    .from('anniversaries')
    .insert({ couple_id: coupleId, created_by: userId, ...input })
    .select(COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function updateAnniversary(
  id: string,
  input: AnniversaryInput,
): Promise<Anniversary> {
  const { data, error } = await supabase
    .from('anniversaries')
    .update(input)
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw error
  return data
}

/**
 * 홈 위젯에 크게 띄울 기념일을 이걸로 바꾼다. 나머지는 자동으로 내려간다.
 *
 * `updateAnniversary`로 `is_primary`를 켜지 않는 이유: 그러면 "이전 것을 끄는"
 * 두 번째 요청이 따로 필요하고, 그 사이에 실패하면 메인이 둘이 된다. 서버
 * 함수가 한 문장으로 처리한다 (supabase/schema.sql의 set_primary_anniversary).
 */
export async function setPrimaryAnniversary(id: string): Promise<void> {
  const { error } = await supabase.rpc('set_primary_anniversary', { p_id: id })
  if (error) throw error
}

export async function deleteAnniversary(id: string): Promise<void> {
  const { error } = await supabase.from('anniversaries').delete().eq('id', id)
  if (error) throw error
}
