import { Badge } from '@astryxdesign/core/Badge'
import { HStack } from '@astryxdesign/core/HStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
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
  /** 지금 홈에 크게 떠 있는 기념일. 고른 적이 없으면 자동으로 뽑힌 것이 온다. */
  primaryId: string | undefined
  onSelectPrimary: (anniversary: Anniversary) => void
  onEdit: (anniversary: Anniversary) => void
  onDelete: (anniversary: Anniversary) => void
}

/**
 * 기념일 목록. 각 줄의 라디오가 "홈에 크게 뜰 기념일"을 고르는 스위치다.
 *
 * `List`가 아니라 `RadioList`인 이유는 하나만 켜지는 것을 컴포넌트가 보장하기
 * 때문이다. 줄마다 켜고 끄는 스위치를 두면 둘 다 켜거나 둘 다 끈 상태가
 * 만들어지는데, 홈에 크게 뜨는 자리는 하나뿐이라 그런 상태가 존재할 수 없다.
 *
 * 라디오는 왼쪽에 붙는다 (`RadioListItem`이 그렇게 그린다). 오른쪽에는 D+N과
 * 수정·삭제가 이미 줄지어 있어서, 고르는 동그라미까지 그쪽에 밀어 넣으면 무엇을
 * 누르는 건지 알아보기 어려워진다.
 */
export function AnniversaryList({
  summaries,
  primaryId,
  onSelectPrimary,
  onEdit,
  onDelete,
}: AnniversaryListProps) {
  return (
    <RadioList
      label="홈에 크게 보여줄 기념일"
      description="고른 하나가 홈 화면 위젯에 큰 숫자로 떠요."
      value={primaryId ?? ''}
      onChange={(id) => {
        const picked = summaries.find((summary) => summary.anniversary.id === id)
        if (picked) onSelectPrimary(picked.anniversary)
      }}
    >
      {summaries.map((summary) => (
        <AnniversaryRow
          key={summary.anniversary.id}
          summary={summary}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </RadioList>
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
    <RadioListItem
      value={anniversary.id}
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
