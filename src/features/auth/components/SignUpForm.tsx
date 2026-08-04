import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useToast } from '@astryxdesign/core/Toast'
import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate, type Location } from 'react-router-dom'

import { signUpWithEmail } from '../api/auth'

export function SignUpForm() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: Location } | null)?.from
  const showToast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      const { session } = await signUpWithEmail(email, password)
      if (session) {
        navigate(from ? `${from.pathname}${from.search}` : '/', { replace: true })
      } else {
        showToast({ body: '가입 확인 메일을 보냈어요. 메일함을 확인해주세요.' })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '회원가입에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <TextInput
        label="이메일"
        type="email"
        htmlName="email"
        isRequired
        value={email}
        onChange={setEmail}
      />
      <TextInput
        label="비밀번호"
        type="password"
        htmlName="password"
        isRequired
        value={password}
        onChange={setPassword}
        description="6자 이상 입력해주세요."
        status={error ? { type: 'error', message: error } : undefined}
        statusVariant="detached"
      />
      <Button
        type="submit"
        label={isSubmitting ? '가입 중...' : '회원가입'}
        variant="primary"
        isLoading={isSubmitting}
        width="100%"
      />
    </form>
  )
}
