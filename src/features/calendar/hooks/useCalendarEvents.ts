import { useQuery } from '@tanstack/react-query'

import { listCalendarEvents } from '../api/calendar'

export function calendarEventsQueryKey(coupleId: string | null | undefined) {
  return ['calendar-events', coupleId] as const
}

export function useCalendarEvents(coupleId: string | null | undefined) {
  return useQuery({
    queryKey: calendarEventsQueryKey(coupleId),
    queryFn: () => listCalendarEvents(coupleId!),
    enabled: coupleId != null,
  })
}
