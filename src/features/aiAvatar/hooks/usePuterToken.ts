import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

/** 이 요청은 우리 서버로 가는 것이라(외부 Puter가 아니라) 오래 걸릴 이유가
 * 없다 — 짧게 잡아서, 이게 막히면 생성 쪽 타임아웃(withTimeout.ts)까지 갈
 * 것도 없이 여기서 먼저 실패로 끝낸다. fetch는 AbortController로 실제 요청
 * 자체를 끊을 수 있다(Puter 호출과 달리). */
const TOKEN_FETCH_TIMEOUT_MS = 15 * 1000

/**
 * 공용 Puter 계정의 개인 액세스 토큰을 서버(api/puter-token.ts)에서 받아온다.
 *
 * 이 토큰을 클라이언트 번들에 정적으로 박아두지 않는 이유: 빌드된 JS 파일은
 * 로그인 여부와 무관하게 그 URL에 접속하는 누구나 받아볼 수 있는 정적
 * 자산이다. 로그인한 사용자에게만 내려주면 최소한 우리 앱 사용자 범위로는
 * 좁혀진다 (api/puter-token.ts 머리말 참고).
 *
 * staleTime을 길게 잡는 이유: 토큰은 자주 바뀌는 값이 아니라서, 아바타를 만들
 * 때마다 매번 새로 받으면 왕복만 하나 늘어난다.
 */
export function usePuterToken() {
  return useQuery({
    queryKey: ['puter-token'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession()
      const accessToken = data.session?.access_token
      if (!accessToken) throw new Error('로그인이 필요해요.')

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TOKEN_FETCH_TIMEOUT_MS)
      try {
        const response = await fetch('/api/puter-token', {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Puter 인증에 실패했어요.')

        const payload = (await response.json()) as { token: string }
        return payload.token
      } finally {
        clearTimeout(timer)
      }
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  })
}
