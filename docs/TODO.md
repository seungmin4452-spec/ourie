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
- [ ] `couples` 테이블 생성 + RLS 정책 작성
- [ ] 초대 코드 생성 UI
- [ ] 초대 코드 입력 → 커플 연결 완료 플로우
- [ ] 커플 미연결 사용자 온보딩 라우트 가드

## Phase 3 — 디데이
- [ ] `anniversaries` 테이블 생성 + RLS 정책
- [ ] 디데이 등록/수정/삭제 UI
- [ ] D+N/D-N 계산 로직 (유틸 함수)
- [ ] 홈 화면에 다가오는 디데이 강조 표시

## Phase 4 — 추억 타임라인
- [ ] `memories`, `memory_photos` 테이블 생성 + RLS 정책
- [ ] `memory-photos` Storage 버킷 생성 + 접근 정책
- [ ] 추억 작성 폼 (텍스트 + 다중 사진 업로드)
- [ ] 타임라인 목록 뷰 (날짜순, 무한 스크롤 또는 페이지네이션)
- [ ] 추억 상세/수정/삭제

## Phase 5 — 여행 지도
- [ ] 지도 API 벤더 선정 (Kakao/Naver/Mapbox 등)
- [ ] 위치 정보 있는 `memories` 조회 쿼리
- [ ] 지도 위 핀 렌더링 + 클러스터링(핀 많아질 경우) 검토
- [ ] 핀 클릭 → 해당 추억 상세로 이동

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
