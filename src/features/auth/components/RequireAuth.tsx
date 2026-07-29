import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { FullscreenLoader } from '@/components/common/FullscreenLoader'
import { useAuth } from '../hooks/useAuth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <FullscreenLoader />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <>{children}</>
}
