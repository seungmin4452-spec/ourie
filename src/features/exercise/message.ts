// 재활운동 알림 문구와 규칙 상수.
//
// 이 파일은 브라우저와 서버(api/exercise.ts) 양쪽에서 쓴다. 그래서 순수
// 함수와 상수만 두고, import를 하나도 하지 않는다 (dailyQuestion/message.ts와
// 같은 규칙 — 서버 쪽 상대 경로 import의 `.js` 확장자 제약을 애초에 만들지
// 않는다).

/**
 * 며칠을 연속으로 채우면 소원권이 몇 장 늘어나는지. DB의
 * settle_exercise_rewards(supabase/schema.sql)에 적힌 30일 1장 / 60일 3장과
 * 반드시 같은 값이어야 한다. 마지막 단계를 채우면 카운트가 0으로 돌아간다.
 */
export const EXERCISE_MILESTONES = [
  { days: 30, tickets: 1 },
  { days: 60, tickets: 3 },
] as const

/** 지금 연속 일수에서 다음으로 노릴 달성 단계. */
export function nextExerciseMilestone(streak: number): (typeof EXERCISE_MILESTONES)[number] {
  return (
    EXERCISE_MILESTONES.find((milestone) => streak < milestone.days) ??
    EXERCISE_MILESTONES[EXERCISE_MILESTONES.length - 1]
  )
}

/**
 * 소원권을 받았을 때의 축하 문구. 장수로 몇 일째 달성인지 거꾸로 찾는다
 * (관리자 인정으로 30일·60일을 한 번에 채우면 4장이라 60일로 본다).
 */
export function exerciseRewardMessage(tickets: number): string {
  const days = tickets >= EXERCISE_MILESTONES[1].tickets
    ? EXERCISE_MILESTONES[1].days
    : EXERCISE_MILESTONES[0].days
  return `${days}일 연속 달성! 소원권이 ${tickets}장 늘었어요.`
}

export type ExerciseAction = 'start' | 'finish'

export interface ExerciseNotification {
  title: string
  body: string
  tag: string
  renotify: true
}

/** wish/message.ts의 wishNameLabel과 같은 일. import하지 않으려고 다시 적는다. */
function exerciseNameLabel(personName: string | null | undefined): string {
  const trimmed = personName?.trim()
  return trimmed ? `${trimmed}님` : '상대방'
}

/**
 * 운동을 시작하거나 끝냈을 때 상대방 기기에 뜰 알림.
 *
 * 시작과 종료의 tag가 같다 — 종료 알림이 오면 시작 알림은 더 볼 이유가 없으니
 * 덮어쓴다. 날짜를 넣어 날마다는 서로 덮지 않는다.
 */
export function buildExerciseNotification(
  action: ExerciseAction,
  exerciseDate: string,
  /** 운동한 사람의 `profiles.name`. `app_name`이 아니다 — DATABASE.md §2.1 참고. */
  senderName: string | null | undefined,
  /** 종료일 때만 쓴다. 방금 끝낸 날까지 센 연속 일수. */
  streak: number,
  /** 종료일 때만 쓴다. 이번 종료로 늘어난 소원권 장수 (없으면 0). */
  rewardedTickets: number,
): ExerciseNotification {
  const name = exerciseNameLabel(senderName)
  const tag = `ourie-exercise-${exerciseDate}`

  if (action === 'start') {
    return {
      title: `${name}이 재활운동을 시작했어요`,
      body: '끝날 때까지 응원해주세요!',
      tag,
      renotify: true,
    }
  }

  return {
    title: `${name}이 재활운동을 다 했어요`,
    body: rewardedTickets > 0
      ? exerciseRewardMessage(rewardedTickets)
      : `${streak}일째 연속이에요. 수고했다고 말해주세요.`,
    tag,
    renotify: true,
  }
}
