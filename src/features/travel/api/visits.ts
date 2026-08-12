import { supabase } from '@/lib/supabase'

export interface TravelVisit {
  /** 통계청 시도 코드. regions.ts의 `code`와 같은 값이다. */
  region_code: string
  /** 실제로 다녀온 날. 지금 화면은 채우지 않는다 — api/visits.ts의 주석 참고. */
  visited_on: string | null
  created_by: string
  created_at: string
}

const COLUMNS = 'region_code, visited_on, created_by, created_at'

/**
 * 커플이 칠해둔 시도 전부.
 *
 * RLS가 이미 호출자의 커플로 범위를 좁히지만, 명시적 필터가 있어야
 * (couple_id, region_code) 기본키 인덱스를 탄다.
 */
export async function listTravelVisits(coupleId: string): Promise<TravelVisit[]> {
  const { data, error } = await supabase
    .from('travel_visits')
    .select(COLUMNS)
    .eq('couple_id', coupleId)
  if (error) throw error
  return data ?? []
}

/**
 * 한 시도를 다녀온 곳으로 칠한다.
 *
 * upsert인 이유: 이 지도는 커플 둘이 같이 본다. 양쪽이 같은 지역을 거의 동시에
 * 누르면 두 번째 요청이 기본키 충돌로 실패하는데, 사용자 입장에서는 이미 원하는
 * 상태가 됐으므로 에러를 띄우면 거짓말이 된다.
 *
 * visited_on을 채우지 않는 이유: 지금 화면이 묻는 것은 "다녀왔다"뿐이고, 오늘
 * 날짜를 넣으면 그건 다녀온 날이 아니라 체크한 날이다. 언제 체크했는지는
 * created_at에 이미 남는다.
 */
export async function markVisited(
  coupleId: string,
  userId: string,
  regionCode: string,
): Promise<void> {
  const { error } = await supabase
    .from('travel_visits')
    .upsert(
      { couple_id: coupleId, region_code: regionCode, created_by: userId },
      { onConflict: 'couple_id,region_code', ignoreDuplicates: true },
    )
  if (error) throw error
}

/** 잘못 누른 지역을 되돌린다. 상대가 칠한 것도 지울 수 있다 (RLS 주석 참고). */
export async function unmarkVisited(coupleId: string, regionCode: string): Promise<void> {
  const { error } = await supabase
    .from('travel_visits')
    .delete()
    .eq('couple_id', coupleId)
    .eq('region_code', regionCode)
  if (error) throw error
}
