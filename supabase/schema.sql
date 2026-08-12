-- ============================================================
-- Ourie — Supabase database schema
-- Tables: profiles, couples, anniversaries, memories, photos,
--         travel_places, travel_visits, travel_maps,
--         travel_region_photos, themes
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
--
-- 소셜 가입(구글·카카오)에서는 같은 자리를 제공자가 채우는데 키 이름이
-- 제각각이라 아래처럼 coalesce로 받는다. 이름이 비면 상대방이 받는 콕 찌르기
-- 알림이 "상대방이 보고 싶대요"로 나간다 (send_poke의 sender_name).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    -- 순서가 곧 우선순위다. 'name'이 맨 앞인 이유는 이메일 가입에서 우리가 직접
    -- 넣는 키가 그것이고, 사람이 적어 넣은 이름이 제공자가 준 것보다 먼저여야
    -- 하기 때문이다. 공백만 넣은 경우까지 null로 떨어뜨린다 — "이름 없음"의
    -- 표현이 하나여야 화면에서 분기가 갈라지지 않는다.
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'preferred_username'), '')
    ),
    -- 소셜 프로필 사진. 온보딩 "꾸미기"에서 바꿀 수 있지만 기본값이 있는 편이
    -- 첫 화면이 덜 비어 보인다. 이메일 가입이면 둘 다 없어서 그냥 null이다.
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'picture'), '')
    )
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
  -- 홈 위젯이 크게 보여줄 기념일. 커플당 최대 하나이며, 고르는 일은
  -- set_primary_anniversary가 한 문장으로 처리한다 (아래 그 함수 주석 참고).
  -- 하나도 켜지 않은 커플이 정상 상태다 — 그때는 화면이 가장 가까운 기념일로
  -- 떨어진다 (src/features/anniversary/dday.ts의 pickHighlight).
  is_primary boolean not null default false,
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
-- travel_visits (스크래치 지도)
--
-- 홈 위젯 "우리가 다녀온 곳"이 칠하는 시군구 목록. 한 row가 "이 커플은 이
-- 지역을 밟았다"는 사실 하나다.
--
-- 위의 travel_places(위·경도 핀)와 별개인 이유: 스크래치가 묻는 것은 "어디에
-- 점을 찍었나"가 아니라 "이 지역을 밟았나"다. 좌표를 저장해두고 매번 구역을
-- 역산하면, 경계에 걸친 지점 하나 때문에 칠해진 지역이 달라질 수 있다.
-- ------------------------------------------------------------
create table public.travel_visits (
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

  -- 한 커플이 같은 시도를 두 번 칠할 수는 없다. 이게 곧 "긁힘" 여부라서
  -- 별도 id 없이 이 짝이 기본키다 — 켜고 끄는 것이 insert/delete가 된다.
  -- 위젯은 커플의 칠해진 지역을 통째로 읽는데, 선두 컬럼이 couple_id인
  -- 이 기본키 인덱스가 그대로 쓰이므로 조회용 인덱스를 따로 두지 않는다.
  primary key (couple_id, region_code)
);

