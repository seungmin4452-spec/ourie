import { Button } from '@astryxdesign/core/Button'
import { useNavigate } from 'react-router-dom'

import { BackButton } from '@/components/common/BackButton'
import { PwaInstallGuide } from '../components/PwaInstallGuide'

export function PwaSetupPage() {
  const navigate = useNavigate()

  return (
    <section className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-6 px-4">
      <BackButton to="/onboarding/customize" />
      <div className="text-center">
        <h1 className="text-2xl font-semibold">홈 화면에 추가하기</h1>
        <p className="mt-1 text-sm text-secondary">
          앱처럼 바로 열 수 있도록 홈 화면에 추가해보세요
        </p>
      </div>
      <PwaInstallGuide />
      <Button label="완료" variant="primary" width="100%" onClick={() => navigate('/')} />
    </section>
  )
}
