-- ============================================================
-- 스크래치 지도 — 증분 스크립트
--
-- 홈 위젯 "우리가 다녀온 곳". 커플이 고른 사진을 지도 모양으로 깔고, 아직
-- 안 다녀온 시군구만 코팅으로 덮는다. 191곳을 다 긁으면 사진이 온전히 드러난다.
--
-- 기존 travel_places(위·경도 핀)와 다른 테이블인 이유: 스크래치가 묻는 것은
-- "어디에 점을 찍었나"가 아니라 "이 지역을 밟았나"다. 좌표를 저장했다가 매번
-- 구역을 역산하면, 경계에 걸친 지점 하나 때문에 칠해진 지역이 바뀔 수 있다.
-- 핀 지도는 나중에 travel_places로 따로 만들고, 잇고 싶어지면 아래 memory_id가
-- 그 자리다.
--
-- 순서대로 한 번에 실행한다. 여러 번 돌려도 안전하다.
-- 내용을 고칠 일이 생기면 schema.sql을 먼저 고치고 둘을 같이 반영한다.
--
-- 선행 조건: couples, profiles, memories가 이미 있어야 한다 (schema.sql).
-- ============================================================

-- 1. 다녀온 시군구 -------------------------------------------
create table if not exists public.travel_visits (
  couple_id uuid not null references public.couples (id) on delete cascade,
  -- 행정안전부 시군구 코드 다섯 자리. src/features/travel/districts.ts의 code와
  -- 같은 값이다. 앞 두 자리가 시도 코드라 시도별 진행률은 여기서 바로 나온다.
  --
  -- 허용 목록을 박지 않고 형식만 본다. 행정구역은 **실제로 바뀐다** — 2023년
  -- 군위군이 경북에서 대구로 넘어갔고, 2026년 7월에는 광주와 전남이 합쳐져
  -- 시도 개수가 17에서 16으로 줄었다. 191개를 check에 적어두면 그때마다
  -- 마이그레이션이 필요하고, 무엇보다 **이미 저장된 옛 코드가 제약에 걸려
  -- 사라진다**. 코드를 아는 쪽은 화면이고(모르는 코드는 그냥 안 그린다),
  -- DB는 형식만 지킨다.
  region_code text not null check (region_code ~ '^[0-9]{5}$'),
  -- 언제 다녀왔는지. 지금 화면은 쓰지 않지만, 나중에 "2024년에 다녀온 곳"
  -- 같은 걸 붙일 때 이 값이 없으면 과거를 되살릴 방법이 없다.
  visited_on date,
  -- 추억 타임라인이 붙는 날 이 지역을 대표하는 추억을 걸어둘 자리.
  -- 추억이 지워져도 다녀온 사실까지 사라지면 안 되므로 set null이다.
  memory_id uuid references public.memories (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),

  -- 한 커플이 같은 지역을 두 번 칠할 수는 없다. 이게 곧 "긁힘" 여부라서
  -- 별도 id 없이 이 짝이 기본키다 — 켜고 끄는 것이 insert/delete가 된다.
  -- 위젯은 커플의 칠해진 지역을 통째로 읽는데, 선두 컬럼이 couple_id인
  -- 이 기본키 인덱스가 그대로 쓰이므로 조회용 인덱스를 따로 두지 않는다.
  primary key (couple_id, region_code)
);

alter table public.travel_visits enable row level security;

drop policy if exists "travel_visits_select_couple" on public.travel_visits;
create policy "travel_visits_select_couple"
  on public.travel_visits for select
  using (couple_id = public.current_couple_id());

drop policy if exists "travel_visits_insert_couple" on public.travel_visits;
create policy "travel_visits_insert_couple"
  on public.travel_visits for insert
  with check (couple_id = public.current_couple_id());

drop policy if exists "travel_visits_update_couple" on public.travel_visits;
create policy "travel_visits_update_couple"
  on public.travel_visits for update
  using (couple_id = public.current_couple_id());

-- 상대가 칠한 지역도 지울 수 있다. 둘이 함께 채우는 지도라 "내가 칠한 것만"으로
-- 좁히면 잘못 누른 것을 상대가 없을 때 되돌릴 방법이 없어진다 (poke_presets와
-- 같은 판단).
drop policy if exists "travel_visits_delete_couple" on public.travel_visits;
create policy "travel_visits_delete_couple"
  on public.travel_visits for delete
  using (couple_id = public.current_couple_id());

-- 2. 지도 밑에 깔 사진 ---------------------------------------
create table if not exists public.travel_maps (
  -- 커플당 한 장. 둘이 같은 지도를 보는 것이 이 기능의 전부라서 1:1이다.
  couple_id uuid primary key references public.couples (id) on delete cascade,
  -- travel-maps 버킷 안의 경로다. 공개 URL이 아니다 (아래 3번 참고).
  photo_path text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.travel_maps enable row level security;

drop policy if exists "travel_maps_select_couple" on public.travel_maps;
create policy "travel_maps_select_couple"
  on public.travel_maps for select
  using (couple_id = public.current_couple_id());

drop policy if exists "travel_maps_insert_couple" on public.travel_maps;
create policy "travel_maps_insert_couple"
  on public.travel_maps for insert
  with check (couple_id = public.current_couple_id());

drop policy if exists "travel_maps_update_couple" on public.travel_maps;
create policy "travel_maps_update_couple"
  on public.travel_maps for update
  using (couple_id = public.current_couple_id());

drop policy if exists "travel_maps_delete_couple" on public.travel_maps;
create policy "travel_maps_delete_couple"
  on public.travel_maps for delete
  using (couple_id = public.current_couple_id());

-- 3. Storage: 지도 배경 사진 ----------------------------------
-- profile-avatars와 달리 **비공개 버킷**이다. 아바타는 상대에게 보여주려고
-- 올리는 작은 썸네일이지만, 이건 "둘만의 공간"의 핵심인 커플 사진 원본이다.
-- URL만 알면 누구나 열 수 있는 자리에 둘 이유가 없다. 클라이언트는
-- createSignedUrl로 읽는다.
insert into storage.buckets (id, name, public)
values ('travel-maps', 'travel-maps', false)
on conflict (id) do nothing;

-- 객체는 `{couple_id}/...`에 쌓인다. 커플 두 사람 모두 읽고 바꿀 수 있어야
-- 하므로 auth.uid()가 아니라 current_couple_id()로 잠근다.
drop policy if exists "travel_maps_couple_read" on storage.objects;
create policy "travel_maps_couple_read"
  on storage.objects for select
  using (
    bucket_id = 'travel-maps'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );

drop policy if exists "travel_maps_couple_write" on storage.objects;
create policy "travel_maps_couple_write"
  on storage.objects for insert
  with check (
    bucket_id = 'travel-maps'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );

drop policy if exists "travel_maps_couple_update" on storage.objects;
create policy "travel_maps_couple_update"
  on storage.objects for update
  using (
    bucket_id = 'travel-maps'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );

drop policy if exists "travel_maps_couple_delete" on storage.objects;
create policy "travel_maps_couple_delete"
  on storage.objects for delete
  using (
    bucket_id = 'travel-maps'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );
