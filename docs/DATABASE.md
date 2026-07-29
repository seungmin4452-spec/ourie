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
| nickname | text | |
| avatar_url | text (nullable) | Storage 경로 또는 URL |
| created_at | timestamptz | default now() |

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
- `memories(couple_id, memory_date desc)` — 타임라인 조회 최적화
- `memories(couple_id, latitude, longitude)` — 지도 조회 시 위치 있는 row만 필터링 (`where latitude is not null`)
- `couples(invite_code)` unique — 코드 조회 성능 및 중복 방지

## 6. 미결 사항
- 커플 연결 해제 시 `couples`, 하위 데이터 처리 정책 (soft delete vs hard delete)
- `memories`를 개인 단위로 비공개 작성 가능하게 할지 여부 (현재는 커플 전체 공유 전제)
- 다국어/타임존 처리 방식 (`date` vs `timestamptz` 선택 재검토 필요)
