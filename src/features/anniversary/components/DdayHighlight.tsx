import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'

import {
  formatDateKey,
  formatDayCount,
  formatUpcomingLabel,
  nearestUpcoming,
  type DdaySummary,
} from '../dday'

/**
 * 디데이 위젯 안의 큰 숫자 (UI_GUIDE 5.1).
 *
 * 카드는 감싸지 않는다 — 이 컴포넌트를 담는 WidgetCard가 이미 카드이고,
 * 카드를 겹치면 안 된다. 큰 숫자는 기준일을 1일째로 센 D+N이고, 그 아래
 * 보조 문구는 `summaries` 전체에서 지나지 않고 가장 먼저 다가오는 기념일을
 * 알려준다 (`formatUpcomingLabel` 주석 참고) — 이 기념일 자신이 가장
 * 가까우면 다음 주년을, 아니면 더 가까운 다른 기념일 이름을 보여준다.
 */
export function DdayHighlight({
  summary,
  summaries,
}: {
  summary: DdaySummary
  summaries: DdaySummary[]
}) {
  const { anniversary } = summary
  const upcomingLabel = formatUpcomingLabel(summary, nearestUpcoming(summaries))

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
