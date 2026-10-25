import { supabase } from '@/lib/supabase'
import type { ExerciseAction } from '../message'
import type { ExerciseBoardRow } from '../types'

/** DB 함수가 막은 것 (supabase/schema.sql의 start_exercise / finish_exercise /
 * set_exercise_owner). */
export type ExerciseErrorCode = 'no_couple' | 'not_started' | 'not_owner' | 'owner_already_set'

export class ExerciseError extends Error {
  readonly code: ExerciseErrorCode

  constructor(code: ExerciseErrorCode, message: string) {
    super(message)
    this.name = 'ExerciseError'
    this.code = code
  }
}

function toExerciseError(error: { message: string }): unknown {
  if (error.message.includes('no_couple')) {
    return new ExerciseError('no_couple', '커플이 연결되어야 기록할 수 있어요.')
  }
  if (error.message.includes('exercise_not_started')) {
    // 다른 기기에서 이미 끝냈거나, 자정을 두 번 넘겨 시작 기록이 지난 경우.
    return new ExerciseError('not_started', '진행 중인 운동이 없어요. 새로고침해주세요.')
  }
  if (error.message.includes('not_exercise_owner')) {
    return new ExerciseError('not_owner', '운동하는 사람만 기록할 수 있어요.')
  }
  if (error.message.includes('exercise_owner_already_set')) {
    return new ExerciseError('owner_already_set', '운동하는 사람이 이미 정해졌어요.')
  }
  return error
}

/**
 * 이 커플에서 재활운동을 할 사람을 처음 한 번 정한다. 이미 정해져 있으면
 * 막힌다 — 바꾸는 건 관리자 화면에서만 한다.
 */
export async function setExerciseOwner(ownerId: string): Promise<void> {
  const { error } = await supabase.rpc('set_exercise_owner', { p_owner_id: ownerId })
  if (error) throw toExerciseError(error)
}

/** 커플 두 사람의 오늘 상태와 연속 일수 (0~2줄). */
export async function getExerciseBoard(): Promise<ExerciseBoardRow[]> {
  const { data, error } = await supabase.rpc('exercise_board')
  if (error) throw error
  return (data ?? []) as ExerciseBoardRow[]
}

export async function startExercise(): Promise<void> {
  const { error } = await supabase.rpc('start_exercise')
  if (error) throw toExerciseError(error)
}

export interface FinishExerciseResult {
  exerciseDate: string
  /** 이번 종료로 받은 소원권 장수 (보통 0, 30일째면 1). */
  rewarded: number
}

export async function finishExercise(): Promise<FinishExerciseResult> {
  const { data, error } = await supabase.rpc('finish_exercise')
  if (error) throw toExerciseError(error)
  return data as FinishExerciseResult
}

export interface ExerciseNotifyResult {
  delivered: number
  reason?: 'stale' | 'no_couple' | 'not_opted_in' | 'no_session'
}

/**
 * 방금 시작/종료한 것을 상대방에게 알린다.
 *
 * 기록과 일부러 나눠 두었다 (notifyDailyQuestionAnswer와 같은 이유) — 알림이
 * 못 가도 운동 기록은 저장된 것이 맞다.
 */
export async function notifyExercise(action: ExerciseAction): Promise<ExerciseNotifyResult> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return { delivered: 0 }

    const response = await fetch('/api/exercise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action }),
    })

    const payload = (await response.json().catch(() => null)) as ExerciseNotifyResult | null
    if (!response.ok) return { delivered: 0 }
    return { delivered: payload?.delivered ?? 0, reason: payload?.reason }
  } catch {
    return { delivered: 0 }
  }
}
