# TODO — Ourie

> 초기 세팅부터 핵심 기능 개발까지의 체크리스트. 완료 항목은 `[x]`로 표시.

## Phase 0 — 프로젝트 초기 세팅
- [ ] Tailwind CSS 설치 및 `vite.config.ts` 연동
- [ ] `src/index.css`의 Vite 템플릿 데모 스타일 제거, 디자인 토큰으로 재구성
- [ ] 폴더 구조 재정리 (`pages/`, `features/`, `components/`, `lib/` 등)
- [ ] `react-router` 설치 및 기본 라우트 골격 구성
- [ ] `@tanstack/react-query` 설치 및 `QueryClientProvider` 설정
- [ ] ESLint/Prettier 정리 (필요 시 Prettier 추가)

## Phase 1 — Supabase 연동 기반
- [ ] Supabase 프로젝트 생성
- [ ] `@supabase/supabase-js` 설치
- [ ] `.env.local`에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 등록, `.gitignore` 확인
- [ ] `src/lib/supabase.ts` 클라이언트 싱글턴 작성
- [ ] `vite-env.d.ts`에 `ImportMetaEnv` 타입 확장

## Phase 2 — 인증 & 커플 연결
- [ ] Supabase Auth 방식 확정 (이메일/매직링크 등)
- [ ] 로그인/회원가입 페이지 구현
- [ ] `profiles` 테이블 생성 + 가입 시 프로필 row 자동 생성 로직
- [x] `couples` 테이블 생성 + RLS 정책 작성
- [x] 초대 코드 생성 UI
- [x] 초대 코드 입력 → 커플 연결 완료 플로우
- [x] 커플 미연결 사용자 온보딩 라우트 가드

## Phase 3 — 디데이
- [x] `anniversaries` 테이블 생성 + RLS 정책
- [x] 디데이 등록/수정/삭제 UI (`/anniversaries`)
- [x] D+N/D-N 계산 로직 (유틸 함수) — `src/features/anniversary/dday.ts`
- [x] 홈 화면에 다가오는 디데이 강조 표시
- [x] 매일 디데이 알림 (Web Push) — `push_subscriptions` 테이블, `/anniversaries`의 알림 스위치, `api/notify-dday.ts` + Supabase pg_cron
- [x] 마일스톤 문구 (100일 단위 · 주년 · D-3 예고) — `src/features/notification/message.ts`
- [x] 콕 찌르기 — `pokes` 테이블 + `send_poke` RPC, `api/poke.ts`, 홈 위젯 `src/features/poke`
- [x] 콕 찌르기를 커플이 직접 만들기 — `poke_presets` 테이블, 위젯의 "콕 찌르기 만들기" 다이얼로그
- [x] 홈 위젯 순서를 드래그로 바꾸기 — `src/features/widgets/components/WidgetList.tsx` (framer-motion Reorder)

## Phase 4 — 추억 타임라인
- [ ] `memories`, `memory_photos` 테이블 생성 + RLS 정책
- [ ] `memory-photos` Storage 버킷 생성 + 접근 정책
- [ ] 추억 작성 폼 (텍스트 + 다중 사진 업로드)
- [ ] 타임라인 목록 뷰 (날짜순, 무한 스크롤 또는 페이지네이션)
- [ ] 추억 상세/수정/삭제

## Phase 5 — 지도

### 5a. 스크래치 지도 (완료)
- [x] 지도 벤더 없이 SVG 직접 렌더로 결정 — `docs/ARCHITECTURE.md` §6.3
- [x] 행정동 경계(2026-07-01) → 시도 16 + 시군구 191 생성기 — `scripts/gen-travel-regions.mjs`
- [x] 울릉도·독도 확대 삽입도
- [x] `travel_visits` / `travel_maps` 테이블 + RLS, `travel-maps` 비공개 버킷
- [x] 홈 위젯 + 시도 → 시군구 2단계 긁기 — `src/features/travel/`
- [x] 배경 사진 업로드 (비율 유지 축소 + SVG cover)
- [ ] **DB 마이그레이션 적용** — `supabase/migrations/2026-08-12-travel-scratch.sql`을
      Supabase SQL 편집기에서 실행해야 저장이 된다
- [ ] 행정구역이 바뀔 때 데이터 갱신 절차 (생성기 재실행 + 사라진 코드 처리) 문서화

### 5b. 핀 지도 (미착수 — 추억 타임라인 이후)
- [ ] 지도 API 벤더 선정 (Kakao/Naver/Mapbox 등)
- [ ] 위치 정보 있는 `memories` 조회 쿼리
- [ ] 지도 위 핀 렌더링 + 클러스터링(핀 많아질 경우) 검토
- [ ] 핀 클릭 → 해당 추억 상세로 이동
- [ ] `travel_visits.memory_id`로 스크래치 지도와 연동

## Phase 6 — 커스터마이징
- [ ] `couple_settings` 테이블 생성 + RLS 정책
- [ ] 테마 컬러 선택 UI
- [ ] 커플 닉네임/대표 사진 설정 UI
- [ ] 설정 값 앱 전역 반영 (Tailwind 테마 변수 동적 적용 방식 검토)

## Phase 7 — PWA
- [ ] `vite-plugin-pwa` 설치 및 설정
- [ ] `manifest.json` 작성 (앱 이름, 아이콘, 테마 컬러, `display: standalone`)
- [ ] 아이콘 세트 준비 (192/512, maskable 포함)
- [ ] iOS PWA 대응 meta 태그 (`apple-touch-icon` 등)
- [ ] 오프라인 캐싱 전략 적용 및 테스트

## Phase 8 — 배포
- [ ] Vercel 프로젝트 연결
- [ ] 환경변수 등록 (프로덕션)
- [ ] 배포 후 실기기(모바일)에서 PWA 설치 테스트

## 미결 정책 항목 (진행 전 결정 필요)
- [ ] 커플 연결 해제 시 데이터 처리 정책
- [ ] 소셜 로그인 지원 여부 및 범위
- [ ] 개인 비공개 기록 허용 여부
- [ ] 개발/운영 Supabase 프로젝트 분리 여부
