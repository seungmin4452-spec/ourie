import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'

export function HomePage() {
  const navigate = useNavigate()

  return (
    <section className="flex min-h-svh flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Ourie</h1>
      <p className="text-muted-foreground">
        승민이랑 진선이만 사용하는 커플 전용 추억 관리
      </p>
      <Button onClick={() => navigate('/onboarding/customize')}>
        시작하기
      </Button>
    </section>
  )
}
