# 지역 뱃지 — 작업 인계 문서

> 스크래치 지도(`우리가 다녀온 곳`)와 사진 지도(`사진으로 채우는 지도`)에서
> **시도 하나를 다 채우면 그 지역 모양의 뱃지가 생기는** 기능. 설계는 끝났고
> 구현은 시작 전이다. 이 문서 하나만 읽고 이어서 작업할 수 있게 적었다.
>
> 작성 2026-08-12 · 관련: `PRD.md` §3.4, `src/features/travel/README.md`

## 1. 무엇을 만드는가

시도(16곳) 안의 시군구를 전부 채우면 뱃지 하나를 얻는다. 얻은 뱃지는 홈 위젯
"우리의 뱃지"에 진열된다. 16개를 다 모으면 한반도 전체 모양의 뱃지가 하나 더 나온다.

**금/은 메달을 쓰지 않기로 했다.** `UI_GUIDE.md` §2가 "별도 브랜드 컬러 없이
neutral 팔레트 그대로"인데, 금속색 두 개를 들이면 앱에서 제일 화려한 것이
트로피가 된다. 대신 **등급을 색이 아니라 "얼마나 채워졌나"로** 표현한다.

| 상태 | 뱃지 모습 | 조건 |
|---|---|---|
| `locked` | 옅은 외곽선만, 안은 비어 있음 | 아직 못 채움 |
| `visited` | 지역 도형이 단색으로 꽉 채워짐 | 그 시도의 시군구를 `travel_visits`에 전부 채움 |
| `photo` | 그 안이 지역별 사진 모자이크로 바뀜 | 거기에 `travel_region_photos`까지 전부 채움 |

사진을 걸었다는 건 다녀왔다는 뜻이므로 `photo`가 `visited`의 상위다. 비어 있다 →
채워진다 → 사진이 된다로 나아가고, **최종 상태가 금색 쪼가리가 아니라 우리 사진**이다.
UI_GUIDE §1의 "사진이 주인공"과 맞물린다.

## 2. 이미 정해진 것

### 뱃지 도형은 새로 그리지 않는다
`src/features/travel/regions.ts`의 `TRAVEL_REGIONS`에 시도 16개의 SVG `path`가
이미 있다. 그걸 자기 경계상자에 맞춘 viewBox로 다시 그리면 **에셋 0개로 서로 다른
뱃지 16개**가 나온다. 사진 모자이크 상태는 `districts.ts`의 시군구 path를 그 안에
깔면 되고, 이건 `RegionMap`의 `reveal={{ kind: 'mosaic' }}`가 이미 하는 일이다.

경계상자는 `pathBounds.ts`의 `pathBounds(d)`를 쓴다 (캐시까지 되어 있다).

### 크기는 시군구 수에 비례시키되 세 덩어리로 끊는다
그대로 비례시키면 세종(1곳)이 경기(31곳)의 1/31이 되어 안 보인다. 실제 분포가
자연스럽게 셋으로 갈라진다:

| 덩어리 | 시도 | 시군구 수 | 셀 크기(미리보기 기준) |
|---|---|---|---|
| 소 | 대전 1 · 세종 1 · 부산 2 · 울산 2 · 제주 2 · 대구 3 · 인천 3 | 1~3 | 60px |
| 중 | 충북 11 · 전북 14 · 충남 15 · 경남 18 · 강원 18 | 11~18 | 84px |
| 대 | 경북 22 · 전남 23 · 서울 25 · 경기 31 | 22~31 | 112px |

크기가 다르면 "이건 쉬운 거였지"가 한눈에 보여서, 난이도 불균형을 공정해 보이게
숨길 필요가 없어진다. **대전·세종은 하루 만에 따는 튜토리얼 뱃지로 둔다** — 이
시스템이 존재한다는 걸 알려주는 유일한 기회다.

