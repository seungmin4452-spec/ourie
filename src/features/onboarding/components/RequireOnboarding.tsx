import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { FullscreenLoader } from '@/components/common/FullscreenLoader'
import { useAuth } from '@/features/auth'
import { getProfile } from '../api/profile'

// The single place that decides which onboarding step is still missing, in
// order: name/photo first, then couple pairing. Customizing first means the
// name exists before anything else needs it -- the invite screen, and the
// home-screen install that closes the flow.
//
// Not enforced on /onboarding/couple itself: an invite link lands there with
// ?code=..., and bouncing that to customize would drop the code. Those users
// pair first and get sent back here for the name afterwards.
export function RequireOnboarding({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: user != null,
  })

  if (isLoading) {
    return <FullscreenLoader />
  }

  if (!profile?.app_name?.trim()) {
    return <Navigate to="/onboarding/customize" replace />
  }

  if (!profile.couple_id) {
    return <Navigate to="/onboarding/couple" replace />
  }

  return <>{children}</>
}
