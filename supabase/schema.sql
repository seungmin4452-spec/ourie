-- ============================================================
-- Ourie — Supabase database schema
-- Tables: profiles, couples, anniversaries, memories, photos,
--         travel_places, themes
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- couples
-- user_a / user_b reference auth.users directly (not profiles)
-- to avoid a circular FK with profiles.couple_id.
-- ------------------------------------------------------------
create table public.couples (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid references auth.users (id) on delete cascade,
  invite_code text unique,
  connected_at timestamptz,
  created_at timestamptz not null default now(),

  constraint couples_user_a_user_b_different check (user_a is distinct from user_b)
);

create index couples_invite_code_idx on public.couples (invite_code);

-- Invite codes are valid for 1 hour from creation (checked against
-- created_at below). The client mirrors this window when deciding whether
-- to reuse a pending invite vs. mint a fresh one -- see
-- INVITE_CODE_TTL_MS in src/features/couple/api/couple.ts. Keep both in
-- sync if this changes.

-- joins the caller to the couple that owns p_invite_code, as user_b.
-- security definer: the caller can't select a couples row they're not yet a
-- member of (couples_select_member RLS), so this needs to run with elevated
-- privileges to look the code up and connect both sides atomically.
create or replace function public.join_couple(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_couple public.couples%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if exists (
    select 1 from public.profiles where id = v_uid and couple_id is not null
  ) then
    raise exception 'already_connected';
  end if;

  select * into v_couple
    from public.couples
    where invite_code = p_invite_code and user_b is null and connected_at is null
    for update;

  if not found then
    raise exception 'invalid_code';
  end if;

  if v_couple.created_at < now() - interval '1 hour' then
    raise exception 'expired_code';
  end if;

  if v_couple.user_a = v_uid then
    raise exception 'own_code';
  end if;

  update public.couples
    set user_b = v_uid, connected_at = now()
    where id = v_couple.id;

  update public.profiles
    set couple_id = v_couple.id
    where id in (v_couple.user_a, v_uid);

  -- Either side may have minted their own never-used invite before this one
  -- connected (both people default to the "create code" tab on first visit).
  -- Those rows would otherwise sit around forever with user_b/connected_at
  -- null -- harmless, but confusing to find in the table. Clear them out now
  -- that this couple is settled.
  delete from public.couples
    where id <> v_couple.id
      and user_b is null
      and connected_at is null
      and user_a in (v_couple.user_a, v_uid);

  return v_couple.id;
end;
$$;

grant execute on function public.join_couple(text) to authenticated;

-- ------------------------------------------------------------
-- profiles
-- 1:1 with auth.users (id is both PK and FK)
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  couple_id uuid references public.couples (id) on delete set null,
  nickname text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create index profiles_couple_id_idx on public.profiles (couple_id);

-- automatically create a profile row whenever a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ------------------------------------------------------------
-- anniversaries (디데이)
-- `date`는 다음 기념일이 아니라 기준일이다. repeat_yearly인 행은 매년 같은
-- 월/일에 돌아오고, 다가오는 기념일과 함께한 날 수는 클라이언트가 이 기준일에서
-- 계산한다 (src/features/anniversary/dday.ts).
-- timestamptz가 아니라 date인 이유: 기념일은 달력상의 하루라서, 보는 사람의
-- 타임존만큼 밀리면 여행 중인 쪽에게 엉뚱한 날이 보인다.
-- ------------------------------------------------------------
create table public.anniversaries (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  date date not null,
  repeat_yearly boolean not null default true,
  created_at timestamptz not null default now()
);

create index anniversaries_couple_id_date_idx
  on public.anniversaries (couple_id, date);

-- ------------------------------------------------------------
-- memories
-- ------------------------------------------------------------
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  title text,
  content text,
  memory_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index memories_couple_id_memory_date_idx
  on public.memories (couple_id, memory_date desc);

-- keep updated_at current on every update
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger memories_set_updated_at
  before update on public.memories
  for each row
  execute function public.set_updated_at();

-- ------------------------------------------------------------
-- photos
-- ------------------------------------------------------------
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories (id) on delete cascade,
  storage_path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index photos_memory_id_idx on public.photos (memory_id);

-- ------------------------------------------------------------
-- travel_places
-- optionally linked to the memory that was recorded at that place
-- ------------------------------------------------------------
create table public.travel_places (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  memory_id uuid references public.memories (id) on delete set null,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  created_at timestamptz not null default now()
);

create index travel_places_couple_id_idx on public.travel_places (couple_id);
create index travel_places_memory_id_idx on public.travel_places (memory_id);

-- ------------------------------------------------------------
-- themes
-- couple 단위 커스터마이징 설정 (1:1 with couples)
-- ------------------------------------------------------------
create table public.themes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null unique references public.couples (id) on delete cascade,
  theme_color text,
  couple_nickname text,
  cover_photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger themes_set_updated_at
  before update on public.themes
  for each row
  execute function public.set_updated_at();

-- ------------------------------------------------------------
-- push_subscriptions (디데이 알림)
-- 브라우저가 발급한 Web Push 구독 하나가 한 row다. 사람이 아니라 "설치된 앱"
-- 단위라, 같은 사람이 아이폰과 노트북에서 각각 켜면 두 row가 된다.
--
-- user_id가 auth.users가 아니라 profiles를 가리키는 이유: 발송 함수가
-- 구독에서 곧바로 couple_id를 따라가야 하는데, PostgREST의 embed는 실제
-- 외래 키가 있어야 걸린다 (api/notify-dday.ts의 profiles!inner).
--
-- last_notified_on은 "하루 한 번"을 지키는 자물쇠다. cron이 재시도되거나 두
-- 번 트리거돼도 이 날짜가 이미 오늘이면 건너뛴다. 커플의 달력 기준 날짜라
-- timestamptz가 아니라 date다 (anniversaries.date와 같은 이유).
-- ------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  last_notified_on date,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

-- ============================================================
-- Row Level Security
-- All tables are couple-scoped: a user may only read/write rows
-- belonging to the couple they are a member of.
-- ============================================================

-- security definer helper avoids recursive RLS lookups on profiles
create or replace function public.current_couple_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select couple_id from public.profiles where id = auth.uid()
$$;

alter table public.couples enable row level security;
alter table public.profiles enable row level security;
alter table public.anniversaries enable row level security;
alter table public.memories enable row level security;
alter table public.photos enable row level security;
alter table public.travel_places enable row level security;
alter table public.themes enable row level security;
alter table public.push_subscriptions enable row level security;

-- couples: only the two members can see/manage their own couple row
create policy "couples_select_member"
  on public.couples for select
  using (auth.uid() = user_a or auth.uid() = user_b);

create policy "couples_insert_creator"
  on public.couples for insert
  with check (auth.uid() = user_a);

create policy "couples_update_member"
  on public.couples for update
  using (auth.uid() = user_a or auth.uid() = user_b);

-- profiles: everyone can see their own profile and their partner's
create policy "profiles_select_self_or_partner"
  on public.profiles for select
  using (id = auth.uid() or couple_id = public.current_couple_id());

create policy "profiles_insert_self"
  on public.profiles for insert
  with check (id = auth.uid());

create policy "profiles_update_self"
  on public.profiles for update
  using (id = auth.uid());

-- anniversaries: couple-scoped
create policy "anniversaries_select_couple"
  on public.anniversaries for select
  using (couple_id = public.current_couple_id());

create policy "anniversaries_insert_couple"
  on public.anniversaries for insert
  with check (couple_id = public.current_couple_id());

create policy "anniversaries_update_couple"
  on public.anniversaries for update
  using (couple_id = public.current_couple_id());

create policy "anniversaries_delete_couple"
  on public.anniversaries for delete
  using (couple_id = public.current_couple_id());

-- memories: couple-scoped
create policy "memories_select_couple"
  on public.memories for select
  using (couple_id = public.current_couple_id());

create policy "memories_insert_couple"
  on public.memories for insert
  with check (couple_id = public.current_couple_id());

create policy "memories_update_couple"
  on public.memories for update
  using (couple_id = public.current_couple_id());

create policy "memories_delete_couple"
  on public.memories for delete
  using (couple_id = public.current_couple_id());

-- photos: scoped through the parent memory's couple_id
create policy "photos_select_couple"
  on public.photos for select
  using (
    memory_id in (
      select id from public.memories where couple_id = public.current_couple_id()
    )
  );

create policy "photos_insert_couple"
  on public.photos for insert
  with check (
    memory_id in (
      select id from public.memories where couple_id = public.current_couple_id()
    )
  );

create policy "photos_delete_couple"
  on public.photos for delete
  using (
    memory_id in (
      select id from public.memories where couple_id = public.current_couple_id()
    )
  );

-- travel_places: couple-scoped
create policy "travel_places_select_couple"
  on public.travel_places for select
  using (couple_id = public.current_couple_id());

create policy "travel_places_insert_couple"
  on public.travel_places for insert
  with check (couple_id = public.current_couple_id());

create policy "travel_places_update_couple"
  on public.travel_places for update
  using (couple_id = public.current_couple_id());

create policy "travel_places_delete_couple"
  on public.travel_places for delete
  using (couple_id = public.current_couple_id());

-- themes: couple-scoped
create policy "themes_select_couple"
  on public.themes for select
  using (couple_id = public.current_couple_id());

create policy "themes_insert_couple"
  on public.themes for insert
  with check (couple_id = public.current_couple_id());

create policy "themes_update_couple"
  on public.themes for update
  using (couple_id = public.current_couple_id());

-- push_subscriptions: 알림은 커플 공유가 아니라 개인 설정이다. 상대방이 내
-- 기기 알림을 끄거나 켤 수 있으면 안 되므로 커플 범위가 아니라 본인 범위로
-- 좁힌다. 발송하는 cron 함수는 service role 키로 이 정책을 우회한다.
create policy "push_subscriptions_select_self"
  on public.push_subscriptions for select
  using (user_id = auth.uid());

create policy "push_subscriptions_insert_self"
  on public.push_subscriptions for insert
  with check (user_id = auth.uid());

create policy "push_subscriptions_update_self"
  on public.push_subscriptions for update
  using (user_id = auth.uid());

create policy "push_subscriptions_delete_self"
  on public.push_subscriptions for delete
  using (user_id = auth.uid());

-- ============================================================
-- Storage: profile avatars
-- public read (simple avatar URLs), writes restricted to the
-- owner's own folder — objects are stored under `{user_id}/...`
-- ============================================================

insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', true)
on conflict (id) do nothing;

create policy "profile_avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'profile-avatars');

create policy "profile_avatars_owner_write"
  on storage.objects for insert
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "profile_avatars_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "profile_avatars_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
