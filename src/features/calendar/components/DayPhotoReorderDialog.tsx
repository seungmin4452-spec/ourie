import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { HStack } from '@astryxdesign/core/HStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { Thumbnail } from '@astryxdesign/core/Thumbnail'
import { Reorder, useDragControls } from 'framer-motion'
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import { useState } from 'react'

import type { DayPhoto } from '../api/dayPhotos'

interface DayPhotoReorderDialogProps {
  photos: DayPhoto[]
  isSaving: boolean
  onCancel: () => void
  onSave: (photos: DayPhoto[]) => void
}

/**
 * 사진 순서 바꾸기. 손잡이를 끌어서 옮기고, 끌기가 어려우면 화살표로 한 칸씩
 * 옮긴다. 저장을 눌러야 반영된다.
 */
export function DayPhotoReorderDialog({
  photos,
  isSaving,
  onCancel,
  onSave,
}: DayPhotoReorderDialogProps) {
  const [order, setOrder] = useState(photos)
  const isChanged = order.some((photo, index) => photo.id !== photos[index]?.id)

  function move(index: number, offset: -1 | 1) {
    const next = [...order]
    const [photo] = next.splice(index, 1)
    next.splice(index + offset, 0, photo)
    setOrder(next)
  }

  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel()
      }}
      purpose="form"
      width={420}
    >
      <Layout
        header={<DialogHeader title="사진 순서 변경" onOpenChange={onCancel} />}
        content={
          <LayoutContent>
            <Reorder.Group axis="y" values={order} onReorder={setOrder} className="m-0 list-none p-0">
              {order.map((photo, index) => (
                <ReorderRow
                  key={photo.id}
                  photo={photo}
                  index={index}
                  isLast={index === order.length - 1}
                  onMove={(offset) => move(index, offset)}
                />
              ))}
            </Reorder.Group>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="center" justify="end">
              <Button label="취소" variant="secondary" isDisabled={isSaving} onClick={onCancel} />
              <Button
                label="저장"
                variant="primary"
                isLoading={isSaving}
                isDisabled={!isChanged}
                onClick={() => onSave(order)}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}

function ReorderRow({
  photo,
  index,
  isLast,
  onMove,
}: {
  photo: DayPhoto
  index: number
  isLast: boolean
  onMove: (offset: -1 | 1) => void
}) {
  const controls = useDragControls()

  return (
    <Reorder.Item
      value={photo}
      dragListener={false}
      dragControls={controls}
      className="relative rounded-lg bg-surface py-1"
    >
      <HStack gap={2} vAlign="center" width="100%">
        <Thumbnail src={photo.thumbUrl} alt={`사진 ${index + 1}`} />
        <Text weight="medium" className="flex-1">
          {index + 1}번째
        </Text>
        <IconButton
          label={`사진 ${index + 1} 위로`}
          variant="ghost"
          size="sm"
          icon={<ChevronUp className="size-4" />}
          isDisabled={index === 0}
          onClick={() => onMove(-1)}
        />
        <IconButton
          label={`사진 ${index + 1} 아래로`}
          variant="ghost"
          size="sm"
          icon={<ChevronDown className="size-4" />}
          isDisabled={isLast}
          onClick={() => onMove(1)}
        />
        <button
          type="button"
          aria-label={`사진 ${index + 1} 끌어서 옮기기`}
          className="flex size-11 cursor-grab touch-none items-center justify-center border-0 bg-transparent p-0 text-secondary active:cursor-grabbing"
          onPointerDown={(event) => controls.start(event)}
        >
          <GripVertical className="size-5" />
        </button>
      </HStack>
    </Reorder.Item>
  )
}
