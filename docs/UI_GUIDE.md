# UI GUIDE — Ourie

## 1. 톤앤매너

Ourie는 생산성 툴이 아니라 "감정을 기록하는 공간"이다. UI는 다음 원칙을 따른다.

- **따뜻함**: 차갑고 기계적인 대시보드 느낌을 지양, 손글씨 느낌/부드러운 곡선/파스텔톤 활용
- **둘만의 공간감**: 폐쇄형 서비스라는 특성을 살려 아늑하고 프라이빗한 느낌
- **사진이 주인공**: 텍스트보다 사진/추억이 시각적으로 강조되는 레이아웃
- **가벼움**: 모바일 PWA 특성상 로딩이 빠르고 인터랙션이 가벼워야 함

## 2. 컬러 팔레트 (초안)

기본 팔레트는 커플별 커스터마이징(테마 컬러)으로 덮어쓸 수 있어야 하므로, 아래는 **기본값**이자 **디자인 토큰 구조**의 예시다.

| 토큰 | 라이트 | 다크 | 용도 |
|---|---|---|---|
| `--color-bg` | `#FFF9FB` | `#1A1620` | 배경 |
| `--color-surface` | `#FFFFFF` | `#241F2B` | 카드/표면 |
| `--color-primary` | `#FF6B9D` | `#FF8FB3` | 강조색 (핑크 계열, 커플 테마로 대체 가능) |
| `--color-primary-muted` | `#FFE1EC` | `#3A2A33` | 강조색 배경/뱃지 |
| `--color-text` | `#3D3540` | `#EDEAF0` | 본문 텍스트 |
| `--color-text-muted` | `#8B8391` | `#A9A2B0` | 보조 텍스트 |
| `--color-border` | `#F0E4E9` | `#332C3B` | 구분선 |

- 위 토큰은 `src/app/theme.ts`의 `ourieTheme`(Astryx `defineTheme`)에 그대로 반영되어 있다. 색상을 바꿀 땐 컴포넌트에 하드코딩하지 말고 `theme.ts`의 `tokens`를 수정할 것.
- 커플별 `theme_color`(`DATABASE.md` 참고)는 `ourieTheme`을 `extends`하는 별도 `<Theme>`로 해당 서브트리를 감싸 `--color-accent`를 오버라이드하는 방식으로 적용 (아직 미구현, §7 참고)
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
- `prefers-color-scheme` 기반 자동 대응을 기본으로 하되, 설정에서 수동 전환 옵션 제공 여부는 후순위 검토
- 커플 테마 컬러는 라이트/다크 각각에 대해 대비(contrast)가 확보된 변형 값을 함께 정의해야 함

## 8. 접근성
- 이미지에는 대체 텍스트(간단한 설명) 입력 권장 (필수는 아니되 UX상 유도)
- 터치 타겟 최소 44x44px 확보
- 텍스트 대비 WCAG AA 기준 참고

## 9. 미결 사항
- 실제 브랜드 컬러/로고 확정 전이므로 위 팔레트는 임시값 (`src/app/theme.ts`에 구현은 되어 있으나 값 자체는 재검토 가능)
- 커스텀 폰트 도입 여부 (현재 `theme.ts`는 system-ui 사용)
- 다크모드 수동 전환 지원 여부
- 커플별 `theme_color` 런타임 적용 로직 미구현 (§2 참고)
- Bottom Sheet 대체 컴포넌트(Astryx Dialog 커스텀) 구체 구현 미착수
