import { Switch } from '@astryxdesign/core/Switch'
import { useToast } from '@astryxdesign/core/Toast'
import { VStack } from '@astryxdesign/core/VStack'
import { useQueryClient } from '@tanstack/react-query'

import {
  APP_EFFECT_IDS,
  APP_EFFECT_LABELS,
  APP_EFFECTS_QUERY_KEY,
  useAppEffects,
  type AppEffectId,
} from '@/features/effects'
import { setAppEffect } from '../api/effects'

/**
 * 관리자 위젯 "특수효과" — 켜면 그 순간 모든 사용자의 홈 화면에 뜬다.
 *
 * 낙관적으로 스위치를 먼저 움직이지 않는다. 이건 내 화면 설정이 아니라
 * 전체 사용자에게 미치는 스위치라, 서버가 실제로 반영한 뒤에 움직이는 편이
 * 안전하다 — 실패했는데 켜진 것처럼 보이면 관리자가 "이미 켰다"고 오해한다.
 * 서버 응답 후 홈 화면과 같은 값을 다시 읽어(invalidate) 스위치에 반영한다.
 */
export function EffectsWidget() {
  const showToast = useToast()
  const queryClient = useQueryClient()
  const { data, isLoading } = useAppEffects()

  async function handleChange(id: AppEffectId, checked: boolean) {
    try {
      await setAppEffect(id, checked)
      await queryClient.invalidateQueries({ queryKey: APP_EFFECTS_QUERY_KEY })
      showToast({
        type: 'info',
        body: checked
          ? `${APP_EFFECT_LABELS[id]} 효과를 켰어요. 모두의 홈 화면에 바로 떠요.`
          : `${APP_EFFECT_LABELS[id]} 효과를 껐어요.`,
      })
    } catch (error) {
      showToast({
        type: 'error',
        body: error instanceof Error ? error.message : '효과를 바꾸지 못했어요.',
      })
    }
  }

  return (
    <VStack gap={3}>
      {APP_EFFECT_IDS.map((id) => (
        <Switch
          key={id}
          label={`${APP_EFFECT_LABELS[id]} 내리기`}
          // labelPosition="start"가 없으면 토글이 앞, 라벨이 뒤로 간다 — 스위치
          // 줄은 글자가 왼쪽, 스위치가 오른쪽이다 (docs/UI_GUIDE.md §5.3.2).
          labelPosition="start"
          labelSpacing="spread"
          width="100%"
          value={data?.[id] ?? false}
          isLoading={isLoading}
          isDisabled={isLoading}
          changeAction={(checked) => handleChange(id, checked)}
        />
      ))}
    </VStack>
  )
}
