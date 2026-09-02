import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { useToast } from '@astryxdesign/core/Toast'
import { VStack } from '@astryxdesign/core/VStack'
import { useMutation } from '@tanstack/react-query'
import { Download, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import { deleteAiAvatarGeneration, type AiAvatarGenerationWithUrl } from '../api/aiAvatar'
import { useAiAvatarGenerations } from '../hooks/useAiAvatarGenerations'
import { aiAvatarStageLabel, useGenerateAiAvatar } from '../hooks/useGenerateAiAvatar'
import { aiAvatarPhotoFileProblem } from '../photoFile'
import { AI_AVATAR_THEMES, findAiAvatarTheme, type AiAvatarTheme } from '../themes'

/**
 * 이 정도 지나면 "느리다" 안내를 보여준다.
 *
 * 요청 자체를 끊지는 않는다 — useGenerateAiAvatar.ts의 GENERATION_TIMEOUT_MS
 * 주석 참고. 여기서는 그저 사용자가 "멈춘 건가?" 싶어할 시점에 미리 말해주는
 * 것뿐이라, 짧게(20초) 잡아도 된다.
 */
const SLOW_NOTICE_MS = 20 * 1000

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
  const [pendingSince, setPendingSince] = useState<number | null>(null)
  const [isSlow, setIsSlow] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const { generations, refresh } = useAiAvatarGenerations(coupleId)
  const generate = useGenerateAiAvatar()

  // pendingSince가 있는 동안만 돈다 — 생성이 끝나면(성공/실패 모두) 아래
  // mutate의 onSettled가 null로 되돌려 정리한다.
  useEffect(() => {
    if (pendingSince == null) return
    const timer = setInterval(() => {
      const elapsed = Date.now() - pendingSince
      setElapsedSeconds(Math.floor(elapsed / 1000))
      if (elapsed >= SLOW_NOTICE_MS) setIsSlow(true)
    }, 1000)
    return () => clearInterval(timer)
  }, [pendingSince])

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

    setPendingSince(Date.now())
    setIsSlow(false)
    setElapsedSeconds(0)

    generate.mutate(
      { coupleId, userId, theme, file },
      {
        onSuccess: async () => {
          await refresh()
          showToast({ type: 'info', body: `${theme.title} 아바타를 만들었어요.` })
        },
        onError: (error) => {
          // generate.stage는 실패 시점에 멈춰 있는 마지막 단계다 — 어디서
          // 막혔는지를 에러 문구에 그대로 남긴다.
          const stageLabel = generate.stage ? `${aiAvatarStageLabel(generate.stage)} — ` : ''
          showToast({
            type: 'error',
            body: `${stageLabel}${error instanceof Error ? error.message : '아바타를 만들지 못했어요.'}`,
          })
        },
        onSettled: () => {
          setPendingSince(null)
          setIsSlow(false)
          setElapsedSeconds(0)
        },
      },
    )
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={420}>
      <Layout
        header={<DialogHeader title="AI 이미지 생성" onOpenChange={() => onOpenChange(false)} />}
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
                    <Button
                      key={theme.id}
                      label={theme.title}
                      variant="secondary"
                      width="100%"
                      isLoading={generate.isPending && pendingTheme?.id === theme.id}
                      isDisabled={generate.isPending && pendingTheme?.id !== theme.id}
                      onClick={() => pickTheme(theme)}
                    />
                  ))}
                </VStack>

                {/* 지금 어느 단계인지 그대로 보여준다 — 폰으로 쓰면 콘솔을 열어볼
                    수 없으니, "멈췄나?" 싶을 때 어디서 안 넘어가고 있는지를
                    여기서 눈으로 확인할 수 있어야 한다. */}
                {generate.isPending && generate.stage && (
                  <Text type="supporting">
                    {aiAvatarStageLabel(generate.stage)} · {elapsedSeconds}초째
                  </Text>
                )}

                {/* 요청을 끊지 않고 그대로 기다린다(useGenerateAiAvatar.ts의
                    GENERATION_TIMEOUT_MS 주석 참고) — 그러니 여기서도 "실패"가
                    아니라 "기다려도, 나가도 된다"고 말해준다. */}
                {isSlow && (
                  <Text type="supporting">
                    평소보다 오래 걸리고 있어요. 이 화면을 나가도 계속 만들어지고,
                    완성되면 갤러리에 나타나요.
                  </Text>
                )}
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
                      <AiAvatarThumbnail
                        key={generation.id}
                        generation={generation}
                        onDeleted={refresh}
                      />
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

