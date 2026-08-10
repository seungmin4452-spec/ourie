import { Badge } from '@astryxdesign/core/Badge'
import { HStack } from '@astryxdesign/core/HStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { List, ListItem } from '@astryxdesign/core/List'
import { Text } from '@astryxdesign/core/Text'
import { Pencil, Trash2 } from 'lucide-react'

import { formatDateKey, formatDday, formatMilestone, toDateKey, type DdaySummary } from '../dday'
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
  const { anniversary, daysUntil, nextDate, yearsAt } = summary
  const milestone = formatMilestone(yearsAt)
  const shownDate = nextDate ? toDateKey(nextDate) : anniversary.date

  return (
    <ListItem
      label={anniversary.title}
      description={[formatDateKey(shownDate), milestone].filter(Boolean).join(' · ')}
      endContent={
        <HStack gap={1} hAlign="center">
          {daysUntil == null ? (
            // 이미 지나간 일회성 기념일. 남은 카운트다운이 없으므로
            // 날짜만 보여준다.
            <Text type="supporting">지남</Text>
          ) : (
            <Badge variant={daysUntil === 0 ? 'info' : 'neutral'} label={formatDday(daysUntil)} />
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
