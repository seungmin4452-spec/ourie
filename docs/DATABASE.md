# DATABASE — Ourie (Supabase / Postgres)

> 아래 스키마는 초기 설계 초안이며, 실제 마이그레이션 작성 시 세부 조정이 필요할 수 있다.

## 1. ERD 개요 (텍스트)

```
auth.users (Supabase 제공)
    │ 1:1
    ▼
profiles ──────┐
    │ N:1       │
    ▼           │
couples ◄───────┘ (couple_id로 연결)
    │ 1:N
    ├──► anniversaries   (디데이)
    ├──► memories        (추억)
    │        │ 1:N
    │        ▼
    │    memory_photos   (추억 사진)
    ├──► travel_visits    (스크래치 지도 — 다녀온 시군구, PK가 couple_id+region_code)
    ├──► travel_maps      (스크래치 지도 배경 사진, 1:1)
    ├──► travel_region_photos (사진 지도 — 시군구마다 사진 한 장, PK가 couple_id+region_code)
    ├──► travel_badges    (지역 뱃지 — PK가 couple_id+sido_code+tier)
    ├──► wish_quotas      (소원권 — 사람마다 총 장수, PK가 couple_id+owner_id)
    ├──► wishes           (소원권 — 쓴 한 장이 한 row)
    ├──► wish_quota_requests (소원권 장수 추가 요청 — 상대 승인이 있어야 늘어난다)
    ├──► memories.location ─► 핀 지도에서 활용 (별도 테이블 없이 memories 재사용)
    └──► couple_settings  (커스터마이징)
```

## 2. 테이블 정의

### 2.1 `profiles`
사용자 프로필. `auth.users`와 1:1 매핑.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK, FK → auth.users.id) | |
| couple_id | uuid (FK → couples.id, nullable) | 연결 전에는 null |
| name | text (nullable) | **사람 이름** — 상대방에게 보이는 이름 |
| app_name | text | **앱 이름** — 사람 이름이 아니다 (아래 참고) |
| avatar_url | text (nullable) | Storage 경로 또는 URL |
| avatar_source | text (nullable) | `social` / `upload` (check 제약) — 위 사진의 출처 |
| poke_opt_in | boolean | default false — 콕 찌르기 수신 동의 (§2.3.2) |
| created_at | timestamptz | default now() |

**이름이 두 개다.** 원래는 `nickname`(앱 이름) 하나뿐이었는데, 이름만 봐서는 사람 이름인지 알 수 없어 콕 찌르기 알림이 "승민 ♥ 진선님이 보고 싶대요"로 나간 적이 있다. 그래서 컬럼 이름만으로 구분되게 `name` / `app_name`으로 갈랐다 (`nickname` → `app_name` rename + `name` 신규).

- `name` = **사람 이름**. 상대방에게 내가 누구인지 보여줄 때 쓴다. 회원가입 폼에서 받는다.
- `app_name` = **앱 이름**. 커플이 정하는 우리 앱의 이름("승민 ♥ 진선")이고, 홈 화면 아이콘 라벨(`src/app/AppMetaSync.tsx`)과 홈 상단의 큰 제목이 된다. 커플 공용이 아니라 `profiles`에 있는 이유는 각자 자기 앱을 따로 꾸미기 때문이다. 온보딩 "꾸미기"에서 받는다.

`name`을 회원가입에서 받으면서도 `profiles`에 직접 쓰지 않는 이유: 이메일 확인이 켜져 있으면 `signUp` 직후에 세션이 없고, 세션이 없으면 RLS 때문에 `profiles`에 쓸 수 없다. 그래서 클라이언트는 `supabase.auth.signUp`의 `options.data`로 넘기고, `handle_new_user` 트리거가 `raw_user_meta_data ->> 'name'`을 읽어 프로필 row를 만든다. 키 이름이 양쪽에서 같아야 하며, 바꾸면 이름이 조용히 사라진다.

`name`이 nullable인 이유는 이 컬럼이 생기기 전에 가입한 계정이 있어서다. 비어 있으면 화면과 알림 모두 이름 없는 문구로 떨어진다(`pokeNameLabel`). 그 계정들은 회원가입을 다시 할 수 없으므로 온보딩 "꾸미기" 화면에서도 이 값을 채울 수 있게 해두었다.

**소셜 프로필 사진과 `avatar_source`.** 카카오가 주는 사진 주소는 `http`다(`http://k.kakaocdn.net/...`). https로 서비스되는 앱에서는 브라우저가 혼합 콘텐츠로 막는데, 깨진 이미지가 뜨는 것도 아니고 조용히 사라져서 "받고 있는데 안 보이는" 상태가 된다 — 홈 화면 아이콘·꾸미기 미리보기·마이페이지가 전부 이 값을 보므로 셋이 함께 비어 있었다. 그래서 `handle_new_user`가 스킴을 https로 올려 저장한다 (제공자를 가리지 않는다 — 어느 제공자 것이든 똑같이 막힌다).

