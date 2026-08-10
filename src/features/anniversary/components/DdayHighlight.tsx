import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'

import {
  formatDateKey,
  formatDayCount,
  formatDday,
  formatMilestone,
  type DdaySummary,
} from '../dday'

/**
 * 디데이 위젯 안의 큰 숫자 (UI_GUIDE 5.1).
 *
 * 카드는 감싸지 않는다 — 이 컴포넌트를 담는 WidgetCard가 이미 카드이고,
 * 카드를 겹치면 안 된다. 큰 숫자는 기준일을 1일째로 센 D+N이고, 매년
 * 반복하는 기념일이면 다음 주년까지의 카운트다운을 아래에 덧붙인다.
 */
export function DdayHighlight({ summary }: { summary: DdaySummary }) {
  const { anniversary, daysUntil, yearsAt } = summary
  const milestone = formatMilestone(yearsAt)

  return (
    <VStack gap={1} hAlign="center">
      <Text type="supporting">{anniversary.title}</Text>

      <Heading level={3} type="display-2">
        {formatDayCount(summary)}
      </Heading>

      <Text type="supporting" justify="center">
        {formatDateKey(anniversary.date)}부터
      </Text>

      {milestone && daysUntil != null && (
        <Text type="supporting" justify="center">
          {daysUntil === 0 ? `오늘이 ${milestone}이에요` : `${milestone}까지 ${formatDday(daysUntil)}`}
        </Text>
      )}
    </VStack>
  )
}