### 진행 중인 지역은 지도 위젯 아래 한 줄로만
"강원 15/18 — 3곳 남았어요" 정도. 뱃지 전부는 별도 위젯에 모은다. 진열장에서
못 얻은 칸은 실루엣으로 남긴다 — 빈 칸이 보여야 모으고 싶어진다.

### 받는 순간에 투자한다
마지막 칸을 채우는 순간이 이 기능의 유일한 클라이맥스다.
- 다이얼로그를 닫지 말고, 그 시도가 한 번 빛난 뒤 뱃지로 접히며 찍힌다 (framer-motion은 이미 의존성에 있다)
- **상대에게 푸시** — "우리가 강원도를 다 채웠어요". 둘이 따로 앱을 보고 있어서 이게 없으면 한쪽만 아는 성취가 된다
- **획득 날짜를 남긴다.** 뱃지가 쌓이면 그게 두 사람의 여행 연대기가 된다

### 곁가지 뱃지 (지역 뱃지가 돌아간 뒤에)
- **섬 정복** — 울릉·독도·강화·옹진·제주 (이미 삽입도로 특별 취급 중)
- **하루에 세 곳** — 여행 다녀와서 한 번에 칠하는 실제 패턴과 맞는다
- **첫 한 칸** — 뱃지가 나오는 물건이라는 걸 알려주는 자리

## 3. 뱃지 형태 — **B안(원형)으로 결정** (2026-08-13)

미리보기를 실제로 띄워 보고 골랐다.

```
node scripts/preview-region-badges.mjs badge-preview.html
```

- **A안 — 지역 도형 그대로**: 개성은 제일 강하다. 하지만 진열장 목업에서 차이가 컸다 —
  도형 높이가 제각각이라 줄이 들쭉날쭉하고, 못 얻은 칸이 어디였는지 눈으로 세기 어렵다.
- **B안 — 원형 뱃지 안에 실루엣 (선택)**: 격자가 잡히고 작아도 뱃지로 읽힌다. 사진
  모자이크가 원에 클립되는 것도 이쪽이 예쁘다. 원이 여백을 먹어 도형 자체는 작아지지만,
  진열장이 이 기능의 주 무대라 그 대가가 싸다.
- 눌러서 크게 열 때 도형 그대로(A) 보여주는 절충은 **나중에 검토**한다. 상세 화면이
  생기기 전까지는 원형 하나로 간다.

### 띄워 보고 새로 알게 된 것 — 섬이 프레임을 먹는다 (해결됨)

문서에는 "작은 뱃지는 섬이 점으로 뭉개진다"고만 적혀 있었는데, 실제로는 더 나빴다.
**인천은 본토가 사라졌다.** 서해 5도 때문에 경계상자가 확 넓어져서 본토가 점 몇 개로
쪼그라든다. A안·B안 공통 문제라 형태 선택으로는 안 풀린다.

**뱃지 프레임을 전체 도형이 아니라 본토 기준으로 잡아 해결했다**
(`src/features/travel/mainlandBounds.ts`). 가장 큰 덩어리를 본토로 보고, 그 긴 변의
20% 안에 있는 이웃만 붙인다 — 코앞의 섬(강화도, 남해안)은 들어오고 먼 섬은 원 밖으로
잘린다.

실측 (전체 → 본토, 경계상자 면적비):

| 지역 | 전체 | 본토 | 면적비 |
|---|---|---|---|
| 인천 | 238×129 | 51×87 | **0.15** |
| 전남광주 | 275×190 | 218×190 | 0.79 |
| 경북 | 301×295 | 254×286 | 0.82 |
| 나머지 13곳 | — | 변화 없음 | 1.00 |

부산·대구는 영향을 받지 않는다 (덩어리가 하나뿐이다). 미리보기에서 작아 보였던 건
섬 때문이 아니라 크기 덩어리가 "소"(60px)여서다.

지도(`RegionMap`)는 이 계산을 쓰지 않는다 — 거기서는 섬도 눌러야 하는 실제 지역이라
화면 밖으로 밀어낼 수 없고, 그래서 삽입도가 따로 있다.

