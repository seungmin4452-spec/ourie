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
  created_at: string
}

export interface AnniversaryInput {
  title: string
  date: DateKey
  repeat_yearly: boolean
}
