import { Switch } from '@astryxdesign/core/Switch'
import { useToast } from '@astryxdesign/core/Toast'
import { useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth'
// 배럴(@/features/couple)이 아니라 훅 파일을 직접 가리킨다 — 배럴에는 홈
// 화면이 들어 있고, 그 홈이 위젯을 거쳐 이 파일까지 닿으므로 순환 import가 된다.
import { partnerQueryKey } from '@/features/couple/hooks/usePartner'
import type { Profile } from '@/features/onboarding/api/profile'
import { setPartnerAlertOptIn } from '../api/partnerAlerts'
import { usePushNotifications, type PushState } from '../hooks/usePushNotifications'

/**
 * 스위치를 아예 켤 수 없는 상태들. 알림 자체가 불가능한 기기라서, 여기서는
 * 되돌릴 방법이 없다.
 */
const UNAVAILABLE: Partial<Record<PushState, string>> = {
  unsupported: '이 브라우저는 알림을 지원하지 않아요.',
  'needs-install': '홈 화면에 추가한 앱에서만 알림을 받을 수 있어요.',
  blocked: '기기 설정에서 이 앱의 알림을 허용한 뒤 다시 시도해주세요.',
}

interface PartnerAlertSwitchProps {
  /** 내 프로필. `poke_opt_in`을 읽는다. */
  profile: Profile | null | undefined
}

/**
 * "상대방이 보내는 알림 받기" 스위치.
 *
 * **이 스위치 하나가 상대방이 내 기기를 울리는 알림 전부를 가른다** — 콕
 * 찌르기와 소원권이 같은 `profiles.poke_opt_in`을 본다. 동의를 종류별로 쪼개면
 * 스위치가 기능 수만큼 늘어나는데, 사람들이 실제로 정하고 싶은 것은 "상대가 내
 * 폰을 울려도 되는가" 하나다.
 *
 * 콕 찌르기 위젯과 마이페이지가 같은 것을 쓴다. 둘이 각자 스위치를 들고 있던
 * 때가 있었는데, 그러면 알림 권한을 함께 켜는 아래 규칙을 한쪽에만 고치게 된다.
 */
export function PartnerAlertSwitch({ profile }: PartnerAlertSwitchProps) {
  const { user } = useAuth()
  const showToast = useToast()
  const queryClient = useQueryClient()
  const { state: pushState, toggle: togglePush } = usePushNotifications(user?.id)

  const unavailableReason = UNAVAILABLE[pushState]

  /** 내 프로필과 상대방 프로필을 서버 상태와 다시 맞춘다. */
  async function refreshProfiles() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] }),
      queryClient.invalidateQueries({ queryKey: partnerQueryKey(profile?.couple_id) }),
    ])
  }

  return (
    <Switch
      label="상대방이 보내는 알림 받기"
      description={
        unavailableReason ??
        (pushState === 'on'
          ? '콕 찌르기와 소원권 알림이 이 기기로 와요.'
          : '켜면 이 기기의 알림 권한도 함께 켜져요.')
      }
      labelSpacing="spread"
      width="100%"
      value={profile?.poke_opt_in ?? false}
      isLoading={pushState === 'loading'}
      isDisabled={pushState === 'loading' || unavailableReason != null || user == null}
      disabledMessage={unavailableReason}
      changeAction={async (checked) => {
        try {
          // 동의만 켜고 알림 구독이 없으면 아무것도 오지 않는다. 켜는
          // 방향일 때만 구독을 같이 만든다 — 끌 때 구독까지 지우면 매일
          // 디데이 알림도 같이 꺼져버린다.
          if (checked && pushState !== 'on') {
            await togglePush(true)
          }
          await setPartnerAlertOptIn(user!.id, checked)
          await refreshProfiles()
          showToast({
            type: 'info',
            body: checked
              ? '이제 상대방이 보낸 알림을 받아요.'
              : '상대방이 보내는 알림을 껐어요.',
          })
        } catch (error) {
          // changeAction이 던지면 처리되지 않은 거절로 남는다. 여기서 받아
          // 토스트로 알리고, 스위치는 서버 값으로 되돌린다 (낙관적 UI가
          // 켜진 채로 남지 않게).
          await refreshProfiles()
          showToast({
            type: 'error',
            body: error instanceof Error ? error.message : '설정에 실패했어요.',
          })
        }
      }}
    />
  )
}
