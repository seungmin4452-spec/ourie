import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { List, ListItem } from '@astryxdesign/core/List'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { CalendarDays } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import type { Profile } from '@/features/onboarding/api/profile'
import { useCalendarEvents } from '../hooks/useCalendarEvents'
import { formatEventDate, formatEventTime, splitByToday, startOfToday } from '../schedule'

/** 위젯 자리에는 다가오는 약속 몇 개만. 전부(개인 일정 포함)는 /calendar 몫이다. */
const PREVIEW_COUNT = 3

interface CalendarWidgetProps {
  /** 홈이 이미 가져온 내 프로필. 같은 걸 또 조회하지 않으려고 받아 쓴다. */
  profile: Profile | null | undefined
  /**
   * 절반 폭 타일일 때 true. 목록을 다가오는 약속 1개로 줄이고, "모두 보기"
   * 버튼 대신 타일 전체를 누르면 지금과 같은 /calendar로 간다.
   */
  isCompact?: boolean
}

/**
 * 홈 위젯 "커플 캘린더"의 본문.
 *
 * 개인 일정이 아니라 **"우리 약속"(is_shared)만** 보여준다. 홈은 둘이 함께
 * 보는 자리라 개인 일정까지 올라오면 상대방 화면에 내 개인 일정이 노출되고,
 * 정작 같이 챙겨야 할 약속은 그 사이에 묻힌다. 개인 일정을 포함한 전체
 * 목록은 "/calendar"에서 본다.
 */
export function CalendarWidget({ profile, isCompact }: CalendarWidgetProps) {
  const navigate = useNavigate()
  const coupleId = profile?.couple_id

  const { data: events, isLoading } = useCalendarEvents(coupleId)

  const upcomingShared = useMemo(
    () => splitByToday(events ?? [], startOfToday()).upcoming.filter((event) => event.is_shared),
    [events],
  )

  if (coupleId == null) {
    return (
      <Text type="supporting" justify="center">
        커플이 연결되면 일정을 함께 볼 수 있어요.
      </Text>
    )
  }

  if (isLoading) {
    return (
      <Text type="supporting" justify="center">
        일정을 불러오는 중이에요.
      </Text>
    )
  }

  if (upcomingShared.length === 0) {
    return (
      <EmptyState
        isCompact
        icon={<CalendarDays className="size-6" />}
        title="다가오는 우리 약속이 없어요"
        description="함께할 약속을 등록해보세요."
        actions={
          <Button label="약속 등록하기" variant="primary" onClick={() => navigate('/calendar')} />
        }
      />
    )
  }

  const previewCount = isCompact ? 1 : PREVIEW_COUNT

  const list = (
    <List hasDividers density="compact">
      {upcomingShared.slice(0, previewCount).map((event) => (
        <ListItem
          key={event.id}
          label={event.title}
          description={[formatEventDate(event.event_date), formatEventTime(event.event_time), event.location]
            .filter(Boolean)
            .join(' · ')}
        />
      ))}
    </List>
  )

  if (isCompact) {
    // "모두 보기" 버튼을 넣을 자리가 없다. 타일 전체를 누르면 그 버튼과 같은
    // 곳(/calendar)으로 간다.
    return (
      <button
        type="button"
        className="w-full cursor-pointer border-0 bg-transparent p-0 text-start"
        onClick={() => navigate('/calendar')}
      >
        {list}
      </button>
    )
  }

  return (
    <VStack gap={3}>
      {list}
      <Button
        label={
          upcomingShared.length > PREVIEW_COUNT
            ? `우리 약속 ${upcomingShared.length}개 모두 보기`
            : '캘린더 전체 보기'
        }
        variant="ghost"
        width="100%"
        onClick={() => navigate('/calendar')}
      />
    </VStack>
  )
}