-- ------------------------------------------------------------
-- travel_maps (스크래치 지도 밑에 깔리는 사진)
--
-- 커플당 한 장. 둘이 같은 지도를 보는 것이 이 기능의 전부라서 1:1이다.
-- photo_path는 travel-maps 버킷 안의 경로이고 공개 URL이 아니다 (맨 아래
-- Storage 절 참고).
-- ------------------------------------------------------------
create table public.travel_maps (
  couple_id uuid primary key references public.couples (id) on delete cascade,
  photo_path text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- travel_region_photos (사진으로 채우는 지도)
--
-- 홈 위젯 "사진으로 채우는 지도"가 지역마다 거는 사진. 스크래치 지도의 다른
-- 판이다 — 그쪽은 사진 한 장을 지도 전체에 깔고 다녀온 곳을 긁어 그 조각을
-- 드러내지만, 이쪽은 시군구마다 한 장씩 걸어 전국을 채운다.
--
-- travel_maps에 컬럼을 붙이지 않는 이유: 그건 커플당 한 줄(1:1)이고 이건
-- 커플 × 지역이다. travel_visits와 잇지 않는 이유: "사진을 걸었다"와
-- "다녀왔다"는 사용자가 따로 하는 말이라, 사진을 빼는 것이 다녀온 기록까지
-- 지우면 그건 시키지 않은 일이다.
-- ------------------------------------------------------------
create table public.travel_region_photos (
  couple_id uuid not null references public.couples (id) on delete cascade,
  -- 행정안전부 시군구 코드 다섯 자리. travel_visits.region_code와 같은 값
  -- 체계이고, 허용 목록 대신 형식만 보는 이유도 같다 (위 주석 참고).
  region_code text not null check (region_code ~ '^[0-9]{5}$'),
  -- travel-maps 버킷 안의 경로. 배경 사진과 같은 버킷을 쓰되 경로로 가른다 —
  -- 배경은 `{couple_id}/map-*.jpg`, 이쪽은 `{couple_id}/regions/{코드}-*.jpg`.
  -- 둘 다 커플 사진 원본이라 성격이 같고, `{couple_id}/...` 하나로 걸린
  -- Storage 정책(맨 아래)이 그대로 맞는다.
  photo_path text not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),

  -- 한 지역에 한 장. 새로 올리면 갈아 끼우는 것이지 쌓이는 게 아니다.
  -- 위젯은 커플의 사진을 통째로 읽는데, 선두 컬럼이 couple_id인 이 기본키
  -- 인덱스가 그대로 쓰이므로 조회용 인덱스를 따로 두지 않는다.
  primary key (couple_id, region_code)
);

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
-- poke_presets (커플이 직접 만든 콕 찌르기 버튼)
--
-- 기본으로 주는 세 개(miss/kakao/call) 말고 커플이 아이콘·제목·알림 내용을
-- 적어 늘리는 버튼들. 한 row가 위젯의 버튼 하나다.
--
-- 이걸 기기(localStorage)가 아니라 DB에 두는 이유는 알림 문구를 **서버가**
-- 알아야 하기 때문이다. 무엇보다 클라이언트가 보낸 문구를 그대로 믿으면 누구든
-- 아무 말이나 상대방 잠금화면에 띄울 수 있다 — 그래서 send_poke가 여기서 읽은
-- 값만 쓴다. 커플 단위인 것도 같은 맥락이다: 둘이 같은 버튼을 본다.
-- ------------------------------------------------------------
create table public.poke_presets (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  -- 아이콘 이름. 허용 목록을 check로 박지 않는 이유는 아이콘을 하나 더할 때마다
  -- 마이그레이션을 돌려야 하기 때문이다. 대신 화면이 모르는 이름을 만나면
  -- 기본 아이콘으로 떨어진다 (src/features/poke/icons.tsx).
  icon text not null check (char_length(icon) between 1 and 40),
  -- 위젯 버튼에 적히고 알림 제목에도 쓰이는 말. 잠금화면에서 잘리지 않을 길이.
  label text not null check (char_length(btrim(label)) between 1 and 20),
  -- 알림 본문.
  body text not null check (char_length(btrim(body)) between 1 and 80),
  created_at timestamptz not null default now()
);

-- 위젯이 커플의 버튼을 만든 순서대로 읽는다.
create index poke_presets_couple_created_idx
  on public.poke_presets (couple_id, created_at);

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
  -- 기본으로 주는 것들(src/features/poke/message.ts의 POKE_KINDS와 같아야
  -- 한다)과, 커플이 만든 버튼을 가리키는 'custom'. text + check인 이유는
  -- enum이면 종류를 늘릴 때마다 타입 변경 마이그레이션이 필요하기 때문이다.
  kind text not null check (kind in ('miss', 'kakao', 'call', 'doing', 'custom')),
  -- 커플이 만든 버튼이었다면 어떤 것이었는지. 버튼을 지우면 그 기록도 같이
  -- 사라진다 — 문구를 잃은 기록은 나중에 뭘 보여줄 수도 없다.
  preset_id uuid references public.poke_presets (id) on delete cascade,
  created_at timestamptz not null default now(),

  -- 'custom'이면 어떤 버튼이었는지가 반드시 있어야 하고, 반대로 기본 버튼은
  -- preset_id를 가질 수 없다. 이 짝이 어긋나면 알림 문구를 만들 수가 없다.
  constraint pokes_preset_matches_kind
    check ((kind = 'custom') = (preset_id is not null))
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
create or replace function public.send_poke(
  p_sender uuid,
  p_kind text,
  p_preset uuid default null
)
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
  v_kind text;
  v_preset public.poke_presets;
