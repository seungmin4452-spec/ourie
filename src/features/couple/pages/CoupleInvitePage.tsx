import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '@/features/auth'
import { getProfile } from '@/features/onboarding/api/profile'
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

  useEffect(() => {
    if (profile?.couple_id) {
      navigate('/onboarding/customize', { replace: true })
    }
  }, [profile?.couple_id, navigate])

  return (
    <section className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">커플 연결하기</h1>
        <p className="mt-1 text-sm text-secondary">
          둘만의 공간을 시작하려면 서로 연결해주세요
        </p>
      </div>

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
    </section>
  )
}
