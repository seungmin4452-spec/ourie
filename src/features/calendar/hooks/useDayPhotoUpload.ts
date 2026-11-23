import { useToast } from '@astryxdesign/core/Toast'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type ChangeEvent } from 'react'

import { addDayPhotos, DAY_PHOTO_MAX } from '../api/dayPhotos'
import type { DateKey } from '../types'
import { dayPhotosQueryKey } from './useDayPhotos'

interface UseDayPhotoUploadOptions {
  coupleId: string
  userId: string
  date: DateKey
  /** 그날 이미 있는 사진 수. 하루 한도에서 남은 자리를 계산한다. */
  photoCount: number
  /** 한 장이라도 올라갔을 때. 올리는 사이 날짜를 옮겼을 수 있어 올린 날짜를 넘긴다. */
  onUploaded?: (date: DateKey) => void
}

/** 사진첩을 열어 그날에 사진을 올린다. 숨긴 file input에 `inputProps`를 넘겨 쓴다. */
export function useDayPhotoUpload({
  coupleId,
  userId,
  date,
  photoCount,
  onUploaded,
}: UseDayPhotoUploadOptions) {
  const queryClient = useQueryClient()
  const showToast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  // 실패한 사진은 고른 날짜와 함께 둔다. 다른 날짜를 보다가 다시 올려도 그 날에
  // 잘못 들어가지 않도록, 지금 날짜와 같을 때만 재시도를 보여준다.
  const [failed, setFailed] = useState<{ date: DateKey; files: File[] } | null>(null)
  const failedFiles = failed?.date === date ? failed.files : []
  const room = Math.max(0, DAY_PHOTO_MAX - photoCount)

  const upload = useMutation({
    mutationFn: (variables: { date: DateKey; files: File[] }) =>
      addDayPhotos(coupleId, userId, variables.date, variables.files),
    onSuccess: async ({ addedCount, failedFiles: failedNow }, variables) => {
      await queryClient.invalidateQueries({ queryKey: dayPhotosQueryKey(coupleId) })
      setFailed(failedNow.length > 0 ? { date: variables.date, files: failedNow } : null)
      if (failedNow.length > 0) {
        showToast({ type: 'error', body: `${failedNow.length}장을 올리지 못했어요.` })
      } else {
        showToast({ type: 'info', body: `사진 ${addedCount}장을 남겼어요.` })
      }
      if (addedCount > 0) onUploaded?.(variables.date)
    },
    onError: (error) => {
      showToast({
        type: 'error',
        body: error instanceof Error ? error.message : '사진을 올리지 못했어요.',
      })
    },
  })

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    // 같은 사진을 다시 골라도 change가 나도록 비운다.
    event.target.value = ''
    if (files.length === 0) return

    if (files.length > room) {
      showToast({ type: 'info', body: `하루에 ${DAY_PHOTO_MAX}장까지라 앞의 ${room}장만 올릴게요.` })
    }
    setFailed(null)
    upload.mutate({ date, files: files.slice(0, room) })
  }

  return {
    room,
    isUploading: upload.isPending,
    failedCount: failedFiles.length,
    openPicker: () => inputRef.current?.click(),
    retry: () => upload.mutate({ date, files: failedFiles }),
    inputProps: {
      ref: inputRef,
      type: 'file' as const,
      accept: 'image/*',
      multiple: true,
      className: 'hidden',
      onChange: handleChange,
    },
  }
}