begin
  -- app_name이 아니라 name이다. app_name은 앱 이름이라 알림에 쓰면
  -- "승민 ♥ 진선님이 보고 싶대요"가 된다 (profiles 위 주석 참고).
  select couple_id, name into v_couple_id, v_name
    from public.profiles where id = p_sender;

  if v_couple_id is null then
    raise exception 'no_couple';
  end if;

  if p_preset is null then
    if p_kind not in ('miss', 'kakao', 'call', 'doing') then
      raise exception 'invalid_kind';
    end if;
    v_kind := p_kind;
  else
    -- 커플이 만든 버튼인지 여기서 확인한다. 남의 커플 버튼 id를 넣어도 걸린다.
    -- 문구를 호출자에게서 받지 않고 이 조회 결과만 쓰는 것이 핵심이다 — 받으면
    -- 아무 말이나 상대방 잠금화면에 띄울 수 있다.
    select * into v_preset
      from public.poke_presets
      where id = p_preset and couple_id = v_couple_id;

    if not found then
      raise exception 'invalid_kind';
    end if;

    v_kind := 'custom';
  end if;

  -- 같은 사람이 같은 버튼을 동시에 두 번 누르는 것만 직렬화한다. 기본 버튼은
  -- 종류로, 커플이 만든 버튼은 그 id로 구분한다.
  perform pg_advisory_xact_lock(
    hashtext(p_sender::text || ':' || coalesce(p_preset::text, v_kind))
  );

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

  -- 같은 버튼은 1초에 한 번. 실수로 두 번 눌린 것을 거르는 게 목적이라 창이
  -- 짧다 (하루 총량 제한은 두지 않는다).
  insert into public.pokes (couple_id, sender_id, recipient_id, kind, preset_id)
  select v_couple_id, p_sender, v_recipient, v_kind, p_preset
  where not exists (
    select 1 from public.pokes
    where sender_id = p_sender
      and kind = v_kind
      -- 커플이 만든 버튼끼리는 서로의 쿨다운에 걸리지 않아야 한다.
      and preset_id is not distinct from p_preset
      and created_at > now() - interval '1 second'
  );

  if not found then
    raise exception 'too_soon';
  end if;

  -- preset_label / preset_body는 기본 버튼일 때 null이다 (v_preset이 비어 있다).
  -- 그때의 문구는 코드가 들고 있다 (src/features/poke/message.ts).
  return jsonb_build_object(
    'recipient_id', v_recipient,
    'sender_name', v_name,
    'preset_label', v_preset.label,
    'preset_body', v_preset.body
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
revoke execute on function public.send_poke(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.send_poke(uuid, text, uuid) to service_role;

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
alter table public.travel_visits enable row level security;
alter table public.travel_maps enable row level security;
alter table public.travel_region_photos enable row level security;
alter table public.themes enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.poke_presets enable row level security;
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

-- ------------------------------------------------------------
-- set_primary_anniversary: 홈 위젯에 크게 뜰 기념일 하나를 고른다.
--
-- **한 문장인 것이 핵심이다.** "전부 끄고 → 하나를 켠다"로 나누면 그 사이에
-- 메인이 없는 순간이 생기고, 두 번째가 실패하면 커플의 홈이 조용히 다른
-- 기념일로 바뀐 채 남는다. `set is_primary = (id = p_id)`는 한 번의 스캔으로
-- 고른 것만 켜고 나머지를 끈다.
--
-- 부분 유니크 인덱스(`unique (couple_id) where is_primary`)로 강제하지 않는
-- 이유: 유니크 검사는 한 문장 안에서도 행 단위로 일어나서, 옛 메인 행보다 새
-- 메인 행이 먼저 갱신되면 잠깐 둘이 되어 위반으로 죽는다. 불변식은 이 함수가
-- 지킨다.
--
-- send_poke와 달리 authenticated의 실행 권한을 회수하지 않는다. 이 함수는
-- 신원을 인자로 받지 않고 auth.uid()에서 직접 읽으므로(current_couple_id),
-- 남의 커플을 건드릴 방법이 없다.
-- ------------------------------------------------------------
create or replace function public.set_primary_anniversary(p_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_couple_id uuid;
begin
  v_couple_id := public.current_couple_id();
  if v_couple_id is null then
    raise exception 'no_couple';
  end if;

  -- 남의 커플 기념일 id를 넣었을 때 우리 커플 것을 전부 꺼버리지 않도록 먼저
  -- 확인한다. RLS가 update를 막아주긴 하지만, 그 경우 "아무 일도 안 일어남"이
  -- 아니라 "메인만 사라짐"이 되기 때문에 여기서 끊는다.
  if not exists (
    select 1 from public.anniversaries where id = p_id and couple_id = v_couple_id
  ) then
    raise exception 'not_found';
  end if;

  update public.anniversaries
     set is_primary = (id = p_id)
   where couple_id = v_couple_id;
end;
$$;

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

-- travel_visits: couple-scoped
-- delete가 "내가 칠한 것만"이 아닌 이유는 poke_presets와 같다 — 둘이 함께
-- 채우는 지도라, 잘못 누른 것을 상대가 없을 때 되돌릴 방법이 있어야 한다.
create policy "travel_visits_select_couple"
  on public.travel_visits for select
  using (couple_id = public.current_couple_id());

create policy "travel_visits_insert_couple"
  on public.travel_visits for insert
  with check (couple_id = public.current_couple_id());

create policy "travel_visits_update_couple"
  on public.travel_visits for update
  using (couple_id = public.current_couple_id());

create policy "travel_visits_delete_couple"
  on public.travel_visits for delete
  using (couple_id = public.current_couple_id());

-- travel_maps: couple-scoped
create policy "travel_maps_select_couple"
  on public.travel_maps for select
  using (couple_id = public.current_couple_id());

create policy "travel_maps_insert_couple"
  on public.travel_maps for insert
  with check (couple_id = public.current_couple_id());

create policy "travel_maps_update_couple"
  on public.travel_maps for update
  using (couple_id = public.current_couple_id());

create policy "travel_maps_delete_couple"
  on public.travel_maps for delete
  using (couple_id = public.current_couple_id());

-- travel_region_photos: couple-scoped
create policy "travel_region_photos_select_couple"
  on public.travel_region_photos for select
  using (couple_id = public.current_couple_id());

create policy "travel_region_photos_insert_couple"
  on public.travel_region_photos for insert
  with check (couple_id = public.current_couple_id());

create policy "travel_region_photos_update_couple"
  on public.travel_region_photos for update
  using (couple_id = public.current_couple_id());

-- 상대가 건 사진도 뺄 수 있다. 둘이 함께 채우는 지도라 "내가 올린 것만"으로
-- 좁히면 잘못 올린 사진을 상대가 없을 때 되돌릴 방법이 없어진다.
create policy "travel_region_photos_delete_couple"
  on public.travel_region_photos for delete
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

-- poke_presets: 커플이 함께 쓰는 버튼 목록이라 커플 범위다. 상대가 만든 버튼도
-- 지울 수 있다 — "내가 만든 것만"으로 좁히면 상대가 없을 때 정리할 방법이 없다.
create policy "poke_presets_select_couple"
  on public.poke_presets for select
  using (couple_id = public.current_couple_id());

create policy "poke_presets_insert_couple"
  on public.poke_presets for insert
  with check (couple_id = public.current_couple_id());

create policy "poke_presets_update_couple"
  on public.poke_presets for update
  using (couple_id = public.current_couple_id());

create policy "poke_presets_delete_couple"
  on public.poke_presets for delete
  using (couple_id = public.current_couple_id());

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

-- ============================================================
-- Storage: 지도 사진
--
-- 위와 달리 **비공개 버킷**이다. 아바타는 상대에게 보여주려고 올리는 작은
-- 썸네일이지만, 이건 "둘만의 공간"(docs/PRD.md §1)의 핵심인 커플 사진
-- 원본이다. URL만 알면 누구나 열 수 있는 자리에 둘 이유가 없다.
-- 클라이언트는 createSignedUrl(s)로 읽는다.
--
-- 두 지도 위젯이 한 버킷을 경로로 나눠 쓴다:
--   {couple_id}/map-*.jpg              스크래치 지도 배경 (travel_maps)
--   {couple_id}/regions/{코드}-*.jpg   지역별 사진 (travel_region_photos)
--
-- 객체는 어느 쪽이든 `{couple_id}/...`에 쌓인다. 커플 두 사람 모두 읽고 바꿀
-- 수 있어야 하므로 auth.uid()가 아니라 current_couple_id()로 잠그고, 정책이
-- 첫 칸만 보므로 하위 폴더가 늘어도 그대로 맞는다.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('travel-maps', 'travel-maps', false)
on conflict (id) do nothing;

create policy "travel_maps_couple_read"
  on storage.objects for select
  using (
    bucket_id = 'travel-maps'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );

create policy "travel_maps_couple_write"
  on storage.objects for insert
  with check (
    bucket_id = 'travel-maps'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );

create policy "travel_maps_couple_update"
  on storage.objects for update
  using (
    bucket_id = 'travel-maps'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );

create policy "travel_maps_couple_delete"
  on storage.objects for delete
  using (
    bucket_id = 'travel-maps'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );

-- ============================================================
-- 매일 디데이 알림을 깨우는 스케줄
--
-- 발송 자체는 api/notify-dday.ts가 한다. 여기서 하는 일은 "매일 KST 오전 8시에
-- 그 엔드포인트를 부른다"뿐이다 (web-push의 VAPID 서명은 Postgres에서 할 수
-- 있는 일이 아니다).
--
-- Vercel Cron이 아니라 pg_cron인 이유: Vercel의 cron은 현재 프로덕션 배포에
-- 묶여서, 발동 구간에 새 배포가 올라가면 그날 몫이 유실된다. Hobby 플랜은
-- 실행 시각 정밀도도 ±59분이다. 자세한 경위는
-- supabase/migrations/2026-08-12-notify-cron.sql 참고.
--
-- **선행 조건**: Vault에 'cron_secret'이 들어 있어야 한다. 비밀값이라 이 파일에
-- 담지 않는다 — 위 마이그레이션 파일 머리말의 vault.create_secret 참고.
-- ============================================================

-- 확장은 Dashboard → Database → Extensions에서 켜는 쪽이 안전하다. 그리고
-- cron 스키마에 grant를 직접 하지 않는다 — Supabase의 after-create 스크립트가
-- 권한을 이미 세팅하고, 거기에 `grant all ... to postgres`를 덧대면 그 스크립트의
-- `revoke all on table cron.job from postgres`가 다음번에 죽는다. 자세한 건
-- supabase/migrations/2026-08-12-notify-cron.sql 참고.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 스케줄은 UTC다. KST 08:00 = 전날 UTC 23:00 (날짜가 밀린 게 아니라 맞다 —
-- 함수의 todayKey()가 +9시간 해서 읽으므로 KST 달력의 오늘이 나온다).
select cron.schedule(
  'notify-dday',
  '0 23 * * *',
  $$
  select net.http_get(
    url := 'https://ourie.vercel.app/api/notify-dday',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'
      )
    ),
    timeout_milliseconds := 60000
  );
  $$
);
