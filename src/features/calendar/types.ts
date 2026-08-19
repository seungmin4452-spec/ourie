import type { ISODateString, ISOTimeString } from '@astryxdesign/core/utils'

export type DateKey = ISODateString
export type TimeKey = ISOTimeString

/** DB의 title check 제약과 같은 값이어야 한다 (supabase/schema.sql). */
export const CALENDAR_TITLE_MAX = 60
/** DB의 location check 제약과 같은 값이어야 한다. */
export const CALENDAR_LOCATION_MAX = 100

export interface CalendarEvent {
  id: string
  couple_id: string
  created_by: string
  title: string
  event_date: DateKey
  /** 시간을 안 적었으면 종일 일정. */
  event_time: TimeKey | null
  location: string | null
  /**
   * "우리 약속" 토글. 켜져 있으면 둘 다 수정·삭제할 수 있고, 꺼져 있으면
   * (기본값) 등록한 사람(created_by)만 할 수 있다 (DB RLS가 실제로 막는다).
   */
  is_shared: boolean
  created_at: string
  updated_at: string
}

export interface CalendarEventInput {
  title: string
  event_date: DateKey
  event_time: TimeKey | null
  location: string | null
  is_shared: boolean
}
