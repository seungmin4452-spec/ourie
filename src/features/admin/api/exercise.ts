import { supabase } from '@/lib/supabase'

export interface AdminExerciseLog {
  owner_id: string
  exercise_date: string
  started_at: string | null
  ended_at: string | null
  admin_confirmed_at: string | null
}

export interface AdminExercisePerson {
  id: string
  name: string | null
  /** 그 커플에서 재활운동을 하는 사람인지. */
  isExerciser: boolean
  streak: number
  rewards: number
  logs: AdminExerciseLog[]
}

export interface AdminExerciseOverview {
  /** 오늘부터 거꾸로, "YYYY-MM-DD" (KST). */
  days: string[]
  people: AdminExercisePerson[]
}

async function authorizedFetch(path: string, init?: RequestInit): Promise<unknown> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('로그인이 필요해요.')

  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  })
  const payload = (await response.json().catch(() => null)) as { message?: string } | null
  if (!response.ok || !payload) {
    throw new Error(payload?.message ?? '요청을 처리하지 못했어요.')
  }
  return payload
}

/**
 * 커플이 연결된 사람 전원의 최근 운동 기록과 연속 일수.
 *
 * 서버(api/admin/_exercise.ts)가 토큰의 이메일로 관리자인지 다시 확인한다
 * (access.ts 참고).
 */
export async function getExerciseOverview(): Promise<AdminExerciseOverview> {
  return (await authorizedFetch('/api/admin/exercise')) as AdminExerciseOverview
}

/**
 * 그날 운동한 것으로 인정하거나(confirm: true) 인정을 취소한다.
 * 인정으로 30일·60일이 채워지면 서버가 소원권까지 준다 — 그 장수가 돌아온다.
 */
export async function confirmExercise(input: {
  ownerId: string
  date: string
  confirm: boolean
}): Promise<{ rewarded: number }> {
  return (await authorizedFetch('/api/admin/exercise-confirm', {
    method: 'POST',
    body: JSON.stringify(input),
  })) as { rewarded: number }
}

/** 이 사람을 그 커플의 운동하는 사람으로 정한다. 이미 다른 사람이면 바꾼다. */
export async function setExerciseOwnerAsAdmin(ownerId: string): Promise<void> {
  await authorizedFetch('/api/admin/exercise-owner', {
    method: 'POST',
    body: JSON.stringify({ ownerId }),
  })
}
