import { Badge } from '@astryxdesign/core/Badge'
import { List, ListItem } from '@astryxdesign/core/List'

import { formatDateKey, formatDday, toDateKey, upcomingMilestones } from '../dday'
import type { Anniversary } from '../types'

const MILESTONE_COUNT = 3

interface UpcomingMilestonesProps {
  /** 매일 알림이 세는 바로 그 기준 기념일 (`notification/baseAnniversary.ts`의 규칙으로 고른 것). */
  anniversary: Anniversary
  today: Date
}

/**
 * 기준 기념일로부터 다가오는 100일 단위·1년 단위 마일스톤 몇 개.
 *
 * 등록해두는 기념일이 아니라 그때그때 계산만 한다 — 알림이 이미 이 기준
 * 기념일 하나로 100일·주년 문구를 매일 만들고 있어서(`dday.ts`의
 * `upcomingMilestones` 주석 참고), 여기서는 "다음이 언제인지"를 미리
 * 보여줄 뿐이다. 수정·삭제 대상이 아니므로 목록의 다른 줄과 달리 아이콘
 * 버튼이 없다.
 */
export function UpcomingMilestones({ anniversary, today }: UpcomingMilestonesProps) {
  const milestones = upcomingMilestones(anniversary, today, MILESTONE_COUNT)
  if (milestones.length === 0) return null

  return (
    <List header={`${anniversary.title}, 다가오는 마일스톤`} hasDividers density="balanced">
      {milestones.map((milestone) => (
        <ListItem
          key={milestone.date.getTime()}
          label={milestone.label}
          description={formatDateKey(toDateKey(milestone.date))}
          endContent={<Badge variant="neutral" label={formatDday(milestone.daysUntil)} />}
        />
      ))}
    </List>
  )
}
