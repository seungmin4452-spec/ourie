import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { HStack } from '@astryxdesign/core/HStack'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Switch } from '@astryxdesign/core/Switch'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useToast } from '@astryxdesign/core/Toast'
import { VStack } from '@astryxdesign/core/VStack'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { createAnniversary, updateAnniversary } from '../api/anniversary'
import { startOfToday, toDateKey } from '../dday'
import { anniversariesQueryKey } from '../hooks/useAnniversaries'
import type { Anniversary, AnniversaryInput, DateKey } from '../types'
import { DatePartsInput } from './DatePartsInput'

interface AnniversaryFormDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  coupleId: string
  userId: string
  /** 수정 중인 기념일. 새로 만들 때는 null. */
  anniversary: Anniversary | null
}

export function AnniversaryFormDialog({
  isOpen,
  onOpenChange,
  coupleId,
  userId,
  anniversary,
}: AnniversaryFormDialogProps) {
  return (
    // 열릴 때마다(그리고 수정 대상 행이 바뀔 때마다) 다시 마운트시켜 입력값을
    // 초기화한다. 아래 state는 props로 한 번만 초기화되므로, key가 그대로면
    // 직전에 열었던 기념일의 값이 남는다.
    <Dialog
      key={anniversary?.id ?? 'new'}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="form"
      width={420}
    >
      <AnniversaryForm
        onClose={() => onOpenChange(false)}
        coupleId={coupleId}
        userId={userId}
        anniversary={anniversary}
      />
    </Dialog>
  )
}

function AnniversaryForm({
  onClose,
  coupleId,
  userId,
  anniversary,
}: Omit<AnniversaryFormDialogProps, 'isOpen' | 'onOpenChange'> & {
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const showToast = useToast()

  const [title, setTitle] = useState(anniversary?.title ?? '')
  const [date, setDate] = useState<DateKey>(anniversary?.date ?? toDateKey(startOfToday()))
  const [repeatYearly, setRepeatYearly] = useState(anniversary?.repeat_yearly ?? true)

  const mutation = useMutation({
    mutationFn: (input: AnniversaryInput) =>
      anniversary
        ? updateAnniversary(anniversary.id, input)
        : createAnniversary(coupleId, userId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: anniversariesQueryKey(coupleId) })
      showToast({
        type: 'info',
        body: anniversary ? '기념일을 수정했어요.' : '기념일을 등록했어요.',
      })
      onClose()
    },
    onError: (error) => {
      showToast({
        type: 'error',
        body: error instanceof Error ? error.message : '저장에 실패했어요.',
      })
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    mutation.mutate({ title: title.trim(), date, repeat_yearly: repeatYearly })
  }

  return (
    <form onSubmit={handleSubmit}>
      <Layout
        header={
          <DialogHeader
            title={anniversary ? '기념일 수정' : '기념일 등록'}
            onOpenChange={onClose}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4}>
              <TextInput
                label="이름"
                htmlName="anniversary-title"
                placeholder="예: 처음 만난 날"
                isRequired
                value={title}
                onChange={setTitle}
              />
              <DatePartsInput value={date} onChange={setDate} />
              <Switch
                label="매년 반복"
                description="생일이나 사귄 날처럼 해마다 돌아오는 기념일이면 켜두세요."
                value={repeatYearly}
                onChange={setRepeatYearly}
                labelPosition="start"
                labelSpacing="spread"
                width="100%"
              />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="center" justify="end">
              <Button
                type="button"
                label="취소"
                variant="secondary"
                onClick={onClose}
                isDisabled={mutation.isPending}
              />
              <Button
                type="submit"
                label="저장"
                variant="primary"
                isLoading={mutation.isPending}
                isDisabled={!title.trim()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </form>
  )
}