미리보기 스크립트와 `badge-preview.html`은 형태가 정해졌으므로 지워도 된다
(프로덕션 코드가 아니다).

## 4. 데이터 모델

### 판정을 DB 트리거로 하지 않는다 — 이게 이 설계의 핵심 판단이다

트리거로 하려면 **시도별 시군구 총개수(분모)를 DB가 알아야** 하는데, 그러려면
16행짜리 허용 목록을 DB에 박아야 한다. 이 프로젝트는 정확히 그 반대를 이미
결정했다 — `travel_visits.region_code`는 형식(`^[0-9]{5}$`)만 검사하고, 코드를
아는 쪽은 화면이다 (행정구역이 실제로 바뀌기 때문. 2026년 7월 광주·전남 통합).
분모만 DB로 옮기면 그 결정이 반쪽이 되고, 행정구역이 바뀔 때마다 마이그레이션이
하나 더 붙는다.

그래서 **판정은 화면이 하고, DB는 중복만 막는다.** 커플 둘만 쓰는 폐쇄 앱이라
자기 커플 뱃지를 위조해도 남에게 피해가 없다.

동시성은 `send_poke`와 같은 방식으로 푼다 — RPC 하나가 한 트랜잭션에서
`insert ... on conflict do nothing` 하고 **실제로 새로 생겼는지를 반환**한다.
둘이 동시에 마지막 칸을 채워도 뱃지는 하나만 생기고, 푸시는 insert가 성공한
쪽에서만 나간다.

### 테이블

```sql
-- supabase/migrations/2026-08-__-region-badges.sql (schema.sql에도 같이 반영)
create table if not exists public.travel_badges (
  couple_id uuid not null references public.couples (id) on delete cascade,
  -- 행정안전부 시도 코드 두 자리. travel_visits.region_code의 앞 두 자리와 같다.
  -- 시군구 코드와 같은 이유로 허용 목록을 박지 않고 형식만 본다.
  sido_code text not null check (sido_code ~ '^[0-9]{2}$'),
  -- 'visited' | 'photo'. 두 지도가 각각 하나씩 채운다.
  -- check로 박는 이유: 시도 코드와 달리 이건 우리가 정하는 값이고 늘어날 일이 드물다.
  tier text not null check (tier in ('visited', 'photo')),
  earned_at timestamptz not null default now(),
  earned_by uuid references public.profiles (id) on delete set null,

  primary key (couple_id, sido_code, tier)
);
```

