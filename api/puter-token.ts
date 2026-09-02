// AI 아바타 위젯이 쓰는 공용 Puter 계정의 개인 액세스 토큰을 내려준다.
//
// 이 토큰을 클라이언트 번들에 정적으로 박아두지 않고 이 함수를 거치게 하는
// 이유: 빌드된 JS 파일은 로그인 여부와 무관하게 그 URL에 접속하는 누구나
// 받아볼 수 있는 정적 자산이다. 토큰을 그대로 박아두면 우리 앱 사용자가
// 아닌 누구든 그 안에서 값을 뽑아 공용 Puter 계정(무료 월간 크레딧)을 대신
// 써버릴 수 있다. 로그인한 사용자에게만 내려주면 그 위험이 최소한 이 앱의
// 실제 사용자 범위로는 좁혀진다.
//
// 실제 이미지 생성은 이 함수가 하지 않는다 — 그건
// src/features/aiAvatar/hooks/useGenerateAiAvatar.ts에서 브라우저가 직접
// Puter를 부른다 (Node 런타임에서 Puter의 이미지 생성 함수가 브라우저 전용
// 타입을 반환하려다 죽는 미해결 버그가 있어서다, HeyPuter/puter#1900). 이
// 함수는 그 호출에 필요한 토큰 문자열 하나만 돌려준다.
//
// **핸들러를 `export default`로 바꾸지 말 것**, **아래 상대 import의 `.js`
// 확장자를 지우지 말 것.** 둘 다 api/poke.ts의 같은 주석 참고.

import { createClient } from '@supabase/supabase-js'

import { requiredEnv } from './_push.js'

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
  if (userError || !userData?.user) {
    return Response.json(
      { error: 'unauthorized', message: '로그인이 만료됐어요. 다시 로그인해주세요.' },
      { status: 401 },
    )
  }

  return Response.json({ token: requiredEnv('PUTER_SHARED_TOKEN') })
}
