// 관리자 전용 엔드포인트 넷(/api/admin/broadcast · effects · effect-image ·
// stats)을 함수 하나로 받는 입구. 실제 일은 옆의 `_*.ts`가 그대로 한다.
//
// **왜 파일 하나로 묶었나.** Vercel Hobby 플랜은 배포 하나에 서버리스 함수를
// 12개까지만 허용하고, api/ 아래 파일 하나가 함수 하나다. 엔드포인트마다 파일을
// 두었더니 16개가 되어 배포가 빌드까지 끝난 뒤 "Deploying outputs"에서
// 거부됐다. 밑줄로 시작하는 파일은 함수로 세지 않으므로(api/_push.ts와 같은
// 규칙), 핸들러를 `_*.ts`로 두고 이 파일만 함수가 된다.
//
// **새 관리자 엔드포인트는 파일을 따로 만들지 말고** `_이름.ts`로 만들어 아래
// ROUTES에 올릴 것 — api/ 아래에 밑줄 없는 파일을 늘리면 같은 한도에 다시
// 걸린다.
//
// 파일 이름의 `[action]`은 Vercel의 동적 경로라, 클라이언트가 부르는 URL은
// 묶기 전과 똑같다.
//
// Node 런타임, 명명 export, 상대 import의 `.js` 확장자 — 전부 api/poke.ts와
// 같은 주의사항이다.

import { POST as broadcast } from './_broadcast.js'
import { POST as effectImage } from './_effect-image.js'
import { POST as effects } from './_effects.js'
import { GET as stats } from './_stats.js'

interface Route {
  method: 'GET' | 'POST'
  handler: (request: Request) => Promise<Response>
}

const ROUTES = new Map<string, Route>([
  ['broadcast', { method: 'POST', handler: broadcast }],
  ['effect-image', { method: 'POST', handler: effectImage }],
  ['effects', { method: 'POST', handler: effects }],
  ['stats', { method: 'GET', handler: stats }],
])

/**
 * 어느 엔드포인트를 부른 것인지. 경로의 마지막 조각을 먼저 보고, 없으면
 * Vercel이 동적 경로 값을 실어주는 쿼리(`?action=`)를 본다.
 */
function resolveRoute(request: Request): Route | undefined {
  const url = new URL(request.url)
  const lastSegment = url.pathname.split('/').filter(Boolean).pop() ?? ''
  return ROUTES.get(lastSegment) ?? ROUTES.get(url.searchParams.get('action') ?? '')
}

async function dispatch(request: Request): Promise<Response> {
  const route = resolveRoute(request)
  if (!route) {
    return Response.json({ error: 'not_found', message: '없는 주소예요.' }, { status: 404 })
  }
  // 파일이 따로였을 때는 export하지 않은 메서드를 Vercel이 405로 막아줬다.
  // 이제 이 파일이 GET·POST를 다 받으므로 여기서 직접 막는다.
  if (route.method !== request.method) {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: route.method } })
  }
  return route.handler(request)
}

export async function GET(request: Request): Promise<Response> {
  return dispatch(request)
}

export async function POST(request: Request): Promise<Response> {
  return dispatch(request)
}
