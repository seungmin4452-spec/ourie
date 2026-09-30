import { supabase } from '@/lib/supabase'
import type { DailyQuestionAnswer, TodaysQuestion } from '../types'

const ANSWER_COLUMNS =
  'couple_id, owner_id, question_date, question_id, content, created_at, updated_at'

/**
 * DB의 트리거가 막은 것 (supabase/schema.sql의
 * check_daily_question_answer_is_today). 화면도 오늘 질문이 아니면 저장
 * 버튼을 막지만, 자정을 걸쳐 화면을 켜둔 채로 저장을 누르면 여기까지 올라올
 * 수 있다.
 */
export type DailyQuestionErrorCode = 'not_todays_question' | 'no_question_today'

export class DailyQuestionError extends Error {
  readonly code: DailyQuestionErrorCode

  constructor(code: DailyQuestionErrorCode, message: string) {
    super(message)
    this.name = 'DailyQuestionError'
    this.code = code
  }
}

function toDailyQuestionError(error: { message: string }): unknown {
  if (error.message.includes('no_question_today')) {
    return new DailyQuestionError('no_question_today', '오늘의 질문을 아직 준비하지 못했어요.')
  }
  if (error.message.includes('not_todays_question')) {
    return new DailyQuestionError(
      'not_todays_question',
      '질문이 바뀌었어요. 새로고침한 뒤 다시 답해주세요.',
    )
  }
  return error
}

/**
 * 오늘의 질문 하나. 질문 풀이 아직 비어 있으면 null이다.
 *
 * 로테이션 계산은 여기서 하지 않는다 — DB의 todays_question() 하나가 유일한
 * 정의라, 화면과 트리거가 서로 다른 "오늘"을 계산해 자정 경계에서 어긋나는
 * 일이 없다 (supabase/schema.sql 주석 참고).
 */
export async function getTodaysQuestion(): Promise<TodaysQuestion | null> {
  const { data, error } = await supabase.rpc('todays_question')
  if (error) throw error
  const row = data?.[0]
  if (!row) return null
  return { id: row.id, content: row.content, questionDate: row.question_date }
}

/**
 * 오늘 이 커플이 남긴 답변 전부(0~2개). RLS가 이미 "오늘 것만"으로 좁히지만,
 * 명시적 필터가 있어야 기본키 인덱스를 확실히 탄다 (listWishes와 같은 이유).
 */
export async function listTodaysAnswers(
  coupleId: string,
  questionDate: string,
): Promise<DailyQuestionAnswer[]> {
  const { data, error } = await supabase
    .from('daily_question_answers')
    .select(ANSWER_COLUMNS)
    .eq('couple_id', coupleId)
    .eq('question_date', questionDate)
  if (error) throw error
  return data ?? []
}

/**
 * 오늘의 답을 적거나 고친다. 자정 전까지는 몇 번이든 다시 부를 수 있다 —
 * 소원권과 달리 답변은 불변이 아니다.
 *
 * upsert인 이유: 사람당 하루 한 줄(couple_id, owner_id, question_date가
 * 기본키)이라, 처음 적는 것과 고쳐 적는 것이 같은 호출이다.
 */
export async function saveTodaysAnswer(
  coupleId: string,
  ownerId: string,
  questionId: string,
  questionDate: string,
  content: string,
): Promise<DailyQuestionAnswer> {
  const { data, error } = await supabase
    .from('daily_question_answers')
    .upsert(
      {
        couple_id: coupleId,
        owner_id: ownerId,
        question_id: questionId,
        question_date: questionDate,
        content,
      },
      { onConflict: 'couple_id,owner_id,question_date' },
    )
    .select(ANSWER_COLUMNS)
    .single()
  if (error) throw toDailyQuestionError(error)
  return data
}

/** notifyWish와 같은 모양의 응답. */
export type DailyQuestionNotifyReason = 'stale' | 'no_couple' | 'not_opted_in' | 'not_first_answer'

export interface DailyQuestionNotifyResult {
  delivered: number
  reason?: DailyQuestionNotifyReason
}

/**
 * 방금 저장한 오늘의 답을 상대방에게 알린다.
 *
 * 저장과 일부러 나눠 두었다 (notifyWish와 같은 이유) — 알림이 못 가도 답은
 * 저장된 것이 맞다. 서버가 "오늘 처음 답한 것"일 때만 실제로 보낸다(같은 날
 * 다시 고쳐 저장할 때마다 알림이 반복되지 않도록) — api/daily-question.ts 참고.
 */
export async function notifyDailyQuestionAnswer(
  questionDate: string,
): Promise<DailyQuestionNotifyResult> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return { delivered: 0 }

    const response = await fetch('/api/daily-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ questionDate }),
    })

    const payload = (await response.json().catch(() => null)) as DailyQuestionNotifyResult | null
    if (!response.ok) return { delivered: 0 }
    return { delivered: payload?.delivered ?? 0, reason: payload?.reason }
  } catch {
    return { delivered: 0 }
  }
}
