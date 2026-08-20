import { Reorder, useDragControls } from 'framer-motion'
import type { ReactNode } from 'react'

import { widgetMeta } from '../catalog'
import type { WidgetEntry } from '../useHomeWidgets'
import { useLongPress } from '../useLongPress'
import type { WidgetId, WidgetSize } from '../types'
import { WidgetCard } from './WidgetCard'

interface WidgetListProps {
  widgets: WidgetEntry[]
  isEditing: boolean
  /** 드래그가 끝난 뒤의 전체 순서. */
  onReorder: (next: WidgetEntry[]) => void
  /** 손잡이에서 화살표 키를 눌렀을 때의 한 칸 이동. */
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
 * 홈에 올려둔 위젯들을 grid로 그리고, 편집 모드에서 드래그로 순서를 바꾼다.
 *
 * 전체 폭 위젯은 두 칸(col-span-2), 절반 폭 위젯은 한 칸을 쓴다. 어느 쪽인지는
 * 위젯마다 저장된 값(useHomeWidgets)이고, 사용자가 편집 모드의 폭 토글로
 * 직접 정한다 — 정해진 규칙으로 자동 배치하지 않는다.
 *
 * framer-motion의 Reorder를 쓴다. Astryx에는 정렬 가능한 목록이 없고, 손으로
 * 만들면 항목이 자리를 바꿀 때의 애니메이션까지 직접 계산해야 한다 (이미
 * 의존성으로 들어와 있는 라이브러리다).
 *
 * **알려진 한계**: Reorder는 원래 세로 한 줄짜리 목록을 위한 것이라 axis="y"가
 * 드래그 중인 항목의 y 위치만으로 이웃과 맞바꿀지를 정한다. 2열 grid에서는 같은
 * 줄의 두 칸이 y가 같으므로, 드래그로 옮기는 동안 어느 칸과 맞바뀌는지가 살짝
 * 부정확할 수 있다. 정확한 순서가 필요하면 손잡이에 포커스를 두고 화살표
 * 키(onMove)를 쓰면 된다 — 그건 항상 정확하다.
 *
 * Reorder.Group은 `<ul>`, Reorder.Item은 `<li>`로 렌더된다. 항목이 그룹의 직계
 * 자식이어야 순서를 재는 측정이 맞으므로 사이에 VStack을 낄 수 없다. 그래서
 * grid도, 칸 사이 간격도 유틸리티로 준다 — gap-5는 PageShell의 gap={5}와 같은
 * 토큰(4px 배수)이라 다른 페이지 요소들과 리듬이 어긋나지 않는다.
 */
export function WidgetList({
  widgets,
  isEditing,
  onReorder,
  onMove,
  onRemove,
  onResize,
  onLongPress,
  renderBody,
  opensOnTap,
  partnerName,
}: WidgetListProps) {
  return (
    <Reorder.Group
      axis="y"
      values={widgets}
      onReorder={onReorder}
      className="grid grid-cols-2 list-none gap-5 p-0"
    >
      {widgets.map((entry, index) => (
        <SortableWidget
          key={entry.id}
          entry={entry}
          index={index}
          isEditing={isEditing}
          onMove={(direction) => onMove(entry.id, direction)}
          onRemove={() => onRemove(entry.id)}
          onResize={(size) => onResize(entry.id, size)}
          onLongPress={onLongPress}
          showsOpenAffordance={!isEditing && opensOnTap(entry.id, entry.size)}
          partnerName={partnerName}
        >
          {renderBody(entry.id, entry.size)}
        </SortableWidget>
      ))}
    </Reorder.Group>
  )
}

interface SortableWidgetProps {
  entry: WidgetEntry
  index: number
  isEditing: boolean
  onMove: (direction: 'up' | 'down') => void
  onRemove: () => void
  onResize: (size: WidgetSize) => void
  onLongPress: () => void
  showsOpenAffordance: boolean
  partnerName?: string | null
  children: ReactNode
}

function SortableWidget({
  entry,
  index,
  isEditing,
  onMove,
  onRemove,
  onResize,
  onLongPress,
  showsOpenAffordance,
  partnerName,
  children,
}: SortableWidgetProps) {
  const dragControls = useDragControls()
  // 이미 편집 중이면 끈다. 순서를 바꾸려고 손잡이를 쥐고 있는 동안 다시
  // 켜질 일도, 켤 이유도 없다.
  const longPressProps = useLongPress(onLongPress, !isEditing)
  const meta = widgetMeta(entry.id, partnerName)
  const { resizable } = meta
  const spanClass = entry.size === 'full' ? 'col-span-2' : 'col-span-1'

  return (
    // dragListener={false}가 이 화면에서 제일 중요한 한 줄이다. 기본값이면
    // framer가 항목에 touch-action: pan-x를 걸어 세로 터치를 전부 드래그로
    // 가져가고, 그러면 편집 중에 홈을 스크롤할 수 없다. 드래그는 오직 카드의
    // 손잡이(WidgetCard.tsx)가 dragControls.start로 열어줄 때만 시작된다.
    <Reorder.Item
      value={entry}
      dragListener={false}
      dragControls={dragControls}
      className={`widget-longpress ${spanClass}`}
      {...longPressProps}
    >
      <WidgetCard
        meta={meta}
        isEditing={isEditing}
        index={index}
        size={entry.size}
        resizable={resizable ?? true}
        onSizeChange={onResize}
        showsOpenAffordance={showsOpenAffordance}
        dragControls={dragControls}
        onMove={onMove}
        onRemove={onRemove}
      >
        {children}
      </WidgetCard>
    </Reorder.Item>
  )
}
