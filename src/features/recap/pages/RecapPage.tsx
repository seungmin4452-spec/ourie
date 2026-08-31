import { Card } from '@astryxdesign/core/Card'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Minus, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'

import { BackButton } from '@/components/common/BackButton'
import { FullscreenLoader } from '@/components/common/FullscreenLoader'
import { PageShell } from '@/components/common/PageShell'
import {
  formatDayCount,
  pickHighlight,
  startOfToday,
  summarizeAll,
  useAnniversaries,
} from '@/features/anniversary'
import { useAuth } from '@/features/auth'
import { usePartner } from '@/features/couple'
import { getProfile } from '@/features/onboarding/api/profile'
import { DISTRICT_COUNT } from '@/features/travel'
import { useHomeWidgets } from '@/features/widgets'
import { useRecapData } from '../hooks/useRecapData'
import {
  clampPeriod,
  comparePeriods,
  computeRecap,
  previousPeriod,
  recapPeriodBounds,
  shiftPeriod,
  type RecapPeriod,
} from '../stats'

type Granularity = RecapPeriod['granularity']

/**
 * 결산 — 한 달 또는 한 해 동안 쌓은 기록을 숫자 몇 개로 돌아본다.
 *
 * 위젯이 아니라 페이지인 이유: 이 화면이 답하는 질문("요즘 어땠지")은 매일
 * 열어볼 것이 아니라 가끔, 특히 월말·연말이나 기념일 즈음에 찾아오는 것이다.
 * 홈에 매일 뜨는 위젯 목록에 얹으면 그 사이 나머지 위젯들 자리만 줄어든다 —
 * 마이페이지처럼 "가끔 찾는 것"들이 모이는 자리로 보냈다 (HomePage 하단 버튼
 * 목록 주석 참고).
 *
 * 카드는 홈에 그 위젯을 올려둔 사람에게만 보인다. 소원권을 안 쓰는 커플에게
 * "소원권 0장"이 매번 뜨면 그 카드는 결산이 아니라 잡음이다 — 홈 구성이 이미
 * "우리가 실제로 쓰는 기능"을 말해주므로 그걸 그대로 따른다. 홈 위젯 구성은
 * 기기별 localStorage 값이라(useHomeWidgets), 같은 커플이라도 상대 기기에서
 * 보는 결산은 카드 구성이 다를 수 있다 — 각자 자기 홈 화면을 보는 것과 같은
 * 원칙이다.
 *
 * 카드 한 켠의 작은 화살표는 바로 이전 기간(월간이면 지난달, 연간이면
 * 작년) 대비 늘었는지 줄었는지다 — 절대 숫자만으로는 "많이 한 편인지"를 알
 * 수 없어서, 결산이 매번 답해야 하는 두 번째 질문이다.
 */
