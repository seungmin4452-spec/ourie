# UI GUIDE — Ourie

## 1. 톤앤매너

Ourie는 생산성 툴이 아니라 "감정을 기록하는 공간"이다. UI는 다음 원칙을 따른다.

- **심플함**: 색을 최소화한 화이트(라이트) / 다크 2가지 모드만 지원. 파스텔·브랜드 컬러 대신 Astryx neutral 팔레트 그대로 사용
- **둘만의 공간감**: 폐쇄형 서비스라는 특성을 살려 아늑하고 프라이빗한 느낌
- **사진이 주인공**: 텍스트보다 사진/추억이 시각적으로 강조되는 레이아웃
- **가벼움**: 모바일 PWA 특성상 로딩이 빠르고 인터랙션이 가벼워야 함

## 2. 컬러 팔레트

화이트(라이트) / 다크 2가지 모드만 지원하며, 기본은 라이트 모드다. 별도 브랜드 컬러 없이 Astryx `neutralTheme`의 기본 팔레트를 그대로 사용한다 (`src/app/theme.ts`의 `ourieTheme`은 `radius-container`만 오버라이드).

- `src/app/providers.tsx`에서 `<Theme theme={ourieTheme} mode="light">`로 기본 모드를 라이트로 고정했다. 다크 모드는 토큰 상 이미 지원되므로, 수동 전환 토글을 만들 때 `mode` prop만 바꿔주면 된다 (§7 참고).
- 색상을 바꿀 땐 컴포넌트에 하드코딩하지 말고 `theme.ts`의 `tokens`를 수정할 것.
- 커플별 `theme_color`(`DATABASE.md` 참고)를 다시 도입하고 싶다면 `ourieTheme`을 `extends`하는 별도 `<Theme>`로 해당 서브트리를 감싸 `--color-accent`를 오버라이드하는 방식을 쓴다 (현재는 요구사항에서 제외됨).
- Tailwind 유틸리티는 Astryx의 `tailwind-theme.css` 브리지를 통해 토큰과 동기화된다 (`bg-surface`, `text-primary`, `text-secondary`, `bg-accent-bg`, `text-accent` 등). 임의 hex/px 값을 className에 직접 넣지 않는다.

## 3. 타이포그래피

| 용도 | 크기 (모바일 기준) | 굵기 |
|---|---|---|
| 페이지 타이틀 (예: "우리의 타임라인") | 24px | Medium/Semibold |
| 섹션 헤더 | 18px | Medium |
| 본문 | 15px | Regular |
| 보조/캡션 (날짜, 위치 등) | 13px | Regular |
| 디데이 숫자 강조 | 32px~40px | Bold |

- 시스템 폰트 우선 (`system-ui` 등) 사용으로 로딩 비용 최소화, 추후 감성적인 커스텀 폰트(예: 손글씨 계열) 도입 검토 가능

## 4. 레이아웃 원칙

- **모바일 우선**: 최대 폭 480~560px 정도의 단일 컬럼 레이아웃을 기본으로, 데스크톱에서는 중앙 정렬
- **하단 탭 내비게이션**: 홈 / 타임라인 / 지도 / 설정 4개 내외로 구성 (엄지 접근성 고려)
- **여백**: 감성적인 느낌을 위해 밀도를 낮추고 여백을 넉넉히 사용 (카드 간 간격 16px 이상)
- **안전 영역 대응**: PWA standalone 모드에서 iOS 노치/홈 인디케이터 영역(`env(safe-area-inset-*)`) 고려

## 5. 핵심 화면별 가이드

### 5.1 홈
- 상단: 커플 대표 사진/닉네임 + 가장 가까운 디데이 큰 숫자로 강조
- 그 아래: 최근 추억 미리보기 카드 (2~3개)

