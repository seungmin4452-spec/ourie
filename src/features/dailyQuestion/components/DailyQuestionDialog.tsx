import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Divider } from '@astryxdesign/core/Divider'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { useToast } from '@astryxdesign/core/Toast'
import { VStack } from '@astryxdesign/core/VStack'
import { useMutation } from '@tanstack/react-query'
import { MessageCircleQuestion } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import type { Partner } from '@/features/couple/api/partner'
import {
  DailyQuestionError,
  notifyDailyQuestionAnswer,
  saveTodaysAnswer,
  type DailyQuestionNotifyResult,
} from '../api/dailyQuestion'
import { dailyQuestionOwnerName } from '../board'
import { DAILY_QUESTION_CONTENT_MAX, type DailyQuestionAnswer, type TodaysQuestion } from '../types'

/**
 * 답을 저장한 뒤 뭐라고 말할지.
 *
 * **처음 답한 것과 고쳐 쓴 것을 갈라 말한다.** 고쳐 쓸 때마다 서버는 알림을
 * 다시 보내지 않으므로(api/daily-question.ts), "상대방에게 전했어요"라고
 * 말하면 거짓말이 된다.
 */
function savedMessage(hadAnswerBefore: boolean, notified: DailyQuestionNotifyResult): string {
  if (hadAnswerBefore) return '답변을 고쳤어요.'
  if (notified.delivered > 0) return '오늘의 질문에 답했어요. 상대방에게 전했어요.'
  if (notified.reason === 'not_opted_in') {
    return '오늘의 질문에 답했어요. 상대방이 알림을 켜지 않아 전하진 못했어요.'
  }
  if (notified.reason === 'no_couple') return '오늘의 질문에 답했어요.'
  return '오늘의 질문에 답했어요. 다만 상대방 기기에 닿지 않았어요.'
}

interface DailyQuestionDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  coupleId: string
  userId: string
  partner: Partner | null
  question: TodaysQuestion
  myAnswer: DailyQuestionAnswer | undefined
  partnerAnswer: DailyQuestionAnswer | undefined
  /** 답을 저장했을 때 — 위젯의 상태 줄까지 같이 다시 읽는다. */
  onChanged: () => Promise<void>
}

/**
 * 오늘의 질문에 답하고, 상대방 답을 확인하는 화면.
 *
 * 소원권과 갈리는 핵심은 하나다 — **공개에 조건이 없다.** 내가 아직 답하지
 * 않았어도 상대가 이미 답했으면 그 내용이 바로 보인다. "둘 다 답해야
 * 보인다"는 이 기능이 요구받은 규칙이 아니다.
 */
export function DailyQuestionDialog({
  isOpen,
  onOpenChange,
  coupleId,
  userId,
  partner,
  question,
  myAnswer,
  partnerAnswer,
  onChanged,
}: DailyQuestionDialogProps) {
  const showToast = useToast()
  const [content, setContent] = useState(myAnswer?.content ?? '')

  const trimmed = content.trim()
  const canSubmit = trimmed.length > 0 && trimmed.length <= DAILY_QUESTION_CONTENT_MAX

  const save = useMutation({
    // 저장한 뒤 상대에게 알린다. 알림은 던지지 않으므로(notifyDailyQuestionAnswer)
    // 여기까지 오면 답은 이미 저장된 것이고, 남은 건 그 사실을 어떻게
    // 말하느냐뿐이다 (wroteMessage와 같은 구조 — api/wish.ts 참고).
    mutationFn: async () => {
      const hadAnswerBefore = myAnswer != null
      await saveTodaysAnswer(coupleId, userId, question.id, question.questionDate, trimmed)
      const notified = await notifyDailyQuestionAnswer(question.questionDate)
      return { hadAnswerBefore, notified }
    },
    onSuccess: async ({ hadAnswerBefore, notified }) => {
      await onChanged()
      showToast({ type: 'info', body: savedMessage(hadAnswerBefore, notified) })
    },
    onError: (error) => {
      showToast({
        type: 'error',
        body: error instanceof DailyQuestionError ? error.message : '답을 저장하지 못했어요.',
      })
      void onChanged()
    },
  })

  /** 열릴 때마다 최신 내 답으로 다시 채운다 — 다른 기기에서 먼저 고쳤을 수 있다. */
  function handleOpenChange(nextIsOpen: boolean) {
    if (nextIsOpen) setContent(myAnswer?.content ?? '')
    onOpenChange(nextIsOpen)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    save.mutate()
  }

  const partnerLabel = dailyQuestionOwnerName(partner?.id ?? '', userId, partner?.name)

  return (
    <Dialog isOpen={isOpen} onOpenChange={handleOpenChange} purpose="form" width={420}>
      <form onSubmit={handleSubmit}>
        <Layout
          header={<DialogHeader title="오늘의 질문" onOpenChange={() => handleOpenChange(false)} />}
          content={
            <LayoutContent>
              <VStack gap={5}>
                <VStack gap={2}>
                  <Heading level={2}>{question.content}</Heading>
                  <Text type="supporting">
                    오늘 하루만 답할 수 있고, 자정이 지나면 새 질문으로 바뀌어요.
                  </Text>
                </VStack>

                <Divider />

                <VStack gap={3}>
                  <Heading level={2}>내 답변</Heading>
                  <TextArea
                    label="답변 내용"
                    htmlName="daily-question-content"
                    placeholder="떠오르는 대로 편하게 적어보세요."
                    description="자정 전까지는 고쳐 쓸 수 있어요."
                    isRequired
                    rows={3}
                    maxLength={DAILY_QUESTION_CONTENT_MAX}
                    value={content}
                    onChange={setContent}
                  />

                  {/* 알림이 갈지를 **쓰기 전에** 알려준다 — WishDialog와 같은 이유로,
                      다 쓰고 나서 알면 이미 저장된 뒤라 되돌릴 수 없다. */}
                  {partner != null && !partner.poke_opt_in && (
                    <Text type="supporting">
                      {partnerLabel}님이 알림을 켜지 않아, 답해도 알림은 가지 않아요.
                    </Text>
                  )}
                </VStack>

                <Divider />

                <VStack gap={2}>
                  <Heading level={2}>{partnerLabel}의 답변</Heading>
                  {partnerAnswer ? (
                    <Text>{partnerAnswer.content}</Text>
                  ) : (
                    <EmptyState
                      isCompact
                      icon={<MessageCircleQuestion className="size-6" />}
                      title={`${partnerLabel}이 아직 답하지 않았어요`}
                      description="답하면 여기 바로 보여요."
                    />
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
                  onClick={() => handleOpenChange(false)}
                />
                <Button
                  type="submit"
                  label={myAnswer ? '고쳐 쓰기' : '답변 저장'}
                  variant="primary"
                  isLoading={save.isPending}
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
