import { Reorder, useDragControls } from 'framer-motion'
import type { ReactNode } from 'react'

import { widgetMeta } from '../catalog'
import type { WidgetId } from '../types'
import { useLongPress } from '../useLongPress'
import { WidgetCard } from './WidgetCard'

interface WidgetListProps {
  widgets: WidgetId[]
  isEditing: boolean
  /** 드래그가 끝난 뒤의 전체 순서. */
  onReorder: (next: WidgetId[]) => void
  /** 손잡이에서 화살표 키를 눌렀을 때의 한 칸 이동. */
  onMove: (id: WidgetId, direction: 'up' | 'down') => void
  onRemove: (id: WidgetId) => void
  /** 위젯을 꾹 눌렀을 때 — 편집 모드로 들어가는 유일한 입구다. */
  onLongPress: () => void
  /** 위젯 본문은 그 기능을 아는 쪽(HomePage)이 그린다. */
  renderBody: (id: WidgetId) => ReactNode
}

/**
 * 홈에 올려둔 위젯들을 순서대로 그리고, 편집 모드에서 드래그로 순서를 바꾼다.
 *
 * framer-motion의 Reorder를 쓴다. Astryx에는 정렬 가능한 목록이 없고, 손으로
 * 만들면 항목이 자리를 바꿀 때의 애니메이션까지 직접 계산해야 한다 (이미
 * 의존성으로 들어와 있는 라이브러리다).
 *
 * Reorder.Group은 `<ul>`, Reorder.Item은 `<li>`로 렌더된다. 항목이 그룹의 직계
 * 자식이어야 순서를 재는 측정이 맞으므로 사이에 VStack을 낄 수 없다. 그래서
 * 간격만 유틸리티로 준다 — gap-5는 PageShell의 gap={5}와 같은 토큰(4px 배수)이라
 * 다른 페이지 요소들과 리듬이 어긋나지 않는다.
 */
export function WidgetList({
  widgets,
  isEditing,
  onReorder,
  onMove,
  onRemove,
  onLongPress,
  renderBody,
}: WidgetListProps) {
  return (
    <Reorder.Group
      axis="y"
      values={widgets}
      onReorder={onReorder}
      className="flex list-none flex-col gap-5 p-0"
    >
      {widgets.map((id, index) => (
        <SortableWidget
          key={id}
          id={id}
          index={index}
          isEditing={isEditing}
          onMove={(direction) => onMove(id, direction)}
          onRemove={() => onRemove(id)}
          onLongPress={onLongPress}
        >
          {renderBody(id)}
        </SortableWidget>
      ))}
    </Reorder.Group>
  )
}

interface SortableWidgetProps {
  id: WidgetId
  index: number
  isEditing: boolean
  onMove: (direction: 'up' | 'down') => void
  onRemove: () => void
  onLongPress: () => void
  children: ReactNode
}

function SortableWidget({
  id,
  index,
  isEditing,
  onMove,
  onRemove,
  onLongPress,
  children,
}: SortableWidgetProps) {
  const dragControls = useDragControls()
  // 이미 편집 중이면 끈다. 순서를 바꾸려고 손잡이를 쥐고 있는 동안 다시
  // 켜질 일도, 켤 이유도 없다.
  const longPressProps = useLongPress(onLongPress, !isEditing)

  return (
    // dragListener={false}가 이 화면에서 제일 중요한 한 줄이다. 기본값이면
    // framer가 항목에 touch-action: pan-x를 걸어 세로 터치를 전부 드래그로
    // 가져가고, 그러면 편집 중에 홈을 스크롤할 수 없다. 드래그는 오직 카드의
    // 손잡이(WidgetCard.tsx)가 dragControls.start로 열어줄 때만 시작된다.
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={dragControls}
      className="widget-longpress"
      {...longPressProps}
    >
      <WidgetCard
        meta={widgetMeta(id)}
        isEditing={isEditing}
        index={index}
        dragControls={dragControls}
        onMove={onMove}
        onRemove={onRemove}
      >
        {children}
      </WidgetCard>
    </Reorder.Item>
  )
}
