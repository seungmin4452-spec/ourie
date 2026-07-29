-- ============================================================
-- Ourie — Supabase database schema
-- Tables: profiles, couples, memories, photos, travel_places, themes
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
alter table public.memories enable row level security;
alter table public.photos enable row level security;
alter table public.travel_places enable row level security;
alter table public.themes enable row level security;

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
