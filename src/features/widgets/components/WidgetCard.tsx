import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { VStack } from '@astryxdesign/core/VStack'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { widgetIcon } from '../catalog'
import type { WidgetMeta } from '../types'

interface WidgetCardProps {
  meta: WidgetMeta
  /** 편집 모드에서만 삭제 버튼이 뜬다. 평소엔 내용에 집중하게 둔다. */
  isEditing: boolean
  onRemove: () => void
  children: ReactNode
}

/**
 * 홈에 올라가는 위젯 하나의 껍데기.
 *
 * Card를 쓰는 이유가 여기 있다 — 각각 따로 떼고 붙일 수 있는 독립된 조각이기
 * 때문이다. 그래서 위젯 본문은 자기 안에서 다시 Card를 쓰지 않는다.
 */
export function WidgetCard({ meta, isEditing, onRemove, children }: WidgetCardProps) {
  return (
    <Card padding={5} variant="muted">
      <VStack gap={3}>
        <HStack gap={2} hAlign="between" vAlign="center">
          <HStack gap={1.5} vAlign="center">
            {widgetIcon(meta.id)}
            <Heading level={2}>{meta.title}</Heading>
          </HStack>

          {isEditing && (
            <IconButton
              label={`${meta.title} 위젯 삭제`}
              tooltip="위젯 삭제"
              variant="ghost"
              size="sm"
              icon={<X className="size-4" />}
              onClick={onRemove}
            />
          )}
        </HStack>

        {children}
      </VStack>
    </Card>
  )
}
