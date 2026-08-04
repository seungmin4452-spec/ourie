import { Button } from '@astryxdesign/core/Button'
import { useNavigate } from 'react-router-dom'

export function HomePage() {
  const navigate = useNavigate()

  return (
    <section className="flex min-h-svh flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Ourie</h1>
      <p className="text-secondary">
        승민이랑 진선이만 사용하는 커플 전용 추억 관리
      </p>
      <Button
        label="시작하기"
        variant="primary"
        onClick={() => navigate('/onboarding/customize')}
      />
    </section>
  )
}
