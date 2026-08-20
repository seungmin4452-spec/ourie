import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { VStack } from '@astryxdesign/core/VStack'
import { ChevronDown, ChevronRight, ChevronUp, Columns2, RectangleHorizontal, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { widgetIcon } from '../catalog'
import type { WidgetMeta, WidgetSize } from '../types'

interface WidgetCardProps {
  meta: WidgetMeta
  /** 편집 모드에서만 이동·삭제 버튼이 뜨고 카드가 흔들린다. 평소엔 내용에 집중하게 둔다. */
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
  /** 목록의 맨 앞/끝인지. 그쪽 이동 버튼을 비활성화한다. */
  canMoveUp: boolean
  canMoveDown: boolean
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
 *
 * **height="100%"가 이 카드가 grid 칸을 꽉 채우게 한다.** 절반 폭 위젯 둘이
 * 한 줄에 나란히 놓일 때, grid 칸 자체는 기본으로(align-items: stretch) 그 줄의
 * 가장 큰 카드에 맞춰 늘어나 있는데, Card가 이걸 안 채우면 짧은 쪽 카드만
 * 위에 붕 뜨고 아래는 빈 채로 남아 둘의 높이가 안 맞아 보였다.
 *
 * **드래그가 아니라 이동 버튼이다.** 2열 grid에서 순서 재기는 framer-motion의
 * Reorder가 원래 세로 한 줄 목록을 위한 것이라 배열상 바로 다음 항목(대개
 * 같은 줄의 옆 칸)과만 비교한다 — 아래로 끌면 옆 칸과 바뀌는 식으로 어긋나
 * 보였다. 자리를 안 옮기고 화살표로만 정확히 한 칸씩 옮기는 편이 grid에서는
 * 더 예측 가능하다 (실제로 겪었던 문제).
 */
export function WidgetCard({
  meta,
  isEditing,
  index,
  size,
  resizable,
  onSizeChange,
  showsOpenAffordance,
  canMoveUp,
  canMoveDown,
  onMove,
  onRemove,
  children,
}: WidgetCardProps) {
  const isHalf = size === 'half'
  const wiggleClass = isEditing
    ? `widget-wiggle${index % 2 === 1 ? ' widget-wiggle-offset' : ''}`
    : undefined

  return (
    <Card
      padding={isHalf ? 4 : 5}
      variant="default"
      elevation="low"
      height="100%"
      className={wiggleClass}
    >
      <VStack gap={isHalf ? 2 : 3}>
        <HStack gap={2} hAlign="between" vAlign="center">
          <HStack gap={1.5} vAlign="center">
            {isEditing && (
              <HStack gap={0} vAlign="center" className="-ms-1.5">
                <IconButton
                  label={`${meta.title} 위젯 위로 옮기기`}
                  tooltip="위로"
                  variant="ghost"
                  size="sm"
                  icon={<ChevronUp className="size-4" />}
                  isDisabled={!canMoveUp}
                  onClick={() => onMove('up')}
                />
                <IconButton
                  label={`${meta.title} 위젯 아래로 옮기기`}
                  tooltip="아래로"
                  variant="ghost"
                  size="sm"
                  icon={<ChevronDown className="size-4" />}
                  isDisabled={!canMoveDown}
                  onClick={() => onMove('down')}
                />
              </HStack>
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
