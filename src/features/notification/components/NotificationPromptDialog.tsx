import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { HStack } from '@astryxdesign/core/HStack'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { List, ListItem } from '@astryxdesign/core/List'
import { Text } from '@astryxdesign/core/Text'
import { useToast } from '@astryxdesign/core/Toast'
import { VStack } from '@astryxdesign/core/VStack'
import { useQueryClient } from '@tanstack/react-query'
import { Bell, CalendarHeart, Pointer } from 'lucide-react'
import { useState } from 'react'

import { useAuth } from '@/features/auth'
// 배럴(@/features/couple)이 아니라 훅 파일을 직접 가리킨다 — 배럴에는 홈
// 화면이 들어 있고, 그 홈이 이 컴포넌트를 가져오므로 순환 import가 된다.
import { partnerQueryKey } from '@/features/couple/hooks/usePartner'
import type { Profile } from '@/features/onboarding/api/profile'
import { setPartnerAlertOptIn } from '../api/partnerAlerts'
import { usePushNotifications } from '../hooks/usePushNotifications'

/**
 * 한 번 물어봤다는 표시. 값이 아니라 **있느냐 없느냐**만 본다.
 *
 * 기기에 저장하는 이유: 이건 "알림을 켰는가"가 아니라 "이 기기에서 물어봤는가"다.
 * 서버에 두면 폰에서 거절한 사람이 노트북에서 앱을 열었을 때 묻지 못하는데,
 * 알림 권한은 애초에 기기마다 따로다.
 */
const ASKED_KEY = 'ourie-notification-asked'

function hasAsked(): boolean {
  try {
    return localStorage.getItem(ASKED_KEY) != null
  } catch {
    // 사파리 프라이빗 모드 등. 읽을 수 없으면 "물어봤다"고 보고 넘어간다 —
    // 저장도 안 될 테니, 아니라고 하면 열 때마다 다시 뜬다.
    return true
  }
}

function markAsked(): void {
  try {
    localStorage.setItem(ASKED_KEY, new Date().toISOString())
  } catch {
    // 저장 실패는 넘어간다. 이번 세션에서는 상태로 이미 닫혀 있다.
  }
}

interface NotificationPromptDialogProps {
  /** 홈이 이미 가져온 내 프로필. 수신 동의를 함께 켜는 데 쓴다. */
  profile: Profile | null | undefined
}

/**
 * 앱에 처음 들어왔을 때 한 번 뜨는 알림 안내.
 *
 * 스위치를 찾아 들어가야만 켤 수 있었을 때는 아무도 켜지 않았다. 이 앱의
 * 알림은 성가신 마케팅이 아니라 **기능 그 자체**다 — 매일 며칠째인지 알려주는
 * 것도, 상대가 콕 찌르고 소원권을 쓰는 것도 알림으로만 닿는다. 그래서 묻는다.
 *
 * 다만 **한 번만** 묻는다. 거절한 사람에게 다시 묻지 않는 것이 이 컴포넌트에서
 * 제일 중요한 규칙이고, 그래서 "켰는가"가 아니라 "물어봤는가"를 기기에 남긴다.
 * 마음이 바뀌면 마이페이지에서 언제든 켤 수 있다.
 *
 * 뜨지 않는 경우:
 * - 이미 켜져 있다 (물어볼 것이 없다)
 * - 이 기기·브라우저가 알림을 못 받는다 (홈 화면에 추가하지 않은 iOS 포함) —
 *   할 수 없는 일을 권하면 안내가 아니라 막다른 길이다
 * - 기기 설정에서 이미 막아뒀다 (여기서 되돌릴 방법이 없다)
 */
export function NotificationPromptDialog({ profile }: NotificationPromptDialogProps) {
  const { user } = useAuth()
  const showToast = useToast()
  const queryClient = useQueryClient()
  const { state, toggle } = usePushNotifications(user?.id)

  // 이번 화면에서 닫았는지. 처음 값은 "예전에 물어봤는가"다.
  const [isDismissed, setIsDismissed] = useState(hasAsked)
  const [isEnabling, setIsEnabling] = useState(false)

  // 열림 여부를 effect로 켜지 않고 렌더에서 유도한다. effect에서 setState하면
  // 연쇄 렌더가 되고(eslint react-hooks/set-state-in-effect), 무엇보다 여는
  // 조건이 상태가 아니라 계산이라 둘을 맞춰줄 이유가 없다.
  //
  // 'off'만 통과시키는 것이 중요하다. 'loading'인 동안 열면 이미 켜둔
  // 사람에게도 한 번 뜨고, 'blocked'/'needs-install'/'unsupported'는 여기서
  // 켤 방법이 없어 막다른 길이 된다.
  const isOpen = !isDismissed && state === 'off'

  function close() {
    markAsked()
    setIsDismissed(true)
  }

  async function enable() {
    setIsEnabling(true)
    try {
      // 권한 요청은 사용자 제스처 안에서 일어나야 한다. 버튼 클릭이 그 제스처다.
      await toggle(true)

      // 매일 알림만 켜고 끝내지 않는다. 여기서 묻는 것은 "알림을 받겠는가"
      // 하나이고, 상대가 보내는 알림을 따로 또 물으면 같은 질문을 두 번 하는
      // 셈이다. 세밀하게 나누고 싶은 사람을 위해 마이페이지에 스위치가 둘 있다.
      if (user != null) {
        await setPartnerAlertOptIn(user.id, true)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['profile', user.id] }),
          queryClient.invalidateQueries({ queryKey: partnerQueryKey(profile?.couple_id) }),
        ])
      }

      showToast({ type: 'info', body: '알림을 켰어요. 마이페이지에서 바꿀 수 있어요.' })
      close()
    } catch (error) {
      showToast({
        type: 'error',
        body: error instanceof Error ? error.message : '알림을 켜지 못했어요.',
      })
      // 닫되 물어봤다고 남긴다. 권한 창에서 거절한 경우가 대부분인데, 그때
      // 다시 물어도 브라우저가 창을 띄워주지 않는다.
      close()
    } finally {
      setIsEnabling(false)
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      // 바깥을 눌러 닫아도 물어본 것으로 친다. 다시 띄우면 그게 성가신 알림이다.
      onOpenChange={(nextIsOpen) => {
        if (!nextIsOpen) close()
      }}
      width={380}
    >
      <Layout
        header={<DialogHeader title="알림을 켤까요?" onOpenChange={() => close()} />}
        content={
          <LayoutContent>
            <VStack gap={4}>
              <Text type="supporting">
                Ourie는 알림으로 닿는 것이 많아요. 지금 켜두면 이런 것들을 놓치지
                않아요.
              </Text>

              <List hasDividers>
                <ListItem
                  startContent={<CalendarHeart className="size-4" />}
                  label="매일 아침 디데이"
                  description="오늘이 함께한 지 며칠째인지 아침 9시에 알려드려요."
                />
                <ListItem
                  startContent={<Pointer className="size-4" />}
                  label="상대방이 보내는 알림"
                  description="콕 찌르기와 소원권이 이 기기로 와요."
                />
              </List>

              <Text type="supporting">
                나중에 마이페이지에서 언제든 끄고 켤 수 있어요.
              </Text>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="center" justify="end">
              <Button
                type="button"
                label="나중에"
                variant="ghost"
                isDisabled={isEnabling}
                onClick={close}
              />
              <Button
                type="button"
                label="알림 켜기"
                variant="primary"
                icon={<Bell className="size-4" />}
                isLoading={isEnabling}
                onClick={() => void enable()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
