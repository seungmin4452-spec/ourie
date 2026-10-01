// 요청마다 HTML·매니페스트를 그려 내주는 edge 페이지 셋(/add-to-home,
// /api/manifest, /api/invite)을 함수 하나로 받는 입구. 실제 일은 옆의
// `_pwa-install.ts` · `_manifest.ts` · `_invite.ts`가 그대로 한다.
//
// **왜 파일 하나로 묶었나.** Vercel Hobby 플랜의 "배포당 서버리스 함수 12개"
// 한도 때문이다 (api/admin/[action].ts 머리말 참고). 밑줄로 시작하는 파일은
// 함수로 세지 않는다.
//
// 바깥에서 보는 주소는 묶기 전과 똑같다 — vercel.json의 rewrite가 세 주소를
// 전부 여기로 보낸다. **이 주소들은 바꾸면 안 된다**: /api/manifest는 이미
// 설치된 홈 화면 앱이 주기적으로 다시 읽는 주소이고, /api/invite는 이미
// 공유된 초대 링크에 박혀 있다.
//
// api/icon-maskable.ts는 여기에 못 합친다 — sharp(네이티브 애드온)를 쓰느라
// Node 런타임이고, 한 함수가 두 런타임을 가질 수는 없다.

import invite from './_invite.js'
import manifest from './_manifest.js'
import pwaInstall from './_pwa-install.js'

export const config = { runtime: 'edge' }

/**
 * vercel.json의 rewrite가 "어느 페이지인지"를 실어 보내는 쿼리 이름. 페이지가
 * 쓰는 이름(title, icon, session, code)과 겹치지 않게 밑줄을 붙였다.
 */
const PAGE_PARAM = '__page'

const PAGES = new Map<string, (request: Request) => Response>([
  ['add-to-home', pwaInstall],
  ['pwa-install', pwaInstall],
  ['manifest', manifest],
  ['invite', invite],
])

export default function handler(request: Request): Response {
  const url = new URL(request.url)

  // 경로의 마지막 조각을 먼저 보고(요청 받은 주소 그대로 넘어올 때), 없으면
  // rewrite가 붙인 쿼리를 본다(rewrite된 주소로 넘어올 때).
  const lastSegment = url.pathname.split('/').filter(Boolean).pop() ?? ''
  const page = PAGES.get(lastSegment) ?? PAGES.get(url.searchParams.get(PAGE_PARAM) ?? '')
  if (!page) return new Response('Not found', { status: 404 })

  // 페이지에는 이 쿼리를 걷어낸 요청을 넘긴다. _pwa-install.ts가 자기 쿼리를
  // 통째로 /api/manifest에 물려주는데, 거기 섞여 가면 매니페스트 요청이 설치
  // 페이지로 잘못 갈 수 있다.
  if (!url.searchParams.has(PAGE_PARAM)) return page(request)
  url.searchParams.delete(PAGE_PARAM)
  return page(new Request(url, request))
}
