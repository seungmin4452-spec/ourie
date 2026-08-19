import { Button } from '@astryxdesign/core/Button'
import { Calendar } from '@astryxdesign/core/Calendar'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Field } from '@astryxdesign/core/Field'
import { HStack } from '@astryxdesign/core/HStack'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Switch } from '@astryxdesign/core/Switch'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TimeInput } from '@astryxdesign/core/TimeInput'
import { useToast } from '@astryxdesign/core/Toast'
import { VStack } from '@astryxdesign/core/VStack'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { createCalendarEvent, updateCalendarEvent } from '../api/calendar'
import { calendarEventsQueryKey } from '../hooks/useCalendarEvents'
import { startOfToday, toDateKey } from '../schedule'
import { CALENDAR_LOCATION_MAX, CALENDAR_TITLE_MAX } from '../types'
import type { CalendarEvent, CalendarEventInput, DateKey, TimeKey } from '../types'

interface CalendarEventFormDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  coupleId: string
  userId: string
  /** 수정 중인 일정. 새로 만들 때는 null. */
  event: CalendarEvent | null
  /** 새로 만들 때 미리 골라둘 날짜. 달력에서 날짜를 짚고 바로 등록할 때 쓴다. */
  initialDate?: DateKey
}

export function CalendarEventFormDialog({
  isOpen,
  onOpenChange,
  coupleId,
  userId,
  event,
  initialDate,
}: CalendarEventFormDialogProps) {
  return (
    // 열릴 때마다(그리고 수정 대상 행이 바뀔 때마다) 다시 마운트시켜 입력값을
    // 초기화한다. AnniversaryFormDialog와 같은 이유.
    <Dialog key={event?.id ?? initialDate ?? 'new'} isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={420}>
      <CalendarEventForm
        onClose={() => onOpenChange(false)}
        coupleId={coupleId}
        userId={userId}
        event={event}
        initialDate={initialDate}
      />
    </Dialog>
  )
}

function CalendarEventForm({
  onClose,
  coupleId,
  userId,
  event,
  initialDate,
}: Omit<CalendarEventFormDialogProps, 'isOpen' | 'onOpenChange'> & { onClose: () => void }) {
  const queryClient = useQueryClient()
  const showToast = useToast()

  const [title, setTitle] = useState(event?.title ?? '')
  const [date, setDate] = useState<DateKey>(
    event?.event_date ?? initialDate ?? toDateKey(startOfToday()),
  )
  const [time, setTime] = useState<TimeKey | undefined>(event?.event_time ?? undefined)
  const [location, setLocation] = useState(event?.location ?? '')
  const [isShared, setIsShared] = useState(event?.is_shared ?? false)

  // "우리 약속" 여부는 등록한 사람만 바꿀 수 있다 — DB RLS가 실제로 막는
  // 규칙과 같다 (calendar_events_update_shared_or_own). 상대가 만든 공유
  // 일정을 열었을 때 이 스위치를 잠가두지 않으면, 꺼서 저장하는 순간
  // 조용히 실패한다.
  const canToggleShared = event == null || event.created_by === userId

  const trimmedTitle = title.trim()
  const trimmedLocation = location.trim()
  const isTitleTooLong = trimmedTitle.length > CALENDAR_TITLE_MAX
  const isLocationTooLong = trimmedLocation.length > CALENDAR_LOCATION_MAX
  const canSubmit = trimmedTitle.length > 0 && !isTitleTooLong && !isLocationTooLong

  const mutation = useMutation({
    mutationFn: (input: CalendarEventInput) =>
      event ? updateCalendarEvent(event.id, input) : createCalendarEvent(coupleId, userId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: calendarEventsQueryKey(coupleId) })
      showToast({ type: 'info', body: event ? '일정을 수정했어요.' : '일정을 등록했어요.' })
      onClose()
    },
    onError: (error) => {
      showToast({
        type: 'error',
        body: error instanceof Error ? error.message : '저장에 실패했어요.',
      })
    },
  })

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if (!canSubmit) return
    mutation.mutate({
      title: trimmedTitle,
      event_date: date,
      event_time: time ?? null,
      location: trimmedLocation ? trimmedLocation : null,
      is_shared: isShared,
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <Layout
        header={
          <DialogHeader title={event ? '일정 수정' : '일정 등록'} onOpenChange={onClose} />
        }
        content={
          <LayoutContent>
            <VStack gap={4}>
              <TextInput
                label="제목"
                htmlName="calendar-event-title"
                placeholder="예: 영화 보기, 병원 예약"
                description={`${CALENDAR_TITLE_MAX}자까지 쓸 수 있어요.`}
                isRequired
                status={
                  isTitleTooLong
                    ? { type: 'error', message: `${CALENDAR_TITLE_MAX}자까지 쓸 수 있어요.` }
                    : undefined
                }
                value={title}
                onChange={setTitle}
              />
              <Field label="날짜" inputID="calendar-event-date">
                <Calendar mode="single" value={date} onChange={setDate} />
              </Field>
              <TimeInput
                label="시간"
                isOptional
                hasClear
                value={time}
                onChange={setTime}
                width="100%"
              />
              <TextInput
                label="장소"
                htmlName="calendar-event-location"
                placeholder="예: 강남역 CGV"
                isOptional
                status={
                  isLocationTooLong
                    ? { type: 'error', message: `${CALENDAR_LOCATION_MAX}자까지 쓸 수 있어요.` }
                    : undefined
                }
                value={location}
                onChange={setLocation}
              />
              <Switch
                label="우리 약속"
                description={
                  canToggleShared
                    ? '켜두면 상대방도 이 일정을 수정하고 지울 수 있어요.'
                    : '상대방이 등록한 일정이라 여기서는 바꿀 수 없어요.'
                }
                value={isShared}
                onChange={setIsShared}
                isDisabled={!canToggleShared}
                labelPosition="start"
                labelSpacing="spread"
                width="100%"
              />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="center" justify="end">
              <Button
                type="button"
                label="취소"
                variant="secondary"
                onClick={onClose}
                isDisabled={mutation.isPending}
              />
              <Button
                type="submit"
                label="저장"
                variant="primary"
                isLoading={mutation.isPending}
                isDisabled={!canSubmit}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </form>
  )
}
