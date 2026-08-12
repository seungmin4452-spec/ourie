-- ============================================================
-- 사진으로 채우는 지도 — 증분 스크립트
--
-- 홈 위젯 "사진으로 채우는 지도". 스크래치 지도(travel_visits + travel_maps)의
-- 다른 판이다. 그쪽은 사진 한 장을 지도 전체에 깔고 다녀온 곳을 긁어 그 조각을
-- 드러내지만, 이쪽은 시군구마다 사진을 한 장씩 걸어 전국을 채운다.
--
-- travel_maps에 컬럼을 붙이지 않고 테이블을 새로 두는 이유: travel_maps는
-- 커플당 한 줄(1:1)이고, 이건 커플 × 지역이다. 스크래치 지도의 배경을 바꿔도
-- 여기 걸어둔 사진은 그대로여야 하고, 그 반대도 마찬가지다.
--
-- travel_visits와도 잇지 않는다. "사진을 걸었다"와 "다녀왔다"는 사용자가 따로
-- 하는 말이라, 사진을 빼는 것이 다녀온 기록까지 지우면 그건 시키지 않은 일이다.
--
-- 순서대로 한 번에 실행한다. 여러 번 돌려도 안전하다.
-- 내용을 고칠 일이 생기면 schema.sql을 먼저 고치고 둘을 같이 반영한다.
--
-- 선행 조건: couples, profiles와 2026-08-12-travel-scratch.sql이 먼저 실행돼
-- 있어야 한다 (travel-maps 버킷과 그 Storage 정책을 그대로 쓴다).
-- ============================================================

create table if not exists public.travel_region_photos (
  couple_id uuid not null references public.couples (id) on delete cascade,
  -- 행정안전부 시군구 코드 다섯 자리. travel_visits.region_code와 같은 값
  -- 체계이고, 허용 목록 대신 형식만 보는 이유도 같다 — 행정구역은 실제로
  -- 바뀌고, 목록을 박아두면 통합·분리 때 이미 저장된 옛 코드가 제약에 걸려
  -- 사라진다. 코드를 아는 쪽은 화면이다(모르는 코드는 그냥 안 그린다).
  region_code text not null check (region_code ~ '^[0-9]{5}$'),
  -- travel-maps 버킷 안의 경로이고 공개 URL이 아니다. 배경 사진과 같은 버킷을
  -- 쓰되 경로로 가른다: 배경은 `{couple_id}/map-*.jpg`, 이쪽은
  -- `{couple_id}/regions/{시군구코드}-*.jpg`. 버킷을 나누지 않는 이유는 성격이
  -- 같아서다 — 둘 다 커플 사진 원본이고, `{couple_id}/...` 하나로 걸린 Storage
  -- 정책이 그대로 맞는다.
  photo_path text not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),

  -- 한 지역에 한 장. 새로 올리면 갈아 끼우는 것이지 쌓이는 게 아니다.
  -- 위젯은 커플의 사진을 통째로 읽는데, 선두 컬럼이 couple_id인 이 기본키
  -- 인덱스가 그대로 쓰이므로 조회용 인덱스를 따로 두지 않는다.
  primary key (couple_id, region_code)
);

alter table public.travel_region_photos enable row level security;

drop policy if exists "travel_region_photos_select_couple" on public.travel_region_photos;
create policy "travel_region_photos_select_couple"
  on public.travel_region_photos for select
  using (couple_id = public.current_couple_id());

drop policy if exists "travel_region_photos_insert_couple" on public.travel_region_photos;
create policy "travel_region_photos_insert_couple"
  on public.travel_region_photos for insert
  with check (couple_id = public.current_couple_id());

drop policy if exists "travel_region_photos_update_couple" on public.travel_region_photos;
create policy "travel_region_photos_update_couple"
  on public.travel_region_photos for update
  using (couple_id = public.current_couple_id());

-- 상대가 건 사진도 뺄 수 있다. 둘이 함께 채우는 지도라 "내가 올린 것만"으로
-- 좁히면 잘못 올린 사진을 상대가 없을 때 되돌릴 방법이 없어진다
-- (travel_visits와 같은 판단).
drop policy if exists "travel_region_photos_delete_couple" on public.travel_region_photos;
create policy "travel_region_photos_delete_couple"
  on public.travel_region_photos for delete
  using (couple_id = public.current_couple_id());
