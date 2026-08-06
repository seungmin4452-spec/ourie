import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { useAuth } from '@/features/auth'
import { joinCoupleByCode } from '../api/couple'

const ERROR_MESSAGES: Record<string, string> = {
  invalid_code: '유효하지 않은 초대 코드예요. 코드를 다시 확인해주세요.',
  expired_code: '만료된 초대 코드예요. 상대방에게 새 코드를 요청해주세요.',
  own_code: '본인이 만든 초대 코드는 사용할 수 없어요.',
  already_connected: '이미 커플로 연결되어 있어요.',
  not_authenticated: '로그인이 필요해요.',
}

function toErrorMessage(err: unknown): string {
  const key = err instanceof Error ? err.message : ''
  return ERROR_MESSAGES[key] ?? '커플 연결에 실패했어요. 다시 시도해주세요.'
}

interface JoinCoupleFormProps {
  initialCode?: string
}

export function JoinCoupleForm({ initialCode = '' }: JoinCoupleFormProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [code, setCode] = useState(initialCode)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await joinCoupleByCode(code)
      await queryClient.invalidateQueries({ queryKey: ['profile', user?.id] })
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <TextInput
        label="초대 코드"
        htmlName="invite-code"
        placeholder="예: AB12CD"
        isRequired
        value={code}
        onChange={(value) => setCode(value.toUpperCase())}
        description="상대방이 공유한 6자리 코드를 입력해주세요."
        status={error ? { type: 'error', message: error } : undefined}
        statusVariant="detached"
      />
      <Button
        type="submit"
        label={isSubmitting ? '연결하는 중...' : '연결하기'}
        variant="primary"
        isLoading={isSubmitting}
        isDisabled={code.trim().length === 0}
        width="100%"
      />
    </form>
  )
}
