import type { CalendarEvent } from '@/features/calendar'
import type { PokeRecord } from '@/features/poke'
import { TRAVEL_DISTRICTS, type RegionPhotoDate, type TravelBadge, type TravelVisit } from '@/features/travel'
import type { Wish } from '@/features/wish'

/**
 * 연간 결산의 셈. 순수 함수만 둔다 — 소원권 현황판(board.ts)과 같은 이유로,
 * 화면과 (나중에 생길 수 있는) 다른 화면이 같은 숫자를 봐야 한다.
 */

/** 지도가 아는 시군구 코드만. 행정구역이 바뀌면 옛 코드가 남을 수 있다
 * (districtIndex.ts의 countKnownVisits와 같은 이유). */
const KNOWN_REGION_CODES = new Set(TRAVEL_DISTRICTS.map((district) => district.code))

/** `event_date`(YYYY-MM-DD)의 연도. UTC로 새지 않게 문자열에서 바로 자른다
 * (anniversary/dday.ts의 parseDateKey와 같은 이유). */
function yearOfDateKey(dateKey: string): number {
  return Number(dateKey.slice(0, 4))
}

/** timestamptz 값의 연도. 보는 사람의 로컬 자정 기준이다. */
function yearOfTimestamp(iso: string): number {
  return new Date(iso).getFullYear()
}

export interface RecapInput {
  year: number
  selfId: string
  calendarEvents: CalendarEvent[]
  travelVisits: TravelVisit[]
  regionPhotoDates: RegionPhotoDate[]
  travelBadges: TravelBadge[]
  wishes: Wish[]
  pokes: PokeRecord[]
}

export interface RecapCounts {
  year: number
  calendarEventCount: number
  sharedCalendarEventCount: number
  newRegionCount: number
  /** 지금까지 누적으로 다녀온 곳 (연도와 무관, 지도가 아는 코드만). */
  totalRegionCount: number
  newRegionPhotoCount: number
  newBadgeCount: number
  myWishCount: number
  partnerWishCount: number
  pokesSent: number
  pokesReceived: number
  hasAnyActivity: boolean
}

export function computeRecap(input: RecapInput): RecapCounts {
  const {
    year,
    selfId,
    calendarEvents,
    travelVisits,
    regionPhotoDates,
    travelBadges,
    wishes,
    pokes,
  } = input

  const knownVisits = travelVisits.filter((visit) => KNOWN_REGION_CODES.has(visit.region_code))
  const knownPhotoDates = regionPhotoDates.filter((photo) =>
    KNOWN_REGION_CODES.has(photo.region_code),
  )

  const yearEvents = calendarEvents.filter((event) => yearOfDateKey(event.event_date) === year)
  const yearVisits = knownVisits.filter((visit) => yearOfTimestamp(visit.created_at) === year)
  const yearPhotos = knownPhotoDates.filter((photo) => yearOfTimestamp(photo.updated_at) === year)
  const yearBadges = travelBadges.filter((badge) => yearOfTimestamp(badge.earned_at) === year)
  const yearWishes = wishes.filter((wish) => yearOfTimestamp(wish.created_at) === year)
  const yearPokes = pokes.filter((poke) => yearOfTimestamp(poke.created_at) === year)

  const myWishCount = yearWishes.filter((wish) => wish.owner_id === selfId).length
  const pokesSent = yearPokes.filter((poke) => poke.sender_id === selfId).length

  return {
    year,
    calendarEventCount: yearEvents.length,
    sharedCalendarEventCount: yearEvents.filter((event) => event.is_shared).length,
    newRegionCount: yearVisits.length,
    totalRegionCount: knownVisits.length,
    newRegionPhotoCount: yearPhotos.length,
    newBadgeCount: yearBadges.length,
    myWishCount,
    partnerWishCount: yearWishes.length - myWishCount,
    pokesSent,
    pokesReceived: yearPokes.length - pokesSent,
    hasAnyActivity:
      yearEvents.length > 0 ||
      yearVisits.length > 0 ||
      yearPhotos.length > 0 ||
      yearBadges.length > 0 ||
      yearWishes.length > 0 ||
      yearPokes.length > 0,
  }
}

/**
 * 연도 선택기가 오갈 수 있는 범위. 최대는 오늘, 최소는 커플이 생긴 해다 —
 * 그보다 이전 해는 둘 중 누구의 기록도 아직 "우리" 기록이 아니었다.
 */
export function recapYearRange(coupleCreatedAt: string | null): { minYear: number; maxYear: number } {
  const maxYear = new Date().getFullYear()
  if (coupleCreatedAt == null) return { minYear: maxYear, maxYear }

  const minYear = new Date(coupleCreatedAt).getFullYear()
  return { minYear: Math.min(minYear, maxYear), maxYear }
}
