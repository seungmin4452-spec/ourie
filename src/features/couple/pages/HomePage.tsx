import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { HStack } from '@astryxdesign/core/HStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useQuery } from '@tanstack/react-query'
import { CalendarHeart, LayoutGrid, Plus, UserRound } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { setWidgetEditMode, useWidgetEditMode } from '@/app/widgetEditMode'
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
import { CalendarWidget } from '@/features/calendar'
import { NotificationPromptDialog } from '@/features/notification'
import { getProfile } from '@/features/onboarding/api/profile'
import { isStandalone, openPwaInstallPage } from '@/features/onboarding/pwaInstall'
import { PokeWidget } from '@/features/poke'
import {
  useHomeWidgets,
  WidgetList,
  WidgetPickerDialog,
  type WidgetId,
} from '@/features/widgets'
import { WishWidget } from '@/features/wish'
import { usePartner } from '../hooks/usePartner'

/**
 * 지도 위젯 둘만 따로 늦게 불러온다.
 *
 * 시도·시군구 도형 데이터가 263KB다. 이 위젯을 홈에 올리지 않은 사람에게까지
 * 첫 화면에서 받게 하면 PWA가 무거워진다 (UI_GUIDE §1 "가벼움"). 정적으로
 * import하지 않아야 별도 청크로 갈라지므로, 배럴 전체를 동적으로 가져온다.
 *
 * 둘이 같은 배럴을 보므로 청크도 하나다 — 도형 데이터를 두 벌 받지 않는다.
 */
const TravelWidget = lazy(async () => ({
  default: (await import('@/features/travel')).TravelWidget,
}))

const PhotoMapWidget = lazy(async () => ({
  default: (await import('@/features/travel')).PhotoMapWidget,
}))

const BadgeWidget = lazy(async () => ({
  default: (await import('@/features/travel')).BadgeWidget,
}))

/**
 * 뱃지 판정. 화면에 아무것도 그리지 않고 다 채운 시도를 알아채 기록한다
 * (BadgeTracker 주석 참고). 지도·뱃지 위젯 중 하나라도 홈에 있을 때만 부른다 —
 * 도형 데이터 청크를 그 사람들만 받으면 된다.
 */
const BadgeTracker = lazy(async () => ({
  default: (await import('@/features/travel')).BadgeTracker,
}))

/**
 * 상대가 지도를 바꾸면 그 순간 따라 바뀌게 하는 구독. 이것도 화면에 아무것도
 * 그리지 않고, 위젯이 아니라 여기서 한 번만 마운트한다 (TravelRealtime 주석).
 */
const TravelRealtime = lazy(async () => ({
  default: (await import('@/features/travel')).TravelRealtime,
}))

/**
 * 지도와 얽힌 위젯들. 하나라도 홈에 있으면 뱃지 판정이 돌고, 지도 변경 구독도
 * 켜진다. 셋 다 없는 사람에게는 둘 다 할 일이 없다.
 */
const TRAVEL_RELATED: WidgetId[] = ['travel', 'photomap', 'badges']

/** 도형 데이터 청크를 받는 동안 위젯 자리에 두는 한 줄. */
function MapLoading() {
  return (
    <Text type="supporting" justify="center">
      지도를 불러오는 중이에요.
    </Text>
  )
}

