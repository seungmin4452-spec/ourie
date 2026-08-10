import { Heading } from '@astryxdesign/core/Heading'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { PageShell } from '@/components/common/PageShell'
import { useAuth } from '@/features/auth'
import { getProfile } from '@/features/onboarding/api/profile'
import { openPwaInstallPage } from '@/features/onboarding/pwaInstall'
import { InviteCodeCard } from '../components/InviteCodeCard'
import { JoinCoupleForm } from '../components/JoinCoupleForm'

type Tab = 'create' | 'join'

export function CoupleInvitePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialCode = searchParams.get('code') ?? ''
  const [tab, setTab] = useState<Tab>(initialCode ? 'join' : 'create')

  // Polls while this screen is open so the moment the partner connects
  // (either side), we move both of them along to the next onboarding step.
  // refetchOnWindowFocus is forced to 'always' (bypassing the app-wide 60s
  // staleTime) because the common path here is: generate a code, background
  // the tab to paste it into a messaging app, then come back -- mobile
  // browsers throttle/pause the refetchInterval timer while backgrounded, so
  // without this the screen can be stuck showing "기다리는 중" even after
  // the partner has already connected.
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: user != null,
    refetchInterval: 3000,
    refetchOnWindowFocus: 'always',
  })

  const coupleId = profile?.couple_id ?? null
  const nickname = profile?.nickname?.trim() ?? ''
  const avatarUrl = profile?.avatar_url ?? null

  useEffect(() => {
    if (!coupleId) return

    // Normally the name is already set (customize comes first), so pairing is
    // the second-to-last step and the install page closes the flow. Someone
    // who arrived straight here from an invite link skipped customize, so send
    // them there instead -- installing without a name bakes "Ourie" onto the
    // home screen, which is exactly what api/pwa-install.ts exists to avoid.
    if (!nickname) {
      navigate('/onboarding/customize', { replace: true })
    } else {
      void openPwaInstallPage(nickname, avatarUrl)
    }
  }, [coupleId, nickname, avatarUrl, navigate])

  return (
    <PageShell gap={6} isCentered maxWidth={384}>
      <VStack gap={1}>
        <Heading level={1} justify="center">
          커플 연결하기
        </Heading>
        <Text type="supporting" justify="center">
          둘만의 공간을 시작하려면 서로 연결해주세요
        </Text>
      </VStack>

      <SegmentedControl
        label="연결 방법 선택"
        value={tab}
        onChange={(value) => setTab(value as Tab)}
        layout="fill"
      >
        <SegmentedControlItem value="create" label="코드 만들기" />
        <SegmentedControlItem value="join" label="코드 입력하기" />
      </SegmentedControl>

      {tab === 'create' ? (
        <InviteCodeCard />
      ) : (
        <JoinCoupleForm initialCode={initialCode} />
      )}
    </PageShell>
  )
}
