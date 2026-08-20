import type { ReactNode } from 'react'

import { widgetMeta } from '../catalog'
import type { WidgetEntry } from '../useHomeWidgets'
import { useLongPress } from '../useLongPress'
import type { WidgetId, WidgetSize } from '../types'
import { WidgetCard } from './WidgetCard'

interface WidgetListProps {
  widgets: WidgetEntry[]
  isEditing: boolean
  /** 이동 버튼을 눌렀을 때의 한 칸 이동. */
  onMove: (id: WidgetId, direction: 'up' | 'down') => void
  onRemove: (id: WidgetId) => void
  /** 편집 모드의 폭 토글을 눌렀을 때. */
  onResize: (id: WidgetId, size: WidgetSize) => void
  /** 위젯을 꾹 눌렀을 때 — 편집 모드로 들어가는 유일한 입구다. */
  onLongPress: () => void
  /** 위젯 본문은 그 기능을 아는 쪽(HomePage)이 그린다. */
  renderBody: (id: WidgetId, size: WidgetSize) => ReactNode
  /** 절반 폭에서 카드 전체가 탭을 받는 위젯(HomePage.tsx의 OPENS_ON_TAP)에 쉐브런을 보여준다. */
  opensOnTap: (id: WidgetId, size: WidgetSize) => boolean
  /** 제목에 상대방 이름을 넣는 위젯이 있다 (catalog.tsx의 widgetMeta 참고). */
  partnerName?: string | null
}

/**
 * 홈에 올려둔 위젯들을 grid로 그린다.
 *
 * 전체 폭 위젯은 두 칸(col-span-2), 절반 폭 위젯은 한 칸을 쓴다. 어느 쪽인지는
 * 위젯마다 저장된 값(useHomeWidgets)이고, 사용자가 편집 모드의 폭 토글로
 * 직접 정한다 — 정해진 규칙으로 자동 배치하지 않는다.
 *
 * **드래그가 아니라 WidgetCard의 위/아래 이동 버튼으로 순서를 바꾼다.**
 * framer-motion의 Reorder는 세로 한 줄 목록을 위한 것이라, 배열상 바로 다음
 * 항목(2열 grid에서는 대개 같은 줄의 옆 칸)하고만 비교해서 아래로 끌면 옆
 * 칸과 자리가 바뀌는 것처럼 보였다 (실제로 겪었던 문제). 화살표 버튼은
 * 자리를 옮기지 않고 배열에서 정확히 한 칸만 옮기므로 grid에서도 항상
 * 예측 가능하다.
 */
export function WidgetList({
  widgets,
  isEditing,
  onMove,
  onRemove,
  onResize,
  onLongPress,
  renderBody,
  opensOnTap,
  partnerName,
}: WidgetListProps) {
  return (
    <div className="grid grid-cols-2 gap-5">
      {widgets.map((entry, index) => (
        <GridWidget
          key={entry.id}
          entry={entry}
          index={index}
          total={widgets.length}
          isEditing={isEditing}
          onMove={(direction) => onMove(entry.id, direction)}
          onRemove={() => onRemove(entry.id)}
          onResize={(size) => onResize(entry.id, size)}
          onLongPress={onLongPress}
          showsOpenAffordance={!isEditing && opensOnTap(entry.id, entry.size)}
          partnerName={partnerName}
        >
          {renderBody(entry.id, entry.size)}
        </GridWidget>
      ))}
    </div>
  )
}

interface GridWidgetProps {
  entry: WidgetEntry
  index: number
  total: number
  isEditing: boolean
  onMove: (direction: 'up' | 'down') => void
  onRemove: () => void
  onResize: (size: WidgetSize) => void
  onLongPress: () => void
  showsOpenAffordance: boolean
  partnerName?: string | null
  children: ReactNode
}

function GridWidget({
  entry,
  index,
  total,
  isEditing,
  onMove,
  onRemove,
  onResize,
  onLongPress,
  showsOpenAffordance,
  partnerName,
  children,
}: GridWidgetProps) {
  // 이미 편집 중이면 끈다. 위젯을 옮기거나 지우려고 버튼을 누르는 동안
  // 다시 켜질 일도, 켤 이유도 없다.
  const longPressProps = useLongPress(onLongPress, !isEditing)
  const meta = widgetMeta(entry.id, partnerName)
  const spanClass = entry.size === 'full' ? 'col-span-2' : 'col-span-1'

  return (
    <div className={`widget-longpress ${spanClass}`} {...longPressProps}>
      <WidgetCard
        meta={meta}
        isEditing={isEditing}
        index={index}
        size={entry.size}
        resizable={meta.resizable ?? true}
        onSizeChange={onResize}
        showsOpenAffordance={showsOpenAffordance}
        canMoveUp={index > 0}
        canMoveDown={index < total - 1}
        onMove={onMove}
        onRemove={onRemove}
      >
        {children}
      </WidgetCard>
    </div>
  )
}
