-- ============================================================
-- 사진으로 채우는 지도 — 최초로 사진을 건 시각을 따로 남긴다
--
-- travel_region_photos는 한 지역에 한 장(기본키가 couple_id+region_code)이라
-- 사진을 바꾸면 upsert가 같은 row를 갱신한다. updated_at만 있으면 "이 해에
-- 새로 채운 곳"을 셀 때 사진을 바꾼 것과 처음 건 것을 구분할 수 없다 — 연간
-- 결산(src/features/recap)이 이 구분을 필요로 한다.
--
-- created_at을 upsert의 SET 목록에 넣지 않으면(setRegionPhoto가 이미 그렇게
-- 되어 있다) INSERT일 때만 기본값이 들어가고, 그 뒤로 몇 번을 바꿔도
-- 그대로다.
--
-- 이미 채워진 row는 언제 처음 걸렸는지 알 방법이 없으므로, 지금까지의
-- updated_at(마지막으로 바뀐 시각)을 최선의 근사값으로 그대로 옮겨 심는다 —
-- "오늘"보다는 낫다.
--
-- 순서대로 한 번에 실행한다. 여러 번 돌려도 안전하다.
-- 내용을 고칠 일이 생기면 schema.sql을 먼저 고치고 둘을 같이 반영한다.
-- ============================================================

alter table public.travel_region_photos
  add column if not exists created_at timestamptz;

update public.travel_region_photos
  set created_at = updated_at
  where created_at is null;

alter table public.travel_region_photos
  alter column created_at set not null,
  alter column created_at set default now();
