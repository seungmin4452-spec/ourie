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
import { getProfile } from '@/features/onboarding/api/profile'
import { deleteAnniversary } from '../api/anniversary'
import { AnniversaryFormDialog } from '../components/AnniversaryFormDialog'
import { AnniversaryList } from '../components/AnniversaryList'
import { startOfToday, summarizeAll } from '../dday'
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
          등록한 기념일 중 가장 가까운 하나가 홈 화면에 크게 표시돼요.
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
        </>
      )}

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
