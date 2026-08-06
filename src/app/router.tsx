import { createBrowserRouter } from 'react-router-dom'
import { LoginPage, RequireAuth, RequireGuest, SignUpPage } from '@/features/auth'
import { CoupleInvitePage, RequireCouple } from '@/features/couple'
import { HomePage } from '@/features/couple/pages/HomePage'
import { CustomizePage, PwaSetupPage } from '@/features/onboarding'

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: (
        <RequireAuth>
          <RequireCouple>
            <HomePage />
          </RequireCouple>
        </RequireAuth>
      ),
    },
    {
      path: '/onboarding/couple',
      element: (
        <RequireAuth>
          <CoupleInvitePage />
        </RequireAuth>
      ),
    },
    {
      path: '/onboarding/customize',
      element: (
        <RequireAuth>
          <CustomizePage />
        </RequireAuth>
      ),
    },
    {
      path: '/onboarding/pwa',
      element: (
        <RequireAuth>
          <PwaSetupPage />
        </RequireAuth>
      ),
    },
    {
      path: '/login',
      element: (
        <RequireGuest>
          <LoginPage />
        </RequireGuest>
      ),
    },
    {
      path: '/signup',
      element: (
        <RequireGuest>
          <SignUpPage />
        </RequireGuest>
      ),
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') },
)
