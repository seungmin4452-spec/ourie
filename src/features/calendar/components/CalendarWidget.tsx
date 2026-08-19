import { Badge } from '@astryxdesign/core/Badge'
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

/** 위젯 자리에는 다가오는 일정 몇 개만. 전부는 /calendar 전체 화면 몫이다. */
const PREVIEW_COUNT = 3

interface CalendarWidgetProps {
  /** 홈이 이미 가져온 내 프로필. 같은 걸 또 조회하지 않으려고 받아 쓴다. */
  profile: Profile | null | undefined
}

export function CalendarWidget({ profile }: CalendarWidgetProps) {
  const navigate = useNavigate()
  const coupleId = profile?.couple_id

  const { data: events, isLoading } = useCalendarEvents(coupleId)

  const upcoming = useMemo(() => splitByToday(events ?? [], startOfToday()).upcoming, [events])

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

  if (upcoming.length === 0) {
    return (
      <EmptyState
        isCompact
        icon={<CalendarDays className="size-6" />}
        title="다가오는 일정이 없어요"
        description="함께할 약속이나 개인 일정을 등록해보세요."
        actions={
          <Button label="일정 등록하기" variant="primary" onClick={() => navigate('/calendar')} />
        }
      />
    )
  }

  return (
    <VStack gap={3}>
      <List hasDividers density="compact">
        {upcoming.slice(0, PREVIEW_COUNT).map((event) => (
          <ListItem
            key={event.id}
            label={event.title}
            description={[formatEventDate(event.event_date), formatEventTime(event.event_time), event.location]
              .filter(Boolean)
              .join(' · ')}
            endContent={event.is_shared ? <Badge variant="info" label="우리 약속" /> : undefined}
          />
        ))}
      </List>
      <Button
        label={upcoming.length > PREVIEW_COUNT ? `일정 ${upcoming.length}개 모두 보기` : '일정 관리'}
        variant="ghost"
        width="100%"
        onClick={() => navigate('/calendar')}
      />
    </VStack>
  )
}
