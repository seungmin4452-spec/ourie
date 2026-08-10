import { Badge } from '@astryxdesign/core/Badge'
import { HStack } from '@astryxdesign/core/HStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { List, ListItem } from '@astryxdesign/core/List'
import { Pencil, Trash2 } from 'lucide-react'

import {
  formatDateKey,
  formatDayCount,
  formatDday,
  formatMilestone,
  type DdaySummary,
} from '../dday'
import type { Anniversary } from '../types'

interface AnniversaryListProps {
  summaries: DdaySummary[]
  onEdit: (anniversary: Anniversary) => void
  onDelete: (anniversary: Anniversary) => void
}

export function AnniversaryList({ summaries, onEdit, onDelete }: AnniversaryListProps) {
  return (
    <List hasDividers>
      {summaries.map((summary) => (
        <AnniversaryRow
          key={summary.anniversary.id}
          summary={summary}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </List>
  )
}

function AnniversaryRow({
  summary,
  onEdit,
  onDelete,
}: { summary: DdaySummary } & Pick<AnniversaryListProps, 'onEdit' | 'onDelete'>) {
  const { anniversary, daysUntil, yearsAt } = summary
  const milestone = formatMilestone(yearsAt)

  // 기준일과 그 기준일부터 센 D+N을 짝지어 보여준다. 다가오는 주년까지의
  // 카운트다운은 부가 정보라 설명줄로 내린다.
  const upcoming =
    milestone && daysUntil != null ? `${milestone} ${formatDday(daysUntil)}` : null

  return (
    <ListItem
      label={anniversary.title}
      description={[formatDateKey(anniversary.date), upcoming].filter(Boolean).join(' · ')}
      endContent={
        <HStack gap={1} hAlign="center">
          {daysUntil === 0 ? (
            // 오늘이 그 기념일. D+N만으로는 오늘이라는 게 안 드러난다.
            <Badge variant="info" label="D-DAY" />
          ) : (
            <Badge variant="neutral" label={formatDayCount(summary)} />
          )}
          <IconButton
            label={`${anniversary.title} 수정`}
            tooltip="수정"
            variant="ghost"
            size="sm"
            icon={<Pencil className="size-4" />}
            onClick={() => onEdit(anniversary)}
          />
          <IconButton
            label={`${anniversary.title} 삭제`}
            tooltip="삭제"
            variant="ghost"
            size="sm"
            icon={<Trash2 className="size-4" />}
            onClick={() => onDelete(anniversary)}
          />
        </HStack>
      }
    />
  )
}
