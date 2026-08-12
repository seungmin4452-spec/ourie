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
 * 버튼 하나의 아이콘·제목·알림 내용을 고친다.
 *
 * id만 넘긴다 — 어느 커플의 버튼인지는 RLS(poke_presets_update_couple)가 본다.
 * 그 정책에 with check가 따로 없지만, 그때는 using 식이 새 row에도 적용되므로
 * 다른 커플로 옮기는 update는 막힌다.
 *
 * 이미 보낸 기록(pokes)은 preset_id만 들고 있어서, 문구를 고치면 지난 기록도
 * 새 문구로 보이게 된다. 지금은 기록을 보여주는 화면이 없어 그대로 두지만,
 * 나중에 기록을 띄운다면 발송 시점 문구를 pokes에 함께 적어야 한다.
 */
export async function updatePokePreset(
  id: string,
  input: PokePresetInput,
): Promise<PokePreset> {
  const { data, error } = await supabase
    .from('poke_presets')
    .update(input)
    .eq('id', id)
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
