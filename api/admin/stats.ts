// 관리자 전용 — 가입자 현황판이 보는 숫자 네 개.
//
// 인증·권한 검사는 api/admin/broadcast.ts와 완전히 같은 뼈대다 (그 파일의
// 주석 참고). 다른 건 쓰기가 아니라 읽기뿐이라는 것 — service role 키로
// 몇 개 테이블의 개수만 센다.
//
// Node 런타임, 명명 export `GET`, 상대 import의 `.js` 확장자를 지우지
// 말 것 — 전부 api/poke.ts·api/admin/broadcast.ts와 같은 이유다.

import { createClient } from '@supabase/supabase-js'

import { isAdminEmail } from '../../src/features/admin/access.js'
import { RECENT_SIGNUP_WINDOW_DAYS } from '../../src/features/admin/limits.js'
import { requiredEnv } from '../_push.js'

/** `Authorization: Bearer <token>`에서 토큰만. 형식이 아니면 null. */
function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token || null
}

export async function GET(request: Request): Promise<Response> {
  const token = bearerToken(request)
  if (!token) {
    return Response.json({ error: 'unauthorized', message: '로그인이 필요해요.' }, { status: 401 })
  }

  const supabase = createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  )

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  const callerEmail = userData?.user?.email
  if (userError || !callerEmail) {
    return Response.json(
      { error: 'unauthorized', message: '로그인이 만료됐어요. 다시 로그인해주세요.' },
      { status: 401 },
    )
  }

  if (!isAdminEmail(callerEmail)) {
    return Response.json(
      { error: 'forbidden', message: '관리자만 볼 수 있어요.' },
      { status: 403 },
    )
  }

  const recentSince = new Date(
    Date.now() - RECENT_SIGNUP_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  // 넷 다 서로 걸리는 게 없는 개수 세기라 한 번에 보낸다 — 순서대로
  // 기다리면 넷을 곱한 만큼 왕복이 늘어난다.
  const [totalUsers, connectedCouples, recentSignups, pushSubscriptions] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('couples').select('*', { count: 'exact', head: true }).not('connected_at', 'is', null),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', recentSince),
    supabase.from('push_subscriptions').select('*', { count: 'exact', head: true }),
  ])

  const firstError = [totalUsers, connectedCouples, recentSignups, pushSubscriptions].find(
    (result) => result.error,
  )?.error
  if (firstError) {
    return Response.json({ error: 'db', message: firstError.message }, { status: 500 })
  }

  return Response.json({
    totalUsers: totalUsers.count ?? 0,
    connectedCouples: connectedCouples.count ?? 0,
    recentSignups: recentSignups.count ?? 0,
    pushSubscriptions: pushSubscriptions.count ?? 0,
  })
}
