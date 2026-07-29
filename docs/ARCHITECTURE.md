# ARCHITECTURE — Ourie

## 1. 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | React 19 + TypeScript | Vite 스캐폴드 기반 |
| 빌드 도구 | Vite | 이미 세팅됨 |
| 스타일링 | Tailwind CSS | 미도입 — 초기 세팅 필요 |
| 백엔드 | Supabase (Postgres, Auth, Storage, Realtime) | 미도입 |
| 라우팅 | react-router | 미도입 |
| 서버 상태 | @tanstack/react-query | 미도입, Supabase 쿼리 캐싱용 |
| 클라이언트 상태 | zustand (필요 시) | 전역 상태 최소화 지향 |
| 지도 | 미정 (Kakao Map / Naver Map / Mapbox / Leaflet 중 선택 필요) | 여행 지도 기능용 |
| PWA | vite-plugin-pwa | 미도입 |
| 배포 | Vercel (권장) | Supabase와 환경변수 연동 용이 |

## 2. 전체 구조

```
[사용자 브라우저 / PWA]
        │
        ▼
  React SPA (Vite build)
        │  Supabase JS Client
        ▼
  Supabase Project
    ├─ Auth        (이메일/매직링크, 세션 관리)
    ├─ Postgres    (RLS로 커플 단위 격리)
    ├─ Storage     (추억 사진 버킷)
    └─ Realtime    (선택: 상대방 활동 실시간 반영)
```

- 별도 커스텀 백엔드 서버 없이 Supabase를 BaaS로 사용하는 구조 (Serverless)
- 클라이언트에서 Supabase RLS 정책에 의존해 데이터 접근을 제어 (커플 단위 격리가 보안의 핵심)

## 3. 폴더 구조

```
src/
  app/
    router.tsx          # 라우트 정의 (createBrowserRouter)
    providers.tsx        # QueryClientProvider 등 전역 프로바이더
  components/
    common/               # 여러 feature가 공유하는 범용 컴포넌트
    layout/                # 앱 셸 레이아웃 (헤더, 하단 탭 등)
    ui/                     # shadcn 기반 프리미티브 (Button 등, components.json 관리)
  features/
    auth/                   # 인증 (로그인/회원가입) — 준비된 껍데기, 구현 예정
    couple/                 # 커플 연결/상태 + 홈(대시보드)
      pages/
        HomePage.tsx
      index.ts              # feature의 public export
    memory/                 # 추억 타임라인 — 준비된 껍데기, 구현 예정
    travel/                  # 여행 지도 — 준비된 껍데기, 구현 예정
  hooks/                    # 여러 feature가 공유하는 커스텀 훅
  lib/
    supabase.ts             # Supabase 클라이언트 싱글턴
    utils.ts                 # cn() 등 범용 유틸
  stores/                   # zustand 전역 스토어
  types/                     # 전역/공유 타입
  main.tsx                   # 진입점 (StrictMode + AppProviders + RouterProvider)
  index.css
```

**Feature 내부 컨벤션**: 각 `features/<name>/`은 필요해지는 시점에 아래 하위 폴더를 그때그때 추가한다 (미리 빈 폴더로 만들어두지 않음).

```
features/<name>/
  api/          # 해당 feature 전용 Supabase 쿼리/뮤테이션
  components/   # 해당 feature 전용 UI
  hooks/         # 해당 feature 전용 훅
  pages/         # 라우트에 연결되는 페이지 컴포넌트
  types.ts       # 해당 feature 전용 타입
  index.ts       # 외부(다른 feature, app/router)에 노출할 public export
```

`couple/`이 위 컨벤션을 따르는 첫 예시다. `auth`/`memory`/`travel`은 현재 `index.ts` 배럴만 있는 빈 껍데기이며, 기능 구현 시 동일한 패턴으로 채워 넣는다. 새 기능(디데이, 커스터마이징 등)이 필요해지면 `features/` 아래 같은 패턴으로 폴더를 추가하면 된다.

라우트 진입점(페이지)은 각 feature의 `pages/` 아래에 두고, 별도 최상위 `pages/` 디렉터리는 두지 않는다. `app/router.tsx`는 각 feature의 `pages/` 컴포넌트를 import해 라우트에 연결하는 역할만 한다.

## 4. 인증 & 커플 연결 흐름

1. 사용자가 이메일(또는 매직링크)로 회원가입/로그인 → Supabase Auth 세션 발급
2. 최초 로그인 시 `profiles` 테이블에 프로필 row 생성 (트리거 또는 클라이언트 로직)
3. `couple_id`가 없는 사용자는 온보딩(커플 연결) 플로우로 리다이렉트
4. 초대 코드 생성 → 상대방이 코드 입력 → `couples` row 생성 및 양쪽 `profiles.couple_id` 업데이트
5. 이후 모든 도메인 데이터(추억, 디데이 등)는 `couple_id` 기준으로 조회/기록 (자세한 스키마는 `DATABASE.md` 참고)

## 5. 데이터 접근 보안 원칙

- 모든 도메인 테이블에 `couple_id` 컬럼을 두고, RLS 정책으로 "본인이 속한 couple_id의 row만 접근 가능"을 강제
- 클라이언트는 anon key만 사용하고, 민감한 작업(예: 커플 연결 해제, 계정 삭제)은 필요 시 Supabase Edge Function으로 분리 검토

## 6. PWA 전략

- `vite-plugin-pwa`로 manifest 및 서비스워커 생성
- 정적 자산은 사전 캐싱(`generateSW` 전략), 추억 사진 등 사용자 업로드 이미지는 런타임 캐싱 전략 별도 검토
- iOS PWA 제약(푸시 알림 미지원 등)을 고려해 알림 기능은 로드맵 후순위로 배치

## 7. 배포 구조

- 프론트엔드: Vercel (main 브랜치 자동 배포)
- 백엔드: Supabase 프로젝트 (개발/운영 환경 분리 여부 검토 — 초기에는 단일 프로젝트로 시작 가능)
- 환경변수: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Vercel 프로젝트 설정에 등록, 로컬은 `.env.local`

## 8. 미결 사항
- 지도 API 벤더 선정 (국내 서비스 고려 시 Kakao/Naver, 글로벌 고려 시 Mapbox)
- 이미지 최적화/리사이징 전략 (Supabase Storage transform 사용 여부)
- 개발/운영 Supabase 프로젝트 분리 여부
