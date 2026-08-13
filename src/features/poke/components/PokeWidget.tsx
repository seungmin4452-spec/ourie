import { Button } from '@astryxdesign/core/Button'
import { Divider } from '@astryxdesign/core/Divider'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import { useToast } from '@astryxdesign/core/Toast'
import { VStack } from '@astryxdesign/core/VStack'
import { useQueryClient } from '@tanstack/react-query'
import { Settings2 } from 'lucide-react'
import { useState } from 'react'

import { useAuth } from '@/features/auth'
// 배럴(@/features/couple)이 아니라 훅 파일을 직접 가리킨다 — 배럴에는 홈
// 화면이 들어 있고, 그 홈이 다시 이 위젯을 가져오므로 순환 import가 된다.
import { partnerQueryKey, usePartner } from '@/features/couple/hooks/usePartner'
import { usePushNotifications, type PushState } from '@/features/notification'
import type { Profile } from '@/features/onboarding/api/profile'
import { setPokeOptIn } from '../api/partner'
import { PokeError, sendPoke } from '../api/poke'
import { pokeIcon } from '../catalog'
import { usePokePresets } from '../hooks/usePokePresets'
import { pokePresetIcon } from '../icons'
import { POKE_KINDS, POKE_LABELS, pokeNameLabel } from '../message'
import type { PokeTarget } from '../types'
import { PokePresetDialog } from './PokePresetDialog'

/**
 * 수신 동의 스위치를 아예 켤 수 없는 상태들. 알림 자체가 불가능한 기기라서,
 * 여기서는 되돌릴 방법이 없다.
 */
const UNAVAILABLE: Partial<Record<PushState, string>> = {
  unsupported: '이 브라우저는 알림을 지원하지 않아요.',
  'needs-install': '홈 화면에 추가한 앱에서만 알림을 받을 수 있어요.',
  blocked: '기기 설정에서 이 앱의 알림을 허용한 뒤 다시 시도해주세요.',
}

interface PokeWidgetProps {
  /** 홈이 이미 가져온 내 프로필. 같은 걸 또 조회하지 않으려고 받아 쓴다. */
  profile: Profile | null | undefined
}

/**
 * 홈 위젯 "콕 찌르기"의 본문.
 *
 * 이 위젯이 다른 위젯과 다른 점은 **내 화면이 아니라 상대방 기기를 건드린다**는
 * 것이다. 그래서 두 가지가 UI에 그대로 드러나야 한다:
 *
 * 1. 상대방이 받겠다고 하지 않았으면 보낼 수 없다. 눌러보고 실패를 보는 대신,
 *    누르기 전부터 버튼이 잠겨 있고 이유가 적혀 있다.
 * 2. 내 수신 동의도 이 자리에서 켠다. 보내는 화면과 받는 설정이 떨어져 있으면
 *    "왜 상대는 나한테 못 보내지?"를 아무도 못 찾는다.
 *
 * 실제 차단은 서버가 한다 (supabase/schema.sql의 send_poke). 여기 잠금은 안내다.
 *
 * 버튼은 기본으로 주는 것들 뒤에 커플이 만든 것들이 붙는다. 새로 만든 게
 * 아래에 쌓여야 이미 손에 익은 버튼의 자리가 흔들리지 않는다.
 */
