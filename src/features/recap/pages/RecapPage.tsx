import { Card } from '@astryxdesign/core/Card'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
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
import { computeRecap, recapYearRange } from '../stats'

/**
 * 연간 결산 — 한 해 동안 쌓은 기록을 숫자 몇 개로 돌아본다.
 *
 * 위젯이 아니라 페이지인 이유: 이 화면이 답하는 질문("올해 어땠지")은 매일
 * 열어볼 것이 아니라 가끔, 특히 연말이나 기념일 즈음에 찾아오는 것이다. 홈에
 * 매일 뜨는 위젯 목록에 일 년에 몇 번 찾을 화면을 얹으면 그 사이 나머지
 * 위젯들 자리만 줄어든다 — 마이페이지처럼 "가끔 찾는 것"들이 모이는 자리로
 * 보냈다 (HomePage 하단 버튼 목록 주석 참고).
 *
 * 카드는 홈에 그 위젯을 올려둔 사람에게만 보인다. 소원권을 안 쓰는 커플에게
 * "소원권 0장"이 매번 뜨면 그 카드는 결산이 아니라 잡음이다 — 홈 구성이 이미
 * "우리가 실제로 쓰는 기능"을 말해주므로 그걸 그대로 따른다. 홈 위젯 구성은
 * 기기별 localStorage 값이라(useHomeWidgets), 같은 커플이라도 상대 기기에서
 * 보는 결산은 카드 구성이 다를 수 있다 — 각자 자기 홈 화면을 보는 것과 같은
 * 원칙이다.
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

  const { minYear, maxYear } = recapYearRange(recap.coupleCreatedAt)
  const [requestedYear, setRequestedYear] = useState(() => new Date().getFullYear())
  // 커플이 생긴 해를 알기 전(조회 중)에는 minYear가 잠깐 maxYear와 같다.
  // 조회가 끝나 범위가 넓어지면 여기서 다시 안쪽으로 붙잡아둔다.
  const year = Math.min(Math.max(requestedYear, minYear), maxYear)

  const counts = useMemo(
    () =>
      profile == null
        ? null
        : computeRecap({
            year,
            selfId: profile.id,
            calendarEvents: recap.calendarEvents,
            travelVisits: recap.travelVisits,
            regionPhotoDates: recap.regionPhotoDates,
            travelBadges: recap.travelBadges,
            wishes: recap.wishes,
            pokes: recap.pokes,
          }),
    [profile, year, recap],
  )

  // 선택한 해 마지막 날(올해면 오늘) 기준으로 "며칠째"를 본다 — 지난 해를
  // 보면서 "오늘 기준" 숫자가 뜨면 그 해를 돌아보는 화면이 아니게 된다.
  // dday 위젯을 안 올려둔 사람에게는 애초에 계산할 이유가 없다.
  const highlight = useMemo(() => {
    if (!showDday) return null
    const yearEnd = year === new Date().getFullYear() ? startOfToday() : new Date(year, 11, 31)
    return pickHighlight(summarizeAll(anniversaries ?? [], yearEnd))
  }, [showDday, anniversaries, year])

  if (isProfileLoading || profile == null || recap.isLoading || counts == null) {
    return <FullscreenLoader />
  }

  const partnerName = partner?.name?.trim() || '상대방'

  // 그리드에 실제로 뜰 카드만 보고 "이 해엔 기록이 없어요"를 판단한다.
  // counts 자체에는 안 올려둔 위젯의 수치도 들어 있어서, 그걸 그대로 쓰면
  // 카드 하나 없는 화면에 "기록이 있다"고 나오는 모순이 생긴다.
  const visibleHasActivity =
    (showCalendar && counts.calendarEventCount > 0) ||
    (showTravel && counts.newRegionCount > 0) ||
    (showPhotomap && counts.newRegionPhotoCount > 0) ||
    (showBadges && counts.newBadgeCount > 0) ||
    (showWish && (counts.myWishCount > 0 || counts.partnerWishCount > 0)) ||
    (showPoke && (counts.pokesSent > 0 || counts.pokesReceived > 0))

  return (
    <PageShell gap={5}>
      <BackButton to="/" label="홈" />

      <VStack gap={1}>
        <HStack gap={2} vAlign="center">
          <Sparkles className="size-5" />
          <Heading level={1}>연간 결산</Heading>
        </HStack>
        <Text type="supporting">한 해 동안 우리가 쌓은 기록이에요.</Text>
      </VStack>

      <HStack hAlign="between" vAlign="center">
        <IconButton
          label="이전 해"
          tooltip="이전 해"
          variant="ghost"
          icon={<ChevronLeft className="size-4" />}
          isDisabled={year <= minYear}
          onClick={() => setRequestedYear(year - 1)}
        />
        <Heading level={2}>{year}년</Heading>
        <IconButton
          label="다음 해"
          tooltip="다음 해"
          variant="ghost"
          icon={<ChevronRight className="size-4" />}
          isDisabled={year >= maxYear}
          onClick={() => setRequestedYear(year + 1)}
        />
      </HStack>

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
                title="이 해엔 기록이 없어요"
                description="일정, 다녀온 곳, 소원권처럼 쌓아온 기록이 있는 해를 골라보세요."
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
                  />
                )}
                {showTravel && (
                  <RecapCard
                    label="새로 다녀온 곳"
                    value={`${counts.newRegionCount}곳`}
                    caption={`누적 ${counts.totalRegionCount}/${DISTRICT_COUNT}곳`}
                  />
                )}
                {showPhotomap && (
                  <RecapCard label="사진으로 채운 곳" value={`${counts.newRegionPhotoCount}곳`} />
                )}
                {showBadges && (
                  <RecapCard label="새로 딴 지역 뱃지" value={`${counts.newBadgeCount}개`} />
                )}
                {showWish && (
                  <RecapCard
                    label="소원권"
                    value={`나 ${counts.myWishCount}장`}
                    caption={`${partnerName} ${counts.partnerWishCount}장`}
                  />
                )}
                {showPoke && (
                  <RecapCard
                    label="콕 찌르기"
                    value={`보낸 ${counts.pokesSent}번`}
                    caption={`받은 ${counts.pokesReceived}번`}
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
}

/** 위젯의 WidgetCard와 같은 이유로 height="100%"를 준다 — 같은 줄의 카드가
 * 캡션 유무로 높이가 달라지면 그 줄만 어긋나 보인다. */
function RecapCard({ label, value, caption }: RecapCardProps) {
  return (
    <Card padding={4} variant="default" elevation="low" height="100%">
      <VStack gap={1}>
        <Text type="supporting" maxLines={1}>
          {label}
        </Text>
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
