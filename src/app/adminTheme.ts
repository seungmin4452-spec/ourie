import { defineTheme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral'

/**
 * 관리자 모드 뒷면에서만 쓰는, macOS 터미널 앱과 비슷한 생김새의 테마.
 *
 * 실제 명령어를 입력하는 터미널을 만드는 게 아니다 — 위젯을 카드로 쌓는
 * 형식은 홈과 똑같고, 다른 건 이 테마뿐이다 (AdminScreen.tsx 참고). 항상
 * `mode="dark"`로만 씌우므로 토큰 값은 라이트/다크 튜플이 아니라 단일
 * 문자열로 적는다.
 */
export const adminTerminalTheme = defineTheme({
  name: 'ourie-admin-terminal',
  extends: neutralTheme,
  typography: {
    body: {
      family: 'ui-monospace',
      fallbacks: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
    },
  },
  tokens: {
    '--color-background-body': '#161b17',
    '--color-background-surface': '#1e2420',
    '--color-background-card': '#1a201c',
    '--color-text-primary': '#e4f5e0',
    '--color-text-secondary': '#7fdf9b',
    '--color-border': '#2e3a33',
    '--color-accent': '#3ddc6a',
    // macOS 창처럼 살짝 둥근 모서리 — 각진 콘솔이 아니라 "터미널 앱 창"의 인상.
    '--radius-container': '14px',
  },
})
