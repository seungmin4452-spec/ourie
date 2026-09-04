import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'

import {
  formatDateKey,
  formatDayCount,
  formatUpcomingLabel,
  nextUpcomingEvent,
  startOfToday,
  type DdaySummary,
} from '../dday'

/**
 * 디데이 위젯 안의 큰 숫자 (UI_GUIDE 5.1).
 *
 * 카드는 감싸지 않는다 — 이 컴포넌트를 담는 WidgetCard가 이미 카드이고,
 * 카드를 겹치면 안 된다. 큰 숫자는 기준일을 1일째로 센 D+N이고, 그 아래
 * 보조 문구는 다음으로 다가오는 것을 알려준다 (`nextUpcomingEvent` 주석
 * 참고) — 기준 기념일이면 다음 100일·1년 단위 마일스톤을, 다른 기념일이
 * 더 가까우면 그 이름을 보여준다. 둘 다 등록해두지 않아도 계산만으로 나온다.
 */
export function DdayHighlight({
  summary,
  summaries,
}: {
  summary: DdaySummary
  summaries: DdaySummary[]
}) {
  const { anniversary } = summary
  const upcomingLabel = formatUpcomingLabel(nextUpcomingEvent(summary, summaries, startOfToday()))

  return (
    <VStack gap={1} hAlign="center">
      <Text type="supporting">{anniversary.title}</Text>

      <Heading level={3} type="display-2">
        {formatDayCount(summary)}
      </Heading>

      <Text type="supporting" justify="center">
        {formatDateKey(anniversary.date)}부터
      </Text>

      {upcomingLabel && (
        <Text type="supporting" justify="center">
          {upcomingLabel}
        </Text>
      )}
    </VStack>
  )
}
