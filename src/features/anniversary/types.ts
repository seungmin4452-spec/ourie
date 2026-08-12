import type { ISODateString } from '@astryxdesign/core/utils'

/**
 * YYYY-MM-DD 형태의 `date` 컬럼 값.
 *
 * Astryx의 ISODateString을 그대로 쓴다. 그래야 DB에서 읽은 값을 변환 없이
 * DateInput에 바로 넘길 수 있다.
 */
export type DateKey = ISODateString

export interface Anniversary {
  id: string
  couple_id: string
  created_by: string
  title: string
  date: DateKey
  repeat_yearly: boolean
  /**
   * 홈 위젯이 크게 보여줄 기념일로 커플이 직접 고른 것. 커플당 최대 하나이고,
   * 아무것도 고르지 않은 상태가 정상이다 — 그때는 가장 가까운 기념일이 뜬다
   * (`dday.ts`의 `pickHighlight`).
   *
   * `AnniversaryInput`에 없는 것은 일부러다. 이 값만 바꾸는 길은
   * `setPrimaryAnniversary` 하나뿐이어야 "메인이 둘"인 상태가 생기지 않는다.
   */
  is_primary: boolean
  created_at: string
}

export interface AnniversaryInput {
  title: string
  date: DateKey
  repeat_yearly: boolean
}