export function RecapPage() {
  const { user } = useAuth()

  const { data: profile, isLoading: isProfileLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: user != null,
  })

  const { data: partner } = usePartner(profile)
  const { data: anniversaries } = useAnniversaries(profile?.couple_id)
  const recap = useRecapData(profile?.couple_id, profile?.id)

  const { widgets: homeWidgets } = useHomeWidgets()
  const addedWidgets = useMemo(
    () => new Set(homeWidgets.map((entry) => entry.id)),
    [homeWidgets],
  )
  const showDday = addedWidgets.has('dday')
  const showCalendar = addedWidgets.has('calendar')
  const showTravel = addedWidgets.has('travel')
  const showPhotomap = addedWidgets.has('photomap')
  // 뱃지는 별도 위젯이 없다 — 두 지도 위젯 중 하나의 뒷면이다(HomePage의
  // TRAVEL_RELATED와 같은 묶음).
  const showBadges = showTravel || showPhotomap
  const showWish = addedWidgets.has('wish')
  const showPoke = addedWidgets.has('poke')
  const showGrid = showCalendar || showTravel || showPhotomap || showWish || showPoke
  const hasAnyWidget = showDday || showGrid

  const [granularity, setGranularity] = useState<Granularity>('year')
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)

  const bounds = recapPeriodBounds(recap.coupleCreatedAt, granularity)
  const requestedPeriod: RecapPeriod =
    granularity === 'year' ? { granularity: 'year', year } : { granularity: 'month', year, month }
  // 조회가 아직 안 끝났거나(min이 잠깐 max와 같다) granularity를 막 바꿔서
  // 저장해둔 year/month가 범위 밖일 수 있다 — 여기서 다시 안쪽으로 붙잡는다.
  const period = clampPeriod(requestedPeriod, bounds)

  function goTo(delta: number) {
    const next = shiftPeriod(period, delta)
    setYear(next.year)
    if (next.granularity === 'month') setMonth(next.month)
  }

  const recapData = useMemo(
    () =>
      profile == null
        ? null
        : {
            selfId: profile.id,
            calendarEvents: recap.calendarEvents,
            travelVisits: recap.travelVisits,
            regionPhotoDates: recap.regionPhotoDates,
            travelBadges: recap.travelBadges,
            wishes: recap.wishes,
            pokes: recap.pokes,
          },
    [profile, recap],
  )

  const counts = useMemo(
    () => (recapData == null ? null : computeRecap(recapData, period)),
    [recapData, period],
  )
  const previousCounts = useMemo(
    () => (recapData == null ? null : computeRecap(recapData, previousPeriod(period))),
    [recapData, period],
  )

  // 선택한 기간의 끝(지금 진행 중인 기간이면 오늘) 기준으로 "며칠째"를 본다 —
  // 지난 기간을 보면서 "오늘 기준" 숫자가 뜨면 그 기간을 돌아보는 화면이
  // 아니게 된다.
  const highlight = useMemo(() => {
    if (!showDday) return null
    const isCurrentPeriod = comparePeriods(period, bounds.max) === 0
    const periodEnd = isCurrentPeriod
      ? startOfToday()
      : period.granularity === 'month'
        ? new Date(period.year, period.month, 0) // 그 달의 마지막 날
        : new Date(period.year, 11, 31)
    return pickHighlight(summarizeAll(anniversaries ?? [], periodEnd))
  }, [showDday, anniversaries, period, bounds.max])

  if (
    isProfileLoading ||
    profile == null ||
    recap.isLoading ||
    counts == null ||
    previousCounts == null
  ) {
    return <FullscreenLoader />
  }

  const partnerName = partner?.name?.trim() || '상대방'
  const wishTotal = counts.myWishCount + counts.partnerWishCount
  const previousWishTotal = previousCounts.myWishCount + previousCounts.partnerWishCount
  const pokeTotal = counts.pokesSent + counts.pokesReceived
  const previousPokeTotal = previousCounts.pokesSent + previousCounts.pokesReceived

  // 그리드에 실제로 뜰 카드만 보고 "이 기간엔 기록이 없어요"를 판단한다.
  // counts 자체에는 안 올려둔 위젯의 수치도 들어 있어서, 그걸 그대로 쓰면
  // 카드 하나 없는 화면에 "기록이 있다"고 나오는 모순이 생긴다.
  const visibleHasActivity =
    (showCalendar && counts.calendarEventCount > 0) ||
    (showTravel && counts.newRegionCount > 0) ||
    (showPhotomap && counts.newRegionPhotoCount > 0) ||
    (showBadges && counts.newBadgeCount > 0) ||
    (showWish && wishTotal > 0) ||
    (showPoke && pokeTotal > 0)

  const comparisonLabel = granularity === 'year' ? '작년' : '지난달'

  return (
    <PageShell gap={5}>
      <BackButton to="/" label="홈" />

      <VStack gap={1}>
        <HStack gap={2} vAlign="center">
          <Sparkles className="size-5" />
          <Heading level={1}>결산</Heading>
        </HStack>
        <Text type="supporting">우리가 쌓은 기록을 돌아봐요.</Text>
      </VStack>

      <SegmentedControl
        value={granularity}
        onChange={(value) => setGranularity(value as Granularity)}
        label="결산 기간 단위"
        layout="fill"
      >
        <SegmentedControlItem value="month" label="월간" />
        <SegmentedControlItem value="year" label="연간" />
      </SegmentedControl>

      <VStack gap={1}>
        <HStack hAlign="between" vAlign="center">
          <IconButton
            label="이전 기간"
            tooltip="이전 기간"
            variant="ghost"
            icon={<ChevronLeft className="size-4" />}
            isDisabled={comparePeriods(period, bounds.min) <= 0}
            onClick={() => goTo(-1)}
          />
          <Heading level={2}>
            {period.granularity === 'year'
              ? `${period.year}년`
              : `${period.year}년 ${period.month}월`}
          </Heading>
          <IconButton
            label="다음 기간"
            tooltip="다음 기간"
            variant="ghost"
            icon={<ChevronRight className="size-4" />}
            isDisabled={comparePeriods(period, bounds.max) >= 0}
            onClick={() => goTo(1)}
          />
        </HStack>
        {showGrid && (
          <Text type="supporting" justify="center">
            {comparisonLabel}과 비교했어요.
          </Text>
        )}
      </VStack>

      {!hasAnyWidget ? (
        <EmptyState
          icon={<Sparkles className="size-6" />}
          title="홈에 위젯을 올려보세요"
          description="디데이·캘린더·소원권처럼 홈에 올려둔 위젯의 기록만 여기 모아 보여드려요."
        />
      ) : (
        <VStack gap={3}>
          {highlight && (
            <Card padding={5} variant="default" elevation="low">
              <VStack gap={1}>
                <Text type="supporting" maxLines={1}>
                  {highlight.anniversary.title}
                </Text>
                <Heading level={2}>{formatDayCount(highlight)}</Heading>
              </VStack>
            </Card>
          )}

          {showGrid &&
            (!visibleHasActivity ? (
              <EmptyState
                icon={<Sparkles className="size-6" />}
                title="이 기간엔 기록이 없어요"
                description="일정, 다녀온 곳, 소원권처럼 쌓아온 기록이 있는 기간을 골라보세요."
              />
            ) : (
              <Grid columns={2} gap={3}>
                {showCalendar && (
                  <RecapCard
                    label="등록한 일정"
                    value={`${counts.calendarEventCount}개`}
                    caption={
                      counts.sharedCalendarEventCount > 0
                        ? `그중 우리 약속 ${counts.sharedCalendarEventCount}개`
                        : undefined
                    }
                    current={counts.calendarEventCount}
                    previous={previousCounts.calendarEventCount}
                  />
                )}
                {showTravel && (
                  <RecapCard
                    label="새로 다녀온 곳"
                    value={`${counts.newRegionCount}곳`}
                    caption={`누적 ${counts.totalRegionCount}/${DISTRICT_COUNT}곳`}
                    current={counts.newRegionCount}
                    previous={previousCounts.newRegionCount}
                  />
                )}
                {showPhotomap && (
                  <RecapCard
                    label="사진으로 채운 곳"
                    value={`${counts.newRegionPhotoCount}곳`}
                    current={counts.newRegionPhotoCount}
                    previous={previousCounts.newRegionPhotoCount}
                  />
                )}
                {showBadges && (
                  <RecapCard
                    label="새로 딴 지역 뱃지"
                    value={`${counts.newBadgeCount}개`}
                    current={counts.newBadgeCount}
                    previous={previousCounts.newBadgeCount}
                  />
                )}
                {showWish && (
                  <RecapCard
                    label="소원권"
                    value={`${wishTotal}장`}
                    caption={`나 ${counts.myWishCount} · ${partnerName} ${counts.partnerWishCount}`}
                    current={wishTotal}
                    previous={previousWishTotal}
                  />
                )}
                {showPoke && (
                  <RecapCard
                    label="콕 찌르기"
                    value={`${pokeTotal}번`}
                    caption={`보낸 ${counts.pokesSent} · 받은 ${counts.pokesReceived}`}
                    current={pokeTotal}
                    previous={previousPokeTotal}
                  />
                )}
              </Grid>
            ))}
        </VStack>
      )}
    </PageShell>
  )
}

