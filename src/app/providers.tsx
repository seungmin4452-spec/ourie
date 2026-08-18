import { Theme } from '@astryxdesign/core'
import { LinkProvider } from '@astryxdesign/core/Link'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { ColorModeToggle } from '@/components/common/ColorModeToggle'
import { AuthProvider } from '@/features/auth'
import { AdminFlipStage } from './AdminFlipStage'
import { AppMetaSync } from './AppMetaSync'
import { ColorModeProvider } from './ColorModeProvider'
import { useColorMode } from './useColorMode'
import { RouterLinkAdapter } from './router-link'
import { SocialAvatarSync } from './SocialAvatarSync'
import { ourieTheme } from './theme'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
    },
  },
})

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ColorModeProvider>
      <ThemedApp>{children}</ThemedApp>
    </ColorModeProvider>
  )
}

function ThemedApp({ children }: { children: ReactNode }) {
  const { mode } = useColorMode()

  return (
    <Theme theme={ourieTheme} mode={mode}>
      <LinkProvider component={RouterLinkAdapter}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AppMetaSync />
            <SocialAvatarSync />
            <div className="min-h-screen bg-body text-primary">
              <ColorModeToggle />
              <AdminFlipStage>{children}</AdminFlipStage>
            </div>
          </AuthProvider>
        </QueryClientProvider>
      </LinkProvider>
    </Theme>
  )
}
