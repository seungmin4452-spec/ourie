import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { VStack } from '@astryxdesign/core/VStack'
import { useState, type ReactNode } from 'react'
import { useLocation, type Location } from 'react-router-dom'

import { signInWithProvider, type SocialProvider } from '../api/auth'
import { takeOAuthError } from '../oauthError'
import { GoogleIcon, KakaoIcon } from '../providerIcons'

// 로그인 화면과 회원가입 화면이 같은 컴포넌트를 쓴다. OAuth에는 가입과 로그인의
// 구분이 없으므로 (api/auth.ts의 signInWithProvider 주석), 두 화면에서 버튼이
// 달라야 할 이유가 없다. 문구를 "…로 로그인"이 아니라 "…로 시작하기"로 둔 것도
// 같은 이유다 — 어느 화면에서 눌러도 맞는 말이 된다.
const PROVIDERS = [
  { id: 'google', label: '구글로 시작하기', icon: <GoogleIcon /> },
  { id: 'kakao', label: '카카오로 시작하기', icon: <KakaoIcon /> },
] satisfies { id: SocialProvider; label: string; icon: ReactNode }[]

export function SocialAuthButtons() {
  const location = useLocation()
  const from = (location.state as { from?: Location } | null)?.from
  // 직전 시도가 실패해서 여기로 돌아온 것이라면 그 사유가 URL에 실려 있었다.
  // 읽는 시점은 이미 지났고(oauthError.ts), 여기서는 붙잡아둔 값을 꺼내 첫
  // 렌더에 바로 보여준다.
  const [error, setError] = useState<string | null>(() => takeOAuthError())
  const [pendingProvider, setPendingProvider] = useState<SocialProvider | null>(null)

  async function handleClick(provider: SocialProvider) {
    setError(null)
    setPendingProvider(provider)
    try {
      // 성공하면 페이지가 제공자에게 넘어가므로 이 아래로는 돌아오지 않는다.
      // 스피너를 끄지 않는 것이 맞다 — 끄면 넘어가기 직전에 버튼이 되살아나
      // 두 번 눌리게 된다.
      await signInWithProvider(provider, from ? `${from.pathname}${from.search}` : '/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '소셜 로그인에 실패했어요.')
      setPendingProvider(null)
    }
  }

  return (
    <VStack gap={2}>
      {error && (
        <Banner
          status="error"
          title="로그인하지 못했어요"
          description={error}
          isDismissable
          onDismiss={() => setError(null)}
        />
      )}
      {PROVIDERS.map(({ id, label, icon }) => (
        <Button
          key={id}
          label={label}
          icon={icon}
          variant="secondary"
          width="100%"
          isLoading={pendingProvider === id}
          isDisabled={pendingProvider != null && pendingProvider !== id}
          onClick={() => void handleClick(id)}
        />
      ))}
    </VStack>
  )
}
