// Link-preview page for shared invite codes. The app is a static SPA with a
// single index.html, so it can't serve per-request <meta> tags -- but when a
// couple shares their invite link (KakaoTalk, iMessage, SMS...) the receiving
// app's crawler needs a real server response with og:image/og:title pointing
// at the inviter's own app photo. This renders that, then forwards a human
// visitor into the real app. Same reasoning as pwa-install.ts.

import { DEFAULT_TITLE, escapeHtmlAttr, requestOrigin, sanitizeIconUrl } from './_shared'

export const config = { runtime: 'edge' }

function isValidInviteCode(value: string | null): value is string {
  return !!value && /^[A-Z0-9]{4,12}$/.test(value)
}

function renderHtml(title: string, icon: string, joinUrl: string): string {
  const safeTitle = escapeHtmlAttr(title)
  const safeIcon = escapeHtmlAttr(icon)
  const safeJoinUrl = escapeHtmlAttr(joinUrl)
  const description = `${title}이(가) Ourie 커플 연결을 초대했어요`
  const safeDescription = escapeHtmlAttr(description)

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#F1F4F7" />
    <title>${safeTitle}</title>
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDescription}" />
    <meta property="og:image" content="${safeIcon}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDescription}" />
    <meta name="twitter:image" content="${safeIcon}" />
    <script>
      location.replace(${JSON.stringify(joinUrl)});
    </script>
    <style>
      body {
        margin: 0;
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 32px 24px;
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif;
        text-align: center;
        background: #F1F4F7;
        color: #111112;
      }
      img {
        width: 64px;
        height: 64px;
        border-radius: 16px;
        object-fit: cover;
        margin-bottom: 8px;
      }
      h1 { font-size: 18px; margin: 0; }
      p { font-size: 14px; color: #6b7280; margin: 0; }
      a {
        margin-top: 8px;
        color: #6b7280;
        font-size: 14px;
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <img src="${safeIcon}" alt="" />
    <h1>${safeTitle}</h1>
    <p>${safeDescription}</p>
    <a href="${safeJoinUrl}">앱으로 이동하기</a>
  </body>
</html>`
}

export default function handler(request: Request): Response {
  const url = new URL(request.url)
  const origin = requestOrigin(request)
  const code = url.searchParams.get('code')?.trim().toUpperCase() ?? null
  const title = url.searchParams.get('title')?.trim() || DEFAULT_TITLE
  const icon = sanitizeIconUrl(url.searchParams.get('icon'), origin)

  if (!isValidInviteCode(code)) {
    return Response.redirect(`${origin}/`, 302)
  }

  // Root-relative: the app lives on this same origin, so staying relative
  // keeps an installed PWA inside its scope (and inside standalone mode).
  const joinUrl = `/onboarding/couple?code=${encodeURIComponent(code)}`

  return new Response(renderHtml(title, icon, joinUrl), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
