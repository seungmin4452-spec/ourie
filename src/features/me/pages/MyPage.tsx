import { Avatar } from '@astryxdesign/core/Avatar'
import { AvatarGroup } from '@astryxdesign/core/AvatarGroup'
import { Button } from '@astryxdesign/core/Button'
import { Divider } from '@astryxdesign/core/Divider'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Text } from '@astryxdesign/core/Text'
import { useToast } from '@astryxdesign/core/Toast'
import { VStack } from '@astryxdesign/core/VStack'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ImageDown } from 'lucide-react'

import { BackButton } from '@/components/common/BackButton'
import { FullscreenLoader } from '@/components/common/FullscreenLoader'
import { PageShell } from '@/components/common/PageShell'
import { useAnniversaries } from '@/features/anniversary'
import { useAuth } from '@/features/auth'
import { usePartner } from '@/features/couple/hooks/usePartner'
import { NotificationSettings, PartnerAlertSwitch } from '@/features/notification'
import { getProfile, updateProfile } from '@/features/onboarding/api/profile'
import { socialAvatar } from '../socialAvatar'

/**
 * 마이페이지 — 지금은 알림 설정 하나를 위한 화면이다.
 *
 * 알림 스위치가 두 개인데 서로 다른 화면에 흩어져 있었다. 매일 디데이 알림은
 * `/anniversaries` 아래에, 상대방이 보내는 알림은 콕 찌르기 위젯 안에. 둘 다
 * 그 자리에 있을 이유가 있었지만(등록한 자리에서 "매일 알려줄까요?"를 만나는
 * 것, 보내는 화면에서 받는 설정을 켜는 것) **그 위젯을 홈에 올리지 않은
 * 사람에게는 켤 자리가 아예 없다**는 문제가 남았다. 소원권 알림이 같은 동의를
 * 쓰기 시작하면서 그게 실제 구멍이 됐다.
 *
 * 그래서 여기가 "언제든 찾아올 수 있는 한 곳"이다. 원래 자리의 스위치들은
 * 그대로 두었다 — 같은 상태를 보는 같은 컴포넌트라 어느 쪽에서 켜도 똑같고,
 * 맥락 안에서 만나는 편이 나은 순간은 여전히 있다.
 */