interface RecapCardProps {
  label: string
  value: string
  caption?: string
  /** 지금 기간의 값과 지난 기간 값 — 카드 한 켠의 작은 증감 표시에 쓴다. */
  current: number
  previous: number
}

/** 위젯의 WidgetCard와 같은 이유로 height="100%"를 준다 — 같은 줄의 카드가
 * 캡션 유무로 높이가 달라지면 그 줄만 어긋나 보인다. */
function RecapCard({ label, value, caption, current, previous }: RecapCardProps) {
  return (
    <Card padding={4} variant="default" elevation="low" height="100%">
      <VStack gap={1}>
        <HStack gap={2} hAlign="between" vAlign="start">
          <Text type="supporting" maxLines={1}>
            {label}
          </Text>
          <DeltaIndicator current={current} previous={previous} />
        </HStack>
        <Heading level={3}>{value}</Heading>
        {caption && (
          <Text type="supporting" maxLines={1}>
            {caption}
          </Text>
        )}
      </VStack>
    </Card>
  )
}

interface DeltaIndicatorProps {
  current: number
  previous: number
}

/**
 * 지난 기간 대비 늘었는지 줄었는지를 화살표 하나로 작게 보여준다. 줄어든
 * 쪽을 빨간색으로 나무라지 않는다 — 이 앱의 톤은 실적 대시보드가 아니라
 * "우리가 쌓은 기록"이라, 늘어난 쪽만 은은하게 강조한다.
 */
function DeltaIndicator({ current, previous }: DeltaIndicatorProps) {
  const diff = current - previous

  if (diff === 0) {
    return <Minus className="size-3 shrink-0 text-secondary" aria-hidden="true" />
  }

  return (
    <HStack gap={0.5} vAlign="center">
      {diff > 0 ? (
        <ArrowUp className="size-3 shrink-0 text-success" aria-hidden="true" />
      ) : (
        <ArrowDown className="size-3 shrink-0 text-secondary" aria-hidden="true" />
      )}
      <Text type="supporting" size="2xs" hasTabularNumbers>
        {Math.abs(diff)}
      </Text>
    </HStack>
  )
}
