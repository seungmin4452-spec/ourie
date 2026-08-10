import { useQuery } from '@tanstack/react-query'

import { BackButton } from '@/components/common/BackButton'
import { useAuth } from '@/features/auth'
import { getProfile } from '../api/profile'
import { CustomizeForm } from '../components/CustomizeForm'

export function CustomizePage() {
  const { user } = useAuth()
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: user != null,
  })

  // This is now the first onboarding step, so during the initial run there is
  // nowhere to go back to -- "/" would just bounce right back here. The button
  // only makes sense once the couple is paired and the home screen exists.
  const canGoBack = profile?.couple_id != null

  return (
    <section className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-6 px-4">
      {canGoBack && <BackButton to="/" />}
      <div className="text-center">
        <h1 className="text-2xl font-semibold">우리 앱 꾸미기</h1>
        <p className="mt-1 text-sm text-secondary">
          우리만의 이름과 사진을 설정해보세요
        </p>
      </div>
      <CustomizeForm />
    </section>
  )
}
