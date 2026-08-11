import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Divider } from '@astryxdesign/core/Divider'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { List, ListItem } from '@astryxdesign/core/List'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useToast } from '@astryxdesign/core/Toast'
import { ToggleButton } from '@astryxdesign/core/ToggleButton'
import { VStack } from '@astryxdesign/core/VStack'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { HandHeart, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { createPokePreset, deletePokePreset } from '../api/presets'
import { pokePresetsQueryKey } from '../hooks/usePokePresets'
import {
  DEFAULT_POKE_ICON,
  POKE_ICON_NAMES,
  pokeIconLabel,
  pokePresetIcon,
  type PokeIconName,
} from '../icons'
import { POKE_PRESET_LIMITS, POKE_PRESET_MAX, pokeNameLabel } from '../message'
import type { PokePreset } from '../types'

interface PokePresetDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  coupleId: string
  userId: string
  presets: PokePreset[]
  /** 알림 미리보기에 쓸 내 이름 (`profiles.name`). */
  senderName: string | null | undefined
}

/**
 * 커플이 콕 찌르기 버튼을 만들고 지우는 화면.
 *
 * 목록과 만드는 폼을 한 다이얼로그에 같이 둔다. 화면을 나누면 "만들고 → 돌아와
 * 확인하고 → 또 만들고"가 되는데, 여기서 만드는 건 짧은 문장 하나라 그만한
 * 무게가 아니다.
 *
 * 삭제에 확인 단계를 두지 않은 것도 같은 이유다. 버튼 하나는 몇 초면 다시
 * 만들 수 있고, 확인 다이얼로그를 이 다이얼로그 위에 겹치면 포커스가 서로
 * 다투기 시작한다.
 */