**한 번 딴 뱃지는 회수하지 않는다.** 나중에 한 칸을 취소해도 지우지 않는다 —
지우면 `earned_at`이 "처음 완성한 날"이 아니라 "마지막으로 완성한 날"이 되고,
그러면 연대기로서의 가치가 사라진다. 이게 파생 계산으로 때우지 않고 테이블을
두는 이유이기도 하다 (방문 기록만 보면 "지금 완성 상태인지"는 알아도 "언제 처음
완성했는지"는 영원히 알 수 없다).

RLS는 다른 travel 테이블과 완전히 같은 모양으로 (`couple_id = public.current_couple_id()`),
select/insert만 두고 update·delete는 두지 않는다 (회수하지 않으므로).

### RPC

```sql
create or replace function public.claim_region_badge(p_sido_code text, p_tier text)
returns boolean  -- 새로 얻었으면 true. 이미 있었으면 false (푸시를 보내지 않는다)
```

`security definer` + `set search_path = public`. 커플 연결 여부와 `earned_by`는
`auth.uid()`에서 가져온다 — **보내는 사람을 인자로 받지 않는다** (`send_poke`와 같은 이유).

## 5. 화면·파일 구성

새 feature 폴더를 만들지 말고 `src/features/travel/` 안에 둔다 — 지도 데이터와
같은 청크에 있어야 뱃지 모자이크가 `districts.ts`를 중복으로 받지 않는다.

```
src/features/travel/
  badges.ts                     시도별 시군구 수 · 크기 덩어리 · 상태 계산 (순수 함수, 테스트 대상)
  api/badges.ts                 claim_region_badge RPC 호출, 뱃지 목록 조회
  hooks/useRegionBadges.ts      react-query
  components/RegionBadge.tsx    뱃지 하나 (locked | visited | photo)
  components/BadgeWidget.tsx    "우리의 뱃지" 위젯 본문
  components/BadgeEarnedOverlay.tsx  획득 순간 연출
```

위젯 등록은 세 군데를 같이 고친다:
1. `src/features/widgets/types.ts` — `WIDGET_IDS`에 `'badges'` 추가.
   **id는 한 번 정하면 바꾸지 않는다** (localStorage에 남아서, 이름이 바뀌면 기존 홈에서 조용히 사라진다)
2. `src/features/widgets/catalog.tsx` — 제목/설명/아이콘 (`lucide-react`의 `Award` 정도)
3. `src/features/couple/pages/HomePage.tsx` — `renderWidgetBody`에 `case 'badges'`.
   **`TravelWidget`과 같은 방식으로 `lazy`로 부른다** — 도형 데이터가 263KB라
   이 위젯을 안 올린 사람에게까지 첫 화면에서 받게 하면 안 된다 (UI_GUIDE §1 "가벼움")

푸시는 `api/poke.ts`의 발송 경로를 거의 그대로 쓴다 (`api/_push.ts`의
`sendPushToTargets`). 상대의 `push_subscriptions`를 읽어야 하므로 service role 키가
필요하고, 그 이유와 주의사항은 `api/poke.ts` 맨 위 주석에 다 적혀 있다 —
**`export default`로 바꾸지 말 것**, **상대 import의 `.js` 확장자를 지우지 말 것** 포함.

## 6. 작업 순서

1. **뱃지 형태 결정** — §3의 미리보기를 띄워 A/B/절충안 중 고른다
2. **`badges.ts`** — 시도별 진행 상태를 세는 순수 함수부터. `countKnownVisits`와
   같은 자리에서 같은 방식으로 "지금 지도가 아는 코드만" 센다
3. **`RegionBadge.tsx`** — 3상태를 정적으로 그린다. 여기까지는 DB 없이 확인 가능
4. **마이그레이션 + RPC** — `travel_badges`, `claim_region_badge`.
   `supabase/schema.sql`과 `supabase/migrations/`에 **같이** 반영한다
5. **"우리의 뱃지" 위젯** — 진열장. 위젯 등록 세 군데
6. **획득 연출 + 푸시** — 마지막에 붙인다. 없어도 기능은 돌아간다
7. **지도 위젯에 진행 한 줄** — "강원 15/18"

`docs/TODO.md`의 Phase 5c에 같은 순서로 체크리스트를 넣어 두었다.

## 7. 함정 모음

- **Astryx CLI는 Node 22가 필요하다** (시스템 Node는 20). `npx astryx component <Name>`
  앞에 fnm PATH 프리픽스를 붙인다
- **`<div>`를 쓰지 않는다.** 레이아웃은 Astryx 컴포넌트로만. 뱃지 격자는 쓸 만한
  컴포넌트가 있는지 `npx astryx search "grid"`로 먼저 확인한다
- **`districts.ts` / `regions.ts`는 생성물이라 손대지 않는다** (`scripts/gen-travel-regions.mjs`)
- **선행 조건**: `supabase/migrations/2026-08-12-travel-scratch.sql`과
  `2026-08-12-travel-region-photos.sql`이 Supabase에 적용되어 있어야 한다.
  `docs/TODO.md` Phase 5a에는 아직 미적용으로 적혀 있으니 **먼저 확인할 것** —
  안 되어 있으면 뱃지 이전에 지도 저장부터 안 된다
- **뱃지를 세 번째 지도로 만들지 말 것.** 진열장을 실제 한국 지도 배치로 놓고
  싶어지는데, 그러면 홈에 같은 지도가 세 개 뜬다. 격자가 맞다
