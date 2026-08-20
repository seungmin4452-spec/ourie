import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { VStack } from '@astryxdesign/core/VStack'
import type { DragControls } from 'framer-motion'
import { ChevronRight, Columns2, GripVertical, RectangleHorizontal, X } from 'lucide-react'
import type { KeyboardEvent, ReactNode } from 'react'

import { widgetIcon } from '../catalog'
import type { WidgetMeta, WidgetSize } from '../types'

interface WidgetCardProps {
  meta: WidgetMeta
  /** 편집 모드에서만 손잡이·삭제 버튼이 뜨고 카드가 흔들린다. 평소엔 내용에 집중하게 둔다. */
  isEditing: boolean
  /** 홈에서 몇 번째인지. 흔들림 위상을 엇갈리게 하는 데 쓴다. */
  index: number
  /** 지금 이 위젯이 절반 폭인지 전체 폭인지. 그리드 칸 수와 여백·제목 크기를 정한다. */
  size: WidgetSize
  /** 폭 토글 자체를 보여줄지 (디데이는 false). */
  resizable: boolean
  /** 편집 모드에서 폭 토글을 눌렀을 때. */
  onSizeChange: (size: WidgetSize) => void
  /**
   * 평소 모드에서 카드 전체가 탭을 받는 위젯(소원권, 지도 등 절반 폭에서
   * 요약만 보여주고 누르면 원래 화면이 열리는 것들)에 쉐브런을 보여준다.
   * 편집 중에는 뜨지 않는다 — 그때 카드를 누르는 건 위젯을 옮기는 동작이다.
   */
  showsOpenAffordance?: boolean
  /**
   * 이 카드를 감싼 Reorder.Item의 드래그 스위치. 손잡이를 누를 때만 켜진다
   * (WidgetList.tsx 참고).
   */
  dragControls: DragControls
  /** 손잡이에 포커스를 두고 화살표 키를 눌렀을 때. 끝에서 더 밀면 무시된다. */
  onMove: (direction: 'up' | 'down') => void
  onRemove: () => void
  children: ReactNode
}

/**
 * 홈에 올라가는 위젯 하나의 껍데기.
 *
 * Card를 쓰는 이유가 여기 있다 — 각각 따로 떼고 붙일 수 있는 독립된 조각이기
 * 때문이다. 그래서 위젯 본문은 자기 안에서 다시 Card를 쓰지 않는다.
 *
 * variant는 default다. muted는 페이지 배경(--color-background-body)과 거의
 * 같은 톤이라 카드 경계가 보이지 않았다. default의 흰 배경 + 옅은 그림자라야
 * "홈에 올려둔 위젯"처럼 배경에서 떠 보인다.
 *
 * 절반 폭에서는 여백과 제목 크기를 한 단 줄인다 — 전체 폭과 같은 20px
 * 패딩·20px 제목을 그대로 쓰면 타일 안에서 글자가 카드보다 커 보인다.
 */
export function WidgetCard({
  meta,
  isEditing,
  index,
  size,
  resizable,
  onSizeChange,
  showsOpenAffordance,
  dragControls,
  onMove,
  onRemove,
  children,
}: WidgetCardProps) {
  const isHalf = size === 'half'
  const wiggleClass = isEditing
    ? `widget-wiggle${index % 2 === 1 ? ' widget-wiggle-offset' : ''}`
    : undefined

  function handleHandleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    // 기본 동작(페이지 스크롤)을 막지 않으면 순서를 바꿀 때마다 화면이 같이
    // 튀어서 방금 옮긴 카드를 놓친다.
    event.preventDefault()
    onMove(event.key === 'ArrowUp' ? 'up' : 'down')
  }

  return (
    <Card padding={isHalf ? 4 : 5} variant="default" elevation="low" className={wiggleClass}>
      <VStack gap={isHalf ? 2 : 3}>
        <HStack gap={2} hAlign="between" vAlign="center">
          <HStack gap={1.5} vAlign="center">
            {isEditing && (
              /* Astryx에는 드래그 손잡이에 해당하는 컴포넌트가 없다. IconButton은
                 onClick만 받아서 포인터가 눌리는 순간(onPointerDown)을 잡을 수
                 없는데, 드래그는 바로 그 순간에 시작해야 한다.

                 touch-none이 이 손잡이의 핵심이다. 이것만 터치 제스처를 드래그로
                 넘기고 카드의 나머지 부분은 그대로 페이지 스크롤에 쓰인다 —
                 카드 전체를 드래그 가능하게 두면 편집 중에 홈을 스크롤할 방법이
                 사라진다. 색·모서리·여백은 전부 토큰 기반 유틸리티다. */
              <button
                type="button"
                aria-label={`${meta.title} 위젯 순서 바꾸기. 위/아래 화살표 키로도 옮길 수 있어요.`}
                className="-m-1 flex cursor-grab touch-none items-center rounded-md border-0 bg-transparent p-1 text-secondary active:cursor-grabbing"
                onPointerDown={(event) => dragControls.start(event)}
                onKeyDown={handleHandleKeyDown}
              >
                <GripVertical className="size-4" />
              </button>
            )}
            {widgetIcon(meta.id)}
            <Heading level={isHalf ? 4 : 2} maxLines={1}>
              {meta.title}
            </Heading>
          </HStack>

          {isEditing ? (
            <IconButton
              label={`${meta.title} 위젯 삭제`}
              tooltip="위젯 삭제"
              variant="ghost"
              size="sm"
              icon={<X className="size-4" />}
              onClick={onRemove}
            />
          ) : (
            showsOpenAffordance && (
              <ChevronRight className="size-4 shrink-0 text-secondary" aria-hidden="true" />
            )
          )}
        </HStack>

        {children}

        {/* 폭 토글. 위젯을 추가할 때 미리 정하는 규칙이 아니라, 이미 올려둔
            위젯도 편집 모드에서 언제든 절반↔전체로 바꿀 수 있다. */}
        {isEditing && resizable && (
          <HStack hAlign="end">
            <SegmentedControl
              value={size}
              onChange={(value) => onSizeChange(value as WidgetSize)}
              label={`${meta.title} 위젯 폭`}
              size="sm"
            >
              <SegmentedControlItem
                value="half"
                label="절반 폭"
                isLabelHidden
                icon={<Columns2 className="size-3.5" />}
              />
              <SegmentedControlItem
                value="full"
                label="전체 폭"
                isLabelHidden
                icon={<RectangleHorizontal className="size-3.5" />}
              />
            </SegmentedControl>
          </HStack>
        )}
      </VStack>
    </Card>
  )
}
