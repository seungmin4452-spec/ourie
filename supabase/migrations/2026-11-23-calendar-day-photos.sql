-- ============================================================
-- 캘린더 날짜별 사진 — 증분 스크립트
--
-- 일정(calendar_events)이 아니라 **날짜**에 사진을 남긴다. 비어 있던
-- memories / photos를 그대로 쓰고, 하루에 기록(memories) 하나, 그 아래에
-- 사진(photos) 여러 장이다.
--
-- 순서대로 한 번에 실행한다. 여러 번 돌려도 안전하다.
-- 같은 날짜의 memories가 이미 둘 이상 있으면 유니크 인덱스에서 멈춘다
-- (지금까지 memories에 쓰는 화면이 없었으므로 정상이라면 비어 있다).
--
-- 선행 조건: couples / profiles / current_couple_id() / set_updated_at()
-- ============================================================

-- 1. 테이블 --------------------------------------------------
-- schema.sql에는 있지만 운영 DB에 적용됐는지 저장소만으로는 알 수 없어서
-- 없을 때만 만든다.
create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references public.couples (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  title text,
  content text,
  memory_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories (id) on delete cascade,
  storage_path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists photos_memory_id_idx on public.photos (memory_id);

drop trigger if exists memories_set_updated_at on public.memories;
create trigger memories_set_updated_at
  before update on public.memories
  for each row
  execute function public.set_updated_at();

-- 2. 연결이 끊겨도 사진은 보존 ---------------------------------
-- 계정을 지우면 couples가 cascade로 지워지는데, 예전 FK대로면 그 커플의
-- 기록과 사진 row까지 함께 사라진다. 둘 다 set null로 바꿔 row를 남긴다.
-- couple_id가 null이 된 row는 RLS상 아무에게도 보이지 않고, 파일 경로의 첫
-- 칸에 원래 couple_id가 남아 있어 나중에 복구할 수 있다.
alter table public.memories alter column couple_id drop not null;
alter table public.memories alter column created_by drop not null;

alter table public.memories drop constraint if exists memories_couple_id_fkey;
alter table public.memories
  add constraint memories_couple_id_fkey
  foreign key (couple_id) references public.couples (id) on delete set null;

alter table public.memories drop constraint if exists memories_created_by_fkey;
alter table public.memories
  add constraint memories_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

-- 3. 하루에 기록 하나, 대표 사진 --------------------------------
-- 둘이 같은 날짜에 동시에 첫 사진을 올려도 기록이 갈라지지 않게 한다.
create unique index if not exists memories_couple_id_memory_date_key
  on public.memories (couple_id, memory_date);

-- null이면 첫 번째 사진이 대표다. 대표 사진을 지우면 다시 null로 돌아간다.
alter table public.memories
  add column if not exists cover_photo_id uuid references public.photos (id) on delete set null;

-- 4. RLS ------------------------------------------------------
alter table public.memories enable row level security;
alter table public.photos enable row level security;

drop policy if exists "memories_select_couple" on public.memories;
create policy "memories_select_couple"
  on public.memories for select
  using (couple_id = public.current_couple_id());

drop policy if exists "memories_insert_couple" on public.memories;
create policy "memories_insert_couple"
  on public.memories for insert
  with check (couple_id = public.current_couple_id());

drop policy if exists "memories_update_couple" on public.memories;
create policy "memories_update_couple"
  on public.memories for update
  using (couple_id = public.current_couple_id());

drop policy if exists "memories_delete_couple" on public.memories;
create policy "memories_delete_couple"
  on public.memories for delete
  using (couple_id = public.current_couple_id());

drop policy if exists "photos_select_couple" on public.photos;
create policy "photos_select_couple"
  on public.photos for select
  using (
    memory_id in (
      select id from public.memories where couple_id = public.current_couple_id()
    )
  );

drop policy if exists "photos_insert_couple" on public.photos;
create policy "photos_insert_couple"
  on public.photos for insert
  with check (
    memory_id in (
      select id from public.memories where couple_id = public.current_couple_id()
    )
  );

drop policy if exists "photos_delete_couple" on public.photos;
create policy "photos_delete_couple"
  on public.photos for delete
  using (
    memory_id in (
      select id from public.memories where couple_id = public.current_couple_id()
    )
  );

-- 5. Storage --------------------------------------------------
-- 커플 사진 원본이라 travel-maps와 같이 비공개 버킷 + 서명 URL이다.
--   {couple_id}/{YYYY-MM-DD}/{photo_id}.jpg        보기용 (긴 변 1600px)
--   {couple_id}/{YYYY-MM-DD}/{photo_id}-thumb.jpg  달력·격자용 정사각형
insert into storage.buckets (id, name, public)
values ('memory-photos', 'memory-photos', false)
on conflict (id) do nothing;

drop policy if exists "memory_photos_couple_read" on storage.objects;
create policy "memory_photos_couple_read"
  on storage.objects for select
  using (
    bucket_id = 'memory-photos'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );

drop policy if exists "memory_photos_couple_write" on storage.objects;
create policy "memory_photos_couple_write"
  on storage.objects for insert
  with check (
    bucket_id = 'memory-photos'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );

drop policy if exists "memory_photos_couple_delete" on storage.objects;
create policy "memory_photos_couple_delete"
  on storage.objects for delete
  using (
    bucket_id = 'memory-photos'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );
