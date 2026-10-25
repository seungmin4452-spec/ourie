// 관리자 전용 — 재활운동 기록 보기(GET /api/admin/exercise), 시작/종료를
// 깜빡한 날을 "했다"고 인정하기(POST /api/admin/exercise-confirm), 커플에서
// 운동하는 사람 바꾸기(POST /api/admin/exercise-owner).
//
// 인증·권한 검사는 api/admin/_stats.ts와 같은 뼈대다. 인정 자체는 DB 함수
// admin_confirm_exercise가 하고(인정한 뒤 30일을 채웠으면 소원권까지 준다),
// 이 함수는 service role로만 부를 수 있다 (supabase/schema.sql 참고).
//
// Node 런타임, 명명 export, 상대 import의 `.js` 확장자를 지우지 말 것 —
// 전부 api/poke.ts와 같은 이유다.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { isAdminEmail } from '../../src/features/admin/access.js'
import { EXERCISE_ADMIN_WINDOW_DAYS } from '../../src/features/admin/limits.js'
import { requiredEnv } from '../_push.js'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token || null
}

/** 관리자면 service role 클라이언트를, 아니면 그대로 돌려줄 에러 응답을. */
async function authorize(
  request: Request,
): Promise<{ supabase: SupabaseClient } | { response: Response }> {
  const token = bearerToken(request)
  if (!token) {
    return {
      response: Response.json({ error: 'unauthorized', message: '로그인이 필요해요.' }, { status: 401 }),
    }
  }

  const supabase = createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  )

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  const callerEmail = userData?.user?.email
  if (userError || !callerEmail) {
    return {
      response: Response.json(
        { error: 'unauthorized', message: '로그인이 만료됐어요. 다시 로그인해주세요.' },
        { status: 401 },
      ),
    }
  }

  if (!isAdminEmail(callerEmail)) {
    return {
      response: Response.json({ error: 'forbidden', message: '관리자만 쓸 수 있어요.' }, { status: 403 }),
    }
  }

  return { supabase }
}

/** KST 기준 n일 전 날짜, "YYYY-MM-DD". */
function kstDate(daysAgo: number): string {
  const kstNow = Date.now() + 9 * 60 * 60 * 1000
  return new Date(kstNow - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export async function GET(request: Request): Promise<Response> {
  const auth = await authorize(request)
  if ('response' in auth) return auth.response
  const { supabase } = auth

  const days = Array.from({ length: EXERCISE_ADMIN_WINDOW_DAYS }, (_, index) => kstDate(index))
  const oldest = days[days.length - 1]

  // 커플이 연결된 사람만 — 운동 기록은 커플이 있어야 남는다.
  const [
    { data: people, error: peopleError },
    { data: logs, error: logsError },
    { data: couples, error: couplesError },
  ] = await Promise.all([
    supabase.from('profiles').select('id, name').not('couple_id', 'is', null).order('created_at'),
    supabase
      .from('exercise_logs')
      .select('owner_id, exercise_date, started_at, ended_at, admin_confirmed_at')
      .gte('exercise_date', oldest),
    supabase.from('couples').select('exercise_owner_id').not('exercise_owner_id', 'is', null),
  ])

  const firstError = peopleError ?? logsError ?? couplesError
  if (firstError) {
    return Response.json({ error: 'db', message: firstError.message }, { status: 500 })
  }

  // 사람 수가 많지 않은 앱이라 연속 일수는 사람마다 한 번씩 센다.
  const streaks = await Promise.all(
    (people ?? []).map(async (person) => {
      const { data } = await supabase.rpc('exercise_streak', { p_owner_id: person.id })
      const row = (data as { streak: number; rewards: number }[] | null)?.[0]
      return { streak: row?.streak ?? 0, rewards: row?.rewards ?? 0 }
    }),
  )

  return Response.json({
    days,
    people: (people ?? []).map((person, index) => ({
      id: person.id,
      name: person.name,
      isExerciser: (couples ?? []).some((couple) => couple.exercise_owner_id === person.id),
      streak: streaks[index].streak,
      rewards: streaks[index].rewards,
      logs: (logs ?? []).filter((log) => log.owner_id === person.id),
    })),
  })
}

export async function POST(request: Request): Promise<Response> {
  const auth = await authorize(request)
  if ('response' in auth) return auth.response
  const { supabase } = auth

  const body = (await request.json().catch(() => null)) as {
    ownerId?: unknown
    date?: unknown
    confirm?: unknown
  } | null

  const ownerId = typeof body?.ownerId === 'string' ? body.ownerId : null
  const date = typeof body?.date === 'string' && DATE_PATTERN.test(body.date) ? body.date : null
  const confirm = typeof body?.confirm === 'boolean' ? body.confirm : null
  if (!ownerId || !date || confirm == null) {
    return Response.json({ error: 'invalid_input', message: '잘못된 요청이에요.' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('admin_confirm_exercise', {
    p_owner_id: ownerId,
    p_date: date,
    p_confirm: confirm,
  })

  if (error) {
    if (error.message.includes('future_date')) {
      return Response.json(
        { error: 'future_date', message: '아직 오지 않은 날은 인정할 수 없어요.' },
        { status: 400 },
      )
    }
    if (error.message.includes('no_couple')) {
      return Response.json(
        { error: 'no_couple', message: '커플이 연결되지 않은 사람이에요.' },
        { status: 400 },
      )
    }
    return Response.json({ error: 'db', message: error.message }, { status: 500 })
  }

  return Response.json({ rewarded: (data as number | null) ?? 0 })
}

/** 이 사람을 그 커플의 운동하는 사람으로 정한다 (이미 다른 사람이 정해져 있어도 바꾼다). */
export async function setOwner(request: Request): Promise<Response> {
  const auth = await authorize(request)
  if ('response' in auth) return auth.response
  const { supabase } = auth

  const body = (await request.json().catch(() => null)) as { ownerId?: unknown } | null
  const ownerId = typeof body?.ownerId === 'string' ? body.ownerId : null
  if (!ownerId) {
    return Response.json({ error: 'invalid_input', message: '잘못된 요청이에요.' }, { status: 400 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('couple_id')
    .eq('id', ownerId)
    .maybeSingle()
  if (profileError) {
    return Response.json({ error: 'db', message: profileError.message }, { status: 500 })
  }
  if (!profile?.couple_id) {
    return Response.json(
      { error: 'no_couple', message: '커플이 연결되지 않은 사람이에요.' },
      { status: 400 },
    )
  }

  const { error } = await supabase
    .from('couples')
    .update({ exercise_owner_id: ownerId })
    .eq('id', profile.couple_id)
  if (error) {
    return Response.json({ error: 'db', message: error.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
