// Serves the page the couple actually taps "Add to Home Screen" from on iOS.
// See CustomizeForm.tsx for why this exists.
//
// Originally this lived as a Supabase Edge Function, but Supabase rewrites
// any GET response's Content-Type to text/plain on the standard
// *.supabase.co domain (custom domains need a paid plan), so the browser
// never actually parsed it as a page. Vercel serves text/html normally even
// on its free *.vercel.app domain, so the same logic lives here instead.

export const config = { runtime: 'edge' }

const APP_URL = 'https://seungmin4452-spec.github.io/ourie/'
const DEFAULT_TITLE = 'Ourie'
const DEFAULT_ICON = `${APP_URL}apple-touch-icon.png`

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sanitizeIconUrl(value: string | null): string {
  if (!value) return DEFAULT_ICON
  try {
    const parsed = new URL(value)
    if (parsed.protocol === 'https:' || parsed.protocol === 'data:') return value
  } catch {
    // Not a valid absolute URL -- fall through to the default.
  }
  return DEFAULT_ICON
}

function renderHtml(title: string, icon: string): string {
  const safeTitle = escapeHtmlAttr(title)
  const safeIcon = escapeHtmlAttr(icon)
  const safeAppUrl = escapeHtmlAttr(APP_URL)

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#F1F4F7" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="${safeTitle}" />
    <link rel="apple-touch-icon" href="${safeIcon}" />
    <title>${safeTitle}</title>
    <script>
      // Re-launched from the home-screen icon (not a normal Safari tab) --
      // this page has done its job, send them into the real app.
      if (window.navigator.standalone) {
        location.replace(${JSON.stringify(APP_URL)});
      }
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
      ol {
        text-align: left;
        padding-left: 20px;
        margin: 12px 0;
        font-size: 15px;
        line-height: 1.6;
      }
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
    <ol>
      <li>하단 공유 버튼을 눌러주세요.</li>
      <li>"홈 화면에 추가"를 선택해주세요.</li>
      <li>오른쪽 위 "추가"를 눌러 완료해주세요.</li>
    </ol>
    <a href="${safeAppUrl}">앱으로 돌아가기</a>
  </body>
</html>`
}

export default function handler(request: Request): Response {
  const url = new URL(request.url)
  const title = url.searchParams.get('title')?.trim() || DEFAULT_TITLE
  const icon = sanitizeIconUrl(url.searchParams.get('icon'))

  return new Response(renderHtml(title, icon), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
