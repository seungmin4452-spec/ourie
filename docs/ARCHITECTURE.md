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
| 지도 | 없음 (SVG 직접 렌더) | 스크래치 지도는 벤더가 필요 없다 — §6.3 참고. 핀 지도를 만들 때 재검토 |
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
    travel/                  # 지도 위젯 둘 (§6.3) — regions/districts는 생성물, README.md 참고
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

`couple/`이 위 컨벤션을 따르는 첫 예시다. `memory`는 아직 `index.ts` 배럴만 있는 빈 껍데기이며, 기능 구현 시 동일한 패턴으로 채워 넣는다. `travel/`은 여기에 더해 생성물(`regions.ts`, `districts.ts`)과 그 배경을 적은 `README.md`를 갖는다 — feature가 커밋된 생성 데이터를 들고 있으면 재생성 방법을 그 옆에 둔다. 새 기능(디데이, 커스터마이징 등)이 필요해지면 `features/` 아래 같은 패턴으로 폴더를 추가하면 된다.

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

#### 홈 화면 아이콘이 커플의 사진·이름을 갖는 방법

아이콘은 **커플마다 다르다**. 정적 매니페스트 하나로는 안 되므로 경로가 셋이다.

- **설치할 때**: `/add-to-home`(`api/pwa-install.ts`)이 요청마다 커플의 값을 HTML 바이트에 박아 렌더한다. iOS Safari의 "홈 화면에 추가"는 서버가 준 원본 바이트만 읽고 JS의 DOM 조작은 무시하므로, 아이콘이 커플의 이름을 가지려면 **반드시 이 페이지에서** 추가해야 한다. 매니페스트도 `/api/manifest?title=&icon=`로 같이 넘겨 안드로이드 설치와 iOS 16.4+를 함께 덮는다.
- **앱을 열 때**: 서비스워커(`src/sw.ts`)의 `personalizeNavigation`이 내비게이션 응답 HTML에서 `apple-mobile-web-app-title` / `apple-touch-icon` / `<link rel="manifest">` 세 태그를 커플의 값으로 갈아 끼운다. 값의 출처는 IndexedDB 사본(`appMetaDb.ts`)이고, `index.html`의 인라인 스크립트가 같은 값을 localStorage에서 읽어 한 번 더 즉시 반영한다.
- **매니페스트 링크를 갈아 끼우는 이유**(안드로이드): Chrome은 설치된 앱의 이름·아이콘을 `start_url`(`/`)에서 매니페스트를 주기적으로 다시 읽어 갱신한다. 빌드된 `index.html`에 박혀 나가는 건 `vite-plugin-pwa`의 정적 `/manifest.webmanifest`(이름 "Ourie", 기본 아이콘)이고, 양쪽 `id`가 다 `/`라 Chrome은 같은 앱으로 본다. 그대로 두면 커플 사진으로 설치한 앱이 **다음 갱신 때 기본 아이콘으로 되돌아간다.**

**이미 놓인 아이콘은 iOS에서 저절로 바뀌지 않는다.** 추가하는 순간의 스냅샷이고 이후 다시 읽히지 않으므로, 꾸미기에서 사진을 바꿨다면 사람이 다시 추가해야 한다. 안내는 **새로 추가한 뒤 예전 아이콘을 지우는** 순서다 — 먼저 지우라고 하면 안내를 띄우고 있는 앱을 지우라는 말이 되고, iOS는 홈 화면 앱을 지울 때 그 앱만의 저장소 컨테이너(세션 포함)까지 함께 버린다. 새로 추가하면 두 아이콘의 사진이 서로 달라 어느 쪽이 예전 것인지 눈으로 갈린다. 안드로이드는 위의 매니페스트 갱신으로 알아서 따라온다. 그래서 설치된 앱 안(standalone)에서 꾸미기를 마치면 `/add-to-home`으로 보내지 않고 — standalone에는 공유 버튼이 없고, 그 페이지는 standalone을 "아이콘으로 실행한 것"으로 보고 앱으로 되돌려보낸다 — `CustomizeForm`이 다이얼로그로 안내하고, **설치 페이지를 브라우저에서 여는 버튼**을 함께 준다. iOS에서 그 버튼은 `x-safari-https:` 스킴으로 진짜 Safari를 띄운다(스코프 안이라 평범한 링크는 standalone 창에서 그대로 열려 공유 버튼이 없는 건 매한가지다). 애플이 문서화한 스킴이 아니라, 잠시 뒤에도 화면이 그대로 앞에 있으면 `window.open`으로 한 번 더 시도하는 폴백을 둔다.

