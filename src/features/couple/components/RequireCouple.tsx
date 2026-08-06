import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { FullscreenLoader } from '@/components/common/FullscreenLoader'
import { useAuth } from '@/features/auth'
import { getProfile } from '@/features/onboarding/api/profile'

export function RequireCouple({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: user != null,
  })

  if (isLoading) {
    return <FullscreenLoader />
  }

  if (!profile?.couple_id) {
    return <Navigate to="/onboarding/couple" replace />
  }

  return <>{children}</>
}
