import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { HStack } from '@astryxdesign/core/HStack'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { List, ListItem } from '@astryxdesign/core/List'
import { LayoutGrid } from 'lucide-react'

import { ALL_WIDGETS, widgetIcon } from '../catalog'
import type { WidgetId } from '../types'

interface WidgetPickerDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  /** 이미 홈에 올라가 있는 위젯. 목록에서 빠진다. */
  addedWidgets: WidgetId[]
  onAdd: (id: WidgetId) => void
}

export function WidgetPickerDialog({
  isOpen,
  onOpenChange,
  addedWidgets,
  onAdd,
}: WidgetPickerDialogProps) {
  const available = ALL_WIDGETS.filter((meta) => !addedWidgets.includes(meta.id))

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={420}>
      <Layout
        header={<DialogHeader title="위젯 추가" onOpenChange={() => onOpenChange(false)} />}
        content={
          <LayoutContent>
            {available.length === 0 ? (
              <EmptyState
                isCompact
                icon={<LayoutGrid className="size-6" />}
                title="모든 위젯을 올려뒀어요"
                description="지울 위젯이 있다면 홈에서 편집을 눌러 지울 수 있어요."
              />
            ) : (
              <List hasDividers>
                {available.map((meta) => (
                  <ListItem
                    key={meta.id}
                    label={meta.title}
                    description={meta.description}
                    startContent={widgetIcon(meta.id)}
                    endContent={
                      <HStack gap={2} vAlign="center">
                        {!meta.isReady && <Badge variant="neutral" label="준비 중" />}
                        <Button
                          label="추가"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            onAdd(meta.id)
                            // 하나 고르면 홈으로 돌아가 방금 올린 위젯을
                            // 바로 보게 한다. 여러 개를 올리려면 다시 연다.
                            onOpenChange(false)
                          }}
                        />
                      </HStack>
                    }
                  />
                ))}
              </List>
            )}
          </LayoutContent>
        }
      />
    </Dialog>
  )
}
