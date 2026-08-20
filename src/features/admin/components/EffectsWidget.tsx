import { Divider } from '@astryxdesign/core/Divider'
import { FileInput } from '@astryxdesign/core/FileInput'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import { useToast } from '@astryxdesign/core/Toast'
import { VStack } from '@astryxdesign/core/VStack'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  APP_EFFECT_LABELS,
  APP_EFFECTS_QUERY_KEY,
  useAppEffects,
  type AppEffectId,
} from '@/features/effects'
import { setAppEffect, uploadEffectImage } from '../api/effects'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** 벚꽃·눈처럼 켜고 끄기만 하면 되는 효과. custom_image는 이미지 업로드가
    같이 필요해서 아래에서 따로 그린다. */
const SIMPLE_EFFECT_IDS = ['cherry_blossom', 'snow'] as const satisfies readonly AppEffectId[]

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
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  async function handleToggle(id: AppEffectId, checked: boolean) {
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

  // 이미지 업로드는 스위치와 별개 동작이다 — 올린다고 자동으로 켜지진
  // 않는다. 이미 켜둔 상태에서 이미지만 바꾸는 경우(다음 시즌 이미지로
  // 교체 등)에는 이 편이 맞다: 새로 올릴 동안 잠깐 옛 이미지가 사라지는
  // 대신, 다 올라간 뒤 한 번에 바뀐다.
  async function handleUpload(file: File | File[] | null) {
    if (!(file instanceof File)) return

    setIsUploading(true)
    try {
      await uploadEffectImage(file)
      await queryClient.invalidateQueries({ queryKey: APP_EFFECTS_QUERY_KEY })
      showToast({ type: 'info', body: '이미지를 바꿨어요.' })
    } catch (error) {
      showToast({
        type: 'error',
        body: error instanceof Error ? error.message : '이미지를 올리지 못했어요.',
      })
    } finally {
      setIsUploading(false)
      setPendingImage(null)
    }
  }

  const hasImage = data?.customImageUrl != null

  return (
    <VStack gap={3}>
      {SIMPLE_EFFECT_IDS.map((id) => (
        <Switch
          key={id}
          label={`${APP_EFFECT_LABELS[id]} 내리기`}
          // labelPosition="start"가 없으면 토글이 앞, 라벨이 뒤로 간다 — 스위치
          // 줄은 글자가 왼쪽, 스위치가 오른쪽이다 (docs/UI_GUIDE.md §5.3.2).
          labelPosition="start"
          labelSpacing="spread"
          width="100%"
          value={data?.enabled[id] ?? false}
          isLoading={isLoading}
          isDisabled={isLoading}
          changeAction={(checked) => handleToggle(id, checked)}
        />
      ))}

      <Divider />

      <VStack gap={2}>
        {data?.customImageUrl && (
          <img
            src={data.customImageUrl}
            alt="지금 등록된 효과 이미지"
            className="size-12 rounded-md border border-border object-contain"
          />
        )}
        <FileInput
          label="떨어뜨릴 이미지"
          description="5MB 이하, 배경이 투명한 PNG를 권장해요."
          accept="image/*"
          maxSize={MAX_IMAGE_BYTES}
          value={pendingImage}
          onChange={(file) => setPendingImage(file instanceof File ? file : null)}
          changeAction={handleUpload}
          isLoading={isUploading}
        />
        {!hasImage && (
          <Text type="supporting">이미지를 올리면 아래 스위치를 켤 수 있어요.</Text>
        )}
      </VStack>

      <Switch
        label={`${APP_EFFECT_LABELS.custom_image} 내리기`}
        labelPosition="start"
        labelSpacing="spread"
        width="100%"
        value={data?.enabled.custom_image ?? false}
        isLoading={isLoading}
        isDisabled={isLoading || !hasImage}
        disabledMessage={hasImage ? undefined : '이미지를 먼저 올려야 켤 수 있어요.'}
        changeAction={(checked) => handleToggle('custom_image', checked)}
      />
    </VStack>
  )
}
