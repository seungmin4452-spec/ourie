import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { useToast } from '@astryxdesign/core/Toast'
import { VStack } from '@astryxdesign/core/VStack'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'

import { BackButton } from '@/components/common/BackButton'
import { FullscreenLoader } from '@/components/common/FullscreenLoader'
import { PageShell } from '@/components/common/PageShell'
import { useAuth } from '@/features/auth'
import { getProfile } from '@/features/onboarding/api/profile'
import { deleteCalendarEvent } from '../api/calendar'
import { CalendarEventFormDialog } from '../components/CalendarEventFormDialog'
import { CalendarEventList } from '../components/CalendarEventList'
import { calendarEventsQueryKey, useCalendarEvents } from '../hooks/useCalendarEvents'
import { splitByToday, startOfToday } from '../schedule'
import type { CalendarEvent } from '../types'

export function CalendarPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const showToast = useToast()

  const [editing, setEditing] = useState<CalendarEvent | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<CalendarEvent | null>(null)

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: user != null,
  })
  const coupleId = profile?.couple_id ?? null

  const { data: events, isLoading, error } = useCalendarEvents(coupleId)

  // startOfToday()를 렌더 중에 부르므로 의존성은 "오늘"이 아니라 데이터로
  // 잡는다 (anniversary/AnniversaryPage와 같은 이유).
  const { upcoming, past } = useMemo(() => splitByToday(events ?? [], startOfToday()), [events])

  const deletion = useMutation({
    mutationFn: (event: CalendarEvent) => deleteCalendarEvent(event.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: calendarEventsQueryKey(coupleId) })
      showToast({ type: 'info', body: '일정을 삭제했어요.' })
      setPendingDelete(null)
    },
    onError: (error) => {
      showToast({
        type: 'error',
        body: error instanceof Error ? error.message : '삭제에 실패했어요.',
      })
    },
  })

  function openCreate() {
    setEditing(null)
    setIsFormOpen(true)
  }

  function openEdit(event: CalendarEvent) {
    setEditing(event)
    setIsFormOpen(true)
  }

  if (isLoading || !coupleId || !user) {
    return <FullscreenLoader />
  }

  const isEmpty = upcoming.length === 0 && past.length === 0

  return (
    <PageShell gap={5}>
      <BackButton to="/" label="홈" />

      <VStack gap={1}>
        <Heading level={1}>커플 캘린더</Heading>
        <Text type="supporting">
          서로의 일정을 함께 봐요. "우리 약속"으로 등록하면 상대방도 수정하고 지울 수
          있고, 그렇지 않은 개인 일정은 등록한 사람만 고칠 수 있어요.
        </Text>
      </VStack>

      {error ? (
        // 조회 실패를 "일정 없음"으로 보여주면 등록해도 계속 비어 보이는 것처럼
        // 읽힌다. 빈 상태와 확실히 구분한다 (anniversary/AnniversaryPage와 같은 이유).
        <EmptyState
          icon={<CalendarDays className="size-8" />}
          title="일정을 불러오지 못했어요"
          description={error instanceof Error ? error.message : '잠시 후 다시 시도해주세요.'}
        />
      ) : isEmpty ? (
        <EmptyState
          icon={<CalendarDays className="size-8" />}
          title="아직 등록한 일정이 없어요"
          description="함께할 약속이나 개인 일정을 등록해보세요."
          actions={
            <Button
              label="일정 등록하기"
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={openCreate}
            />
          }
        />
      ) : (
        <>
          {upcoming.length > 0 && (
            <CalendarEventList
              header="다가오는 일정"
              events={upcoming}
              userId={user.id}
              onEdit={openEdit}
              onDelete={setPendingDelete}
            />
          )}
          {past.length > 0 && (
            <CalendarEventList
              header="지난 일정"
              events={past}
              userId={user.id}
              onEdit={openEdit}
              onDelete={setPendingDelete}
            />
          )}
          <Button
            label="일정 추가"
            variant="secondary"
            icon={<Plus className="size-4" />}
            width="100%"
            onClick={openCreate}
          />
        </>
      )}

      <CalendarEventFormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        coupleId={coupleId}
        userId={user.id}
        event={editing}
      />

      <AlertDialog
        isOpen={pendingDelete != null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPendingDelete(null)
        }}
        title="일정을 삭제할까요?"
        description={
          pendingDelete ? `"${pendingDelete.title}"을(를) 삭제하면 되돌릴 수 없어요.` : ''
        }
        actionLabel="삭제"
        cancelLabel="취소"
        isActionLoading={deletion.isPending}
        onAction={() => {
          if (pendingDelete) deletion.mutate(pendingDelete)
        }}
      />
    </PageShell>
  )
}
