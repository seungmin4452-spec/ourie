// 관리자 전용 — 특수효과(벚꽃·눈)를 켜고 끈다. api/poke.ts와 같은 뼈대다:
// 인증은 요청 본문이 아니라 사용자의 Supabase access token으로 하고,
// app_effects 쓰기는 service role 키로 한다 — RLS는 이 테이블에 select 정책만
// 두고 있어 클라이언트 세션으로는 애초에 못 쓴다 (supabase/schema.sql 참고).
//
// **클라이언트가 보낸 어떤 값도 신원으로 믿지 않는다.** Authorization 헤더의
// 토큰을 Supabase에 되물어 나온 이메일만 믿는다
// (src/features/admin/access.ts의 isAdminEmail).
//
// Node 런타임이다 (config를 두지 않으면 기본값). 핸들러는 반드시
// `export const POST`가 아니라 명명 export `POST`(Web 표준 Request ->
// Response 시그니처)여야 Vercel의 Node 런타임이 올바르게 불러준다 — default
// export면 Node 스타일 (req, res)로 불러서 죽는다 (api/poke.ts와 같은
// 주의사항).
//
// 아래 상대 import의 `.js` 확장자를 지우지 말 것 — Node 런타임 함수는
// 번들되지 않고 파일별로 .js로 트랜스파일된 뒤 ESM으로 로드되는데, ESM은
// 확장자 없는 상대 경로를 해석하지 못한다.

import { createClient } from '@supabase/supabase-js'

import { isAdminEmail } from '../../src/features/admin/access.js'
import { isAppEffectId } from '../../src/features/effects/types.js'
import { requiredEnv } from '../_push.js'

/** `Authorization: Bearer <token>`에서 토큰만. 형식이 아니면 null. */
function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token || null
}

export async function POST(request: Request): Promise<Response> {
  const token = bearerToken(request)
  if (!token) {
    return Response.json({ error: 'unauthorized', message: '로그인이 필요해요.' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as
    | { id?: unknown; isEnabled?: unknown }
    | null

  if (!isAppEffectId(body?.id) || typeof body?.isEnabled !== 'boolean') {
    return Response.json(
      { error: 'invalid_body', message: '효과 종류와 켤지 끌지를 확인해주세요.' },
      { status: 400 },
    )
  }
  const { id, isEnabled } = body

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
      { error: 'forbidden', message: '관리자만 쓸 수 있어요.' },
      { status: 403 },
    )
  }

  const { error: updateError } = await supabase
    .from('app_effects')
    .update({ is_enabled: isEnabled })
    .eq('id', id)

  if (updateError) {
    return Response.json({ error: 'db', message: updateError.message }, { status: 500 })
  }

  return Response.json({ id, isEnabled })
}
