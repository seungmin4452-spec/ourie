# Ourie — Agent Guide

@.claude/CLAUDE.md

## 프로젝트 문서
작업 전 관련 문서를 확인한다.
- `docs/PRD.md` — 제품 요구사항, 유저 스토리
- `docs/UI_GUIDE.md` — 톤앤매너, 디자인 토큰, 화면별 가이드 (디자인 결정의 기준 문서)
- `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/TODO.md`

## 디자인 시스템
UI는 `@astryxdesign/core` (Astryx)만 사용한다. shadcn/`@base-ui/react`는 제거했으며 재도입하지 않는다.
Astryx 사용 규칙은 위에 임포트된 `.claude/CLAUDE.md`를 따른다 (컴포넌트로만 레이아웃 구성, `astryx component`/`astryx docs`로 API 확인 후 사용, `:root`에서 `--color-*` 직접 오버라이드 금지 등).

브랜드 테마는 `src/app/theme.ts`의 `ourieTheme`(`defineTheme`, `neutralTheme` 확장)에 정의되어 있고 `src/app/providers.tsx`에서 `<Theme theme={ourieTheme}>`로 앱 전체에 적용된다. `UI_GUIDE.md` §2의 팔레트를 그대로 토큰에 매핑했으므로, 색상을 바꿀 땐 컴포넌트 안에서 하드코딩하지 말고 `theme.ts`의 `tokens`를 수정한다.

커플별 accent 커스터마이징(향후 기능, PRD §3.5)은 `ourieTheme`을 `extends`하는 별도 `<Theme>`로 특정 서브트리를 감싸 적용한다. DB의 `theme_color` 값이 준비되면 `docs/UI_GUIDE.md` §2, §7을 참고해 구현한다.

Toast/Badge/Dialog 같은 컴포넌트는 타임라인·지도 등 아직 구현되지 않은 화면에서 필요해지면 그때 도입한다 (Bottom Sheet에 대응하는 컴포넌트는 Astryx에 없으므로 `Dialog`를 하단 고정 스타일로 커스터마이징해야 함).