`avatar_source`는 그 사진이 **어디서 왔는지**를 적어둔다. 이게 있어야 소셜 사진을 로그인할 때마다 최신으로 따라가면서도(`src/app/SocialAvatarSync.tsx`) 직접 올린 사진은 절대 건드리지 않을 수 있다. 제공자는 사진이 바뀌면 새 주소를 발급하므로, 저장해 둔 주소는 그냥 두면 옛 사진을 가리킨 채 남고 옛 주소의 수명도 제공자 마음이다.

출처를 주소로 추측하지 않는(Storage 도메인이면 직접 올린 것) 이유는 버킷 이름이나 도메인이 바뀌는 날 그 추측이 조용히 뒤집히기 때문이다. 그때 벌어지는 일이 "직접 올린 사진이 지워지는 것"이라, 틀렸을 때의 대가가 너무 크다. `null`은 "사진이 없거나 출처를 모름"이고 그때도 자동 갱신하지 않는다. **`avatar_url`을 쓰는 코드는 `avatar_source`도 반드시 함께 쓴다** (`updateProfile`의 타입이 그걸 유도한다).

컬럼 rename 시 주의: Postgres는 함수 본문을 텍스트로 저장하므로 `send_poke`처럼 그 컬럼을 참조하는 함수는 rename을 따라오지 않는다. 같은 트랜잭션에서 `create or replace`로 다시 만들어야 한다 (`supabase/migrations/2026-08-11-names.sql` 참고).

### 2.2 `couples`
커플 단위 엔티티. 모든 도메인 데이터의 격리 기준.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | default gen_random_uuid() |
| user_a | uuid (FK → profiles.id) | |
| user_b | uuid (FK → profiles.id, nullable) | 연결 전 초대 코드 생성 단계에서는 null 가능 |
| invite_code | text (unique, nullable) | 연결 완료 후 만료 처리 |
| connected_at | timestamptz (nullable) | 상대방 연결 완료 시점 |
| created_at | timestamptz | default now() |

초대 코드 생성은 클라이언트에서 직접 insert (`couples_insert_creator` RLS로 허용). 코드 입력을 통한 연결은 `public.join_couple(p_invite_code)` RPC(security definer)로 처리한다 — 상대방은 아직 `couples`/`profiles` row의 소유자가 아니어서 일반 RLS로는 코드를 조회할 수 없기 때문에, 코드 조회·`user_b`/`connected_at` 갱신·양쪽 `profiles.couple_id` 갱신을 하나의 트랜잭션으로 원자적으로 수행한다. 이미 연결된 사용자, 자기 자신의 코드, 존재하지 않거나 이미 사용된 코드, 생성 후 1시간이 지난 코드는 각각 `already_connected` / `own_code` / `invalid_code` / `expired_code` 예외로 구분한다.

초대 코드는 생성 후 1시간만 유효하다 (`join_couple`이 `created_at`을 검사). 클라이언트는 같은 1시간 창을 기준으로 아직 유효한 pending invite가 있으면 재사용하고, 만료되면 새 코드를 발급한다 (`src/features/couple/api/couple.ts`의 `INVITE_CODE_TTL_MS`). 만료된 초대의 `couples` row는 별도로 정리하지 않고 그대로 남는다 (미결 사항 참고).

### 2.3 `anniversaries` (디데이)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| couple_id | uuid (FK → couples.id) | |
| title | text | 예: "처음 만난 날", "결혼기념일" |
| date | date | 기준 날짜 |
| repeat_yearly | boolean | default true |
| created_by | uuid (FK → profiles.id) | |
| created_at | timestamptz | default now() |

`date`는 다음 기념일이 아니라 **기준일**이다. `repeat_yearly`인 행은 매년 같은 월/일에 돌아오고, 다가오는 기념일·주년·함께한 날 수는 클라이언트가 이 기준일에서 계산한다 (`src/features/anniversary/dday.ts`). 평년의 2월 29일은 3월 1일로 넘긴다.

`timestamptz`가 아니라 `date`인 이유: 기념일은 달력상의 하루라서, 보는 사람의 타임존만큼 밀리면 여행 중인 쪽에게 엉뚱한 날이 보인다. 클라이언트도 같은 이유로 `new Date('YYYY-MM-DD')`(UTC 파싱) 대신 로컬 자정으로 직접 파싱한다.

