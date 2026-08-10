import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import { AuthContext } from '../hooks/auth-context'
import { resolveInitialSession } from '../sessionHandoff'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // 그냥 getSession()이 아니다: 처음 실행되는 홈 화면 앱은 저장된 세션이 없고
    // 대신 start_url에 세션을 싣고 온다. 그 교환이 끝나기 전에 isLoading을
    // 내리면 RequireAuth가 로그아웃 상태로 보고 /login으로 보내버린다
    // (sessionHandoff.ts).
    resolveInitialSession().then((initialSession) => {
      setSession(initialSession)
      setIsLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // INITIAL_SESSION은 resolveInitialSession이 담당한다. Supabase는 저장소에
      // 있는 값을 그대로 실어 보내는데 첫 실행에서는 그게 없는 상태이고, 세션
      // 인계가 이미 세션을 만들어 놓은 뒤에 도착해서 그걸 로그아웃으로
      // 되돌려버릴 수 있다.
      if (event === 'INITIAL_SESSION') return
      setSession(nextSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, isLoading }}
    >
      {children}
    </AuthContext.Provider>
  )
}
