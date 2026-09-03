import type { AiAvatarGeneration } from '@/features/aiAvatar'
import type { AppVisitRecord } from '@/features/appVisit'
import type { CalendarEvent } from '@/features/calendar'
import type { PokeRecord } from '@/features/poke'
import { TRAVEL_DISTRICTS, type RegionPhotoDate, type TravelBadge, type TravelVisit } from '@/features/travel'
import type { Wish } from '@/features/wish'

/**
 * 연간·월간 결산의 셈. 순수 함수만 둔다 — 소원권 현황판(board.ts)과 같은 이유로,
 * 화면과 (나중에 생길 수 있는) 다른 화면이 같은 숫자를 봐야 한다.
 */

/** 지도가 아는 시군구 코드만. 행정구역이 바뀌면 옛 코드가 남을 수 있다
 * (districtIndex.ts의 countKnownVisits와 같은 이유). */
const KNOWN_REGION_CODES = new Set(TRAVEL_DISTRICTS.map((district) => district.code))

/** 결산이 보는 기간 하나. month의 month는 1~12(1월~12월). */
export type RecapPeriod =
  | { granularity: 'year'; year: number }
  | { granularity: 'month'; year: number; month: number }

/** `event_date`(YYYY-MM-DD)를 보는 사람의 로컬 자정으로 파싱한다. UTC로 새지
 * 않게 문자열에서 바로 자른다 (anniversary/dday.ts의 parseDateKey와 같은 이유). */
function parseDateKeyLocal(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function matchesPeriod(date: Date, period: RecapPeriod): boolean {
  if (date.getFullYear() !== period.year) return false
  return period.granularity === 'year' || date.getMonth() + 1 === period.month
}

/** 같은 granularity의 기간만 비교할 수 있는 정렬 값. */
function periodOrdinal(period: RecapPeriod): number {
  return period.granularity === 'year' ? period.year : period.year * 12 + (period.month - 1)
}

/** a가 b보다 이전이면 음수, 같으면 0, 이후면 양수. 반드시 같은 granularity끼리만 비교한다. */
export function comparePeriods(a: RecapPeriod, b: RecapPeriod): number {
  return periodOrdinal(a) - periodOrdinal(b)
}

/** period를 한 눈금 옮긴 값 — year면 한 해, month면 한 달씩 움직인다. */
export function shiftPeriod(period: RecapPeriod, delta: number): RecapPeriod {
  if (period.granularity === 'year') return { granularity: 'year', year: period.year + delta }

  const ordinal = periodOrdinal(period) + delta
  const year = Math.floor(ordinal / 12)
  return { granularity: 'month', year, month: ordinal - year * 12 + 1 }
}

export function previousPeriod(period: RecapPeriod): RecapPeriod {
  return shiftPeriod(period, -1)
}

/**
 * 기간 선택기가 오갈 수 있는 범위. 최대는 지금(이번 달/올해), 최소는 커플이
 * 생긴 달/해다 — 그보다 이전은 둘 중 누구의 기록도 아직 "우리" 기록이
 * 아니었다.
 */
export function recapPeriodBounds(
  coupleCreatedAt: string | null,
  granularity: RecapPeriod['granularity'],
): { min: RecapPeriod; max: RecapPeriod } {
  const now = new Date()
  const max: RecapPeriod =
    granularity === 'year'
      ? { granularity: 'year', year: now.getFullYear() }
      : { granularity: 'month', year: now.getFullYear(), month: now.getMonth() + 1 }

  if (coupleCreatedAt == null) return { min: max, max }

  const created = new Date(coupleCreatedAt)
  const min: RecapPeriod =
    granularity === 'year'
      ? { granularity: 'year', year: created.getFullYear() }
      : { granularity: 'month', year: created.getFullYear(), month: created.getMonth() + 1 }

  return comparePeriods(min, max) <= 0 ? { min, max } : { min: max, max }
}

export function clampPeriod(
  period: RecapPeriod,
  bounds: { min: RecapPeriod; max: RecapPeriod },
): RecapPeriod {
  if (comparePeriods(period, bounds.min) < 0) return bounds.min
  if (comparePeriods(period, bounds.max) > 0) return bounds.max
  return period
}

export interface RecapData {
  selfId: string
  calendarEvents: CalendarEvent[]
  travelVisits: TravelVisit[]
  regionPhotoDates: RegionPhotoDate[]
  travelBadges: TravelBadge[]
  wishes: Wish[]
  pokes: PokeRecord[]
  appVisits: AppVisitRecord[]
  aiImageGenerations: AiAvatarGeneration[]
}

export interface RecapCounts {
  calendarEventCount: number
  sharedCalendarEventCount: number
  newRegionCount: number
  /** 지금까지 누적으로 다녀온 곳 (기간과 무관, 지도가 아는 코드만). */
  totalRegionCount: number
  newRegionPhotoCount: number
  newBadgeCount: number
  myWishCount: number
  partnerWishCount: number
  pokesSent: number
  pokesReceived: number
  myAppVisitCount: number
  partnerAppVisitCount: number
  myAiImageCount: number
  partnerAiImageCount: number
}

export function computeRecap(data: RecapData, period: RecapPeriod): RecapCounts {
  const {
    selfId,
    calendarEvents,
    travelVisits,
    regionPhotoDates,
    travelBadges,
    wishes,
    pokes,
    appVisits,
    aiImageGenerations,
  } = data

  const knownVisits = travelVisits.filter((visit) => KNOWN_REGION_CODES.has(visit.region_code))
  const knownPhotoDates = regionPhotoDates.filter((photo) =>
    KNOWN_REGION_CODES.has(photo.region_code),
  )

  const periodEvents = calendarEvents.filter((event) =>
    matchesPeriod(parseDateKeyLocal(event.event_date), period),
  )
  const periodVisits = knownVisits.filter((visit) => matchesPeriod(new Date(visit.created_at), period))
  const periodPhotos = knownPhotoDates.filter((photo) =>
    matchesPeriod(new Date(photo.created_at), period),
  )
  const periodBadges = travelBadges.filter((badge) => matchesPeriod(new Date(badge.earned_at), period))
  const periodWishes = wishes.filter((wish) => matchesPeriod(new Date(wish.created_at), period))
  const periodPokes = pokes.filter((poke) => matchesPeriod(new Date(poke.created_at), period))
  const periodAppVisits = appVisits.filter((visit) =>
    matchesPeriod(new Date(visit.created_at), period),
  )
  const periodAiImages = aiImageGenerations.filter((generation) =>
    matchesPeriod(new Date(generation.created_at), period),
  )

  const myWishCount = periodWishes.filter((wish) => wish.owner_id === selfId).length
  const pokesSent = periodPokes.filter((poke) => poke.sender_id === selfId).length
  const myAppVisitCount = periodAppVisits.filter((visit) => visit.user_id === selfId).length
  const myAiImageCount = periodAiImages.filter(
    (generation) => generation.requested_by === selfId,
  ).length

  return {
    calendarEventCount: periodEvents.length,
    sharedCalendarEventCount: periodEvents.filter((event) => event.is_shared).length,
    newRegionCount: periodVisits.length,
    totalRegionCount: knownVisits.length,
    newRegionPhotoCount: periodPhotos.length,
    newBadgeCount: periodBadges.length,
    myWishCount,
    partnerWishCount: periodWishes.length - myWishCount,
    pokesSent,
    pokesReceived: periodPokes.length - pokesSent,
    myAppVisitCount,
    partnerAppVisitCount: periodAppVisits.length - myAppVisitCount,
    myAiImageCount,
    partnerAiImageCount: periodAiImages.length - myAiImageCount,
  }
}
