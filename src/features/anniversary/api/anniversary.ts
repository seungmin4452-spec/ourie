import { supabase } from '@/lib/supabase'
import type { Anniversary, AnniversaryInput } from '../types'

const COLUMNS = 'id, couple_id, created_by, title, date, repeat_yearly, created_at'

export async function listAnniversaries(coupleId: string): Promise<Anniversary[]> {
  // RLS가 이미 호출자의 커플로 범위를 좁히지만, 명시적 필터가 있어야
  // anniversaries_couple_id_date_idx 인덱스를 탄다.
  const { data, error } = await supabase
    .from('anniversaries')
    .select(COLUMNS)
    .eq('couple_id', coupleId)
    .order('date', { ascending: true })
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

export async function deleteAnniversary(id: string): Promise<void> {
  const { error } = await supabase.from('anniversaries').delete().eq('id', id)
  if (error) throw error
}
