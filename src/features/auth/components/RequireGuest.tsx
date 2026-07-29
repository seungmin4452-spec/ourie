import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { FullscreenLoader } from '@/components/common/FullscreenLoader'
import { useAuth } from '../hooks/useAuth'

export function RequireGuest({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <FullscreenLoader />
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
