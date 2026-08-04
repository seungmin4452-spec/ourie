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

브랜드 테마는 `src/app/theme.ts`의 `ourieTheme`(`defineTheme`, `neutralTheme` 확장)에 정의되어 있다. 별도 브랜드 컬러 없이 Astryx neutral 팔레트를 그대로 쓰는 화이트/다크 2모드 구성이며 기본은 라이트다 (`docs/UI_GUIDE.md` §2 참고). 색상을 바꿀 땐 컴포넌트 안에서 하드코딩하지 말고 `theme.ts`의 `tokens`를 수정한다.

라이트/다크 모드는 사용자가 직접 전환할 수 있다: `src/app/color-mode-context.ts`(Context) + `src/app/ColorModeProvider.tsx`(상태, localStorage 영속화, 기본값 `light`) + `src/app/useColorMode.ts`(훅)로 관리되고, `src/components/common/ColorModeToggle.tsx`가 우측 상단에 떠 있는 전환 버튼이다. `src/app/providers.tsx`의 `ThemedApp`이 이 상태를 읽어 `<Theme theme={ourieTheme} mode={mode}>`에 넘긴다.

**주의**: `src/index.css`에 직접 `html { color-scheme: ... }` 같은 규칙을 추가하지 말 것. Astryx의 `reset.css`가 `Theme`의 `mode` prop에 따라 `<html data-theme>`을 보고 `color-scheme`을 이미 올바르게 설정한다 (`@layer reset`). 여기에 우리 규칙을 `@layer base`(reset보다 우선순위 높음)에 추가하면 그 규칙이 덮어써서, OS가 다크모드일 때 `mode="light"`를 지정해도 배경이 어두워지고 스타일 없는 텍스트(색을 지정하지 않은 `<h1>` 등)가 검게 보이지 않는 버그가 생긴다 (실제로 겪었던 문제).

Toast/Badge/Dialog 같은 컴포넌트는 타임라인·지도 등 아직 구현되지 않은 화면에서 필요해지면 그때 도입한다 (Bottom Sheet에 대응하는 컴포넌트는 Astryx에 없으므로 `Dialog`를 하단 고정 스타일로 커스터마이징해야 함).
