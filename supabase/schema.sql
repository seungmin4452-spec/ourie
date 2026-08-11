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
-- poke_opt_in은 "상대방이 눌러서 보내는 알림"(콕 찌르기)을 받겠다는 동의다.
-- 기본값이 false인 게 핵심이다 — 이 기능만은 내가 아니라 상대방이 내 기기를
-- 울리므로, 켠 적 없는 사람에게는 절대 가지 않아야 한다. 매일 디데이 알림과
-- 분리된 스위치인 이유이기도 하다 (디데이는 켜고 콕 찌르기는 안 받고 싶을 수
-- 있다). 수정은 본인만 가능하고(profiles_update_self), 상대방은 읽기만
-- 가능하다(profiles_select_self_or_partner) — 그래서 보내는 쪽 화면이 "상대가
-- 아직 안 켰어요"를 미리 보여줄 수 있다.
-- 이름이 둘이다. 컬럼 이름만 보고 구분되도록 name / app_name으로 갈라 두었다
-- (예전에는 nickname / display_name이었는데, 어느 쪽이 사람인지 알 수 없어서
-- 실제로 앱 이름을 알림에 실어 보낸 적이 있다).
--
--   name     = **사람 이름**. 상대방에게 내가 누구인지 보여줄 때 쓴다
--              (콕 찌르기 알림의 "지영님이 보고 싶대요"). 회원가입에서 받는다.
--   app_name = **앱 이름**. 커플이 정하는 우리 앱의 이름이고("승민 ♥ 진선"),
--              홈 화면 아이콘 라벨(AppMetaSync)과 홈 상단의 큰 제목이 된다.
--              커플 공용이 아니라 profiles에 있는 이유는 각자 자기 앱을 따로
--              꾸미기 때문이다. 온보딩 "꾸미기"에서 받는다.
--
-- name이 nullable인 이유: 이 컬럼이 생기기 전에 가입한 계정이 있다. 비어
-- 있으면 이름 없는 문구로 떨어진다 (src/features/poke/message.ts의
-- pokeNameLabel).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  couple_id uuid references public.couples (id) on delete set null,
  name text,
  app_name text,
  avatar_url text,
  poke_opt_in boolean not null default false,
  created_at timestamptz not null default now()
);

create index profiles_couple_id_idx on public.profiles (couple_id);

-- automatically create a profile row whenever a new auth user signs up
--
-- 이름을 auth 메타데이터에서 꺼내오는 이유: 이메일 확인이 켜져 있으면 회원가입
-- 직후에 세션이 없다. 세션이 없으면 RLS 때문에 클라이언트가 profiles에 쓸 수
-- 없어서, 가입 폼에서 받은 이름을 저장할 방법이 이것뿐이다. 클라이언트는
-- supabase.auth.signUp의 options.data로 넘긴다 (src/features/auth/api/auth.ts).
-- 여기 쓰는 건 사람 이름(name)이다. 앱 이름은 온보딩에서 따로 받는다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    -- 공백만 넣은 경우까지 null로 떨어뜨린다. "이름 없음"의 표현이 하나여야
    -- 화면에서 분기가 갈라지지 않는다.
    nullif(trim(new.raw_user_meta_data ->> 'name'), '')
  );
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

-- ------------------------------------------------------------
-- pokes (콕 찌르기)
-- 한쪽이 버튼을 눌러 상대방 기기를 울린 기록 하나가 한 row다.
--
-- 기록을 남기는 이유는 두 가지다. 하나는 연타 방지 — send_poke가 직전 발송
-- 시각을 여기서 읽는다. 다른 하나는 나중에 "오늘 세 번 보고 싶다고 했어요"
-- 같은 걸 보여줄 수 있게 하는 것이다. 그래서 발송 성공 여부가 아니라 "보내기로
-- 했다"는 사실을 적는다 (상대가 기기를 꺼둬서 안 닿아도 보낸 건 보낸 거다).
--
-- 쓰기 정책이 없는 건 실수가 아니다. insert는 오직 send_poke(security
-- definer)와 service role만 한다 — 클라이언트가 직접 넣을 수 있으면 쿨다운도
-- 수신 동의도 우회된다.
-- ------------------------------------------------------------
create table public.pokes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  -- 종류는 3개 고정이다 (src/features/poke/kinds.ts의 POKE_KINDS와 같아야
  -- 한다). text + check인 이유는 enum이면 종류를 늘릴 때마다 타입 변경
  -- 마이그레이션이 필요하기 때문이다.
  kind text not null check (kind in ('miss', 'kakao', 'call')),
  created_at timestamptz not null default now()
);

-- 쿨다운 조회용. send_poke가 (sender_id, kind)로 가장 최근 한 건만 본다.
create index pokes_sender_kind_created_idx
  on public.pokes (sender_id, kind, created_at desc);

-- 커플의 주고받은 기록 조회용.
create index pokes_couple_created_idx on public.pokes (couple_id, created_at desc);