### 2.3.1 `push_subscriptions` (디데이 알림)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK → profiles.id) | 커플이 아니라 **사람** 단위 |
| endpoint | text (unique) | 브라우저가 발급한 푸시 서비스 주소 |
| p256dh | text | 페이로드 암호화용 공개 키 |
| auth | text | 페이로드 암호화용 인증 비밀 |
| last_notified_on | date (nullable) | 마지막으로 발송한 날 (KST 기준) |
| created_at | timestamptz | default now() |

알림은 커플 공유 설정이 아니라 개인 설정이다 (PRD §3.5의 "개인 단위 설정"). 그래서 RLS도 `couple_id`가 아니라 `user_id = auth.uid()`로 좁힌다 — 상대방이 내 기기 알림을 끄거나 켤 수 없어야 한다.

한 사람이 여러 기기에서 켜면 row가 여러 개다 (기기가 아니라 "설치된 앱" 단위로 endpoint가 발급된다). `user_id`가 `auth.users`가 아닌 `profiles`를 가리키는 이유는 발송 함수가 구독에서 곧바로 `couple_id`를 따라가야 하는데, PostgREST의 embed가 실제 외래 키를 요구하기 때문이다.

`last_notified_on`이 "1일 1알림"을 지키는 자물쇠다. cron이 재시도되거나 엔드포인트를 손으로 한 번 더 불러도, 이 값이 이미 오늘이면 건너뛴다. 발송은 `api/notify-dday.ts`가 하며 service role 키로 RLS를 우회한다 (모두를 대신해 도는 작업이라 특정 사용자의 세션이 없다).

그 엔드포인트를 매일 KST 오전 9시에 깨우는 것도 이 DB다 — `pg_cron` 잡 `notify-dday`가 `pg_net`으로 호출한다 (`supabase/migrations/2026-08-12-notify-cron.sql`). 스케줄이 애플리케이션이 아니라 DB에 사는 이유는 `ARCHITECTURE.md` §6.1 참고.

### 2.3.2 `poke_presets` (커플이 만든 콕 찌르기 버튼)

기본으로 주는 세 개 말고 커플이 직접 만든 버튼. 한 row가 위젯의 버튼 하나다.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| couple_id | uuid (FK → couples.id) | |
| created_by | uuid (FK → profiles.id) | |
| icon | text | 아이콘 이름 (1–40자) |
| label | text | 버튼에 적히는 말 = 알림 제목 (1–20자) |
| body | text | 알림 본문 (1–80자) |
| created_at | timestamptz | default now() |

**왜 기기(localStorage)가 아니라 DB인가.** 알림 문구를 서버가 알아야 한다. 발송은 보내는 사람의 기기가 아니라 `api/poke.ts`에서 나가고, 무엇보다 클라이언트가 보낸 문구를 그대로 믿으면 누구든 아무 말이나 상대방 잠금화면에 띄울 수 있다. 그래서 `send_poke`가 이 테이블에서 읽은 값만 쓰고, 클라이언트는 버튼의 `id`만 넘긴다. 커플 단위인 것도 같은 맥락이다 — 둘이 같은 버튼을 본다.

`icon`에 허용 목록 check를 걸지 않았다. 걸면 아이콘을 하나 더할 때마다 마이그레이션을 돌려야 한다. 대신 화면이 모르는 이름을 만나면 기본 아이콘으로 떨어진다 (`src/features/poke/icons.tsx`). 반대로 `label`/`body`의 길이 제약은 DB에 있다 — 잠금화면에서 잘리지 않을 길이가 이 기능의 정의에 가깝기 때문이고, `POKE_PRESET_LIMITS`(`message.ts`)와 같은 값이어야 한다.

RLS는 커플 범위 전체 열기(select/insert/update/delete)다. 상대가 만든 버튼도 고치고 지울 수 있다 — "내가 만든 것만"으로 좁히면 상대가 없을 때 정리할 방법이 없어진다. update 정책에 `with check`를 따로 두지 않았는데, 그때는 `using` 식이 새 row에도 적용되므로 다른 커플로 옮기는 update는 막힌다.

문구를 고쳐도 이미 보낸 기록(`pokes`)은 `preset_id`만 들고 있어서 지난 기록도 새 문구로 보이게 된다. 지금은 기록을 보여주는 화면이 없어 그대로 두지만, 기록을 띄우게 되면 발송 시점 문구를 `pokes`에 함께 적어야 한다.

한 커플이 만들 수 있는 개수(12개)는 DB가 아니라 화면에서만 막는다. 위젯에 버튼이 끝없이 쌓이는 걸 막는 게 목적이고, 넘겨도 데이터가 깨지지는 않는다.

