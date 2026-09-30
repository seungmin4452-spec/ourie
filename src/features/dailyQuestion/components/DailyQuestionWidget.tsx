import { Button } from '@astryxdesign/core/Button'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useState } from 'react'

import { useAuth } from '@/features/auth'
// 배럴이 아니라 훅 파일을 직접 가리킨다 — 배럴에는 홈 화면이 들어 있고, 그
// 홈이 다시 이 위젯을 가져오므로 순환 import가 된다 (WishWidget.tsx와 같은
// 이유).
import { usePartner } from '@/features/couple/hooks/usePartner'
import type { Profile } from '@/features/onboarding/api/profile'
import { dailyQuestionOwnerName, findAnswer } from '../board'
import { useDailyQuestionBoard } from '../hooks/useDailyQuestionBoard'
import { DailyQuestionDialog } from './DailyQuestionDialog'

interface DailyQuestionWidgetProps {
  /** 홈이 이미 가져온 내 프로필. 같은 걸 또 조회하지 않으려고 받아 쓴다. */
  profile: Profile | null | undefined
  /** 절반 폭 타일일 때 true. 카드 전체를 누르면 다이얼로그가 열린다
   * (WishWidget.tsx와 같은 패턴 — 쉐브런은 WidgetCard가 그린다). */
  isCompact?: boolean
}

/**
 * 홈 위젯 "오늘의 질문"의 본문.
 *
 * 위젯이 답하는 것은 하나다 — **오늘의 질문에 누가 답했나.** 질문 전문과
 * 답변을 적고 고치는 일은 전부 다이얼로그로 밀어냈다 (WishWidget.tsx와 같은
 * 판단).
 */
export function DailyQuestionWidget({ profile, isCompact }: DailyQuestionWidgetProps) {
  const { user } = useAuth()
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const coupleId = profile?.couple_id
  const { data: partner } = usePartner(profile)
  const { question, answers, isLoading, refresh } = useDailyQuestionBoard(coupleId)

  // 질문에 둘이 함께 답하는 것이라 커플이 없으면 성립하지 않는다.
  if (coupleId == null || user == null) {
    return (
      <Text type="supporting" justify="center">
        커플이 연결되면 오늘의 질문에 답할 수 있어요.
      </Text>
    )
  }

  if (isLoading) {
    return (
      <Text type="supporting" justify="center">
        오늘의 질문을 불러오는 중이에요.
      </Text>
    )
  }

  // 질문 풀이 비어 있을 때뿐이다 — 정상 운영 중에는 일어나지 않는다.
  if (question == null) {
    return (
      <Text type="supporting" justify="center">
        오늘의 질문을 아직 준비하지 못했어요.
      </Text>
    )
  }

  const myAnswer = findAnswer(answers, user.id)
  const partnerAnswer = partner ? findAnswer(answers, partner.id) : undefined
  const partnerLabel = dailyQuestionOwnerName(partner?.id ?? '', user.id, partner?.name)

  const statusLine = (
    <VStack gap={0}>
      <Text weight="medium" maxLines={isCompact ? 2 : undefined}>
        {question.content}
      </Text>
      <Text type="supporting">
        나 {myAnswer ? '· 답변 완료' : '· 아직 안 했어요'} · {partnerLabel}{' '}
        {partnerAnswer ? '· 답변 완료' : '· 아직 안 했어요'}
      </Text>
    </VStack>
  )

  return (
    <VStack gap={isCompact ? 3 : 4}>
      {isCompact ? (
        <button
          type="button"
          className="w-full cursor-pointer border-0 bg-transparent p-0 text-start"
          onClick={() => setIsDialogOpen(true)}
        >
          {statusLine}
        </button>
      ) : (
        <>
          {statusLine}
          <Button
            label={myAnswer ? '답변 고치기' : '오늘의 질문에 답하기'}
            variant={myAnswer ? 'secondary' : 'primary'}
            width="100%"
            onClick={() => setIsDialogOpen(true)}
          />
        </>
      )}

      <DailyQuestionDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        coupleId={coupleId}
        userId={user.id}
        partner={partner ?? null}
        question={question}
        myAnswer={myAnswer}
        partnerAnswer={partnerAnswer}
        onChanged={refresh}
      />
    </VStack>
  )
}
