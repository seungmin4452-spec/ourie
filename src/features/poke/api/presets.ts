import { supabase } from '@/lib/supabase'
import type { PokePreset, PokePresetInput } from '../types'

const COLUMNS = 'id, couple_id, created_by, icon, label, body, created_at'

/**
 * 커플이 만들어둔 버튼 전부. 만든 순서대로다 — 새로 만든 버튼이 위젯 아래쪽에
 * 붙어서, 이미 익숙해진 버튼들의 자리가 흔들리지 않는다.
 *
 * RLS가 이미 호출자의 커플로 범위를 좁히지만, 명시적 필터가 있어야
 * poke_presets_couple_created_idx 인덱스를 탄다.
 */
export async function listPokePresets(coupleId: string): Promise<PokePreset[]> {
  const { data, error } = await supabase
    .from('poke_presets')
    .select(COLUMNS)
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createPokePreset(
  coupleId: string,
  userId: string,
  input: PokePresetInput,
): Promise<PokePreset> {
  const { data, error } = await supabase
    .from('poke_presets')
    .insert({ couple_id: coupleId, created_by: userId, ...input })
    .select(COLUMNS)
    .single()
  if (error) throw error
  return data
}

/**
 * 버튼 하나를 지운다. 그 버튼으로 보냈던 기록(pokes)도 함께 사라진다
 * (on delete cascade) — 문구를 잃은 기록은 나중에 보여줄 수도 없다.
 */
export async function deletePokePreset(id: string): Promise<void> {
  const { error } = await supabase.from('poke_presets').delete().eq('id', id)
  if (error) throw error
}
