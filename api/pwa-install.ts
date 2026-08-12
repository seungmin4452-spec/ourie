// Serves the page the couple actually taps "Add to Home Screen" from on iOS.
// See CustomizeForm.tsx for why this exists.
//
// Originally this lived as a Supabase Edge Function, but Supabase rewrites
// any GET response's Content-Type to text/plain on the standard
// *.supabase.co domain (custom domains need a paid plan), so the browser
// never actually parsed it as a page. Vercel serves text/html normally even
// on its free *.vercel.app domain, so the same logic lives here instead.
//
// This is also the *only* install screen: the app links straight here rather
// than through a React page that then asks you to open this one. Both
// platforms are explained on the spot -- iOS through the Share Sheet (the one
// route that picks up the couple's name, baked into the bytes below), Android
// through beforeinstallprompt, which installs in a single tap.

import {
  appLaunchUrl,
  DEFAULT_TITLE,
  escapeHtmlAttr,
  requestOrigin,
  sanitizeIconUrl,
  sanitizeSessionHandoff,
  SESSION_HANDOFF_PARAM,
} from './_shared.js'

export const config = { runtime: 'edge' }

function renderHtml(
  title: string,
  icon: string,
  manifestUrl: string,
  launchUrl: string,
): string {
  const safeTitle = escapeHtmlAttr(title)
  const safeIcon = escapeHtmlAttr(icon)
  const safeManifestUrl = escapeHtmlAttr(manifestUrl)

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#F1F4F7" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="${safeTitle}" />
    <link rel="apple-touch-icon" href="${safeIcon}" />
    <!-- Declares scope "/" so the app added from here covers the whole site.
         Without it iOS infers a narrow scope and bounces the launch into an
         in-app browser -- see api/manifest.ts. On Android this is also what
         Chrome installs from, so the icon gets the couple's name too. -->
    <link rel="manifest" href="${safeManifestUrl}" />
    <title>${safeTitle}</title>
    <script>
      // 이제는 폴백일 뿐이다: 매니페스트의 start_url이 홈 화면 아이콘을 곧장
      // 앱으로 보내므로, 그걸 존중하는 iOS 버전은 이 페이지를 다시 열지 않는다.
      // 구버전은 추가한 URL을 다시 열기 때문에 여기서 넘겨준다 -- 매니페스트가
      // scope를 "/"로 선언하니 스코프 안에 머물고, start_url이 실었을 세션 인계
      // 토큰도 똑같이 싣고 간다.
      if (window.navigator.standalone) {
        location.replace(${JSON.stringify(launchUrl)});
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
        padding:
          calc(32px + env(safe-area-inset-top))
          calc(24px + env(safe-area-inset-right))
          calc(32px + env(safe-area-inset-bottom))
          calc(24px + env(safe-area-inset-left));
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif;
        text-align: center;
        background: #F1F4F7;
        color: #111112;
      }
      [hidden] { display: none !important; }
      img {
        width: 64px;
        height: 64px;
        border-radius: 16px;
        object-fit: cover;
        margin-bottom: 8px;
      }
      h1 { font-size: 18px; margin: 0; }
      p.lead { margin: 0; font-size: 14px; color: #6b7280; }
      nav {
        display: flex;
        gap: 4px;
        margin-top: 8px;
        padding: 4px;
        border-radius: 999px;
        background: #e2e8f0;
      }
      nav button {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: 8px 20px;
        font: inherit;
        font-size: 14px;
        color: #6b7280;
        background: transparent;
        cursor: pointer;
      }
      body[data-platform="android"] nav button[data-select="android"],
      body[data-platform="ios"] nav button[data-select="ios"] {
        background: #ffffff;
        color: #111112;
        font-weight: 600;
      }
      body[data-platform="android"] section[data-platform="ios"],
      body[data-platform="ios"] section[data-platform="android"] { display: none; }
      section { width: 100%; max-width: 320px; }
      ol {
        text-align: left;
        padding-left: 20px;
        margin: 12px 0;
        font-size: 15px;
        line-height: 1.6;
      }
      button#install {
        appearance: none;
        border: 0;
        width: 100%;
        margin-top: 12px;
        padding: 14px 20px;
        border-radius: 12px;
        font: inherit;
        font-size: 16px;
        font-weight: 600;
        color: #ffffff;
        background: #111112;
        cursor: pointer;
      }
      button#install[disabled] { opacity: 0.5; cursor: default; }
      /* 이 화면에서 빠져나가는 유일한 출구. 설치를 마쳤든, 나중에 하기로 했든,
         안내만 읽고 말았든 여기서 앱으로 돌아갈 수 있어야 한다. 링크처럼
         작게 두었더니 막다른 길처럼 보여서 버튼으로 키웠다. */
      a#done {
        display: block;
        box-sizing: border-box;
        width: 100%;
        max-width: 320px;
        margin-top: 4px;
        padding: 14px 20px;
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        font-size: 16px;
        font-weight: 600;
        color: #111112;
        background: #ffffff;
        text-align: center;
        text-decoration: none;
      }
    </style>
  </head>
  <body data-platform="ios">
    <img src="${safeIcon}" alt="" />
    <h1>${safeTitle}</h1>
    <p class="lead">홈 화면에 추가하면 앱처럼 바로 열려요.</p>

    <nav>
      <button type="button" data-select="android">안드로이드</button>
      <button type="button" data-select="ios">아이폰</button>
    </nav>

    <section data-platform="ios">
      <ol>
        <li>이 화면 하단의 공유 버튼을 눌러주세요.</li>
        <li>"홈 화면에 추가"를 선택해주세요.</li>
        <li>오른쪽 위 "추가"를 눌러 완료해주세요.</li>
        <!-- iOS는 이미 놓인 아이콘의 이름·사진을 절대 다시 읽지 않는다. 꾸미기를
             고치고 여기까지 온 사람에게는 새 아이콘이 하나 더 생기는 것이고,
             이 줄이 없으면 예전 아이콘이 그대로 남아 "안 바뀌었다"가 된다.
             지우는 건 마지막이다: 먼저 지우면 앱만의 저장소 컨테이너까지 함께
             날아가고(_shared.ts의 세션 인계 참고), 새로 추가한 뒤라면 사진이
             달라 어느 쪽이 예전 것인지 눈으로 바로 갈린다. -->
        <li>예전 아이콘이 남아 있다면, 꾹 눌러 삭제해주세요.</li>
      </ol>
    </section>

    <section data-platform="android">
      <!-- Shown only once Chrome has handed us a deferred prompt: tapping it
           installs outright, no menu digging. The steps below stay as the
           fallback for browsers that never fire the event (Samsung Internet,
           Firefox) and for an app that is already installed. -->
      <button type="button" id="install" hidden>지금 홈 화면에 추가하기</button>
      <ol id="android-steps">
        <li>Chrome 브라우저로 이 페이지를 열어주세요.</li>
        <li>오른쪽 위 메뉴(⋮) 버튼을 눌러주세요.</li>
        <li>"앱 설치" 또는 "홈 화면에 추가"를 선택해주세요.</li>
        <li>"설치"를 눌러 완료해주세요.</li>
      </ol>
    </section>

    <a id="done" href="${escapeHtmlAttr(launchUrl)}">완료</a>

    <script>
      (function () {
        var body = document.body;
        var ua = navigator.userAgent;
        // iPadOS reports a Mac UA, so the touch check catches it too.
        var isIOS =
          /iphone|ipad|ipod/i.test(ua) ||
          (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
        body.setAttribute("data-platform", isIOS ? "ios" : "android");

        var tabs = document.querySelectorAll("nav button");
        for (var i = 0; i < tabs.length; i++) {
          tabs[i].addEventListener("click", function (event) {
            body.setAttribute("data-platform", event.currentTarget.getAttribute("data-select"));
          });
        }

        var installButton = document.getElementById("install");
        var androidSteps = document.getElementById("android-steps");
        var deferredPrompt = null;

        window.addEventListener("beforeinstallprompt", function (event) {
          // Chrome only lets prompt() run from a user gesture, so hold the
          // event and fire it from the button instead of on arrival.
          event.preventDefault();
          deferredPrompt = event;
          installButton.hidden = false;
          androidSteps.hidden = true;
        });

        installButton.addEventListener("click", function () {
          if (!deferredPrompt) return;
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then(function (choice) {
            // The event is single-use: a dismissed prompt can't be replayed,
            // so fall back to the manual steps rather than a dead button.
            deferredPrompt = null;
            if (choice.outcome !== "accepted") {
              installButton.hidden = true;
              androidSteps.hidden = false;
            }
          });
        });

        window.addEventListener("appinstalled", function () {
          location.replace("/");
        });
      })();
    </script>
  </body>
</html>`
}

export default function handler(request: Request): Response {
  const url = new URL(request.url)
  const title = url.searchParams.get('title')?.trim() || DEFAULT_TITLE
  const icon = sanitizeIconUrl(url.searchParams.get('icon'), requestOrigin(request))
  const handoff = sanitizeSessionHandoff(url.searchParams.get(SESSION_HANDOFF_PARAM))

  // 같은 title/icon/session을 매니페스트로 그대로 넘긴다. 매니페스트는 지금
  // 누가 설치하는지 알 방법이 달리 없다.
  const manifestUrl = `/api/manifest?${url.searchParams.toString()}`

  return new Response(renderHtml(title, icon, manifestUrl, appLaunchUrl(handoff)), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // URL과 응답 바이트 양쪽에 세션 인계 토큰이 들어 있다. CDN이 공유해서도
      // 안 되고, 브라우저가 캐시해서도 안 된다 -- 토큰은 첫 실행에 쓰이면
      // 그걸로 소진된다.
      'Cache-Control': 'private, no-store',
    },
  })
}