export function PokePresetDialog({
  isOpen,
  onOpenChange,
  coupleId,
  userId,
  presets,
  senderName,
}: PokePresetDialogProps) {
  const queryClient = useQueryClient()
  const showToast = useToast()

  const [icon, setIcon] = useState<PokeIconName>(DEFAULT_POKE_ICON)
  const [label, setLabel] = useState('')
  const [body, setBody] = useState('')

  const isFull = presets.length >= POKE_PRESET_MAX
  const trimmedLabel = label.trim()
  const trimmedBody = body.trim()
  const canSubmit =
    !isFull &&
    trimmedLabel.length > 0 &&
    trimmedLabel.length <= POKE_PRESET_LIMITS.label &&
    trimmedBody.length > 0 &&
    trimmedBody.length <= POKE_PRESET_LIMITS.body

  async function refreshPresets() {
    await queryClient.invalidateQueries({ queryKey: pokePresetsQueryKey(coupleId) })
  }

  const creation = useMutation({
    mutationFn: () =>
      createPokePreset(coupleId, userId, {
        icon,
        label: trimmedLabel,
        body: trimmedBody,
      }),
    onSuccess: async () => {
      await refreshPresets()
      showToast({ type: 'info', body: `"${trimmedLabel}" 버튼을 만들었어요.` })
      // 아이콘은 그대로 둔다. 연달아 만들 때 비슷한 걸 고르는 경우가 많다.
      setLabel('')
      setBody('')
    },
    onError: (error) => {
      showToast({
        type: 'error',
        body: error instanceof Error ? error.message : '버튼을 만들지 못했어요.',
      })
    },
  })

  const deletion = useMutation({
    mutationFn: (preset: PokePreset) => deletePokePreset(preset.id),
    onSuccess: async (_data, preset) => {
      await refreshPresets()
      showToast({ type: 'info', body: `"${preset.label}" 버튼을 지웠어요.` })
    },
    onError: (error) => {
      showToast({
        type: 'error',
        body: error instanceof Error ? error.message : '버튼을 지우지 못했어요.',
      })
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    creation.mutate()
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={420}>
      <form onSubmit={handleSubmit}>
        <Layout
          header={
            <DialogHeader title="콕 찌르기 만들기" onOpenChange={() => onOpenChange(false)} />
          }
          content={
            <LayoutContent>
              <VStack gap={5}>
                {presets.length === 0 ? (
                  <EmptyState
                    isCompact
                    icon={<HandHeart className="size-6" />}
                    title="아직 만든 버튼이 없어요"
                    description="아래에서 아이콘과 문구를 정하면 위젯에 버튼이 하나 늘어나요."
                  />
                ) : (
                  <VStack gap={2}>
                    <Heading level={2}>만들어둔 버튼</Heading>
                    <List hasDividers>
                      {presets.map((preset) => (
                        <ListItem
                          key={preset.id}
                          label={preset.label}
                          description={preset.body}
                          startContent={pokePresetIcon(preset.icon)}
                          endContent={
                            <IconButton
                              label={`${preset.label} 버튼 삭제`}
                              tooltip="삭제"
                              variant="ghost"
                              size="sm"
                              icon={<Trash2 className="size-4" />}
                              isDisabled={deletion.isPending}
                              onClick={() => deletion.mutate(preset)}
                            />
                          }
                        />
                      ))}
                    </List>
                  </VStack>
                )}

                <Divider />

                <VStack gap={4}>
                  <Heading level={2}>새 버튼</Heading>

                  <VStack gap={2}>
                    <Text type="label">아이콘</Text>
                    {/* ToggleButtonGroup을 쓰지 않는다. 그건 inline-flex에
                        flex-wrap이 없어서 16개가 한 줄로 넘쳐버린다. Grid는
                        줄을 바꾸므로 다이얼로그 폭 안에 두 줄로 들어온다.
                        justify="start"가 없으면 버튼이 칸 너비만큼 늘어난다.

                        그래서 각 버튼의 눌림 상태를 직접 들고 있는데, 대신
                        "항상 하나는 골라져 있다"를 여기서 지킬 수 있다 —
                        그룹은 다시 누르면 선택이 풀려 아이콘 없는 상태가 된다. */}
                    <Grid columns={8} gap={1} justify="start">
                      {POKE_ICON_NAMES.map((name) => (
                        <ToggleButton
                          key={name}
                          label={pokeIconLabel(name)}
                          isIconOnly
                          size="sm"
                          icon={pokePresetIcon(name)}
                          isPressed={icon === name}
                          onPressedChange={(isPressed) => {
                            if (isPressed) setIcon(name)
                          }}
                        />
                      ))}
                    </Grid>
                  </VStack>

                  <TextInput
                    label="제목"
                    htmlName="poke-preset-label"
                    placeholder="예: 밥 먹었어?"
                    description={`위젯 버튼에 적히고, 알림 제목에도 그대로 들어가요. ${POKE_PRESET_LIMITS.label}자까지.`}
                    isRequired
                    // TextInput에는 TextArea 같은 글자 수 카운터가 없다. 넘겼을
                    // 때만 알려주고, 저장은 canSubmit이 막는다 (DB의 check
                    // 제약에 걸려 알 수 없는 에러가 나기 전에).
                    status={
                      trimmedLabel.length > POKE_PRESET_LIMITS.label
                        ? {
                            type: 'error',
                            message: `${POKE_PRESET_LIMITS.label}자까지 쓸 수 있어요.`,
                          }
                        : undefined
                    }
                    value={label}
                    onChange={setLabel}
                  />

                  <TextArea
                    label="알림 내용"
                    htmlName="poke-preset-body"
                    placeholder="예: 아직이면 같이 먹자"
                    isRequired
                    rows={2}
                    maxLength={POKE_PRESET_LIMITS.body}
                    value={body}
                    onChange={setBody}
                  />

                  {/* 보내기 전에 무엇이 갈지 알고 누르는 것이 이 기능의 전부다.
                      (message.ts의 "문구를 무작위로 고르지 않는다" 주석 참고) */}
                  <VStack gap={0.5}>
                    <Text type="supporting">상대방에게는 이렇게 떠요</Text>
                    <Text weight="medium">
                      {`${pokeNameLabel(senderName)}: ${trimmedLabel || '제목'}`}
                    </Text>
                    <Text type="supporting">{trimmedBody || '알림 내용'}</Text>
                  </VStack>

                  {isFull && (
                    <Text type="supporting">
                      버튼은 {POKE_PRESET_MAX}개까지 만들 수 있어요. 하나를 지우면 더
                      만들 수 있어요.
                    </Text>
                  )}
                </VStack>
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="center" justify="end">
                <Button
                  type="button"
                  label="닫기"
                  variant="secondary"
                  onClick={() => onOpenChange(false)}
                />
                <Button
                  type="submit"
                  label="버튼 만들기"
                  variant="primary"
                  icon={<Plus className="size-4" />}
                  isLoading={creation.isPending}
                  isDisabled={!canSubmit}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </form>
    </Dialog>
  )
}
