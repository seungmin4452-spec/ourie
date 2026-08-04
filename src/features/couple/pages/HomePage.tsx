import { Button } from '@astryxdesign/core/Button'
import { Spinner } from '@astryxdesign/core/Spinner'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { DefaultAvatar } from '@/components/common/DefaultAvatar'
import { useAuth } from '@/features/auth'
import { getProfile } from '@/features/onboarding/api/profile'

export function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: user != null,
  })

  if (isLoading) {
    return (
      <section className="flex min-h-svh items-center justify-center">
        <Spinner label="불러오는 중..." />
      </section>
    )
  }

  return (
    <section className="flex min-h-svh flex-col items-center justify-center gap-4">
      <div className="size-20 overflow-hidden rounded-2xl border border-border">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="size-full object-cover" />
        ) : (
          <DefaultAvatar className="size-full" />
        )}
      </div>
      <h1 className="text-2xl font-semibold">{profile?.nickname || 'Ourie'}</h1>
      <p className="text-secondary">
        승민이랑 진선이만 사용하는 커플 전용 추억 관리
      </p>
      <Button
        label="꾸미기 다시 하기"
        variant="secondary"
        onClick={() => navigate('/onboarding/customize')}
      />
    </section>
  )
}
