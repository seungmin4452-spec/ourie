import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { useToast } from '@astryxdesign/core/Toast'
import { VStack } from '@astryxdesign/core/VStack'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarHeart, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'

import { BackButton } from '@/components/common/BackButton'
import { FullscreenLoader } from '@/components/common/FullscreenLoader'
import { PageShell } from '@/components/common/PageShell'
import { useAuth } from '@/features/auth'
import { NotificationSettings, pickBaseAnniversary } from '@/features/notification'
import { getProfile } from '@/features/onboarding/api/profile'
import { deleteAnniversary, setPrimaryAnniversary } from '../api/anniversary'
import { AnniversaryFormDialog } from '../components/AnniversaryFormDialog'
import { AnniversaryList } from '../components/AnniversaryList'
import { UpcomingMilestones } from '../components/UpcomingMilestones'
import { pickHighlight, startOfToday, summarizeAll } from '../dday'
import { anniversariesQueryKey, useAnniversaries } from '../hooks/useAnniversaries'
import type { Anniversary } from '../types'

export function AnniversaryPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const showToast = useToast()

  const [editing, setEditing] = useState<Anniversary | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Anniversary | null>(null)

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: user != null,
  })
  const coupleId = profile?.couple_id ?? null

  const { data: anniversaries, isLoading, error } = useAnniversaries(coupleId)

  // startOfToday()를 렌더 중에 부르므로 의존성은 "오늘"이 아니라 데이터로 잡는다.
  // 날짜가 바뀌는 건 사용자가 자정을 넘겨 이 화면을 켜둔 경우뿐이고, 그때는
  // 아무 조작이나 하면 다시 렌더된다.
  const summaries = useMemo(
    () => summarizeAll(anniversaries ?? [], startOfToday()),
    [anniversaries],
  )

  // 목록의 라디오가 가리킬 곳. 커플이 고른 적이 없으면 홈이 자동으로 뽑는 것과
  // 같은 규칙으로 떨어지므로, 라디오는 언제나 "지금 홈에 떠 있는 그것"을 켠 채로
  // 열린다 — 비어 있는 라디오 그룹을 보여주지 않으려는 것이다.
  const primaryId = pickHighlight(summaries)?.anniversary.id

  // 다가오는 마일스톤은 위젯의 "크게 뜨는 것"이 아니라 알림이 세는 기준
  // 기념일 하나로 계산한다 — 그래야 여기 보이는 다음 마일스톤과 실제로 오는
  // 알림이 같은 날을 가리킨다 (`notification/baseAnniversary.ts`).
  const baseAnniversary = pickBaseAnniversary(anniversaries ?? [])

  const primarySelection = useMutation({
    mutationFn: (anniversary: Anniversary) => setPrimaryAnniversary(anniversary.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: anniversariesQueryKey(coupleId) })
    },
    onError: (error) => {
      showToast({
        type: 'error',
        body: error instanceof Error ? error.message : '변경하지 못했어요.',
      })
    },
  })

  const deletion = useMutation({
    mutationFn: (anniversary: Anniversary) => deleteAnniversary(anniversary.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: anniversariesQueryKey(coupleId) })
      showToast({ type: 'info', body: '기념일을 삭제했어요.' })
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

  function openEdit(anniversary: Anniversary) {
    setEditing(anniversary)
    setIsFormOpen(true)
  }

  if (isLoading || !coupleId || !user) {
    return <FullscreenLoader />
  }

  return (
    <PageShell gap={5}>
      <BackButton to="/" label="홈" />

      <VStack gap={1}>
        <Heading level={1}>기념일</Heading>
        <Text type="supporting">
          홈 화면에 크게 띄우고 매일 알림으로 받을 기념일을 골라두세요. 나머지는
          여기서만 보여요.
        </Text>
      </VStack>

      {error ? (
        // 조회 실패를 "기념일 없음"으로 보여주면 등록해도 계속 비어 보이는
        // 것처럼 읽힌다. 빈 상태와 확실히 구분한다.
        <EmptyState
          icon={<CalendarHeart className="size-8" />}
          title="기념일을 불러오지 못했어요"
          description={error instanceof Error ? error.message : '잠시 후 다시 시도해주세요.'}
        />
      ) : summaries.length === 0 ? (
        <EmptyState
          icon={<CalendarHeart className="size-8" />}
          title="아직 등록한 기념일이 없어요"
          description="처음 만난 날, 사귄 날, 생일처럼 둘이 기억하고 싶은 날을 더해보세요."
          actions={
            <Button
              label="기념일 등록하기"
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={openCreate}
            />
          }
        />
      ) : (
        <>
          <AnniversaryList
            summaries={summaries}
            primaryId={primaryId}
            onSelectPrimary={primarySelection.mutate}
            onEdit={openEdit}
            onDelete={setPendingDelete}
          />
          <Button
            label="기념일 추가"
            variant="secondary"
            icon={<Plus className="size-4" />}
            width="100%"
            onClick={openCreate}
          />

          {baseAnniversary && (
            <UpcomingMilestones anniversary={baseAnniversary} today={startOfToday()} />
          )}
        </>
      )}

      {/* 알림은 기념일에서 파생되는 기능이라 같은 화면에 둔다. 커플이 기념일을
          등록한 바로 그 자리에서 "매일 알려줄까요?"를 만나는 게 자연스럽다. */}
      <VStack gap={2}>
        <Heading level={2}>알림</Heading>
        <NotificationSettings anniversaries={anniversaries ?? []} />
      </VStack>

      <AnniversaryFormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        coupleId={coupleId}
        userId={user.id}
        anniversary={editing}
      />

      <AlertDialog
        isOpen={pendingDelete != null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPendingDelete(null)
        }}
        title="기념일을 삭제할까요?"
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
