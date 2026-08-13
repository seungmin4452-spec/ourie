import { Button } from '@astryxdesign/core/Button'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import { useToast } from '@astryxdesign/core/Toast'
import { VStack } from '@astryxdesign/core/VStack'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { startOfToday, toDateKey, type Anniversary } from '@/features/anniversary'
import { useAuth } from '@/features/auth'
import { getProfile } from '@/features/onboarding/api/profile'
import { openPwaInstallPage } from '@/features/onboarding/pwaInstall'
import { pickBaseAnniversary } from '../baseAnniversary'
import { usePushNotifications, type PushState } from '../hooks/usePushNotifications'
import { buildDdayNotification } from '../message'

/** 상태별로 스위치 아래에 붙는 한 줄. */
const DESCRIPTIONS: Record<PushState, string> = {
  loading: '알림을 켤 수 있는지 확인하고 있어요.',
  // "쯤"이 빠진 이유: 예전엔 Vercel Hobby cron이라 실행 시각이 ±59분까지
  // 흔들렸는데, pg_cron으로 옮기면서 정각에 돈다. 시각을 바꾸면 여기 문구도
  // 같이 고쳐야 한다 (스케줄은 ARCHITECTURE.md §6.1 참고).
  on: '매일 아침 9시에 오늘이 며칠째인지 알려드려요.',
  off: '매일 아침 9시에 오늘이 며칠째인지 알려드려요.',
  blocked: '기기 설정에서 이 앱의 알림을 허용한 뒤 다시 시도해주세요.',
  'needs-install': '홈 화면에 추가한 앱에서만 알림을 받을 수 있어요.',
  unsupported: '이 브라우저는 알림을 지원하지 않아요.',
}

interface NotificationSettingsProps {
  /** 알림 기준을 고르고 미리보기를 만드는 데 쓴다. */
  anniversaries: Anniversary[]
  /**
   * 기념일 목록이 **이 화면에 함께 있는지**.
   *
   * 기념일 화면에서는 스위치 바로 위에 목록이 있어서 "위에서 고른 것"이라고
   * 가리킬 수 있지만, 마이페이지에는 그 목록이 없다. 없는 것을 가리키면 안내가
   * 아니라 수수께끼가 되므로, 그때는 문구를 바꾸고 갈 수 있는 버튼을 준다.
   */
  hasAnniversaryList?: boolean
}

/**
 * 기념일 화면 아래에 붙는 알림 설정.
 *
 * Card로 감싸지 않는다 — 이건 독립적으로 떼었다 붙이는 조각이 아니라 페이지의
 * 한 구역이고, Astryx는 그런 구역을 카드로 감싸지 말라고 못 박고 있다
 * ("Notification Preferences"가 문서에 나오는 바로 그 예시다).
 */
export function NotificationSettings({
  anniversaries,
  hasAnniversaryList = true,
}: NotificationSettingsProps) {
  const { user } = useAuth()
  const showToast = useToast()
  const { state, toggle } = usePushNotifications(user?.id)

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: user != null,
  })

  // 오늘 알림이 왔다면 어떤 문구일지 그대로 보여준다. 100일이나 주년이 가까우면
  // 이 자리에서 먼저 눈에 띄고, 스위치를 켤 이유가 된다.
  const preview = useMemo(() => {
    const base = pickBaseAnniversary(anniversaries)
    if (!base) return null
    return {
      base,
      message: buildDdayNotification({
        anniversaryTitle: base.title,
        date: base.date,
        today: toDateKey(startOfToday()),
      }),
    }
  }, [anniversaries])

  const isUnavailable = state === 'unsupported' || state === 'needs-install' || state === 'blocked'
  const hasNoAnniversary = preview == null

  return (
    <VStack gap={3}>
      <Switch
        label="매일 디데이 알림"
        description={DESCRIPTIONS[state]}
        // labelPosition="start"가 없으면 토글이 앞, 라벨이 뒤로 간다. spread가
        // 그 둘을 양 끝으로 밀어내므로 화면 왼쪽 끝에 토글만 덩그러니 놓이고
        // 글자는 오른쪽 끝에 붙어 오른쪽 정렬처럼 보인다 — 아래 설명·미리보기와
        // 아무것도 맞지 않는다. 설정 줄은 글자가 왼쪽, 스위치가 오른쪽이다.
        labelPosition="start"
        labelSpacing="spread"
        width="100%"
        value={state === 'on'}
        isLoading={state === 'loading'}
        isDisabled={state === 'loading' || isUnavailable || hasNoAnniversary}
        disabledMessage={
          hasNoAnniversary && !isUnavailable
            ? '기념일을 먼저 등록하면 켤 수 있어요.'
            : undefined
        }
        changeAction={async (checked) => {
          try {
            await toggle(checked)
            showToast({
              type: 'info',
              body: checked ? '매일 아침 알림을 보내드릴게요.' : '알림을 껐어요.',
            })
          } catch (error) {
            // changeAction이 던지면 처리되지 않은 거절로 남는다. 여기서 받아
            // 토스트로 알리고, 스위치는 훅이 실제 상태로 되돌려놓는다.
            showToast({
              type: 'error',
              body: error instanceof Error ? error.message : '알림 설정에 실패했어요.',
            })
          }
        }}
      />

      {state === 'needs-install' && (
        <Button
          label="홈 화면에 추가하기"
          variant="secondary"
          width="100%"
          onClick={() =>
            void openPwaInstallPage(profile?.app_name?.trim() ?? '', profile?.avatar_url ?? null)
          }
        />
      )}

      {preview && !isUnavailable && (
        <VStack gap={0.5}>
          <Text type="supporting">
            오늘 알림: {preview.message.title}
          </Text>
          <Text type="supporting">{preview.message.body}</Text>
          <Text type="supporting">
            {/* "위에서 고른"은 목록이 같은 화면에 있을 때만 쓸 수 있는 말이다.
                마이페이지에는 그 목록이 없어서, 없는 것을 가리키게 된다. */}
            {hasAnniversaryList
              ? `위에서 고른 "${preview.base.title}" 하나만 알려드려요. 다른 기념일을 고르면 알림도 그쪽으로 바뀝니다.`
              : `골라둔 "${preview.base.title}" 하나만 알려드려요. 기념일 화면에서 다른 기념일을 고를 수 있어요.`}
          </Text>
        </VStack>
      )}

    </VStack>
  )
}
