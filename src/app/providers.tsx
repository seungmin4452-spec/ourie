import { Theme } from '@astryxdesign/core'
import { LinkProvider } from '@astryxdesign/core/Link'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { AuthProvider } from '@/features/auth'
import { RouterLinkAdapter } from './router-link'
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
    <Theme theme={ourieTheme}>
      <LinkProvider component={RouterLinkAdapter}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>{children}</AuthProvider>
        </QueryClientProvider>
      </LinkProvider>
    </Theme>
  )
}
