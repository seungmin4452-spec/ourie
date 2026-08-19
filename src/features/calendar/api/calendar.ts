import { supabase } from '@/lib/supabase'
import type { CalendarEvent, CalendarEventInput } from '../types'

const COLUMNS =
  'id, couple_id, created_by, title, event_date, event_time, location, is_shared, created_at, updated_at'

export async function listCalendarEvents(coupleId: string): Promise<CalendarEvent[]> {
  // 다가오는 날짜순. RLS가 이미 호출자의 커플로 범위를 좁히지만, 명시적
  // 필터가 있어야 calendar_events_couple_id_event_date_idx 인덱스를 탄다.
  const { data, error } = await supabase
    .from('calendar_events')
    .select(COLUMNS)
    .eq('couple_id', coupleId)
    .order('event_date', { ascending: true })
    .order('event_time', { ascending: true, nullsFirst: true })
  if (error) throw error
  return data ?? []
}

export async function createCalendarEvent(
  coupleId: string,
  userId: string,
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from('calendar_events')
    .insert({ couple_id: coupleId, created_by: userId, ...input })
    .select(COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function updateCalendarEvent(
  id: string,
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from('calendar_events')
    .update(input)
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const { error } = await supabase.from('calendar_events').delete().eq('id', id)
  if (error) throw error
}
