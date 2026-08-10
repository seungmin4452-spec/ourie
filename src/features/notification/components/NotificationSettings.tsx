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
  // "9시쯤"인 이유: Vercel Hobby 플랜은 cron 실행 시각을 ±59분까지만 보장한다
  // (9시 정각에 걸어도 9시 59분에 갈 수 있다). 분 단위로 맞추려면 Pro 플랜이
  // 필요하다 — ARCHITECTURE.md §6.1 참고.
  on: '매일 아침 9시쯤 오늘이 며칠째인지 알려드려요.',
  off: '매일 아침 9시쯤 오늘이 며칠째인지 알려드려요.',
  blocked: '기기 설정에서 이 앱의 알림을 허용한 뒤 다시 시도해주세요.',
  'needs-install': '홈 화면에 추가한 앱에서만 알림을 받을 수 있어요.',
  unsupported: '이 브라우저는 알림을 지원하지 않아요.',
}

interface NotificationSettingsProps {
  /** 알림 기준을 고르고 미리보기를 만드는 데 쓴다. */
  anniversaries: Anniversary[]
}

/**
 * 기념일 화면 아래에 붙는 알림 설정.
 *
 * Card로 감싸지 않는다 — 이건 독립적으로 떼었다 붙이는 조각이 아니라 페이지의
 * 한 구역이고, Astryx는 그런 구역을 카드로 감싸지 말라고 못 박고 있다
 * ("Notification Preferences"가 문서에 나오는 바로 그 예시다).
 */
export function NotificationSettings({ anniversaries }: NotificationSettingsProps) {
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
            void openPwaInstallPage(profile?.nickname?.trim() ?? '', profile?.avatar_url ?? null)
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
            "{preview.base.title}"을(를) 기준으로 세요. 기념일이 여럿이면 가장 오래된
            기준일을 씁니다.
          </Text>
        </VStack>
      )}
    </VStack>
  )
}