### 6.1 디데이 알림 (Web Push)

하루 한 번 "오늘 며칠째"를 보내고, 100일 단위·주년에는 다른 문구를 보낸다.

```
Supabase pg_cron (매일 UTC 00:00 = KST 09:00)
        │ pg_net (GET + Bearer, 비밀값은 Vault)
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

- **런타임**: 이 함수는 edge가 아니라 Node다. `web-push`가 Node의 crypto를 쓴다. 시그니처는 Web 표준(`GET(request)`)이라 다른 `api/` 파일과 모양은 같다. 실제 발송(VAPID 설정, 전송, 죽은 구독 수거)은 §6.2의 콕 찌르기와 공유하는 `api/_push.ts`가 맡는다.
- **트리거**: Vercel Cron이 아니라 **Supabase의 pg_cron**이다 (`supabase/migrations/2026-08-12-notify-cron.sql`). Vercel의 cron은 *현재 프로덕션 배포에 묶여* 있어서, 발동 구간에 새 배포가 올라가면 cron이 새 배포 기준으로 다시 등록되고 아직 안 돈 그날 몫은 유실된다. 2026-08-12에 실제로 이걸로 알림이 안 갔다 — 09:13/09:49/09:52에 main을 푸시했고 그 배포들이 09:00~09:59 발동 구간을 덮어썼다. pg_cron은 DB 안에서 도니 배포와 무관하다.
- **발송 시각**: KST 오전 9시 정각. 스케줄(`0 0 * * *`)은 **UTC 기준**이라 KST 09:00 = 같은 날 UTC 00:00이다. 함수의 `todayKey()`가 절대 시각에 +9시간을 해서 읽으므로 언제 깨어나든 사용자가 맞이하는 오늘이 나온다. 시각을 바꿀 땐 마이그레이션의 `cron.schedule` 하나를 고쳐 **다시 실행하고**(잡 이름이 같으면 갈아끼운다) 설정 화면 문구만 맞추면 된다. `KST_OFFSET_MINUTES`는 시각이 아니라 "누구의 달력인가"라 무관하다.
- **호출 방식**: `pg_net`이 엔드포인트를 GET으로 친다(`GET`만 export한다). `CRON_SECRET`은 SQL에 박지 않고 **Supabase Vault**의 `cron_secret`에서 실행할 때마다 꺼내 쓴다 — 값을 바꿔도 잡을 다시 만들 필요가 없고, 마이그레이션 파일에 비밀값이 남지 않는다.
- **한 번에 보내는 개수**: cron이 함수를 깨우는 건 하루 한 번이지만, 그게 한 실행이 보내는 알림 수는 아니다. 한 번 깨어난 함수가 구독 전부를 순회하며 각자에게 보내므로, 커플 두 사람이 각각 켜두면 같은 실행에서 둘 다 받는다.
- **일시정지 주의**: pg_cron은 DB 안에서 돌기 때문에 Supabase Free 프로젝트가 일시정지되면(활동 없이 7일) 같이 멈춘다. 다만 Vercel Cron으로 돌려도 결과는 같다 — 그 함수가 하는 첫 일이 Supabase에서 `push_subscriptions`를 읽는 것이라 DB가 자면 어차피 못 보낸다. 대신 이 잡이 만드는 왕복(pg_net → Vercel → PostgREST 조회·갱신)이 매일 사용자 요청으로 잡히므로 그 자체가 일시정지를 늦춘다.
- **중복 방지**: `push_subscriptions.last_notified_on`. cron 재시도나 수동 호출로 같은 날 두 번 울리지 않는다.
- **기준 기념일**: 커플이 기념일 화면에서 **직접 고른 것**(`anniversaries.is_primary`) 하나 (`src/features/notification/baseAnniversary.ts`). 홈 위젯의 큰 숫자(`pickHighlight`)와 같은 날이라 앱 안에서 숫자가 하나로 읽힌다. 고른 적이 없으면 기준일이 가장 이른 것으로 떨어진다 — 예전엔 그게 유일한 규칙이었는데, 오래전에 넣어둔 날이 늘 이겨서 골라둔 기념일이 알림에 나오지 않았다.
- **문구**: `src/features/notification/message.ts`. 브라우저(설정 화면의 미리보기)와 서버가 같은 함수를 쓴다. 그래서 이 파일은 DOM·Supabase에 손대지 않는 순수 함수만 두고, `api/`에서 상대 경로로 import한다 (Vercel은 `api/`의 tsconfig path mapping을 지원하지 않아 `@/` 별칭을 쓸 수 없다).
- **iOS 제약**: 홈 화면에 추가한 앱에서만 Web Push가 동작한다 (Safari 탭에는 `PushManager`가 없다). 설정 화면은 이 경우를 "지원 안 함"이 아니라 "홈 화면에 추가하면 켤 수 있어요"로 구분해 안내한다. 또 iOS는 알림을 띄우지 않는 push를 받으면 구독을 회수하므로, 서비스워커는 페이로드가 깨져도 기본 문구로 반드시 하나를 띄운다.
- **환경변수**: `VITE_VAPID_PUBLIC_KEY`(클라이언트) / `VAPID_PUBLIC_KEY`·`VAPID_PRIVATE_KEY`·`VAPID_SUBJECT`·`SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`·`CRON_SECRET`(서버). `.env.example` 참고. service role 키에는 절대 `VITE_` 접두사를 붙이지 않는다.

### 6.2 콕 찌르기 (사용자가 보내는 알림)

홈 위젯의 버튼("보고싶어" / "카톡 확인해줘" / "전화해줘" / "뭐해?")을 누르면 커플 상대방의 기기가 울린다. 커플이 아이콘·제목·알림 내용을 적어 버튼을 더 만들 수도 있다 (`poke_presets`).

```
홈 위젯 버튼 클릭
        │  fetch POST /api/poke  (Authorization: 사용자 access token)
        ▼
