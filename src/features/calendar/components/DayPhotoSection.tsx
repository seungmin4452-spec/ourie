import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Button } from '@astryxdesign/core/Button'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Thumbnail } from '@astryxdesign/core/Thumbnail'
import { useToast } from '@astryxdesign/core/Toast'
import { VStack } from '@astryxdesign/core/VStack'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, RotateCw } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'

import { cn } from '@/lib/utils'
import {
  addDayPhotos,
  DAY_NOTE_MAX,
  DAY_PHOTO_MAX,
  deleteDayPhoto,
  setDayCover,
  updateDayNote,
  type DayPhoto,
  type DayRecord,
} from '../api/dayPhotos'
import { dayPhotosQueryKey, useDayRecord } from '../hooks/useDayPhotos'
import { DayPhotoViewer } from './DayPhotoViewer'
import { formatEventDate, startOfToday, toDateKey } from '../schedule'
import type { DateKey } from '../types'

interface DayPhotoSectionProps {
  coupleId: string
  userId: string
  date: DateKey
}

/** 고른 날짜의 "그날의 우리". 날짜가 바뀌면 상태가 섞이지 않게 key로 다시 마운트한다. */
export function DayPhotoSection(props: DayPhotoSectionProps) {
  return <DayPhotoSectionBody key={props.date} {...props} />
}

