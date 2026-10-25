/** exercise_board() RPC의 한 줄 — 커플 중 한 사람의 오늘 상태. */
export interface ExerciseBoardRow {
  owner_id: string
  /** 이 커플에서 재활운동을 하는 사람인지 (couples.exercise_owner_id). 둘 다 false면 아직 안 골랐다. */
  is_exerciser: boolean
  /** 지금 보고 있는 운동 기록의 날짜. 오늘 것, 또는 어제 시작해 아직 안 끝낸 것. 없으면 null. */
  session_date: string | null
  started_at: string | null
  ended_at: string | null
  /** 오늘(KST)이 완료로 쳐졌는지 — 시작·종료를 다 눌렀거나 관리자가 인정했다. */
  today_done: boolean
  /** 지금의 연속 일수. 소원권을 받으면 0으로 돌아간다. */
  streak: number
  /** 지금까지 30일을 채워 받은 소원권 수. */
  rewards: number
}

/** 위젯의 버튼이 지금 무엇을 해야 하는지. */
export type ExercisePhase = 'idle' | 'running' | 'done'

export function exercisePhase(row: ExerciseBoardRow | undefined): ExercisePhase {
  if (!row) return 'idle'
  if (row.started_at && !row.ended_at) return 'running'
  if (row.today_done) return 'done'
  return 'idle'
}
