/** DB check 제약(daily_question_answers.content)과 반드시 같은 값이어야 한다
 * — wish/types.ts의 WISH_CONTENT_MAX와 같은 규칙. */
export const DAILY_QUESTION_CONTENT_MAX = 300

/** todays_question() RPC가 돌려주는 오늘의 질문. */
export interface TodaysQuestion {
  id: string
  content: string
  /** KST 기준 오늘 날짜, "YYYY-MM-DD". */
  questionDate: string
}

/** daily_question_answers의 한 줄. */
export interface DailyQuestionAnswer {
  couple_id: string
  owner_id: string
  question_date: string
  question_id: string
  content: string
  created_at: string
  updated_at: string
}
