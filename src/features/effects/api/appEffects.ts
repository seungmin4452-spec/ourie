import { supabase } from '@/lib/supabase'
import { ALL_EFFECTS_OFF, isAppEffectId, type AppEffectState } from '../types'

/**
 * 지금 켜져 있는 특수효과들. app_effects는 누구나 읽을 수 있다 (RLS
 * `app_effects_select_all`) — 홈 화면이 이 값을 보고 벚꽃·눈을 켠다.
 *
 * DB가 모르는 효과 id는 없는 셈 친다(꺼짐) — 코드가 모르는 효과를 그리려고
 * 하지 않기 위해서다.
 */
export async function listAppEffects(): Promise<AppEffectState> {
  const { data, error } = await supabase.from('app_effects').select('id, is_enabled')
  if (error) throw error

  const state = { ...ALL_EFFECTS_OFF }
  for (const row of data ?? []) {
    if (isAppEffectId(row.id)) state[row.id] = row.is_enabled
  }
  return state
}
