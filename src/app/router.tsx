import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AnniversaryPage } from '@/features/anniversary'
import { LoginPage, RequireAuth, RequireGuest, SignUpPage } from '@/features/auth'
import { CoupleInvitePage } from '@/features/couple'
import { HomePage } from '@/features/couple/pages/HomePage'
import { CustomizePage, RequireOnboarding } from '@/features/onboarding'

// Onboarding order: /onboarding/customize (name + photo) -> /onboarding/couple
// (pairing) -> /add-to-home (server-rendered install page, see
// api/pwa-install.ts) -> /. RequireOnboarding owns the first two hops; each
// step sends itself to whatever is still missing.
export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: (
        <RequireAuth>
          <RequireOnboarding>
            <HomePage />
          </RequireOnboarding>
        </RequireAuth>
      ),
    },
    {
      // 기념일은 커플 데이터라서 홈과 같은 온보딩 관문을 지난다.
      path: '/anniversaries',
      element: (
        <RequireAuth>
          <RequireOnboarding>
            <AnniversaryPage />
          </RequireOnboarding>
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
      path: '/onboarding/couple',
      element: (
        <RequireAuth>
          <CoupleInvitePage />
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
    // Nothing else exists client-side, and a stale link (an old
    // /onboarding/pwa bookmark, a home-screen icon from a previous install)
    // should land in the app rather than on a router error screen.
    { path: '*', element: <Navigate to="/" replace /> },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') },
)
