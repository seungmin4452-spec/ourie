import { supabase } from '@/lib/supabase'
import type { BadgeTier } from '../badges'

/** 커플이 딴 뱃지 하나. */
export interface TravelBadge {
  sido_code: string
  /** 'visited' | 'photo'. locked는 아직 못 딴 것이라 여기 없다. */
  tier: Exclude<BadgeTier, 'locked'>
  earned_at: string
  earned_by: string | null
}

const COLUMNS = 'sido_code, tier, earned_at, earned_by'

/**
 * 커플이 딴 뱃지 전부. 딴 순서대로다 — 쌓이면 그게 두 사람의 여행 연대기가 된다.
 *
 * RLS가 이미 호출자의 커플로 범위를 좁히지만, 명시적 필터가 있어야
 * (couple_id, sido_code, tier) 기본키 인덱스를 탄다.
 */
export async function listTravelBadges(coupleId: string): Promise<TravelBadge[]> {
  const { data, error } = await supabase
    .from('travel_badges')
    .select(COLUMNS)
    .eq('couple_id', coupleId)
    .order('earned_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

/**
 * 뱃지 하나를 딴 것으로 기록한다.
 *
 * **새로 생겼을 때만 true**를 돌려준다. 이미 있었으면 false — 그 값이 연출과
 * 푸시를 보낼지 정한다. 둘이 동시에 마지막 칸을 채워도 뱃지는 하나만 생기고
 * 알림도 한 번만 나간다 (supabase/schema.sql의 claim_region_badge).
 *
 * 커플과 딴 사람은 서버가 auth.uid()에서 읽는다 — 여기서 넘기지 않는다.
 */
export async function claimRegionBadge(
  sidoCode: string,
  tier: Exclude<BadgeTier, 'locked'>,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('claim_region_badge', {
    p_sido_code: sidoCode,
    p_tier: tier,
  })
  if (error) throw error
  return data === true
}
