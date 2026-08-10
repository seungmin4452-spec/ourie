import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useQuery } from '@tanstack/react-query'
import { CalendarHeart, Images } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { DefaultAvatar } from '@/components/common/DefaultAvatar'
import { FullscreenLoader } from '@/components/common/FullscreenLoader'
import {
  DdayHighlight,
  pickHighlight,
  startOfToday,
  summarizeAll,
  useAnniversaries,
} from '@/features/anniversary'
import { useAuth } from '@/features/auth'
import { getProfile } from '@/features/onboarding/api/profile'
import { isStandalone, openPwaInstallPage } from '@/features/onboarding/pwaInstall'

export function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [isInstalled] = useState(isStandalone)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: user != null,
  })

  const { data: anniversaries } = useAnniversaries(profile?.couple_id)

  // 데이터에만 의존한다. 자정을 넘겨 화면을 켜둔 경우가 아니면 "오늘"은
  // 바뀌지 않고, 그 경우에도 조작 한 번이면 다시 계산된다.
  const summaries = useMemo(
    () => summarizeAll(anniversaries ?? [], startOfToday()),
    [anniversaries],
  )
  const highlight = pickHighlight(summaries)

  if (isLoading) {
    return <FullscreenLoader />
  }

  return (
    <VStack
      as="section"
      gap={6}
      padding={4}
      width="100%"
      maxWidth={560}
      minHeight="100svh"
      className="mx-auto"
    >
      <VStack gap={3} hAlign="center" paddingBlock={4}>
        <span className="size-20 overflow-hidden rounded-2xl border border-border">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="size-full object-cover" />
          ) : (
            <DefaultAvatar className="size-full" />
          )}
        </span>
        <Heading level={1}>{profile?.nickname || 'Ourie'}</Heading>
      </VStack>

      {highlight ? (
        <VStack gap={2}>
          <DdayHighlight summary={highlight} />
          <Button
            label={
              summaries.length > 1 ? `기념일 ${summaries.length}개 모두 보기` : '기념일 관리'
            }
            variant="ghost"
            width="100%"
            onClick={() => navigate('/anniversaries')}
          />
        </VStack>
      ) : (
        <EmptyState
          icon={<CalendarHeart className="size-8" />}
          title="기념일을 등록해보세요"
          description="처음 만난 날을 등록하면 오늘이 며칠째인지 여기에 크게 표시돼요."
          actions={
            <Button
              label="기념일 등록하기"
              variant="primary"
              onClick={() => navigate('/anniversaries')}
            />
          }
        />
      )}

      <VStack gap={2}>
        <Heading level={2}>최근 추억</Heading>
        {/* 추억 타임라인(PRD 3.3)은 아직 구현 전이다. 자리를 비워두는 대신
            무엇이 올 자리인지 알려주고, 타임라인이 붙으면 이 자리에 카드
            2~3개가 들어간다 (UI_GUIDE 5.1). */}
        <EmptyState
          isCompact
          icon={<Images className="size-6" />}
          title="아직 기록한 추억이 없어요"
          description="사진과 함께 추억을 남기는 타임라인은 준비 중이에요."
        />
      </VStack>

      <VStack gap={2}>
        <Text type="supporting" justify="center">
          둘만의 공간, Ourie
        </Text>
        <Button
          label="꾸미기 다시 하기"
          variant="secondary"
          width="100%"
          onClick={() => navigate('/onboarding/customize')}
        />
        {/* 서버가 렌더한 설치 페이지로 바로 보낸다. 중간 화면을 두지 않는 이유는
            그 페이지만이 iOS에 커플이 정한 이름을 넘겨줄 수 있기 때문이다.
            이미 홈 화면에서 실행 중이면 감춘다. */}
        {!isInstalled && (
          <Button
            label="홈 화면에 다시 추가하기"
            variant="ghost"
            width="100%"
            onClick={() =>
              void openPwaInstallPage(
                profile?.nickname?.trim() ?? '',
                profile?.avatar_url ?? null,
              )
            }
          />
        )}
      </VStack>
    </VStack>
  )
}