### 2.3.3 `pokes` (콕 찌르기)

한쪽이 버튼을 눌러 상대방 기기를 울린 기록.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| couple_id | uuid (FK → couples.id) | |
| sender_id | uuid (FK → profiles.id) | 버튼을 누른 사람 |
| recipient_id | uuid (FK → profiles.id) | 알림을 받은 사람 |
| kind | text | `miss` / `kakao` / `call` / `doing` / `custom` (check 제약) |
| preset_id | uuid (FK → poke_presets.id, nullable) | `custom`일 때만. on delete cascade |
| created_at | timestamptz | default now() |

`kind`에서 `custom`을 뺀 나머지는 `src/features/poke/message.ts`의 `POKE_KINDS`와 같아야 한다. 한쪽만 늘리면 발송이 `invalid_kind`로 막힌다. 커플이 만든 버튼은 종류를 늘리지 않고 `custom` 하나로 기록되며, 어떤 버튼이었는지는 `preset_id`에 남는다.

`pokes_preset_matches_kind` check가 이 둘의 짝을 강제한다 — `custom`이면 `preset_id`가 반드시 있고, 기본 버튼은 가질 수 없다. 짝이 어긋난 row는 알림 문구를 만들 수 없는 row다. 버튼을 지우면 그 버튼으로 보낸 기록도 함께 사라진다(cascade) — 문구를 잃은 기록은 나중에 보여줄 수도 없다.

**수신 동의가 전제다.** 이 기능만은 내가 아니라 상대방이 내 기기를 울리므로, `profiles.poke_opt_in`(기본 `false`)을 켠 사람에게만 간다. 매일 디데이 알림과 별개의 스위치인 이유이기도 하다 — 디데이는 받고 콕 찌르기는 안 받고 싶을 수 있다. 수정은 본인만(`profiles_update_self`), 읽기는 커플 상대방도 가능하다(`profiles_select_self_or_partner`) — 그래서 보내는 쪽 화면이 눌러보기 전에 "상대가 아직 안 켰어요"를 보여줄 수 있다.

**쓰기 정책이 없다.** insert는 `public.send_poke(p_sender, p_kind, p_preset)`(security definer)와 service role만 한다. 클라이언트가 직접 넣을 수 있으면 쿨다운도 수신 동의도 우회된다. 그 함수는 `authenticated`/`anon`의 실행 권한을 revoke해 두었고(남의 id를 넣어 사칭하는 것을 막는다), 실제 신원 확인은 `api/poke.ts`가 access token을 검증해 한다. `p_preset`이 오면 그 버튼이 **보내는 사람의 커플 것인지** 함수 안에서 확인하고, 알림 문구도 그때 읽은 값만 돌려준다.

**연타 방지**는 같은 버튼 1초 1회다 (하루 총량 제한은 없다). 직전 발송 조회와 insert가 `send_poke` 한 트랜잭션 안에 있고, `pg_advisory_xact_lock(sender, 버튼)`으로 동시에 들어온 두 요청을 직렬화한다 — 여러 조회로 나누면 버튼 연타가 정확히 그 검사를 빠져나간다. 여기서 "버튼"은 기본 버튼이면 `kind`, 커플이 만든 것이면 `preset_id`다. 서로 다른 버튼끼리는 쿨다운을 공유하지 않는다.

기록을 남기는 건 쿨다운 때문만은 아니다. 나중에 "오늘 세 번 보고 싶다고 했어요" 같은 화면을 붙일 수 있게 하려는 것이라, 발송 성공 여부가 아니라 "보내기로 했다"는 사실을 적는다.

### 2.3.4 `wish_quotas` / `wishes` (소원권)

각자 몇 장을 들고 있고(`wish_quotas`), 그중 몇 장을 무엇에 썼는지(`wishes`). 홈 위젯 "소원권"이 이 둘을 나란히 보여준다. 소원권을 **가진** 사람이 한 장을 써서 상대에게 소원을 말하므로, 두 테이블의 `owner_id`는 모두 "소원권의 주인 = 쓴 사람"이지 들어주는 사람이 아니다.

`wish_quotas`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| couple_id | uuid (FK → couples.id) | PK 1 |
| owner_id | uuid (FK → profiles.id) | PK 2 — 소원권을 가진 사람 |
| total | int | default `wish_default_total()` (5), 0–99 (check 제약) |
| updated_by | uuid (FK → profiles.id, nullable) | 마지막으로 장수를 정한 사람 |
| updated_at | timestamptz | default now() |

`wishes`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| couple_id | uuid (FK → couples.id) | |
| owner_id | uuid (FK → profiles.id) | 소원권을 쓴 사람 |
| content | text | 부탁한 내용 (1–100자) |
| created_at | timestamptz | default now() |

