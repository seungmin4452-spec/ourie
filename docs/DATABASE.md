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
    ├──► memories.location ─► travel map에서 활용 (별도 테이블 없이 memories 재사용)
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
| poke_opt_in | boolean | default false — 콕 찌르기 수신 동의 (§2.3.2) |
| created_at | timestamptz | default now() |

**이름이 두 개다.** 원래는 `nickname`(앱 이름) 하나뿐이었는데, 이름만 봐서는 사람 이름인지 알 수 없어 콕 찌르기 알림이 "승민 ♥ 진선님이 보고 싶대요"로 나간 적이 있다. 그래서 컬럼 이름만으로 구분되게 `name` / `app_name`으로 갈랐다 (`nickname` → `app_name` rename + `name` 신규).

- `name` = **사람 이름**. 상대방에게 내가 누구인지 보여줄 때 쓴다. 회원가입 폼에서 받는다.
- `app_name` = **앱 이름**. 커플이 정하는 우리 앱의 이름("승민 ♥ 진선")이고, 홈 화면 아이콘 라벨(`src/app/AppMetaSync.tsx`)과 홈 상단의 큰 제목이 된다. 커플 공용이 아니라 `profiles`에 있는 이유는 각자 자기 앱을 따로 꾸미기 때문이다. 온보딩 "꾸미기"에서 받는다.

`name`을 회원가입에서 받으면서도 `profiles`에 직접 쓰지 않는 이유: 이메일 확인이 켜져 있으면 `signUp` 직후에 세션이 없고, 세션이 없으면 RLS 때문에 `profiles`에 쓸 수 없다. 그래서 클라이언트는 `supabase.auth.signUp`의 `options.data`로 넘기고, `handle_new_user` 트리거가 `raw_user_meta_data ->> 'name'`을 읽어 프로필 row를 만든다. 키 이름이 양쪽에서 같아야 하며, 바꾸면 이름이 조용히 사라진다.

`name`이 nullable인 이유는 이 컬럼이 생기기 전에 가입한 계정이 있어서다. 비어 있으면 화면과 알림 모두 이름 없는 문구로 떨어진다(`pokeNameLabel`). 그 계정들은 회원가입을 다시 할 수 없으므로 온보딩 "꾸미기" 화면에서도 이 값을 채울 수 있게 해두었다.

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

### 2.3.2 `pokes` (콕 찌르기)

한쪽이 버튼을 눌러 상대방 기기를 울린 기록.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| couple_id | uuid (FK → couples.id) | |
| sender_id | uuid (FK → profiles.id) | 버튼을 누른 사람 |
| recipient_id | uuid (FK → profiles.id) | 알림을 받은 사람 |
| kind | text | `miss` / `kakao` / `call` (check 제약) |
| created_at | timestamptz | default now() |

`kind`는 `src/features/poke/message.ts`의 `POKE_KINDS`와 같아야 한다. 한쪽만 늘리면 발송이 `invalid_kind`로 막힌다.

**수신 동의가 전제다.** 이 기능만은 내가 아니라 상대방이 내 기기를 울리므로, `profiles.poke_opt_in`(기본 `false`)을 켠 사람에게만 간다. 매일 디데이 알림과 별개의 스위치인 이유이기도 하다 — 디데이는 받고 콕 찌르기는 안 받고 싶을 수 있다. 수정은 본인만(`profiles_update_self`), 읽기는 커플 상대방도 가능하다(`profiles_select_self_or_partner`) — 그래서 보내는 쪽 화면이 눌러보기 전에 "상대가 아직 안 켰어요"를 보여줄 수 있다.

**쓰기 정책이 없다.** insert는 `public.send_poke(p_sender, p_kind)`(security definer)와 service role만 한다. 클라이언트가 직접 넣을 수 있으면 쿨다운도 수신 동의도 우회된다. 그 함수는 `authenticated`/`anon`의 실행 권한을 revoke해 두었고(남의 id를 넣어 사칭하는 것을 막는다), 실제 신원 확인은 `api/poke.ts`가 access token을 검증해 한다.

**연타 방지**는 같은 종류 1초 1회다 (하루 총량 제한은 없다). 직전 발송 조회와 insert가 `send_poke` 한 트랜잭션 안에 있고, `pg_advisory_xact_lock(sender, kind)`으로 동시에 들어온 두 요청을 직렬화한다 — 여러 조회로 나누면 버튼 연타가 정확히 그 검사를 빠져나간다.

기록을 남기는 건 쿨다운 때문만은 아니다. 나중에 "오늘 세 번 보고 싶다고 했어요" 같은 화면을 붙일 수 있게 하려는 것이라, 발송 성공 여부가 아니라 "보내기로 했다"는 사실을 적는다.

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
| `profile-avatars` | 프로필 이미지 | 본인만 쓰기, 커플 상대방은 읽기 허용 검토 |

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
- `couples(invite_code)` unique — 코드 조회 성능 및 중복 방지

## 6. 미결 사항
- 커플 연결 해제 시 `couples`, 하위 데이터 처리 정책 (soft delete vs hard delete)
- `pokes` 보관 기간 — 쿨다운은 최근 1초만 보므로 오래된 기록은 조회 화면을 붙일 때까지 순수하게 쌓이기만 한다
- `memories`를 개인 단위로 비공개 작성 가능하게 할지 여부 (현재는 커플 전체 공유 전제)
- 다국어/타임존 처리 방식 (`date` vs `timestamptz` 선택 재검토 필요)
