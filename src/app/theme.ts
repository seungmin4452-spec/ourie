import { defineTheme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral'

// UI_GUIDE.md §2 팔레트를 Astryx 토큰에 매핑한 브랜드 테마.
// 커플별 accent 커스터마이징은 이 테마를 extends하는 별도 Theme로 감싸 적용한다 (UI_GUIDE.md §2, §7 참고).
export const ourieTheme = defineTheme({
  name: 'ourie',
  extends: neutralTheme,
  color: { accent: '#FF6B9D', neutralStyle: 'warm' },
  typography: {
    body: { family: 'system-ui', fallbacks: "'Segoe UI', Roboto, sans-serif" },
  },
  tokens: {
    '--color-accent': ['#FF6B9D', '#FF8FB3'],
    '--color-background-body': ['#FFF9FB', '#1A1620'],
    '--color-background-surface': ['#FFFFFF', '#241F2B'],
    '--color-background-card': ['#FFFFFF', '#241F2B'],
    '--color-text-primary': ['#3D3540', '#EDEAF0'],
    '--color-border': ['#F0E4E9', '#332C3B'],
    '--radius-container': '16px',
  },
})