export function MyPage() {
  const { user } = useAuth()
  const showToast = useToast()
  const queryClient = useQueryClient()

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: user != null,
  })

  const { data: partner } = usePartner(profile)
  // 디데이 알림 스위치는 기념일이 있어야 켤 수 있고, 오늘 갈 문구도 미리
  // 보여준다. 그래서 이 화면도 기념일을 읽는다 (홈과 캐시를 공유한다).
  const { data: anniversaries } = useAnniversaries(profile?.couple_id)

  const social = socialAvatar(user)

  const adoptSocialAvatar = useMutation({
    mutationFn: () =>
      // 출처를 'social'로 적으면 이 뒤로는 로그인할 때마다 자동으로 최신
      // 사진을 따라간다 (src/app/SocialAvatarSync.tsx).
      updateProfile(user!.id, { avatar_url: social!.url, avatar_source: 'social' }),
    onSuccess: async () => {
      // 홈 화면 아이콘도 이 값을 본다. AppMetaSync가 같은 쿼리를 구독하고
      // 있어서, 무효화 한 번이면 아이콘까지 따라온다.
      await queryClient.invalidateQueries({ queryKey: ['profile', user!.id] })
      showToast({ type: 'info', body: `${social!.providerLabel} 사진으로 바꿨어요.` })
    },
    onError: (error) => {
      showToast({
        type: 'error',
        body: error instanceof Error ? error.message : '사진을 바꾸지 못했어요.',
      })
    },
  })

  if (isLoading || user == null) {
    return <FullscreenLoader />
  }

  // 이미 그 사진을 쓰고 있으면 권할 것이 없다.
  const canAdoptSocial = social != null && social.url !== profile?.avatar_url

  const myName = profile?.name?.trim()
  const partnerName = partner?.name?.trim()

  return (
    <PageShell gap={5}>
      <BackButton to="/" label="홈" />

      <HStack gap={3} vAlign="center">
        {/* 소셜 가입이면 제공자가 준 사진이 여기 들어온다 (구글·카카오). 카카오는
            주소를 http로 주는데 https 페이지에서는 막히므로, 가입 트리거가
            https로 올려서 저장한다 (supabase/schema.sql의 handle_new_user).
            사진이 없으면 Avatar가 이름의 첫 글자로 떨어져서 fallback을 따로
            그리지 않는다. 바꾸는 곳은 온보딩 "꾸미기"다.

            둘을 겹쳐 보여준다 — 이 앱에서 "나"는 언제나 둘 중 하나라, 내 얼굴만
            덩그러니 있는 마이페이지는 이 앱의 화면 같지 않다. */}
        <AvatarGroup size="lg">
          <Avatar src={profile?.avatar_url ?? undefined} name={myName || '나'} />
          {partner && (
            <Avatar src={partner.avatar_url ?? undefined} name={partnerName || '상대방'} />
          )}
        </AvatarGroup>
        <VStack gap={0.5}>
          <Heading level={1}>{myName || '내 정보'}</Heading>
          <Text type="supporting">
            {partnerName ? `${partnerName}님과 연결돼 있어요.` : '아직 커플이 연결되지 않았어요.'}
          </Text>
        </VStack>
      </HStack>

      {/* 소셜 사진을 지금 가져온다.
          가입할 때 한 번 받아두긴 하지만, 그 뒤 꾸미기에서 직접 올렸거나
          사진이 안 뜨던 시절에 가입한 사람은 프로필에 그 사진이 없다. 세션에는
          로그인할 때마다 최신 값이 실려 오므로 여기서 꺼내 쓴다.
          로그인할 때 자동으로 덮지 않는 이유는 socialAvatar.ts 주석 참고 —
          직접 올린 사진이 매번 지워지면 고쳐준 게 아니라 뺏은 것이다.
          한 사람이 눌러도 그 사람 것만 바뀐다. 상대의 소셜 사진은 상대의
          세션에만 있어서, 각자 자기 기기에서 눌러야 한다. */}
      {canAdoptSocial && (
        <Button
          label={`${social.providerLabel} 프로필 사진으로 바꾸기`}
          variant="secondary"
          width="100%"
          icon={<ImageDown className="size-4" />}
          isLoading={adoptSocialAvatar.isPending}
          onClick={() => adoptSocialAvatar.mutate()}
        />
      )}

      <VStack gap={4}>
        <VStack gap={1}>
          <Heading level={2}>알림</Heading>
          <Text type="supporting">
            이 기기로 받을 알림을 정해요. 기기마다 따로 켜야 해요 — 폰에서 켜도
            노트북에는 오지 않아요.
          </Text>
        </VStack>

        {/* 스위치 둘을 Divider로 가른다. 디데이 스위치는 아래에 미리보기 세
            줄을 달고 나오는데, 가르는 선이 없으면 그 줄들이 다음 스위치에
            붙은 설명처럼 읽힌다 — 둘 사이 간격과 스위치·설명 사이 간격이
            같아서 무엇이 무엇에 속하는지 알 수가 없었다.

            매일 정해진 시각에 오는 것과, 상대가 눌러서 보내는 것. 스위치가
            둘인 이유도 성격이 달라서다 (디데이는 받고 싶지만 상대가 내 폰을
            울리는 건 싫을 수 있다). */}
        <NotificationSettings
          anniversaries={anniversaries ?? []}
          // 이 화면에는 기념일 목록이 없다. "위에서 고른"이 가리킬 곳이 없으므로
          // 문구를 바꾸고 갈 수 있는 버튼을 준다.
          hasAnniversaryList={false}
        />

        <Divider />

        <PartnerAlertSwitch profile={profile} />
      </VStack>
    </PageShell>
  )
}
