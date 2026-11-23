import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Button } from '@astryxdesign/core/Button'
import { Dialog } from '@astryxdesign/core/Dialog'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Text } from '@astryxdesign/core/Text'
import { useToast } from '@astryxdesign/core/Toast'
import { VStack } from '@astryxdesign/core/VStack'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImageOff } from 'lucide-react'
import { useState } from 'react'

import {
  deleteDayPhoto,
  setDayCover,
  updateDayPost,
  type DayPhoto,
} from '../api/dayPhotos'
import { useDayPhotoUpload } from '../hooks/useDayPhotoUpload'
import { dayPhotosQueryKey, useDayRecord } from '../hooks/useDayPhotos'
import type { DateKey } from '../types'
import { DayPostView, type DayPostPerson } from './DayPostView'

interface DayPostDialogProps {
  coupleId: string
  userId: string
  date: DateKey
  me: DayPostPerson
  partner: DayPostPerson | null
  /** 사진을 막 올리고 들어왔을 때 바로 글을 쓰게 한다. */
  startInEdit: boolean
  onClose: () => void
}

/** 달력에서 사진이 있는 날을 누르면 열리는 전체 화면 게시물. */
export function DayPostDialog(props: DayPostDialogProps) {
  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) props.onClose()
      }}
      variant="fullscreen"
      padding={0}
      className="border-0! shadow-none!"
    >
      <DayPostContent {...props} />
    </Dialog>
  )
}

function DayPostContent({
  coupleId,
  userId,
  date,
  me,
  partner,
  startInEdit,
  onClose,
}: DayPostDialogProps) {
  const queryClient = useQueryClient()
  const showToast = useToast()
  const { data: record, isLoading } = useDayRecord(coupleId, date)
  const [pendingDelete, setPendingDelete] = useState<DayPhoto | null>(null)

  const photoCount = record?.photos.length ?? 0
  const upload = useDayPhotoUpload({ coupleId, userId, date, photoCount })
  const refresh = () => queryClient.invalidateQueries({ queryKey: dayPhotosQueryKey(coupleId) })

  const save = useMutation({
    mutationFn: ({ title, content }: { title: string | null; content: string | null }) =>
      updateDayPost(record!.memoryId, title, content),
    onSuccess: refresh,
    onError: () => showToast({ type: 'error', body: '글을 저장하지 못했어요.' }),
  })

  const cover = useMutation({
    mutationFn: (photo: DayPhoto) => setDayCover(record!.memoryId, photo.id),
    onSuccess: async () => {
      await refresh()
      showToast({ type: 'info', body: '달력 대표 사진을 바꿨어요.' })
    },
    onError: () => showToast({ type: 'error', body: '대표 사진을 바꾸지 못했어요.' }),
  })

  const removal = useMutation({
    mutationFn: (photo: DayPhoto) => deleteDayPhoto(record!, photo),
    onSuccess: async () => {
      const wasLast = photoCount <= 1
      await refresh()
      setPendingDelete(null)
      showToast({ type: 'info', body: wasLast ? '게시물을 지웠어요.' : '사진을 지웠어요.' })
      if (wasLast) onClose()
    },
    onError: () => showToast({ type: 'error', body: '사진을 지우지 못했어요.' }),
  })

  if (isLoading) {
    return (
      <VStack width="100%" height="100dvh" hAlign="center" vAlign="center">
        <Text type="supporting">사진을 불러오는 중이에요.</Text>
      </VStack>
    )
  }

  if (!record || record.photos.length === 0) {
    return (
      <VStack width="100%" height="100dvh" hAlign="center" vAlign="center">
        <EmptyState
          icon={<ImageOff className="size-8" />}
          title="사진을 불러오지 못했어요"
          description="잠시 후 다시 시도해주세요."
          actions={<Button label="닫기" variant="secondary" onClick={onClose} />}
        />
      </VStack>
    )
  }

  const isLastPhoto = record.photos.length === 1

  return (
    <>
      <DayPostView
        record={record}
        me={me}
        partner={partner}
        startInEdit={startInEdit}
        isSaving={save.isPending}
        isUploading={upload.isUploading}
        onClose={onClose}
        onAddPhotos={upload.openPicker}
        onSetCover={(photo) => cover.mutate(photo)}
        onDeletePhoto={setPendingDelete}
        onSave={async (title, content) => {
          try {
            await save.mutateAsync({ title, content })
            return true
          } catch {
            return false
          }
        }}
      />

      <input {...upload.inputProps} />

      <AlertDialog
        isOpen={pendingDelete != null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPendingDelete(null)
        }}
        title={isLastPhoto ? '게시물을 지울까요?' : '사진을 지울까요?'}
        description={
          isLastPhoto
            ? '마지막 사진이라 제목과 내용도 함께 지워지고, 둘 다 다시 볼 수 없어요.'
            : '지운 사진은 둘 다 다시 볼 수 없어요.'
        }
        actionLabel="삭제"
        cancelLabel="취소"
        isActionLoading={removal.isPending}
        onAction={() => {
          if (pendingDelete) removal.mutate(pendingDelete)
        }}
      />
    </>
  )
}
