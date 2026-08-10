// iOS Safari's "Add to Home Screen" reads the icon label from the raw HTML
// bytes the server returned for the page you are standing on -- not from
// anything JS does to the DOM afterward, and not from a service-worker
// rewritten response (both were tried, neither worked). So the couple's own
// name only lands on the home screen if they add it *from* a page a server
// rendered with that name baked in: api/pwa-install.ts.
//
// Adding from the SPA at "/" instead always yields the static "Ourie" in
// index.html, which is exactly the trap this helper exists to keep everyone
// out of.

import { createSessionHandoffToken, SESSION_HANDOFF_PARAM } from '@/features/auth'
import { PWA_INSTALL_PATH } from '@/lib/pwaInstallPath'

// Platform detection lives on the install page itself (api/pwa-install.ts),
// which is where the per-platform steps are shown -- both platforms are sent
// there so the icon carries the couple's name either way.
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

// Root-relative on purpose: same-origin keeps an already-installed PWA inside
// its scope, and leaving scope on iOS drops it into an in-app browser with no
// way back.
export function buildPwaInstallUrl(
  title: string,
  icon: string | null,
  sessionHandoff?: string | null,
): string {
  const params = new URLSearchParams({ title })
  // Only https icons travel by query string. The offline fallback is a 512px
  // PNG data URL (renderEmojiIcon.ts) -- tens of KB, far past what a URL can
  // carry -- and api/pwa-install.ts already substitutes the default icon when
  // this parameter is missing.
  if (icon?.startsWith('https://')) params.set('icon', icon)
  // 매니페스트의 start_url까지 그대로 따라가서, 설치된 앱이 로그인 화면이 아니라
  // 로그인된 상태로 실행되게 한다 (sessionHandoff.ts).
  if (sessionHandoff) params.set(SESSION_HANDOFF_PARAM, sessionHandoff)
  return `${PWA_INSTALL_PATH}?${params.toString()}`
}

// 설치 페이지로 넘어갈 때는 이 함수만 쓴다. 세션 인계 토큰은 아직 세션을 들고
// 있는 브라우저에 있는 동안 읽어야 하기 때문이다.
export async function openPwaInstallPage(title: string, icon: string | null): Promise<void> {
  const handoff = await createSessionHandoffToken()
  window.location.assign(buildPwaInstallUrl(title, icon, handoff))
}
