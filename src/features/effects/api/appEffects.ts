import { supabase } from '@/lib/supabase'
import { ALL_EFFECTS_OFF, isAppEffectId, type AppEffectsData } from '../types'

/**
 * 지금 켜져 있는 특수효과들과, custom_image 효과가 떨어뜨릴 이미지.
 * app_effects는 누구나 읽을 수 있다 (RLS `app_effects_select_all`) — 홈
 * 화면이 이 값을 보고 벚꽃·눈·이미지를 켠다.
 *
 * DB가 모르는 효과 id는 없는 셈 친다(꺼짐) — 코드가 모르는 효과를 그리려고
 * 하지 않기 위해서다.
 */
export async function listAppEffects(): Promise<AppEffectsData> {
  const { data, error } = await supabase.from('app_effects').select('id, is_enabled, image_url')
  if (error) throw error

  const enabled = { ...ALL_EFFECTS_OFF }
  let customImageUrl: string | null = null

  for (const row of data ?? []) {
    if (!isAppEffectId(row.id)) continue
    enabled[row.id] = row.is_enabled
    if (row.id === 'custom_image') customImageUrl = row.image_url
  }

  return { enabled, customImageUrl }
}