export function PokeWidget({ profile }: PokeWidgetProps) {
  const { user } = useAuth()
  const showToast = useToast()
  const queryClient = useQueryClient()
  const { state: pushState, toggle: togglePush } = usePushNotifications(user?.id)
  const [isPresetDialogOpen, setIsPresetDialogOpen] = useState(false)

  const coupleId = profile?.couple_id
  const { data: partner, isLoading: isPartnerLoading } = usePartner(profile)

  const { data: presets } = usePokePresets(coupleId)

  const canSend = partner?.poke_opt_in === true
  const unavailableReason = UNAVAILABLE[pushState]

  /** 상대방 프로필과 내 프로필을 서버 상태와 다시 맞춘다. */
  async function refreshProfiles() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] }),
      queryClient.invalidateQueries({ queryKey: partnerQueryKey(coupleId) }),
    ])
  }

  async function send(target: PokeTarget, label: string) {
    try {
      const { delivered } = await sendPoke(target)
      if (delivered === 0) {
        // 동의는 켰는데 켜둔 기기가 하나도 없는 경우. 보낸 건 기록에 남지만
        // 상대는 모르므로, 전했다고 말하면 거짓말이 된다.
        showToast({ type: 'info', body: '보냈지만 상대방 기기에 닿지 않았어요.' })
        return
      }
      showToast({ type: 'info', body: `"${label}"라고 전했어요.` })
    } catch (error) {
      if (error instanceof PokeError) {
        // 1초 안에 두 번 눌린 것. 사용자가 뭘 잘못한 게 아니라 이미 보낸
        // 것이므로 토스트로 나무라지 않는다.
        if (error.code === 'too_soon') return

        // 우리가 알던 상태가 낡았다는 뜻이다 (상대가 방금 껐다). 다시 읽어
        // 버튼을 잠근다.
        if (error.code === 'not_opted_in') void refreshProfiles()

        // 상대가 방금 이 버튼을 지운 경우도 여기로 온다 (invalid_kind).
        // 목록을 다시 읽어 없어진 버튼을 화면에서도 치운다.
        if (error.code === 'invalid_kind' && target.type === 'custom') {
          void queryClient.invalidateQueries({ queryKey: ['poke-presets', coupleId] })
        }

        showToast({ type: 'error', body: error.message })
        return
      }
      showToast({ type: 'error', body: '알림을 보내지 못했어요.' })
    }
  }

  return (
    <VStack gap={4}>
      <VStack gap={2}>
        {POKE_KINDS.map((kind) => (
          <Button
            key={kind}
            label={POKE_LABELS[kind]}
            variant="secondary"
            width="100%"
            icon={pokeIcon(kind)}
            isDisabled={!canSend}
            tooltip={canSend ? undefined : '지금은 보낼 수 없어요.'}
            // clickAction은 promise가 끝날 때까지 버튼에 스피너를 띄우고 중복
            // 클릭을 막는다. 서버의 1초 쿨다운과 별개로, 느린 회선에서 연타가
            // 쌓이지 않게 하는 첫 번째 방어선이다.
            clickAction={() => send({ type: 'builtin', kind }, POKE_LABELS[kind])}
          />
        ))}

        {presets?.map((preset) => (
          <Button
            key={preset.id}
            label={preset.label}
            variant="secondary"
            width="100%"
            icon={pokePresetIcon(preset.icon)}
            isDisabled={!canSend}
            tooltip={canSend ? undefined : '지금은 보낼 수 없어요.'}
            clickAction={() => send({ type: 'custom', preset }, preset.label)}
          />
        ))}
      </VStack>

      {!canSend && !isPartnerLoading && (
        <Text type="supporting" justify="center">
          {partner
            ? `${pokeNameLabel(partner.name)}이 아직 콕 찌르기 알림을 켜지 않았어요.`
            : '커플이 연결되면 보낼 수 있어요.'}
        </Text>
      )}

      {/* 커플이 연결돼야 버튼을 만들 수 있다 — poke_presets는 커플 단위이고,
          RLS도 커플이 없으면 insert를 막는다. */}
      {coupleId != null && user != null && (
        <>
          <Button
            label="콕 찌르기 만들기"
            variant="ghost"
            width="100%"
            icon={<Settings2 className="size-4" />}
            onClick={() => setIsPresetDialogOpen(true)}
          />
          <PokePresetDialog
            isOpen={isPresetDialogOpen}
            onOpenChange={setIsPresetDialogOpen}
            coupleId={coupleId}
            userId={user.id}
            presets={presets ?? []}
          />
        </>
      )}

      <Divider />

      {/* 이 스위치 하나가 "상대방이 내 기기를 울리는 알림" 전부를 가른다.
          처음에는 콕 찌르기뿐이었지만 소원권 알림(api/wish.ts)도 같은
          profiles.poke_opt_in을 본다. 동의를 종류별로 쪼개면 스위치가 기능
          수만큼 늘어나는데, 사람들이 실제로 정하고 싶은 것은 "상대가 내 폰을
          울려도 되는가" 하나다. 그래서 문구를 둘 다 가리키게 적는다. */}
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
            await setPokeOptIn(user!.id, checked)
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
    </VStack>
  )
}
