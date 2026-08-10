import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useQuery } from '@tanstack/react-query'
import { CalendarHeart, LayoutGrid, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { DefaultAvatar } from '@/components/common/DefaultAvatar'
import { FullscreenLoader } from '@/components/common/FullscreenLoader'
import { PageShell } from '@/components/common/PageShell'
import {
  DdayHighlight,
  pickHighlight,
  startOfToday,
  summarizeAll,
  useAnniversaries,
} from '@/features/anniversary'
import { useAuth } from '@/features/auth'
import { getProfile } from '@/features/onboarding/api/profile'
import { isStandalone, openPwaInstallPage } from '@/features/onboarding/pwaInstall'
import {
  useHomeWidgets,
  widgetMeta,
  WidgetCard,
  WidgetPickerDialog,
  type WidgetId,
} from '@/features/widgets'

export function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [isInstalled] = useState(isStandalone)

  const { widgets, addWidget, removeWidget, moveWidget } = useHomeWidgets()
  const [isEditing, setIsEditing] = useState(false)
  const [isPickerOpen, setIsPickerOpen] = useState(false)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: user != null,
  })

  const { data: anniversaries } = useAnniversaries(profile?.couple_id)

  // 데이터에만 의존한다. 자정을 넘겨 화면을 켜둔 경우가 아니면 "오늘"은
  // 바뀌지 않고, 그 경우에도 조작 한 번이면 다시 계산된다.
  const summaries = useMemo(
    () => summarizeAll(anniversaries ?? [], startOfToday()),
    [anniversaries],
  )
  const highlight = pickHighlight(summaries)

  if (isLoading) {
    return <FullscreenLoader />
  }

  // 위젯 본문은 그 기능을 아는 쪽이 그려야 해서 여기서 나눈다. 껍데기(제목,
  // 삭제 버튼)는 WidgetCard가 전부 맡는다.
  function renderWidgetBody(id: WidgetId) {
    switch (id) {
      case 'dday':
        return highlight ? (
          <VStack gap={3}>
            <DdayHighlight summary={highlight} />
            <Button
              label={
                summaries.length > 1 ? `기념일 ${summaries.length}개 모두 보기` : '기념일 관리'
              }
              variant="ghost"
              width="100%"
              onClick={() => navigate('/anniversaries')}
            />
          </VStack>
        ) : (
          <EmptyState
            isCompact
            icon={<CalendarHeart className="size-6" />}
            title="기념일을 등록해보세요"
            description="처음 만난 날을 등록하면 오늘이 며칠째인지 여기에 크게 표시돼요."
            actions={
              <Button
                label="기념일 등록하기"
                variant="primary"
                onClick={() => navigate('/anniversaries')}
              />
            }
          />
        )
      case 'memories':
        return (
          <Text type="supporting" justify="center">
            사진과 함께 추억을 남기는 타임라인은 준비 중이에요.
          </Text>
        )
      case 'travel':
        return (
          <Text type="supporting" justify="center">
            다녀온 곳을 지도에 모아 보는 기능은 준비 중이에요.
          </Text>
        )
    }
  }

  return (
    <PageShell gap={5}>
      <VStack gap={3} hAlign="center" paddingBlock={4}>
        <span className="size-20 overflow-hidden rounded-2xl border border-border">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="size-full object-cover" />
          ) : (
            <DefaultAvatar className="size-full" />
          )}
        </span>
        <Heading level={1}>{profile?.nickname || 'Ourie'}</Heading>
      </VStack>

      {widgets.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid className="size-8" />}
          title="위젯을 올려보세요"
          description="디데이처럼 보고 싶은 기능만 골라 홈에 둘 수 있어요."
          actions={
            <Button
              label="위젯 추가"
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => setIsPickerOpen(true)}
            />
          }
        />
      ) : (
        widgets.map((id, index) => (
          <WidgetCard
            key={id}
            meta={widgetMeta(id)}
            isEditing={isEditing}
            index={index}
            isFirst={index === 0}
            isLast={index === widgets.length - 1}
            onMoveUp={() => moveWidget(id, 'up')}
            onMoveDown={() => moveWidget(id, 'down')}
            onRemove={() => removeWidget(id)}
          >
            {renderWidgetBody(id)}
          </WidgetCard>
        ))
      )}

      <HStack gap={2}>
        <Button
          label="위젯 추가"
          variant="secondary"
          icon={<Plus className="size-4" />}
          width="100%"
          onClick={() => setIsPickerOpen(true)}
        />
        {widgets.length > 0 && (
          <Button
            label={isEditing ? '편집 완료' : '위젯 편집'}
            variant="ghost"
            width="100%"
            onClick={() => setIsEditing((editing) => !editing)}
          />
        )}
      </HStack>

      <VStack gap={2}>
        <Text type="supporting" justify="center">
          둘만의 공간, Ourie
        </Text>
        <Button
          label="꾸미기 다시 하기"
          variant="secondary"
          width="100%"
          onClick={() => navigate('/onboarding/customize')}
        />
        {/* 서버가 렌더한 설치 페이지로 바로 보낸다. 중간 화면을 두지 않는 이유는
            그 페이지만이 iOS에 커플이 정한 이름을 넘겨줄 수 있기 때문이다.
            이미 홈 화면에서 실행 중이면 감춘다. */}
        {!isInstalled && (
          <Button
            label="홈 화면에 다시 추가하기"
            variant="ghost"
            width="100%"
            onClick={() =>
              void openPwaInstallPage(
                profile?.nickname?.trim() ?? '',
                profile?.avatar_url ?? null,
              )
            }
          />
        )}
      </VStack>

      <WidgetPickerDialog
        isOpen={isPickerOpen}
        onOpenChange={setIsPickerOpen}
        addedWidgets={widgets}
        onAdd={addWidget}
      />
    </PageShell>
  )
}
