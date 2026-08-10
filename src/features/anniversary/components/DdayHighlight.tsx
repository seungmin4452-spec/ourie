import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'

import { formatDateKey, formatDday, formatMilestone, toDateKey, type DdaySummary } from '../dday'

/**
 * 홈 화면 상단의 큰 숫자 (UI_GUIDE 5.1). 가장 가까이 다가온 기념일을 보여주고,
 * 기준일이 이미 지났으면 그 아래에 함께한 날 수를 붙인다.
 */
export function DdayHighlight({ summary }: { summary: DdaySummary }) {
  const { anniversary, daysUntil, daysSince, nextDate, yearsAt } = summary
  const milestone = formatMilestone(yearsAt)

  // 매년 반복하는 기념일은 다음 기념일이 등록된 날짜와 다른 날이고,
  // 카운트다운이 가리키는 것도 그 다가오는 날이다.
  const shownDate = nextDate ? toDateKey(nextDate) : anniversary.date

  return (
    <Card padding={6} variant="muted">
      <VStack gap={2} hAlign="center">
        <Text type="supporting">{anniversary.title}</Text>

        <Heading level={2} type="display-2">
          {daysUntil == null ? '지난 기념일' : formatDday(daysUntil)}
        </Heading>

        <Text type="supporting" justify="center">
          {formatDateKey(shownDate)}
          {milestone ? ` · ${milestone}` : ''}
        </Text>

        {daysSince != null && (
          <Text type="supporting" justify="center">
            함께한 지 {daysSince.toLocaleString('ko-KR')}일째
          </Text>
        )}
      </VStack>
    </Card>
  )
}