/**
 * 신호 URL이 가리키는 이미지를 실제로 폰에 남긴다.
 *
 * `<a download>`을 안 쓰는 이유: Storage 서명 URL은 다른 origin이라, iOS
 * Safari/PWA는 `download` 속성을 무시하고 그냥 이미지를 새 탭에 열어버린다
 * (그러면 "사진 앱에 저장"까지 가려면 사용자가 직접 길게 눌러야 한다). Web
 * Share API로 파일 자체를 공유 시트에 넘기면, 그 시트의 "이미지 저장"이
 * 갤러리/사진 앱에 바로 남겨준다 — 안드로이드 크롬도 같은 시트를 띄운다.
 * `navigator.share`가 없는 경우(데스크톱 등)만 `<a download>`으로 대체한다.
 */
async function saveAiAvatarToDevice(url: string, fileName: string): Promise<void> {
  const response = await fetch(url)
  const blob = await response.blob()
  const file = new File([blob], fileName, { type: blob.type || 'image/png' })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
    } catch {
      // 사용자가 공유 시트를 닫았을 뿐 — 에러가 아니다 (InviteCodeCard와 같은 판단).
    }
    return
  }

  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = fileName
  link.click()
  URL.revokeObjectURL(link.href)
}

interface AiAvatarThumbnailProps {
  generation: AiAvatarGenerationWithUrl
  /** 지운 뒤 위젯의 갤러리까지 같이 맞춘다(useAiAvatarGenerations의 refresh). */
  onDeleted: () => Promise<unknown>
}

function AiAvatarThumbnail({ generation, onDeleted }: AiAvatarThumbnailProps) {
  const showToast = useToast()
  const theme = findAiAvatarTheme(generation.theme_id)
  const [isSaving, setIsSaving] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const remove = useMutation({
    mutationFn: () => deleteAiAvatarGeneration(generation.id, generation.storage_path),
    onSuccess: () => onDeleted(),
    onError: () => showToast({ type: 'error', body: '아바타를 지우지 못했어요.' }),
  })

  async function handleSave() {
    if (!generation.url) return
    setIsSaving(true)
    try {
      await saveAiAvatarToDevice(generation.url, `ourie-ai-avatar-${generation.id}.png`)
    } catch {
      showToast({ type: 'error', body: '이미지를 저장하지 못했어요.' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <VStack gap={2}>
      {/* 크게 볼 땐 오른쪽 썸네일 자리 대신 여기 전체 폭으로 띄운다 — 같은
          이미지를 눌러 다시 접으면 원래 썸네일 크기로 돌아간다. */}
      {isExpanded && generation.url && (
        <button
          type="button"
          className="w-full cursor-pointer border-0 bg-transparent p-0"
          onClick={() => setIsExpanded(false)}
        >
          <img
            src={generation.url}
            alt=""
            className="aspect-square w-full rounded-lg border border-border object-cover"
          />
        </button>
      )}

      <HStack gap={2} hAlign="between" vAlign="center">
        <HStack gap={3} vAlign="center">
          {generation.url && !isExpanded && (
            <button
              type="button"
              className="shrink-0 cursor-pointer border-0 bg-transparent p-0"
              onClick={() => setIsExpanded(true)}
            >
              <img
                src={generation.url}
                alt=""
                className="size-16 rounded-md border border-border object-cover"
              />
            </button>
          )}
          <VStack gap={0}>
            <Text weight="medium">{theme?.title ?? '아바타'}</Text>
            <Text type="supporting">{dateLabel(generation.created_at)}</Text>
          </VStack>
        </HStack>

        <HStack gap={1}>
          <IconButton
            label="폰에 저장"
            tooltip="폰에 저장"
            variant="secondary"
            size="sm"
            icon={<Download className="size-4" />}
            isDisabled={!generation.url || isSaving}
            onClick={handleSave}
          />
          <IconButton
            label="아바타 지우기"
            tooltip="지우기"
            variant="secondary"
            size="sm"
            icon={<Trash2 className="size-4" />}
            isDisabled={remove.isPending}
            onClick={() => remove.mutate()}
          />
        </HStack>
      </HStack>
    </VStack>
  )
}
