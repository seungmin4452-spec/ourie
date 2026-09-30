import type { DailyQuestionAnswer } from './types'

/**
 * 답한 사람의 이름. wish/board.ts의 wishOwnerName과 같은 규칙이다 — 내 것이면
 * "나", 상대 이름이 비어 있으면 "상대방". 다른 feature의 board.ts를 그대로
 * import하지 않고 다시 적은 이유는 소원권 문구가 바뀌어도 이 화면은 흔들리지
 * 않게 하기 위해서다 (message.ts들이 서로 import하지 않는 것과 같은 이유).
 */
export function dailyQuestionOwnerName(
  ownerId: string,
  selfId: string | null | undefined,
  partnerName: string | null | undefined,
): string {
  if (ownerId === selfId) return '나'
  return partnerName?.trim() || '상대방'
}

/** answers 배열에서 특정 사람의 오늘 답을 찾는다. 없으면 아직 안 답한 것. */
export function findAnswer(
  answers: DailyQuestionAnswer[],
  ownerId: string,
): DailyQuestionAnswer | undefined {
  return answers.find((answer) => answer.owner_id === ownerId)
}
