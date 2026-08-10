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

## 4. 인증 & 온보딩 흐름

1. 사용자가 이메일(또는 매직링크)로 회원가입/로그인 → Supabase Auth 세션 발급
2. 최초 로그인 시 `profiles` 테이블에 프로필 row 생성 (트리거 또는 클라이언트 로직)
3. `RequireOnboarding`(`features/onboarding`)이 `/` 진입 시 남은 단계로 리다이렉트한다. 순서는 **앱 꾸미기 → 커플 연결**: `nickname`이 없으면 `/onboarding/customize`, 그 다음 `couple_id`가 없으면 `/onboarding/couple`
4. 초대 코드 생성 → 상대방이 코드 입력 → `couples` row 생성 및 양쪽 `profiles.couple_id` 업데이트
5. 연결이 감지되면 마지막 단계인 홈 화면 추가 페이지(`/add-to-home`, `api/pwa-install.ts`)로 이동하고, 거기서 앱(`/`)으로 복귀한다
6. 이후 모든 도메인 데이터(추억, 디데이 등)는 `couple_id` 기준으로 조회/기록 (자세한 스키마는 `DATABASE.md` 참고)

초대 링크(`/onboarding/couple?code=...`)로 바로 들어온 사용자는 코드 파라미터를 잃지 않도록 연결을 먼저 하고, 이름이 없으면 그 뒤에 꾸미기로 보낸다.

## 5. 데이터 접근 보안 원칙

- 모든 도메인 테이블에 `couple_id` 컬럼을 두고, RLS 정책으로 "본인이 속한 couple_id의 row만 접근 가능"을 강제
- 클라이언트는 anon key만 사용하고, 민감한 작업(예: 커플 연결 해제, 계정 삭제)은 필요 시 Supabase Edge Function으로 분리 검토

## 6. PWA 전략

- `vite-plugin-pwa`로 manifest 및 서비스워커 생성
- 정적 자산은 사전 캐싱(`generateSW` 전략), 추억 사진 등 사용자 업로드 이미지는 런타임 캐싱 전략 별도 검토

### 6.1 디데이 알림 (Web Push)

하루 한 번 "오늘 며칠째"를 보내고, 100일 단위·주년에는 다른 문구를 보낸다.

```
Vercel Cron (매일 UTC 00:00 = KST 09:00)
        │
        ▼
api/notify-dday.ts  ── service role ──►  Supabase
   (Node 런타임)                          push_subscriptions + profiles + anniversaries
        │
        │ web-push (VAPID 서명 + 페이로드 암호화)
        ▼
  푸시 서비스 (APNs / FCM ...)
        │
        ▼
  src/sw.ts의 push 리스너 → showNotification
```

- **런타임**: 이 함수만 edge가 아니라 Node다. `web-push`가 Node의 crypto를 쓴다. 시그니처는 Web 표준(`GET(request)`)이라 다른 `api/` 파일과 모양은 같다.
- **발송 시각**: KST 오전 9시 고정. Hobby 플랜의 cron 제약이 두 가지 걸린다 — (1) 하루 1회만 실행 가능하고(`0 * * * *` 같은 식은 배포 자체가 실패한다), (2) 실행 시각 정밀도가 ±59분이라 실제 발송은 09:00~09:59 사이다. 그래서 설정 화면도 "9시"가 아니라 "9시쯤"이라고 안내한다. 사용자별 시각/타임존을 지원하려면 구독마다 타임존을 저장하고 cron을 매시간 돌려야 하며, 둘 다 Pro 플랜이 필요하다.
- **한 번에 보내는 개수**: 하루 1회 제약은 *cron이 함수를 깨우는 횟수*지 한 실행이 보내는 알림 수가 아니다. 한 번 깨어난 함수가 구독 전부를 순회하며 각자에게 보내므로, 커플 두 사람이 각각 켜두면 같은 실행에서 둘 다 받는다.
- **중복 방지**: `push_subscriptions.last_notified_on`. cron 재시도나 수동 호출로 같은 날 두 번 울리지 않는다.
- **기준 기념일**: 여러 기념일 중 **기준일이 가장 이른 것** 하나 (`src/features/notification/baseAnniversary.ts`). 홈 위젯의 큰 숫자(`pickHighlight`)는 "가장 가까이 다가온" 기념일이라 기준이 다르다 — 위젯은 다음에 뭐가 오는지, 알림은 오늘이 며칠째인지를 말하는 자리다.
- **문구**: `src/features/notification/message.ts`. 브라우저(설정 화면의 미리보기)와 서버가 같은 함수를 쓴다. 그래서 이 파일은 DOM·Supabase에 손대지 않는 순수 함수만 두고, `api/`에서 상대 경로로 import한다 (Vercel은 `api/`의 tsconfig path mapping을 지원하지 않아 `@/` 별칭을 쓸 수 없다).
- **iOS 제약**: 홈 화면에 추가한 앱에서만 Web Push가 동작한다 (Safari 탭에는 `PushManager`가 없다). 설정 화면은 이 경우를 "지원 안 함"이 아니라 "홈 화면에 추가하면 켤 수 있어요"로 구분해 안내한다. 또 iOS는 알림을 띄우지 않는 push를 받으면 구독을 회수하므로, 서비스워커는 페이로드가 깨져도 기본 문구로 반드시 하나를 띄운다.
- **환경변수**: `VITE_VAPID_PUBLIC_KEY`(클라이언트) / `VAPID_PUBLIC_KEY`·`VAPID_PRIVATE_KEY`·`VAPID_SUBJECT`·`SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`·`CRON_SECRET`(서버). `.env.example` 참고. service role 키에는 절대 `VITE_` 접두사를 붙이지 않는다.

## 7. 배포 구조

- 프론트엔드: Vercel (main 브랜치 자동 배포)
- 백엔드: Supabase 프로젝트 (개발/운영 환경 분리 여부 검토 — 초기에는 단일 프로젝트로 시작 가능)
- 환경변수: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Vercel 프로젝트 설정에 등록, 로컬은 `.env.local`

## 8. 미결 사항
- 지도 API 벤더 선정 (국내 서비스 고려 시 Kakao/Naver, 글로벌 고려 시 Mapbox)
- 이미지 최적화/리사이징 전략 (Supabase Storage transform 사용 여부)
- 개발/운영 Supabase 프로젝트 분리 여부
