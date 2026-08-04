import { createBrowserRouter } from 'react-router-dom'
import { LoginPage, RequireAuth, RequireGuest, SignUpPage } from '@/features/auth'
import { HomePage } from '@/features/couple/pages/HomePage'
import { CustomizePage, PwaSetupPage } from '@/features/onboarding'

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: (
        <RequireAuth>
          <HomePage />
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
