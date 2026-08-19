import type { CalendarEvent, DateKey } from './types'

/**
 * `event_date` 컬럼 값을 로컬 자정으로 파싱한다. UTC로 읽으면
 * (`new Date('YYYY-MM-DD')`) 한국보다 서쪽에서는 하루가 밀린다 —
 * anniversary/dday.ts의 parseDateKey와 같은 이유.
 */
export function parseDateKey(key: DateKey): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function toDateKey(date: Date): DateKey {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}` as DateKey
}

export function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export function formatEventDate(key: DateKey): string {
  const date = parseDateKey(key)
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAYS[date.getDay()]})`
}

/** "HH:MM"·"HH:MM:SS"를 "오후 7:30"으로. 시간을 안 적었으면 null. */
export function formatEventTime(time: string | null): string | null {
  if (!time) return null
  const [hourStr, minuteStr] = time.split(':')
  const hour = Number(hourStr)
  const period = hour < 12 ? '오전' : '오후'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${period} ${hour12}:${minuteStr.padStart(2, '0')}`
}

/** DB RLS와 같은 규칙 — "우리 약속"이면 누구나, 아니면 등록한 사람만. */
export function canEditEvent(event: CalendarEvent, userId: string): boolean {
  return event.is_shared || event.created_by === userId
}

export interface SplitEvents {
  /** 오늘 포함 이후. 다가오는 순(오름차순). */
  upcoming: CalendarEvent[]
  /** 오늘보다 전. 최근 것이 위로 오게 내림차순. */
  past: CalendarEvent[]
}

/**
 * events는 이미 event_date·event_time 오름차순으로 온다
 * (api/calendar.ts) — 지난 일정만 뒤집어서 최근 것이 위로 오게 한다.
 */
export function splitByToday(events: CalendarEvent[], today: Date): SplitEvents {
  const todayKey = toDateKey(today)
  const upcoming: CalendarEvent[] = []
  const past: CalendarEvent[] = []
  for (const event of events) {
    if (event.event_date >= todayKey) upcoming.push(event)
    else past.push(event)
  }
  past.reverse()
  return { upcoming, past }
}
