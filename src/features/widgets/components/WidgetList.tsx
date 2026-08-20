import { motion, useDragControls, type PanInfo } from 'framer-motion'
import { useRef, useState, type ReactNode } from 'react'

import { widgetMeta } from '../catalog'
import type { WidgetEntry } from '../useHomeWidgets'
import { useLongPress } from '../useLongPress'
import { isWidgetId, type WidgetId, type WidgetSize } from '../types'
import { WidgetCard } from './WidgetCard'

interface WidgetListProps {
  widgets: WidgetEntry[]
  isEditing: boolean
  /** 드래그 중 다른 위젯 위로 겹쳤을 때 — 그 위젯이 있던 자리로 밀어 넣는다. */
  onDragOver: (id: WidgetId, overId: WidgetId) => void
  /** 손잡이에 포커스를 두고 화살표 키를 눌렀을 때의 한 칸 이동. */
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
 * 홈에 올려둔 위젯들을 grid로 그리고, 편집 모드에서 손잡이를 끌어 순서를
 * 바꾼다.
 *
 * 전체 폭 위젯은 두 칸(col-span-2), 절반 폭 위젯은 한 칸을 쓴다. 어느 쪽인지는
 * 위젯마다 저장된 값(useHomeWidgets)이고, 사용자가 편집 모드의 폭 토글로
 * 직접 정한다 — 정해진 규칙으로 자동 배치하지 않는다.
 *
 * **framer-motion의 Reorder를 안 쓴다.** Reorder.Group/Item은 세로 한 줄
 * 목록 전용이라, 드래그 중인 항목을 배열상 바로 다음 항목(2열 grid에서는
 * 대개 같은 줄의 옆 칸)하고만 비교한다 — 아래로 끌면 옆 칸과 자리가 바뀌는
 * 것처럼 보였다 (실제로 겪었던 문제). 대신 각 카드를 자유롭게 끌 수 있는
 * `motion.div`로 두고, 지금 손가락 아래 어느 카드가 깔려 있는지
 * `elementFromPoint`로 직접 찾아 그 자리로 밀어 넣는다 — "밀리고 밀리는"
 * 관계만 맞으면 되므로 정확한 드롭 좌표까지는 계산하지 않는다.
 *
 * `layout`이 나머지 카드들이 자리를 비켜주는 애니메이션을 맡는다 (framer의
 * FLIP 애니메이션 — 배열 순서가 바뀌면 각 카드가 새 자리로 자연스럽게
 * 미끄러진다).
 */
export function WidgetList({
  widgets,
  isEditing,
  onDragOver,
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
        <DraggableWidget
          key={entry.id}
          entry={entry}
          index={index}
          isEditing={isEditing}
          onDragOver={(overId) => onDragOver(entry.id, overId)}
          onMove={(direction) => onMove(entry.id, direction)}
          onRemove={() => onRemove(entry.id)}
          onResize={(size) => onResize(entry.id, size)}
          onLongPress={onLongPress}
          showsOpenAffordance={!isEditing && opensOnTap(entry.id, entry.size)}
          partnerName={partnerName}
        >
          {renderBody(entry.id, entry.size)}
        </DraggableWidget>
      ))}
    </div>
  )
}

interface DraggableWidgetProps {
  entry: WidgetEntry
  index: number
  isEditing: boolean
  onDragOver: (overId: WidgetId) => void
  onMove: (direction: 'up' | 'down') => void
  onRemove: () => void
  onResize: (size: WidgetSize) => void
  onLongPress: () => void
  showsOpenAffordance: boolean
  partnerName?: string | null
  children: ReactNode
}

function DraggableWidget({
  entry,
  index,
  isEditing,
  onDragOver,
  onMove,
  onRemove,
  onResize,
  onLongPress,
  showsOpenAffordance,
  partnerName,
  children,
}: DraggableWidgetProps) {
  const dragControls = useDragControls()
  // 이미 편집 중이면 끈다. 손잡이를 눌러 드래그를 시작하는 동안 다시 켜질
  // 일도, 켤 이유도 없다.
  const longPressProps = useLongPress(onLongPress, !isEditing)
  const meta = widgetMeta(entry.id, partnerName)
  const spanClass = entry.size === 'full' ? 'col-span-2' : 'col-span-1'

  const [isDragging, setIsDragging] = useState(false)
  // 같은 카드 위에 계속 겹쳐 있는 동안 매 프레임 onDragOver를 부르지 않게
  // 마지막으로 처리한 상대를 기억한다.
  const lastOverIdRef = useRef<WidgetId | null>(null)

  function handleDrag(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    // info.point는 페이지 기준(pageX/pageY)이라 elementFromPoint가 쓰는
    // 뷰포트 기준으로 스크롤만큼 되돌린다.
    const x = info.point.x - window.scrollX
    const y = info.point.y - window.scrollY
    const under = document.elementFromPoint(x, y)
    const overEl = under instanceof Element ? under.closest<HTMLElement>('[data-widget-id]') : null
    const overId = overEl?.dataset.widgetId
    if (!overId || !isWidgetId(overId) || overId === entry.id || overId === lastOverIdRef.current) {
      return
    }
    lastOverIdRef.current = overId
    onDragOver(overId)
  }

  return (
    <motion.div
      layout
      data-widget-id={entry.id}
      drag={isEditing}
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0}
      // 드래그를 놓으면 끌던 좌표(x/y transform)를 0으로 되돌린다. layout이
      // 그 사이 바뀐 grid 자리(재배치된 새 칸)로 옮겨주므로, 이걸 안 하면
      // 카드가 놓은 위치에 그대로 떠 있고 자기 칸으로 안 돌아온다.
      dragSnapToOrigin
      onDragStart={() => {
        lastOverIdRef.current = null
        setIsDragging(true)
      }}
      onDrag={handleDrag}
      onDragEnd={() => setIsDragging(false)}
      className={`widget-longpress ${spanClass}`}
      // 드래그 중인 카드 자체가 elementFromPoint에 잡히면 늘 자기 자신
      // 아래에 있는 카드를 못 찾는다 (커서 바로 밑에 자기가 있으니까).
      // pointer-events를 꺼서 그 아래 깔린 카드가 보이게 한다.
      style={{
        position: 'relative',
        zIndex: isDragging ? 20 : undefined,
        pointerEvents: isDragging ? 'none' : undefined,
      }}
      {...longPressProps}
    >
      <WidgetCard
        meta={meta}
        isEditing={isEditing}
        index={index}
        size={entry.size}
        resizable={meta.resizable ?? true}
        onSizeChange={onResize}
        showsOpenAffordance={showsOpenAffordance}
        dragControls={dragControls}
        onMove={onMove}
        onRemove={onRemove}
      >
        {children}
      </WidgetCard>
    </motion.div>
  )
}