**남은 장수를 컬럼으로 들고 있지 않는 것이 이 설계의 전부다.** 남은 장수 = `total` − 그 사람의 `wishes` 수. 세어서 구하므로 어긋날 일이 없다 — 카운터 컬럼을 두면 소원을 지우거나 장수를 고칠 때마다 같이 맞춰야 하고, 한 번 어긋나면 사용자는 그게 왜 3장인지 알 방법이 없다. 소원을 하나 지우면 그 한 장이 자동으로 돌아오는 것도 같은 이유다.

기본 장수는 `public.wish_default_total()` 하나에만 적혀 있다. 컬럼 기본값·잔량 검사·화면이 모두 이 숫자를 읽는데, 화면 쪽 짝인 `WISH_DEFAULT_TOTAL`(`src/features/wish/types.ts`)과 **반드시 같아야 한다**. 어긋나면 위젯이 보여주는 남은 장수와 실제로 쓸 수 있는 장수가 달라진다. 장수를 정한 적 없는 사람은 `wish_quotas`에 row가 아예 없고, DB와 화면 양쪽이 이 기본값으로 떨어진다.

불변식 둘은 트리거가 지킨다. 화면도 같은 조건을 미리 막지만 그건 안내다 — 두 기기에서 동시에 쓰면 화면의 잠금은 둘 다 통과한다.

- `check_wish_quota` (`before insert on wishes`) — 남은 장수를 넘겨 쓸 수 없다. `pg_advisory_xact_lock(owner_id)`로 동시 삽입을 직렬화한다 (`send_poke`의 연타 방지와 같은 장치). 실패하면 `no_wish_left`.
- `check_wish_total` (`before insert or update on wish_quotas`) — 이미 쓴 장수 아래로 총 장수를 내릴 수 없다. 실패하면 `wish_total_below_used`.

둘 다 `security definer`다. 세는 일이 RLS에 가려지면 쓴 장수가 실제보다 적게 보여서 검사가 오히려 더 쓰게 허락해버린다.

**RLS는 두 테이블이 다르다.** `wish_quotas`는 커플 범위 전체(select/insert/update) — 장수는 둘이 같이 정하는 약속이라, 각자 자기 것만 정할 수 있으면 그건 약속이 아니라 자기 신고가 된다. delete 정책이 없는 것은 의도다: 없애고 싶으면 0장으로 두면 되고, row를 지우면 다음에 읽을 때 조용히 기본값으로 되살아난다. 반면 `wishes`는 읽기만 커플 범위이고 insert/update/delete는 `owner_id = auth.uid()`로 좁다 — 지도나 콕 찌르기 버튼과 달리 소원권은 **내 것을 내가 쓰는** 것이라, 상대가 내 이름으로 한 장을 쓰거나 내가 말한 소원을 바꿔 적을 수 있으면 안 된다.

"들어줬는지"를 기록하는 컬럼은 아직 없다. 지금 이 기능이 답하는 것은 "몇 장 남았나"와 "무엇을 부탁했나" 둘뿐이고, 쓴 소원은 지우기 전까지 계속 쓴 것으로 남는다.

### 2.3.4.1 `wish_quota_requests` (소원권 장수 추가 요청)

`wish_quotas.total`을 줄이는 건 즉시 반영이지만, **늘리는 건 상대의 승인을 거친다.** "내
소원권 추가"/"상대방 소원권 추가" 버튼을 누르면 이 테이블에 요청 한 row가 생기고 상대방에게
알림이 간다 (`api/wish-quota-request.ts`). 한 row가 요청 하나다.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| couple_id | uuid (FK → couples.id) | |
| target_owner_id | uuid (FK → profiles.id) | 승인되면 소원권이 늘어날 사람 |
| requested_by | uuid (FK → profiles.id) | 버튼을 누른 사람 |
| status | text | `pending` / `approved` / `rejected` (check 제약), default `pending` |
| resolved_by | uuid (FK → profiles.id, nullable) | 응답한 사람 |
| resolved_at | timestamptz (nullable) | |
| created_at | timestamptz | default now() |

