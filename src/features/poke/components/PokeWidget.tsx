import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/HStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Text } from '@astryxdesign/core/Text'
import { useToast } from '@astryxdesign/core/Toast'
import { VStack } from '@astryxdesign/core/VStack'
import { useQueryClient } from '@tanstack/react-query'
import { Settings2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { useAuth } from '@/features/auth'
// 배럴(@/features/couple)이 아니라 훅 파일을 직접 가리킨다 — 배럴에는 홈
// 화면이 들어 있고, 그 홈이 다시 이 위젯을 가져오므로 순환 import가 된다.
import { partnerQueryKey, usePartner } from '@/features/couple/hooks/usePartner'
import type { Profile } from '@/features/onboarding/api/profile'
import { PokeError, sendPoke } from '../api/poke'
import { pokeIcon } from '../catalog'
import { usePokePresets } from '../hooks/usePokePresets'
import { pokePresetIcon } from '../icons'
import { POKE_KINDS, POKE_LABELS, pokeNameLabel } from '../message'
import type { PokeTarget } from '../types'
import { PokePresetDialog } from './PokePresetDialog'

interface PokeWidgetProps {
  /** 홈이 이미 가져온 내 프로필. 같은 걸 또 조회하지 않으려고 받아 쓴다. */
  profile: Profile | null | undefined
  /**
   * 절반 폭 타일일 때 true. 버튼을 세로로 쌓을 자리가 없어, 가로로 스와이프해
   * 넘기는 한 줄로 바꾼다 — 버튼이 늘어나도(직접 만든 버튼 포함) 타일이 세로로
   * 자라지 않고 옆으로 늘어난다.
   */
  isCompact?: boolean
}

/**
 * 홈 위젯 "콕 찌르기"의 본문.
 *
 * 이 위젯이 다른 위젯과 다른 점은 **내 화면이 아니라 상대방 기기를 건드린다**는
 * 것이다. 그래서 상대방이 받겠다고 하지 않았으면 보낼 수 없고, 눌러보고 실패를
 * 보는 대신 누르기 전부터 버튼이 잠겨 있고 이유가 적혀 있다. 실제 차단은 서버가
 * 한다 (supabase/schema.sql의 send_poke) — 여기 잠금은 안내다.
 *
 * **내 수신 동의 스위치는 여기 없다.** 한때 이 위젯 아래에 붙어 있었지만, 그건
 * 콕 찌르기만의 설정이 아니라 소원권 알림까지 함께 가르는 값이라 위젯 하나에
 * 얹혀 있을 것이 아니었다 (이 위젯을 홈에 올리지 않은 사람에게는 켤 자리가 아예
 * 없기도 했다). 지금은 마이페이지(/me)와 첫 실행 안내가 그 일을 맡는다.
 *
 * 버튼은 기본으로 주는 것들 뒤에 커플이 만든 것들이 붙는다. 새로 만든 게
 * 아래에 쌓여야 이미 손에 익은 버튼의 자리가 흔들리지 않는다.
 */
export function PokeWidget({ profile, isCompact }: PokeWidgetProps) {
  const { user } = useAuth()
  const showToast = useToast()
  const queryClient = useQueryClient()
  const [isPresetDialogOpen, setIsPresetDialogOpen] = useState(false)

  const coupleId = profile?.couple_id
  const { data: partner, isLoading: isPartnerLoading } = usePartner(profile)

  const { data: presets } = usePokePresets(coupleId)

  const canSend = partner?.poke_opt_in === true

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

  const buttons = (
    <>
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
    </>
  )

  // 절반 폭에서는 Button(아이콘+글자가 가로로 나란한 알약 모양)을 그대로
  // 줄 세우지 않는다 — 카드 높이가 옆 타일(소원권 등)에 맞춰 늘어나면 알약
  // 버튼들이 위쪽에만 몰리고 아래는 빈 채로 남아 엉뚱해 보인다. 아이콘이
  // 위, 이름이 아래인 정사각형에 가까운 칩으로 바꿔 카드가 늘어나도 자연스럽게
  // 어울리는 크기를 갖게 한다. 실제 버튼은 IconButton이 맡고(접근성 이름도
  // 그쪽에 있다), 아래 글자는 눈으로만 보는 라벨이라 스크린리더에서 뺀다.
  function chip(key: string, label: string, icon: ReactNode, onPress: () => void) {
    return (
      <VStack key={key} gap={1} vAlign="center" className="w-16 shrink-0">
        <IconButton
          label={label}
          tooltip={canSend ? undefined : '지금은 보낼 수 없어요.'}
          variant="secondary"
          size="lg"
          icon={icon}
          isDisabled={!canSend}
          clickAction={onPress}
        />
        <Text type="supporting" justify="center" maxLines={1} aria-hidden="true">
          {label}
        </Text>
      </VStack>
    )
  }

  const chips = (
    <>
      {POKE_KINDS.map((kind) =>
        chip(kind, POKE_LABELS[kind], pokeIcon(kind), () =>
          send({ type: 'builtin', kind }, POKE_LABELS[kind]),
        ),
      )}
      {presets?.map((preset) =>
        chip(preset.id, preset.label, pokePresetIcon(preset.icon), () =>
          send({ type: 'custom', preset }, preset.label),
        ),
      )}
    </>
  )

  // 커플이 연결돼야 버튼을 만들 수 있다 — poke_presets는 커플 단위이고,
  // RLS도 커플이 없으면 insert를 막는다.
  const canCreatePreset = coupleId != null && user != null

  return (
    <VStack gap={isCompact ? 2 : 4}>
      {isCompact ? (
        <HStack gap={2} isScrollable>
          {chips}
          {canCreatePreset && (
            <VStack gap={1} vAlign="center" className="w-16 shrink-0">
              <IconButton
                label="콕 찌르기 만들기"
                tooltip="콕 찌르기 만들기"
                variant="ghost"
                size="lg"
                icon={<Settings2 className="size-4" />}
                onClick={() => setIsPresetDialogOpen(true)}
              />
            </VStack>
          )}
        </HStack>
      ) : (
        <VStack gap={2}>{buttons}</VStack>
      )}

      {!canSend && !isPartnerLoading && (
        <Text type="supporting" justify="center" maxLines={isCompact ? 1 : undefined}>
          {partner
            ? `${pokeNameLabel(partner.name)}이 아직 콕 찌르기 알림을 켜지 않았어요.`
            : '커플이 연결되면 보낼 수 있어요.'}
        </Text>
      )}

      {!isCompact && canCreatePreset && (
        <Button
          label="콕 찌르기 만들기"
          variant="ghost"
          width="100%"
          icon={<Settings2 className="size-4" />}
          onClick={() => setIsPresetDialogOpen(true)}
        />
      )}

      {canCreatePreset && (
        <PokePresetDialog
          isOpen={isPresetDialogOpen}
          onOpenChange={setIsPresetDialogOpen}
          coupleId={coupleId}
          userId={user.id}
          presets={presets ?? []}
        />
      )}
    </VStack>
  )
}
