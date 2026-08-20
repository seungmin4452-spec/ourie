// 관리자 전용 — "이미지가 회전하며 떨어지는" 특수효과(custom_image)에 올릴
// 이미지를 받는다. api/admin/effects.ts와 같은 뼈대다: 인증은 사용자의
// Supabase access token으로 하고, 이미지 저장·app_effects 갱신은 service
// role 키로 한다 — effect-images 버킷과 app_effects 테이블 둘 다 쓰기
// 정책이 없어 클라이언트 세션으로는 애초에 못 쓴다 (supabase/schema.sql
// 참고).
//
// 본문은 JSON이 아니라 multipart/form-data다 — 파일을 base64로 감싸
// JSON에 태우면 1/3만큼 더 커지고, Vercel Node 함수의 body 한도(100MB)에
// 더 가까워질 뿐 얻는 게 없다. Web 표준 Request의 formData()가 파일
// 파싱을 대신해준다.
//
// **클라이언트가 보낸 어떤 값도 신원으로 믿지 않는다.** Authorization
// 헤더의 토큰을 Supabase에 되물어 나온 이메일만 믿는다
// (src/features/admin/access.ts의 isAdminEmail).
//
// Node 런타임이다. 핸들러는 반드시 `export const POST`가 아니라 명명
// export `POST`(Web 표준 Request -> Response 시그니처)여야 Vercel의 Node
// 런타임이 올바르게 불러준다 — default export면 Node 스타일 (req, res)로
// 불러서 죽는다 (api/poke.ts와 같은 주의사항).
//
// 아래 상대 import의 `.js` 확장자를 지우지 말 것 — Node 런타임 함수는
// 번들되지 않고 파일별로 .js로 트랜스파일된 뒤 ESM으로 로드되는데, ESM은
// 확장자 없는 상대 경로를 해석하지 못한다.

import { createClient } from '@supabase/supabase-js'

import { isAdminEmail } from '../../src/features/admin/access.js'
import { requiredEnv } from '../_push.js'

/** 한 장의 상한. 화면에는 32~44px로 작게 뜨므로 넉넉히 잡아도 충분하다. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}

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

  const formData = await request.formData().catch(() => null)
  const file = formData?.get('image')
  if (!(file instanceof File)) {
    return Response.json(
      { error: 'invalid_body', message: '이미지 파일을 확인해주세요.' },
      { status: 400 },
    )
  }
  if (!file.type.startsWith('image/')) {
    return Response.json(
      { error: 'invalid_body', message: '이미지 파일만 올릴 수 있어요.' },
      { status: 400 },
    )
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return Response.json(
      { error: 'invalid_body', message: '이미지 용량은 5MB 이하여야 해요.' },
      { status: 400 },
    )
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
      { error: 'forbidden', message: '관리자만 쓸 수 있어요.' },
      { status: 403 },
    )
  }

  // 매번 새 경로로 올린다. 같은 경로에 덮어쓰면 브라우저가 옛 이미지를
  // 캐시에서 계속 보여줄 수 있다 — 파일명 자체를 바꾸면 그 문제가 아예
  // 없다. 이전 파일은 지우지 않는다(관리자 한 명이 가끔 바꾸는 정도라
  // 용량이 문제 될 일이 없다).
  const extension = EXTENSION_BY_MIME[file.type] ?? 'png'
  const path = `custom-image-${Date.now()}.${extension}`

  const { error: uploadError } = await supabase.storage
    .from('effect-images')
    .upload(path, file, { contentType: file.type, upsert: false })

  if (uploadError) {
    return Response.json({ error: 'storage', message: uploadError.message }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('effect-images').getPublicUrl(path)

  const { error: updateError } = await supabase
    .from('app_effects')
    .update({ image_url: publicUrl })
    .eq('id', 'custom_image')

  if (updateError) {
    return Response.json({ error: 'db', message: updateError.message }, { status: 500 })
  }

  return Response.json({ imageUrl: publicUrl })
}
