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
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      const { session } = await signUpWithEmail(email, password, name)
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
      {/* 앱 이름("승민 ♥ 진선")이 아니라 사람 이름이다. 상대방이 받는 알림에
          이 이름이 그대로 뜨므로 그 쓰임을 description으로 밝혀둔다 — 안 그러면
          여기에도 커플 이름을 적게 된다. */}
      <TextInput
        label="이름"
        htmlName="name"
        placeholder="예: 승민"
        isRequired
        value={name}
        onChange={setName}
        description="상대방에게 보내는 알림에 표시돼요."
      />
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