-- ------------------------------------------------------------
-- send_poke: 콕 찌르기 한 번을 원자적으로 처리한다.
--
-- 상대방 찾기 · 수신 동의 확인 · 쿨다운 확인 · 기록을 한 트랜잭션에 묶는 이유는
-- join_couple과 같다. 이걸 api/poke.ts에서 여러 번의 조회로 나눠 하면, 두 요청이
-- 겹쳤을 때 둘 다 "직전 발송 없음"을 보고 통과한다 — 버튼을 빠르게 두 번 누르는
-- 것이 정확히 그 상황이라, 막으려는 바로 그 케이스에서 못 막는다.
--
-- 그 겹침을 확실히 막는 게 아래 advisory lock이다. 트랜잭션이 끝나면 자동으로
-- 풀리고, (보낸 사람, 종류)별로만 잠그므로 다른 커플끼리는 서로 기다리지 않는다.
--
-- p_sender를 인자로 받고 auth.uid()를 쓰지 않는 이유: 이 함수는 사용자의 세션이
-- 아니라 service role로 도는 api/poke.ts가 부른다 (상대방의 push_subscriptions를
-- 읽어야 하는데 그건 RLS로 막혀 있다). 그래서 p_sender는 신뢰할 수 없는 값이고,
-- 아래 grant로 authenticated/anon의 실행 권한을 아예 빼앗아 클라이언트가 남의
-- id를 넣어 부를 수 없게 한다. 실제 신원 확인은 호출 전 access token 검증이
-- 담당한다.
-- ------------------------------------------------------------
create or replace function public.send_poke(p_sender uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple public.couples;
  v_couple_id uuid;
  v_recipient uuid;
  v_name text;
begin
  if p_kind not in ('miss', 'kakao', 'call') then
    raise exception 'invalid_kind';
  end if;

  -- app_name이 아니라 name이다. app_name은 앱 이름이라 알림에 쓰면
  -- "승민 ♥ 진선님이 보고 싶대요"가 된다 (profiles 위 주석 참고).
  select couple_id, name into v_couple_id, v_name
    from public.profiles where id = p_sender;

  if v_couple_id is null then
    raise exception 'no_couple';
  end if;

  -- 같은 사람이 같은 종류를 동시에 두 번 보내는 것만 직렬화한다.
  perform pg_advisory_xact_lock(hashtext(p_sender::text || ':' || p_kind));

  select * into v_couple from public.couples where id = v_couple_id;

  -- 커플의 두 자리 중 보낸 사람이 아닌 쪽. 아직 상대가 안 붙었으면 null이다.
  v_recipient := case when v_couple.user_a = p_sender
                      then v_couple.user_b
                      else v_couple.user_a end;

  if v_recipient is null then
    raise exception 'no_couple';
  end if;

  if not exists (
    select 1 from public.profiles where id = v_recipient and poke_opt_in
  ) then
    raise exception 'not_opted_in';
  end if;

  -- 같은 종류는 1초에 한 번. 실수로 두 번 눌린 것을 거르는 게 목적이라 창이
  -- 짧다 (하루 총량 제한은 두지 않는다).
  insert into public.pokes (couple_id, sender_id, recipient_id, kind)
  select v_couple_id, p_sender, v_recipient, p_kind
  where not exists (
    select 1 from public.pokes
    where sender_id = p_sender
      and kind = p_kind
      and created_at > now() - interval '1 second'
  );

  if not found then
    raise exception 'too_soon';
  end if;

  return jsonb_build_object(
    'recipient_id', v_recipient,
    'sender_name', v_name
  );
end;
$$;

-- 그대로 두면 로그인한 사용자가 supabase.rpc('send_poke', { p_sender: <남의 id> })
-- 로 남의 이름을 사칭해 알림을 보낼 수 있다.
--
-- **`from public`만으로는 안 막힌다.** Postgres 기본값인 PUBLIC 실행 권한 외에,
-- Supabase가 `alter default privileges in schema public grant execute on
-- functions to anon, authenticated, service_role`을 걸어두기 때문이다. 함수를
-- 만드는 순간 anon/authenticated에게 *명시적* grant가 따로 붙고, PUBLIC에서
-- revoke해도 그건 그대로 남는다. 실제로 `from public`만 썼을 때 anon 키로
-- 호출이 함수 본문까지 들어갔다 (배포 전 확인해서 잡았다).
--
-- 바꿀 때는 반드시 anon 키로 rpc를 직접 호출해 42501(permission denied)이
-- 나오는지 확인할 것. 권한이 남아 있으면 함수가 실행돼 다른 에러가 나온다.
revoke execute on function public.send_poke(uuid, text) from public, anon, authenticated;
grant execute on function public.send_poke(uuid, text) to service_role;

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
alter table public.pokes enable row level security;

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

-- pokes: 주고받은 기록은 둘 다 본다 (보낸 쪽은 보냈는지, 받는 쪽은 누가
-- 불렀는지). insert/update/delete 정책은 일부러 없다 — 위 send_poke 주석 참고.
create policy "pokes_select_couple"
  on public.pokes for select
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
