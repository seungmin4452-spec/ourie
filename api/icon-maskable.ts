// Serves the couple's photo composited into an Android-safe-zone PNG, as a
// real image response at its own URL -- not inlined as a data: URI inside
// manifest.json (that made the manifest large enough that Android's WebAPK
// signing step silently gave up and fell back to a favicon shortcut instead
// of a real installed app). See api/manifest.ts for how this URL is wired in.
//
// **핸들러를 `export default`로 바꾸지 말 것**, **아래 상대 import의 `.js`
// 확장자를 지우지 말 것.** 둘 다 api/notify-dday.ts의 같은 주석 참고 -- 이
// 파일은 sharp(네이티브 애드온)를 쓰느라 edge가 아닌 Node 런타임이고, Node
// 런타임은 명명 export(`GET`)일 때만 Web 표준 시그니처(Request -> Response)로
// 부른다.
//
// 여기서 세이프존을 굽는 시도는 이번이 세 번째다. 처음엔 SVG(<image>가 원본
// 사진을 https 참조) -- 크롬이 설치 시 매니페스트를 보내는 구글 WebAPK 서명
// 서버가 SSRF 방지로 외부 참조를 따라가지 않아 "설치 중..."이 멈췄다. 그다음
// SVG 안에 사진을 base64 data: URI로 박아 자기 완결적으로 만들었더니 설치는
// 끝났지만, 그래도 사진 대신 기본 로고가 깔렸다 -- 서명 서버가 SVG 자체를
// 신뢰하지 못하는 것으로 보인다. 그다음 @vercel/og(satori + wasm 폰트 셰이핑)로
// PNG를 구워봤는데, 이 프로젝트의 Node 함수 실행 방식(파일별로 그대로 실행,
// 번들 없음)과 부딪혀 "Dynamic require of fs is not supported"로 함수 자체가
// 죽었다. sharp는 텍스트 레이아웃이 필요 없는 순수 이미지 합성이라 그 wasm
// 로더를 아예 안 쓰므로 같은 문제를 피해간다.

import sharp from 'sharp'
import { requestOrigin, sanitizeIconUrl } from './_shared.js'

const BACKGROUND_COLOR = '#F1F4F7'
const ICON_SIZE = 512
const SAFE_ZONE_RATIO = 0.8 // 사진이 캔버스의 80%를 차지 (여백 10%씩)

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const icon = sanitizeIconUrl(url.searchParams.get('icon'), requestOrigin(request))

  // Whoever is fetching this icon (the WebAPK signing server, or Chrome
  // itself) falls back to the manifest's 'any' icon -- the plain photo URL --
  // when this one 404s, so failing loudly on any error here is safe.
  const photoResponse = await fetch(icon).catch(() => null)
  if (!photoResponse?.ok) return new Response('Not found', { status: 404 })
  const photoBytes = Buffer.from(await photoResponse.arrayBuffer())

  const content = Math.round(ICON_SIZE * SAFE_ZONE_RATIO)
  const inset = Math.round((ICON_SIZE - content) / 2)

  try {
    // 사진은 cropImageToSquare가 이미 정사각형으로 잘라 넘겨주므로 fit:
    // 'cover'는 사실상 단순 축소다 -- 다른 출처의 사진이 섞여도 안전하도록
    // 남겨둔다.
    const resizedPhoto = await sharp(photoBytes)
      .resize(content, content, { fit: 'cover' })
      .toBuffer()

    const png = await sharp({
      create: {
        width: ICON_SIZE,
        height: ICON_SIZE,
        channels: 4,
        background: BACKGROUND_COLOR,
      },
    })
      .composite([{ input: resizedPhoto, top: inset, left: inset }])
      .png()
      .toBuffer()

    return new Response(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        // Personalized per couple -- must never be shared by a CDN edge.
        'Cache-Control': 'private, no-store',
      },
    })
  } catch {
    // 사진이 아닌 응답(깨진 파일, HTML 에러 페이지 등)을 sharp가 못 읽는
    // 경우도 같은 404 폴백으로 흡수한다.
    return new Response('Not found', { status: 404 })
  }
}