`target_owner_id`는 요청한 사람 자신일 수도("내 소원권 늘려줘"), 상대일 수도 있다("네 소원권
늘려줄게"). 어느 쪽이든 **승인은 항상 요청하지 않은 다른 한 사람**이 한다 — 자기 요청을
자기가 승인하면 승인이라는 절차가 없는 것과 같아진다.

**쓰기 정책이 없다.** `pokes`와 같은 이유다: insert는 `public.request_wish_quota_add(p_target_owner_id)`가, update는 `public.resolve_wish_quota_request(p_request_id, p_approve)`가 한다(둘 다 security definer, 신원은 `auth.uid()`에서 직접 읽는다 — `claim_region_badge`와 같은 판단이라 `send_poke`와 달리 `authenticated`의 실행 권한을 회수하지 않는다). 클라이언트가 직접 넣을 수 있으면 "요청 없이 바로 승인된" row를 만들어 아래 트리거를 우회할 수 있다.

대기 중인 요청은 `(couple_id, target_owner_id)`당 하나로 부분 유니크 인덱스(`where status = 'pending'`)가 막는다 — 버튼을 연달아 눌러도 목록이 늘어나지 않는다. 화면은 `status = 'pending'`인 것만 읽어온다(`listPendingWishQuotaRequests`) — **이미 승인·거절된 요청이 목록에서 사라지는 것**은 이 필터가 전부다, 별도로 지우지 않는다.

**늘리는 걸 실제로 막는 건 트리거다.** 화면이 "추가 요청" 버튼만 보여주고 총 장수를 직접
올리는 길을 두지 않는 것은 안내일 뿐이고, `wish_quotas`의 update RLS는 여전히 커플 범위
전체다(줄이는 쪽은 계속 직접 할 수 있어야 하므로). 실제 차단은
`check_wish_total_increase_requires_approval`(`before insert or update on wish_quotas`)이
한다: 새 값이 기준값(기존 row가 있으면 그 `total`, 새로 만드는 row라면
`wish_default_total()`)보다 크면서, 같은 트랜잭션에 `resolve_wish_quota_request`가 남긴
표시(`set_config('wish.quota_request_approval', 'on', true)`)가 없으면 막는다. INSERT도
검사 대상인 이유: 장수를 정한 적 없는 사람의 row를 처음부터 기본값보다 높게 만드는 것도
승인 없는 늘림이기 때문이다.

RLS는 select만 커플 범위다.

### 2.4 `memories` (추억 타임라인)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| couple_id | uuid (FK → couples.id) | |
| title | text (nullable) | |
| content | text (nullable) | |
| memory_date | date | 실제 추억이 일어난 날짜 (등록일과 다를 수 있음) |
| location_name | text (nullable) | 예: "제주도 협재해수욕장" |
| latitude | double precision (nullable) | 여행 지도용 |
| longitude | double precision (nullable) | 여행 지도용 |
| created_by | uuid (FK → profiles.id) | |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

### 2.4.1 `travel_visits` (스크래치 지도)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| couple_id | uuid (FK → couples.id) | PK의 앞 컬럼 |
| region_code | text | 행정안전부 **시군구** 코드 5자리. `src/features/travel/districts.ts`의 `code` |
| visited_on | date (nullable) | 실제로 다녀온 날. 지금 화면은 안 채운다 |
| memory_id | uuid (FK → memories.id, on delete set null) | 나중에 추억과 잇는 자리 |
| created_by | uuid (FK → profiles.id) | |
| created_at | timestamptz | default now() |

기본키가 `(couple_id, region_code)`다. 한 커플이 같은 지역을 두 번 칠할 수 없고, 이게 곧
"긁힘" 여부라서 **켜고 끄는 것이 insert/delete**가 된다. 위젯은 커플의 칠해진 지역을 통째로
읽는데 선두 컬럼이 `couple_id`인 이 인덱스가 그대로 쓰이므로 조회용 인덱스를 따로 두지 않는다.

**허용 목록을 걸지 않고 형식(`^[0-9]{5}$`)만 본다.** 행정구역은 실제로 바뀐다 — 2023년
군위군이 경북에서 대구로 넘어갔고, 2026년 7월 광주와 전남이 합쳐져 시도가 17→16이 됐다.
191개 코드를 `check`에 적으면 그때마다 마이그레이션이 필요하고, 무엇보다 **이미 저장된 옛
코드가 제약에 걸려 사라진다.** 코드를 아는 쪽은 화면이고(모르는 코드는 그리지도 세지도
않는다 — `districtIndex.ts`), DB는 형식만 지킨다.

`travel_places`(위·경도 핀)와 별개인 이유는 묻는 것이 다르기 때문이다. 스크래치는 "어디에
점을 찍었나"가 아니라 "이 지역을 밟았나"를 묻는다. 좌표를 저장했다가 매번 구역을 역산하면
경계에 걸친 지점 하나 때문에 칠해진 지역이 달라질 수 있다.

### 2.4.2 `travel_maps` (스크래치 지도 배경 사진)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| couple_id | uuid (PK, FK → couples.id) | 1:1 — 둘이 같은 지도를 본다 |
| photo_path | text (nullable) | `travel-maps` 버킷 안의 경로. **공개 URL이 아니다** |
| updated_by | uuid (FK → profiles.id, on delete set null) | |
| updated_at | timestamptz | default now() |

### 2.4.3 `travel_region_photos` (사진으로 채우는 지도)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| couple_id | uuid (FK → couples.id) | PK의 앞 컬럼 |
| region_code | text | `travel_visits`와 같은 **시군구** 코드 5자리, 같은 형식 제약 |
| photo_path | text | `travel-maps` 버킷의 `{couple_id}/regions/...`. **공개 URL이 아니다** |
| updated_by | uuid (FK → profiles.id, on delete set null) | |
| updated_at | timestamptz | default now() |

기본키가 `(couple_id, region_code)`다 — **한 지역에 한 장**이라, 새로 올리는 것은 쌓는 게
아니라 갈아 끼우는 것이다(`upsert` + 이전 파일 삭제). 조회 인덱스를 따로 두지 않는 이유는
`travel_visits`와 같다.

`travel_maps`에 컬럼을 붙이지 않은 이유: 그건 커플당 한 줄(1:1)이고 이건 커플 × 지역이다.
`travel_visits`와 잇지 않은 이유: "사진을 걸었다"와 "다녀왔다"는 사용자가 따로 하는 말이라,
사진을 빼는 것이 다녀온 기록까지 지우면 그건 시키지 않은 일이다 (`PRD.md` §3.4.1).

### 2.4.4 `travel_badges` (지역 뱃지)

시도 안의 시군구를 전부 채우면 뱃지 하나. 두 지도가 나눠 갖는다 — 전부 방문하면 `visited`, 사진까지 걸면 `photo`.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| couple_id | uuid (FK → couples.id) | PK 1 |
| sido_code | text | PK 2 — 시도 코드 두 자리 (`^[0-9]{2}$` check) |
| tier | text | PK 3 — `visited` / `photo` (check 제약) |
| earned_at | timestamptz | default now() |
| earned_by | uuid (FK → profiles.id, nullable) | 마지막 칸을 채운 사람 |

**판정은 화면이 하고 DB는 중복만 막는다.** 트리거로 판정하려면 시도별 시군구 총개수(분모)를 DB가 알아야 하는데, `travel_visits`는 이미 형식만 검사하고 코드는 화면이 안다 (행정구역이 실제로 바뀐다 — 2026년 7월 광주·전남 통합). 분모만 DB로 옮기면 그 결정이 반쪽이 되고 행정구역이 바뀔 때마다 마이그레이션이 하나 더 붙는다. 커플 둘만 쓰는 폐쇄 앱이라 자기 커플 뱃지를 위조해도 남에게 피해가 없다.

**한 번 딴 뱃지는 회수하지 않는다** — 그래서 update·delete 정책이 없다 (select/insert만). 나중에 한 칸을 취소해도 지우지 않는다: 지우면 `earned_at`이 "처음 완성한 날"이 아니라 "마지막으로 완성한 날"이 되고 연대기로서의 가치가 사라진다. 방문 기록만 보면 "지금 완성 상태인지"는 알아도 "언제 처음 완성했는지"는 영영 알 수 없다 — 파생 계산으로 때우지 않고 테이블을 두는 이유다.

획득은 `public.claim_region_badge(p_sido_code, p_tier)`(security definer)가 한다. `insert ... on conflict do nothing` 후 **실제로 새로 생겼는지를 반환**하고, 그 값이 연출과 푸시를 보낼지 정한다 — 둘이 동시에 마지막 칸을 채워도 뱃지는 하나만 생기고 알림도 한 번만 나간다. 신원을 인자로 받지 않고 `auth.uid()`에서 읽으므로 `send_poke`와 달리 `authenticated`의 실행 권한을 회수하지 않는다 (`set_primary_anniversary`와 같은 판단).

### 2.5 `memory_photos`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| memory_id | uuid (FK → memories.id, on delete cascade) | |
| storage_path | text | Supabase Storage 내 경로 |
| sort_order | int | default 0 |
| created_at | timestamptz | default now() |

### 2.6 `couple_settings` (커스터마이징)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| couple_id | uuid (PK, FK → couples.id) | 1:1 |
| theme_color | text (nullable) | 커플 공용 테마 |
| couple_nickname | text (nullable) | 예: "민수 ❤️ 지영" |
| cover_photo_path | text (nullable) | 홈 화면 대표 이미지 |
| updated_at | timestamptz | default now() |

## 3. Storage 버킷

| 버킷명 | 용도 | 접근 정책 |
|---|---|---|
| `memory-photos` | 추억 사진 원본 | 커플 단위 RLS (해당 couple_id 소속 사용자만) |
| `profile-avatars` | 프로필 이미지 | **공개 버킷.** 본인 폴더(`{user_id}/`)에만 쓰기 |
| `travel-maps` | 지도 사진 (두 위젯이 나눠 쓴다) | **비공개 버킷.** 커플 폴더(`{couple_id}/`) 단위로 읽기·쓰기, 클라이언트는 서명 URL로 읽는다 |

`travel-maps`만 비공개인 이유: 아바타는 어차피 상대에게 보여주려고 올리는 작은 썸네일이지만,
지도에 걸리는 사진은 "둘만의 공간"(`PRD.md` §1)의 핵심인 커플 사진 원본이다. URL만 알면
누구나 열 수 있는 자리에 둘 이유가 없다. 대가는 URL이 만료된다는 것이고, 훅이 만료보다 짧은
주기로 다시 받아온다.

한 버킷을 경로로 나눠 쓴다. 정책이 첫 칸(`{couple_id}`)만 보므로 하위 폴더가 늘어도 그대로
맞고, 둘 다 성격이 같은 커플 사진 원본이라 버킷을 가를 이유가 없다.

| 경로 | 쓰는 곳 | 서명 수명 |
|---|---|---|
| `{couple_id}/map-*.jpg` | 스크래치 지도 배경 (`travel_maps`) | 1시간 (`useTravelMapPhoto`) |
| `{couple_id}/regions/{시군구코드}-*.jpg` | 지역별 사진 (`travel_region_photos`) | 6시간 (`useRegionPhotos`) |

지역별 사진의 수명이 긴 이유는 장수다. 서명이 갱신되면 URL이 바뀌어 브라우저 캐시가 통째로
무효가 되는데, 채운 만큼 늘어나는 사진을 짧은 주기로 다시 받으면 홈을 켜둔 것만으로 지도를
반복해서 내려받게 된다. 목록도 장당 왕복이 아니라 `createSignedUrls`로 한 번에 받는다.

## 4. RLS (Row Level Security) 정책 원칙

모든 도메인 테이블(`anniversaries`, `memories`, `memory_photos`, `couple_settings`)은 아래 패턴을 따른다.

```sql
-- 예시: memories 테이블
create policy "couple members can select"
  on memories for select
  using (
    couple_id in (
      select couple_id from profiles where id = auth.uid()
    )
  );

create policy "couple members can insert"
  on memories for insert
  with check (
    couple_id in (
      select couple_id from profiles where id = auth.uid()
    )
  );
```

- `memory_photos`는 `memory_id`를 통해 상위 `memories.couple_id`를 확인하는 서브쿼리 정책 필요
- `couples` 테이블 자체는 `user_a` 또는 `user_b`가 본인인 경우에만 select/update 허용
- `profiles`는 본인 row는 전체 접근, 같은 `couple_id`인 상대방 row는 read-only 허용 검토

## 5. 인덱스 고려사항
- `anniversaries(couple_id, date)` — 커플별 기념일 조회
- `memories(couple_id, memory_date desc)` — 타임라인 조회 최적화
- `memories(couple_id, latitude, longitude)` — 지도 조회 시 위치 있는 row만 필터링 (`where latitude is not null`)
- `travel_visits`·`travel_region_photos`는 기본키 `(couple_id, region_code)`가 곧 조회 인덱스다 (§2.4.1, §2.4.3)
- `wishes(couple_id, created_at desc)` — 목록(최신순), `wishes(couple_id, owner_id)` — 잔량 검사가 사람별로 센다. `wish_quotas`는 기본키 `(couple_id, owner_id)`가 곧 조회 인덱스다 (§2.3.4)
- `wish_quota_requests(couple_id, target_owner_id) where status = 'pending'` unique — 대기 중인 요청 중복 방지 및 조회 인덱스 겸용. `wish_quota_requests(couple_id, created_at desc)` — 목록(최신순) (§2.3.4.1)
- `couples(invite_code)` unique — 코드 조회 성능 및 중복 방지

## 6. 미결 사항
- 커플 연결 해제 시 `couples`, 하위 데이터 처리 정책 (soft delete vs hard delete)
- `pokes` 보관 기간 — 쿨다운은 최근 1초만 보므로 오래된 기록은 조회 화면을 붙일 때까지 순수하게 쌓이기만 한다
- `memories`를 개인 단위로 비공개 작성 가능하게 할지 여부 (현재는 커플 전체 공유 전제)
- 다국어/타임존 처리 방식 (`date` vs `timestamptz` 선택 재검토 필요)
