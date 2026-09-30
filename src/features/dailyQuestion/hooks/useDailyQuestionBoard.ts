import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { getTodaysQuestion, listTodaysAnswers } from '../api/dailyQuestion'

export function todaysQuestionQueryKey() {
  return ['daily-question', 'today'] as const
}

export function dailyQuestionAnswersQueryKey(
  coupleId: string | null | undefined,
  questionDate: string | null | undefined,
) {
  return ['daily-question-answers', coupleId, questionDate] as const
}

/**
 * 오늘의 질문 위젯이 보는 것 — 오늘의 질문과 이 커플이 오늘 남긴 답변들.
 *
 * 위젯과 다이얼로그가 같은 훅을 부른다 (useWishBoard.ts와 같은 이유). 답변을
 * 저장하면 `refresh()` 한 번으로 뒤에 있는 위젯까지 같이 맞춰진다.
 *
 * 질문 조회를 답변 조회와 분리한 이유: 질문은 하루 종일 바뀌지 않지만
 * (todays_question()이 순수하게 날짜로만 정해진다), 답변은 저장할 때마다
 * 새로 읽어야 한다. `questionDate`가 있어야 답변 쿼리를 시작할 수 있어서
 * `enabled`로 순서를 강제한다.
 */
export function useDailyQuestionBoard(coupleId: string | null | undefined) {
  const queryClient = useQueryClient()

  const question = useQuery({
    queryKey: todaysQuestionQueryKey(),
    queryFn: getTodaysQuestion,
  })

  const questionDate = question.data?.questionDate

  const answers = useQuery({
    queryKey: dailyQuestionAnswersQueryKey(coupleId, questionDate),
    queryFn: () => listTodaysAnswers(coupleId!, questionDate!),
    enabled: coupleId != null && questionDate != null,
  })

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: todaysQuestionQueryKey() }),
      queryClient.invalidateQueries({ queryKey: dailyQuestionAnswersQueryKey(coupleId, questionDate) }),
    ])
  }, [queryClient, coupleId, questionDate])

  return {
    question: question.data ?? null,
    answers: answers.data ?? [],
    isLoading: question.isLoading || answers.isLoading,
    refresh,
  }
}