구현 상태 (`src/features/couple/pages/HomePage.tsx`):
- 디데이 강조는 `DdayHighlight` (Astryx `Card variant="muted"` + `Heading type="display-2"`). 숫자 크기는 §3의 32~40px를 px로 박지 않고 display 타입 스케일 토큰을 쓴다
- 어떤 기념일을 크게 띄울지는 `pickHighlight` — 등록된 기념일 중 **가장 가까이 다가온 것** 하나 (PRD §3.2). 기준일이 이미 지났으면 "함께한 지 N일째"(한국식으로 기준일이 1일째)를 아래에 덧붙인다
- 기념일이 하나도 없으면 `EmptyState`로 `/anniversaries` 등록을 유도한다
- 최근 추억 영역은 타임라인(PRD §3.3) 구현 전까지 `EmptyState` 자리표시자다

### 5.2 추억 타임라인
- 날짜 그룹핑된 세로 스크롤 리스트
- 카드형: 사진(대표 1장 또는 그리드) + 날짜 + 짧은 텍스트 미리보기
- 작성자(둘 중 누구) 구분은 은은한 뱃지/아이콘으로만 표시 (과도한 구분 지양 — "우리"라는 감각 유지)

### 5.3 여행 지도
- 전체 화면 지도 + 하단 시트(bottom sheet)로 핀 상세 정보 노출
- 핀은 커스텀 마커(하트 등)로 브랜드 톤 유지

### 5.4 커스터마이징/설정
- 테마 컬러는 프리셋 몇 가지 제공 후 필요시 커스텀 컬러피커 (초기엔 프리셋만으로 충분)
- 설정 항목은 리스트형 UI로 단순하게 구성

## 6. 컴포넌트 가이드
UI는 Astryx(`@astryxdesign/core`)로 통일한다. 새 컴포넌트가 필요하면 직접 만들기 전에 `npx astryx component <이름>` / `npx astryx search "<키워드>"`로 먼저 확인한다.

- **Button**: Astryx `Button` — `variant`: primary(강조색 채움) / secondary / ghost / destructive
- **입력 필드**: Astryx `TextInput` (label/description/status 내장, 별도 Label 불필요)
- **Card**: Astryx `Card` — radius는 테마의 `--radius-container`(16px)를 따름
- **Badge**: 작성자 표시, 태그 표시용 (타임라인 구현 시 도입 — PRD §3.3)
- **Toast**: 저장 완료/실패 등 비차단 피드백 (`useToast`) — 폼 필드 자체 검증 에러는 `TextInput`의 `status` prop 사용
- **지도 핀 상세 / 사진 확대**: Astryx에 Bottom Sheet 컴포넌트가 없음. `Dialog`를 하단 고정형으로 커스텀 스타일링해서 사용 (여행 지도 기능 구현 시 결정)

## 7. 다크모드
- 시스템 설정(`prefers-color-scheme`)을 따르지 않고 기본값을 라이트 모드로 고정
- 사용자가 화면 우측 상단의 토글 버튼(`ColorModeToggle`)으로 라이트/다크를 직접 전환할 수 있다. 선택값은 `localStorage`(`ourie-color-mode`)에 저장되어 재방문 시에도 유지된다 (`src/app/ColorModeProvider.tsx`)
- 구현 시 `src/index.css`에 `color-scheme`을 직접 선언하지 않는다 — Astryx `reset.css`가 `Theme`의 `mode`를 보고 알아서 처리하며, 직접 선언하면 이 동작을 깨뜨린다 (`CLAUDE.md` 참고)

## 8. 접근성
- 이미지에는 대체 텍스트(간단한 설명) 입력 권장 (필수는 아니되 UX상 유도)
- 터치 타겟 최소 44x44px 확보
- 텍스트 대비 WCAG AA 기준 참고

## 9. 미결 사항
- 커스텀 폰트 도입 여부 (현재 `theme.ts`는 system-ui 사용)
- 커플별 `theme_color` 커스터마이징 재도입 여부 (현재 요구사항에서 제외, §2 참고)
- Bottom Sheet 대체 컴포넌트(Astryx Dialog 커스텀) 구체 구현 미착수
- 라이트/다크 토글 위치가 현재는 임시로 우측 상단 고정 버튼. 설정 화면이 생기면 그쪽으로 옮길지 검토