export function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [isInstalled] = useState(isStandalone)

  const { widgets, addWidget, removeWidget, moveWidget, reorderWidgets } = useHomeWidgets()
  const isEditRequested = useWidgetEditMode()
  const [isPickerOpen, setIsPickerOpen] = useState(false)

  // 마지막 위젯을 지우는 순간까지 편집 도구가 한 프레임 남지 않도록 렌더에서
  // 바로 거른다. 아래 effect는 그 뒤에 스토어를 맞춰준다.
  const isEditing = isEditRequested && widgets.length > 0

  // 편집 모드로 들어가는 길은 위젯을 꾹 누르는 것 하나뿐이라, 마지막 위젯을
  // 지우면 나갈 수도 다시 들어올 수도 없는 상태가 된다. 위젯이 없으면 편집도
  // 없다고 보고 빈 화면 안내로 돌려보낸다.
  useEffect(() => {
    if (widgets.length === 0) setWidgetEditMode(false)
  }, [widgets.length])

  // 편집 상태는 컴포넌트 밖(모듈)에 산다. 홈을 떠날 때 꺼주지 않으면 다른
  // 화면에서도 라이트/다크 버튼이 계속 숨고, 홈으로 돌아왔을 때 흔들리는
  // 카드로 열린다.
  useEffect(() => () => setWidgetEditMode(false), [])

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: user != null,
  })

  // 위젯 제목에 상대방 이름을 넣는다 ("진선이와 다녀온 곳"). 콕 찌르기 위젯도
  // 같은 훅을 쓰므로 조회는 한 번만 나간다.
  const { data: partner } = usePartner(profile)

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
      case 'poke':
        return <PokeWidget profile={profile} />
      case 'wish':
        return <WishWidget profile={profile} />
      case 'calendar':
        return <CalendarWidget profile={profile} />
      case 'memories':
        return (
          <Text type="supporting" justify="center">
            사진과 함께 추억을 남기는 타임라인은 준비 중이에요.
          </Text>
        )
      case 'travel':
        return (
          <Suspense fallback={<MapLoading />}>
            <TravelWidget profile={profile} isEditing={isEditing} />
          </Suspense>
        )
      case 'photomap':
        return (
          <Suspense fallback={<MapLoading />}>
            <PhotoMapWidget profile={profile} isEditing={isEditing} />
          </Suspense>
        )
      case 'badges':
        return (
          <Suspense fallback={<MapLoading />}>
            <BadgeWidget profile={profile} />
          </Suspense>
        )
    }
  }

  return (
    <PageShell gap={5}>
      {/* 편집 도구는 iOS 홈 화면 정리 모드와 같은 자리에 둔다 — 왼쪽 위에
          추가, 오른쪽 위에 완료. PageShell의 첫 자식이어야 위쪽 여백을
          되돌려 화면 맨 위에 붙을 수 있다 (index.css의 .widget-edit-bar). */}
      {isEditing && (
        <HStack className="widget-edit-bar" hAlign="between" vAlign="center">
          <IconButton
            label="위젯 추가"
            tooltip="위젯 추가"
            variant="secondary"
            icon={<Plus className="size-5" />}
            onClick={() => setIsPickerOpen(true)}
          />
          <Button
            label="완료"
            variant="primary"
            onClick={() => setWidgetEditMode(false)}
          />
        </HStack>
      )}

      {/* 앱 아이콘과 앱 이름은 홈 화면 아이콘과 상태바가 이미 말해준다. 위젯이
          첫 화면의 주인공이 되도록 상단에서 뺐다. */}
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
        <VStack gap={3}>
          <WidgetList
            widgets={widgets}
            isEditing={isEditing}
            onReorder={reorderWidgets}
            onMove={moveWidget}
            onRemove={removeWidget}
            onLongPress={() => setWidgetEditMode(true)}
            renderBody={renderWidgetBody}
            partnerName={partner?.name}
          />

          {/* 평소의 홈은 위젯만 보이는 화면이어야 해서, 꾹 누르면 된다는 것만
              한 줄로 알려준다. 편집 중에는 지금 할 수 있는 일로 바뀐다. */}
          <Text type="supporting" justify="center">
            {isEditing
              ? '왼쪽 손잡이를 끌어 순서를 바꾸고, ✕로 지울 수 있어요.'
              : '위젯을 꾹 누르면 추가하거나 지울 수 있어요.'}
          </Text>
        </VStack>
      )}

      <VStack gap={2}>
        <Text type="supporting" justify="center">
          둘만의 공간, Ourie
        </Text>
        {/* 알림 설정처럼 "가끔 찾는 것"들이 모이는 자리. 홈에 버튼을 하나씩
            늘리는 대신 여기로 보낸다. */}
        <Button
          label="마이페이지"
          variant="secondary"
          width="100%"
          icon={<UserRound className="size-4" />}
          onClick={() => navigate('/me')}
        />
        <Button
          label="꾸미기 다시 하기"
          variant="ghost"
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
                profile?.app_name?.trim() ?? '',
                profile?.avatar_url ?? null,
              )
            }
          />
        )}
      </VStack>

      {/* 지도를 다 채운 순간을 알아채 뱃지로 기록한다. 위젯 어느 쪽에도 두지
          않은 이유는 판정이 한 군데서만 일어나야 하기 때문이다 — 지도 위젯과
          뱃지 위젯이 각자 하면 같은 뱃지를 두세 번 청구하고 연출도 겹쳐 뜬다.
          상대의 변경을 구독하는 쪽도 같은 이유로 여기 있다. */}
      {widgets.some((id) => TRAVEL_RELATED.includes(id)) && (
        <Suspense fallback={null}>
          <TravelRealtime profile={profile} />
          <BadgeTracker profile={profile} />
        </Suspense>
      )}

      {/* 앱에 처음 들어온 사람에게 한 번만 뜬다. 알림이 이 앱의 기능 자체라
          찾아 들어가 켜기를 기다릴 수 없다 (NotificationPromptDialog 주석). */}
      <NotificationPromptDialog profile={profile} />

      <WidgetPickerDialog
        isOpen={isPickerOpen}
        onOpenChange={setIsPickerOpen}
        addedWidgets={widgets}
        onAdd={addWidget}
        partnerName={partner?.name}
      />
    </PageShell>
  )
}