api/poke.ts (Node 런타임)
        │  ① auth.getUser(token) — 보낸 사람이 누구인지 확정
        │  ② rpc('send_poke')    — 커플 확인 · 수신 동의 확인 · 쿨다운 · 기록 (한 트랜잭션)
        │  ③ service role로 상대방의 push_subscriptions 조회
        ▼
api/_push.ts → 푸시 서비스 → src/sw.ts의 push 리스너
```

§6.1과 다른 점만 정리하면:

- **트리거**: cron이 아니라 사용자 요청이다. 그래서 Hobby 플랜의 "하루 1회" cron 제약과 무관하다.
- **인증**: `CRON_SECRET`이 아니라 로그인 세션의 access token이다. **보내는 사람을 request body로 받지 않는다** — 받으면 아무나 남의 이름으로 알림을 쏠 수 있다.
- **service role이 필요한 이유**: `push_subscriptions`의 RLS가 `user_id = auth.uid()`라 사용자 세션으로는 상대방 구독이 보이지 않는다. 그 정책 자체는 유지한다(상대가 내 기기 알림을 켜고 끄면 안 된다). 대신 발송만 서버가 대신한다.
- **수신 동의**: `profiles.poke_opt_in`(기본 `false`). 이 기능만은 내가 아니라 상대방이 내 기기를 울리므로, 켠 적 없는 사람에게는 가지 않는다. 매일 디데이 알림과 별개의 스위치다. 위젯이 상대방의 이 값을 미리 읽어 버튼을 잠그지만(`profiles_select_self_or_partner`가 커플 상대방 읽기를 허용한다), 실제 차단은 서버가 한다.
- **연타 방지**: 같은 버튼은 1초에 한 번 (하루 총량 제한은 없다). 검사와 기록이 `send_poke` 한 트랜잭션 안에 있고, `pg_advisory_xact_lock`으로 동시에 들어온 두 요청을 직렬화한다 — 여러 조회로 나누면 버튼 연타가 정확히 그 검사를 빠져나간다.
- **권한**: `send_poke`는 `security definer`이고 `p_sender`를 인자로 받으므로, `authenticated`/`anon`의 실행 권한을 revoke해 클라이언트가 직접 부를 수 없게 한다.
- **커플이 만든 버튼**: 클라이언트가 넘기는 건 `presetId` 하나뿐이고, 아이콘·제목·알림 내용은 서버가 `send_poke` 안에서 `poke_presets`를 읽어 가져온다. **문구를 요청 본문으로 받지 않는 것이 핵심이다** — 받으면 누구든 아무 말이나 상대방 잠금화면에 띄울 수 있다. 같은 이유로 그 버튼이 보내는 사람의 커플 것인지도 함수 안에서 확인한다.
- **알림 tag**: 버튼별로 다르다 — 기본 버튼은 `ourie-poke-{kind}`, 커플이 만든 것은 `ourie-poke-custom-{presetId}`. 디데이(`ourie-dday`)를 덮지 않고, 같은 말을 여러 번 보내면 알림함에 쌓이는 대신 마지막 하나로 덮인다. 서로 다른 버튼끼리는 덮지 않는다. 이때도 소리가 나도록 `renotify`를 실어 보낸다.
- **TTL**: 1시간 (디데이는 12시간). "보고싶어"는 지금 도착해야 의미가 있고, 몇 시간 뒤에 뜨면 상대는 무슨 상황인지 알 수 없다.
- **문구**: `src/features/poke/message.ts`. §6.1의 `message.ts`와 같은 이유로 순수 모듈이고, import를 하나도 하지 않아 서버 쪽 `.js` 확장자 규칙을 애초에 만들지 않는다.
- **보낸 사람 이름**: 기본 버튼의 문구에만 들어간다("승민님이 보고 싶대요"). 쓰는 값은 `profiles.name`이다 — `profiles.app_name`은 **앱 이름**이라 쓰면 "승민 ♥ 진선님이 보고 싶대요"가 된다 (실제로 그렇게 나갔던 버그다 — `DATABASE.md` §2.1 참고). 이름이 비어 있는 계정은 "상대방이 보고 싶대요"로 떨어진다. 커플이 만든 버튼은 적어둔 제목이 그대로 알림 제목이 되고 이름을 앞에 붙이지 않는다 — 이 앱에서 알림을 보낼 수 있는 사람은 한 명뿐이라 이름이 제목 자리만 차지했다.

### 6.3 지도 위젯 (지도 벤더 없이)

홈 위젯 "우리가 다녀온 곳"(스크래치)과 "사진으로 채우는 지도"는 Kakao/Naver/Mapbox 같은
지도 API를 **쓰지 않는다.**

```
행정동 경계 GeoJSON (34MB, 통계청 SGIS)
        │  scripts/gen-travel-regions.mjs — 빌드 전에 사람이 한 번 돌린다
        │  (행정동 3,558개 → 시도 16 + 시군구 191로 합치고, 투영·단순화)
        ▼
