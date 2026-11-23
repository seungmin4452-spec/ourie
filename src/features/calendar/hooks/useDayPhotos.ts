import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { getDayRecord, listDayCovers } from '../api/dayPhotos'
import { parseDateKey, toDateKey } from '../schedule'
import type { DateKey } from '../types'

/** 무효화할 때 달력 대표 사진과 날짜 상세를 한 번에 잡는 앞부분. */
export function dayPhotosQueryKey(coupleId: string | null | undefined) {
  return ['calendar-day-photos', coupleId] as const
}

/** 달력은 앞뒤 달의 날짜도 그리므로 보이는 달에서 일주일씩 넓혀 읽는다. */
function visibleRange(focusDate: DateKey): { from: DateKey; to: DateKey } {
  const focus = parseDateKey(focusDate)
  const year = focus.getFullYear()
  const month = focus.getMonth()
  return {
    from: toDateKey(new Date(year, month, -6)),
    to: toDateKey(new Date(year, month + 1, 7)),
  }
}

export function useDayCovers(coupleId: string | null | undefined, focusDate: DateKey) {
  const { from, to } = visibleRange(focusDate)
  return useQuery({
    queryKey: [...dayPhotosQueryKey(coupleId), 'covers', from, to],
    queryFn: () => listDayCovers(coupleId!, from, to),
    enabled: coupleId != null,
    // 달을 넘길 때 칸의 사진이 깜빡이지 않게 한다.
    placeholderData: keepPreviousData,
  })
}

export function useDayRecord(coupleId: string | null | undefined, date: DateKey) {
  return useQuery({
    queryKey: [...dayPhotosQueryKey(coupleId), 'day', date],
    queryFn: () => getDayRecord(coupleId!, date),
    enabled: coupleId != null,
  })
}