function DayPhotoSectionBody({ coupleId, userId, date }: DayPhotoSectionProps) {
  const queryClient = useQueryClient()
  const showToast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: record, isLoading, error } = useDayRecord(coupleId, date)

  const [failedFiles, setFailedFiles] = useState<File[]>([])
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<DayPhoto | null>(null)
  const [isPickingCover, setIsPickingCover] = useState(false)

  const photos = record?.photos ?? []
  const room = DAY_PHOTO_MAX - photos.length
  // 사진은 지나간 날의 기록이다. 앞으로의 날짜에는 일정만 잡는다.
  const isFuture = date > toDateKey(startOfToday())

  const refresh = () => queryClient.invalidateQueries({ queryKey: dayPhotosQueryKey(coupleId) })

  const upload = useMutation({
    mutationFn: (files: File[]) => addDayPhotos(coupleId, userId, date, files),
    onSuccess: async ({ addedCount, failedFiles: failed }) => {
      await refresh()
      setFailedFiles(failed)
      if (failed.length > 0) {
        showToast({ type: 'error', body: `${failed.length}장을 올리지 못했어요.` })
      } else {
        showToast({ type: 'info', body: `사진 ${addedCount}장을 남겼어요.` })
      }
    },
    onError: (uploadError) => {
      showToast({
        type: 'error',
        body: uploadError instanceof Error ? uploadError.message : '사진을 올리지 못했어요.',
      })
    },
  })

  const removal = useMutation({
    mutationFn: (photo: DayPhoto) => deleteDayPhoto(record!, photo),
    onSuccess: async () => {
      await refresh()
      setPendingDelete(null)
      showToast({ type: 'info', body: '사진을 지웠어요.' })
    },
    onError: () => showToast({ type: 'error', body: '사진을 지우지 못했어요.' }),
  })

  const cover = useMutation({
    mutationFn: (photoId: string) => setDayCover(record!.memoryId, photoId),
    onSuccess: async () => {
      await refresh()
      setIsPickingCover(false)
    },
    onError: () => showToast({ type: 'error', body: '대표 사진을 바꾸지 못했어요.' }),
  })

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    // 같은 사진을 다시 골라도 change가 나도록 비운다.
    event.target.value = ''
    if (files.length === 0) return

    if (files.length > room) {
      showToast({
        type: 'info',
        body: `하루에 ${DAY_PHOTO_MAX}장까지라 앞의 ${room}장만 올릴게요.`,
      })
    }
    setFailedFiles([])
    upload.mutate(files.slice(0, room))
  }

  if (isFuture && photos.length === 0) return null

  const coverId = record?.coverPhotoId ?? photos[0]?.id

  return (
    <VStack gap={3}>
      <Heading level={2}>그날의 우리</Heading>

      {error ? (
        <Text type="supporting">사진을 불러오지 못했어요. 잠시 후 다시 시도해주세요.</Text>
      ) : isLoading ? (
        <Text type="supporting">사진을 불러오는 중이에요.</Text>
      ) : (
        <>
          {photos.length > 0 && (
            <Grid columns={3} gap={2}>
              {photos.map((photo, index) => (
                <Thumbnail
                  key={photo.id}
                  src={photo.thumbUrl}
                  alt={`${formatEventDate(date)} 사진 ${index + 1}`}
                  className={cn(
                    'w-full!',
                    isPickingCover && photo.id === coverId && 'ring-2 ring-accent',
                  )}
                  onClick={() => {
                    if (isPickingCover) cover.mutate(photo.id)
                    else setViewerIndex(index)
                  }}
                  onRemove={isPickingCover ? undefined : () => setPendingDelete(photo)}
                />
              ))}
            </Grid>
          )}

          {isPickingCover && <Text type="supporting">대표로 쓸 사진을 눌러주세요.</Text>}

          {record && photos.length > 0 && (
            <DayNoteForm
              key={`${record.memoryId}-${record.note ?? ''}`}
              record={record}
              onSaved={refresh}
            />
          )}

          {failedFiles.length > 0 && (
            <Button
              label={`실패한 ${failedFiles.length}장 다시 올리기`}
              variant="secondary"
              width="100%"
              icon={<RotateCw className="size-4" />}
              isLoading={upload.isPending}
              onClick={() => upload.mutate(failedFiles)}
            />
          )}

          <HStack gap={2} width="100%">
            {!isFuture && (
              <Button
                label={room > 0 ? '사진 추가' : `하루 ${DAY_PHOTO_MAX}장까지예요`}
                variant="primary"
                width="100%"
                icon={<ImagePlus className="size-4" />}
                isLoading={upload.isPending}
                isDisabled={room <= 0}
                onClick={() => fileInputRef.current?.click()}
              />
            )}
            {photos.length > 1 && (
              <Button
                label={isPickingCover ? '취소' : '대표 사진 바꾸기'}
                variant="secondary"
                width="100%"
                onClick={() => setIsPickingCover((value) => !value)}
              />
            )}
          </HStack>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {photos.length > 0 && (
        <DayPhotoViewer
          media={photos.map((photo, index) => ({
            src: photo.fullUrl,
            alt: `${formatEventDate(date)} 사진 ${index + 1}`,
            caption: record?.note ?? undefined,
          }))}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
        />
      )}

      <AlertDialog
        isOpen={pendingDelete != null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPendingDelete(null)
        }}
        title="사진을 지울까요?"
        description="지운 사진은 둘 다 다시 볼 수 없어요."
        actionLabel="삭제"
        cancelLabel="취소"
        isActionLoading={removal.isPending}
        onAction={() => {
          if (pendingDelete) removal.mutate(pendingDelete)
        }}
      />
    </VStack>
  )
}

function DayNoteForm({ record, onSaved }: { record: DayRecord; onSaved: () => Promise<unknown> }) {
  const showToast = useToast()
  const [note, setNote] = useState(record.note ?? '')

  const trimmed = note.trim()
  const isTooLong = trimmed.length > DAY_NOTE_MAX
  const isDirty = trimmed !== (record.note ?? '')

  const save = useMutation({
    mutationFn: () => updateDayNote(record.memoryId, trimmed || null),
    onSuccess: onSaved,
    onError: () => showToast({ type: 'error', body: '메모를 저장하지 못했어요.' }),
  })

  return (
    <VStack gap={2}>
      <TextInput
        label="한 줄 메모"
        htmlName="calendar-day-note"
        placeholder="이날은 어땠나요?"
        isOptional
        status={
          isTooLong ? { type: 'error', message: `${DAY_NOTE_MAX}자까지 쓸 수 있어요.` } : undefined
        }
        value={note}
        onChange={setNote}
      />
      {isDirty && (
        <Button
          label="메모 저장"
          variant="secondary"
          width="100%"
          isLoading={save.isPending}
          isDisabled={isTooLong}
          onClick={() => save.mutate()}
        />
      )}
    </VStack>
  )
}
