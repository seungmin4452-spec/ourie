import { defineTheme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral'

// 화이트(라이트) / 다크 2가지만 지원하는 단순한 테마. neutralTheme 기본 팔레트를 그대로 쓰고
// radius만 조정한다. 기본 모드는 providers.tsx에서 mode="light"로 고정 (UI_GUIDE.md §2, §7 참고).
export const ourieTheme = defineTheme({
  name: 'ourie',
  extends: neutralTheme,
  typography: {
    body: { family: 'system-ui', fallbacks: "'Segoe UI', Roboto, sans-serif" },
  },
  tokens: {
    '--radius-container': '16px',
  },
})