src/features/travel/{regions,districts}.ts  (292KB, 저장소에 커밋)
        │
        ▼
  <svg> 한 장 — 사진을 clipPath로 오려 깔고 그 위에 시군구 코팅
```

- **두 위젯이 같은 지도를 쓴다** (`components/RegionMap.tsx`). 층 구성(사진 → 코팅 →
  경계선 → 탭 목표)과 조작(시도를 눌러 들어가 시군구를 고른다)이 같고, 다른 것은 코팅
  **아래에 무엇이 있는가** 하나뿐이라 그 자리만 `reveal` prop으로 갈랐다:
  사진 한 장을 깔고 긁힌 구역만 드러내거나(`photo`), 구역마다 사진을 한 장씩 앉히거나
  (`mosaic`). 사진 자리는 path에서 바로 잰다 (`pathBounds.ts` — 도형이 M·L·Z뿐이라
  숫자를 짝으로 읽으면 경계 상자가 나온다).

- **왜 벤더가 필요 없나**: 이 지도가 하는 일은 "행정구역을 색칠하기"뿐이다. 타일도, 좌표
  변환도, 지오코딩도 필요 없다. 벤더를 쓰면 API 키·요금·오프라인 동작이 전부 걸리는데,
  PWA에서 그걸 떠안을 이유가 없다. 나중에 **핀 지도**(`docs/PRD.md` §3.4.2)를 만들 때는
  실제 좌표 위에 마커를 얹어야 하므로 그때 다시 고른다.
- **경계 데이터는 두 단계가 어긋나면 지도에 구멍이 뚫린다.** 시도는 따로 합치지 않고 살아남은 시군구를 다시 합쳐 만들고, 다른 구역과 맞닿은 조각은 크기와 무관하게 남긴다. 실제로 이 규칙이 없어서 대구 한가운데가 뚫렸던 적이 있다 (자세한 사정은 feature README).
- **데이터는 생성물**이고 원본은 커밋하지 않는다. 출처·라이선스(SGIS 공공누리 1유형 +
  CC BY 4.0)와 재생성 방법은 `src/features/travel/README.md`에 있다.
- **행정구역은 바뀐다.** 2026년 7월 광주·전남이 합쳐져 시도가 17→16이 됐고, 2023년에는
  군위군이 경북에서 대구로 넘어갔다. 그래서 `travel_visits.region_code`에는 코드 허용
  목록을 걸지 않고 형식만 본다 — 목록을 걸면 구역이 바뀔 때마다 마이그레이션이 필요하고,
  무엇보다 이미 저장된 옛 코드가 제약에 걸려 사라진다. 대신 화면이 모르는 코드를 그리지도
  세지도 않는다.
- **사진은 비공개 버킷**(`travel-maps`) + 서명 URL이다. 아바타(`profile-avatars`, 공개)와
  다른 이유는 이쪽이 커플 사진 원본이기 때문이다. 두 위젯이 이 버킷을 경로로 나눠 쓰고,
  지역별 사진은 장수가 많아 서명 수명이 더 길다 (`DATABASE.md` §3).
- **도형 데이터는 지연 로딩**이다. 두 위젯 모두 `@/features/travel` 배럴을 동적으로
  가져오므로 청크가 하나로 합쳐진다 — 둘 다 홈에 올려도 263KB를 두 번 받지 않는다.

## 7. 배포 구조

- 프론트엔드: Vercel (main 브랜치 자동 배포)
- 백엔드: Supabase 프로젝트 (개발/운영 환경 분리 여부 검토 — 초기에는 단일 프로젝트로 시작 가능)
- 환경변수: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Vercel 프로젝트 설정에 등록, 로컬은 `.env.local`

## 8. 미결 사항
- 핀 지도(`docs/PRD.md` §3.4.2)용 지도 API 벤더 선정 (국내 Kakao/Naver, 글로벌 Mapbox). 스크래치 지도는 §6.3대로 벤더 없이 끝났다
- 이미지 최적화/리사이징 전략 (Supabase Storage transform 사용 여부)
- 개발/운영 Supabase 프로젝트 분리 여부
