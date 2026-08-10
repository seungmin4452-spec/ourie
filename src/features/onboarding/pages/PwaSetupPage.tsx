import { Button } from '@astryxdesign/core/Button'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { BackButton } from '@/components/common/BackButton'
import { useAuth } from '@/features/auth'
import { getProfile } from '../api/profile'
import { PwaInstallGuide } from '../components/PwaInstallGuide'
import { buildPwaInstallUrl, isIOS } from '../pwaInstall'

export function PwaSetupPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [isIOSDevice] = useState(isIOS)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: user != null,
  })

  const title = profile?.nickname?.trim() ?? ''

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

      {isIOSDevice &&
        (!isLoading && !title ? (
          // No nickname saved yet, so there is nothing to bake onto the icon.
          // Send them to set one rather than leaving a dead disabled button.
          <Button
            label="먼저 앱 이름 설정하기"
            variant="primary"
            width="100%"
            onClick={() => navigate('/onboarding/customize')}
          />
        ) : (
          <Button
            label={title ? `"${title}" 이름으로 추가 페이지 열기` : '홈 화면 추가 페이지 열기'}
            variant="primary"
            width="100%"
            // Disabled until the nickname actually arrives: firing early would
            // hand the function an empty title and bake the generic "Ourie"
            // onto the home screen -- the exact bug this page exists to avoid.
            isDisabled={isLoading}
            isLoading={isLoading}
            onClick={() =>
              window.location.assign(buildPwaInstallUrl(title, profile?.avatar_url ?? null))
            }
          />
        ))}

      <Button
        label="완료"
        variant={isIOSDevice ? 'secondary' : 'primary'}
        width="100%"
        onClick={() => navigate('/')}
      />
    </section>
  )
}
