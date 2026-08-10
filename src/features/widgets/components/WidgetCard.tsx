import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { VStack } from '@astryxdesign/core/VStack'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { widgetIcon } from '../catalog'
import type { WidgetMeta } from '../types'

interface WidgetCardProps {
  meta: WidgetMeta
  /** 편집 모드에서만 삭제·순서 버튼이 뜨고 카드가 흔들린다. 평소엔 내용에 집중하게 둔다. */
  isEditing: boolean
  /** 홈에서 몇 번째인지. 흔들림 위상을 엇갈리게 하는 데 쓴다. */
  index: number
  /** 맨 위/맨 아래면 그 방향 버튼을 눌러도 갈 곳이 없다. */
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
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
 */
export function WidgetCard({
  meta,
  isEditing,
  index,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
  children,
}: WidgetCardProps) {
  const wiggleClass = isEditing
    ? `widget-wiggle${index % 2 === 1 ? ' widget-wiggle-offset' : ''}`
    : undefined

  return (
    <Card padding={5} variant="default" elevation="low" className={wiggleClass}>
      <VStack gap={3}>
        <HStack gap={2} hAlign="between" vAlign="center">
          <HStack gap={1.5} vAlign="center">
            {widgetIcon(meta.id)}
            <Heading level={2}>{meta.title}</Heading>
          </HStack>

          {isEditing && (
            <HStack gap={0.5} vAlign="center">
              <IconButton
                label={`${meta.title} 위젯 위로 옮기기`}
                tooltip="위로"
                variant="ghost"
                size="sm"
                isDisabled={isFirst}
                icon={<ChevronUp className="size-4" />}
                onClick={onMoveUp}
              />
              <IconButton
                label={`${meta.title} 위젯 아래로 옮기기`}
                tooltip="아래로"
                variant="ghost"
                size="sm"
                isDisabled={isLast}
                icon={<ChevronDown className="size-4" />}
                onClick={onMoveDown}
              />
              <IconButton
                label={`${meta.title} 위젯 삭제`}
                tooltip="위젯 삭제"
                variant="ghost"
                size="sm"
                icon={<X className="size-4" />}
                onClick={onRemove}
              />
            </HStack>
          )}
        </HStack>

        {children}
      </VStack>
    </Card>
  )
}
