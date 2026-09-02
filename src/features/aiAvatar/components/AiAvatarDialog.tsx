import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { useToast } from '@astryxdesign/core/Toast'
import { VStack } from '@astryxdesign/core/VStack'
import { Sparkles } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'

import type { AiAvatarGenerationWithUrl } from '../api/aiAvatar'
import { useAiAvatarGenerations } from '../hooks/useAiAvatarGenerations'
import { useGenerateAiAvatar } from '../hooks/useGenerateAiAvatar'
import { aiAvatarPhotoFileProblem } from '../photoFile'
import { AI_AVATAR_THEMES, findAiAvatarTheme, type AiAvatarTheme } from '../themes'

interface AiAvatarDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  coupleId: string
  userId: string
}

/**
 * 주제를 고르고, 사진을 올리고, 지난 아바타들을 보는 화면.
 *
 * 사진첩이 바로 열리지 않는 이유는 RegionPhotoDialog와 다르다 — 여기선
 * "무엇을 만들지"부터 정해야 하니, 주제 버튼 자체가 그 확인 단계를 겸한다
 * (버튼을 누르는 행위가 곧 "이 스타일로 만들래"라는 뜻이다).
 */
export function AiAvatarDialog({ isOpen, onOpenChange, coupleId, userId }: AiAvatarDialogProps) {
  const showToast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingTheme, setPendingTheme] = useState<AiAvatarTheme | null>(null)

  const { generations, refresh } = useAiAvatarGenerations(coupleId)
  const generate = useGenerateAiAvatar()

  function pickTheme(theme: AiAvatarTheme) {
    setPendingTheme(theme)
    fileInputRef.current?.click()
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // 같은 파일을 다시 고를 수 있게 비운다 (RegionPhotoDialog와 같은 이유).
    event.target.value = ''
    const theme = pendingTheme
    if (!file || !theme) return

    const problem = aiAvatarPhotoFileProblem(file)
    if (problem) {
      showToast({ type: 'error', body: problem })
      return
    }

    generate.mutate(
      { coupleId, userId, theme, file },
      {
        onSuccess: async () => {
          await refresh()
          showToast({ type: 'info', body: `${theme.title} 아바타를 만들었어요.` })
        },
        onError: (error) => {
          showToast({
            type: 'error',
            body: error instanceof Error ? error.message : '아바타를 만들지 못했어요.',
          })
        },
      },
    )
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={420}>
      <Layout
        header={<DialogHeader title="AI 아바타" onOpenChange={() => onOpenChange(false)} />}
        content={
          <LayoutContent>
            <VStack gap={5}>
              <VStack gap={3}>
                <Text type="supporting">
                  주제를 고르면 사진첩이 열려요. 고른 사진 속 얼굴은 그대로 알아볼 수
                  있게 유지한 채로 스타일만 바꿔드려요.
                </Text>

                <VStack gap={2}>
                  {AI_AVATAR_THEMES.map((theme) => (
                    <VStack key={theme.id} gap={1}>
                      <Button
                        label={theme.title}
                        variant="secondary"
                        width="100%"
                        isLoading={generate.isPending && pendingTheme?.id === theme.id}
                        isDisabled={generate.isPending && pendingTheme?.id !== theme.id}
                        onClick={() => pickTheme(theme)}
                      />
                      <Text type="supporting">{theme.description}</Text>
                    </VStack>
                  ))}
                </VStack>
              </VStack>

              {generations.length === 0 ? (
                <EmptyState
                  isCompact
                  icon={<Sparkles className="size-6" />}
                  title="아직 만든 아바타가 없어요"
                  description="위 주제 중 하나를 골라 사진을 올려보세요."
                />
              ) : (
                <VStack gap={2}>
                  <Heading level={2}>만든 아바타들</Heading>
                  <VStack gap={3}>
                    {generations.map((generation) => (
                      <AiAvatarThumbnail key={generation.id} generation={generation} />
                    ))}
                  </VStack>
                </VStack>
              )}
            </VStack>
          </LayoutContent>
        }
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </Dialog>
  )
}

/** "9월 2일" 같은 한 줄. wishDateLabel(features/wish/board.ts)과 같은 모양이다. */
function dateLabel(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

function AiAvatarThumbnail({ generation }: { generation: AiAvatarGenerationWithUrl }) {
  const theme = findAiAvatarTheme(generation.theme_id)

  return (
    <HStack gap={3} vAlign="center">
      {generation.url && (
        <img
          src={generation.url}
          alt=""
          className="size-16 shrink-0 rounded-md border border-border object-cover"
        />
      )}
      <VStack gap={0}>
        <Text weight="medium">{theme?.title ?? '아바타'}</Text>
        <Text type="supporting">{dateLabel(generation.created_at)}</Text>
      </VStack>
    </HStack>
  )
}
