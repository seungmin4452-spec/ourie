-- ============================================================
-- 소원권 — 증분 스크립트
--
-- 각자 몇 장을 들고 있고(wish_quotas), 그중 몇 장을 무엇에 썼는지(wishes).
-- 홈 위젯 "소원권"이 이 둘을 나란히 보여준다.
--
-- **남은 장수를 컬럼으로 들고 있지 않는 것이 이 설계의 전부다.**
-- 남은 장수 = 총 장수 - 쓴 소원 수. 세어서 구하면 어긋날 일이 없다. 카운터
-- 컬럼을 두면 소원을 지우거나 총 장수를 고칠 때마다 같이 맞춰야 하고, 한 번
-- 어긋나면 사용자는 그게 왜 3장인지 알 방법이 없다.
--
-- 순서대로 한 번에 실행한다. 여러 번 돌려도 안전하다.
-- 내용을 고칠 일이 생기면 schema.sql을 먼저 고치고 둘을 같이 반영한다.
--
-- 선행 조건: couples / profiles / current_couple_id()가 이미 있어야 한다.
-- ============================================================

-- 1. 기본 장수 ------------------------------------------------
-- 아직 장수를 정한 적 없는 커플이 몇 장으로 시작하는지. 함수로 두는 이유는
-- 이 숫자를 읽는 곳이 셋(컬럼 기본값, 아래 잔량 검사, 화면)이기 때문이다 —
-- 값을 여기 한 군데에만 적어두면 서로 어긋날 수가 없다.
-- 화면 쪽 짝은 src/features/wish/types.ts의 WISH_DEFAULT_TOTAL이다.
create or replace function public.wish_default_total()
returns int
language sql
immutable
as $$ select 5 $$;

-- 2. 누가 몇 장을 들고 있나 -----------------------------------
create table if not exists public.wish_quotas (
  couple_id uuid not null references public.couples (id) on delete cascade,
  -- 소원권을 **가진** 사람. 이 사람이 한 장을 써서 상대에게 소원을 말한다.
  owner_id uuid not null references public.profiles (id) on delete cascade,
  -- 0장도 정상이다 ("이번 달은 없음"). 위쪽은 위젯이 한눈에 읽을 수 있는 선.
  total int not null default public.wish_default_total() check (total between 0 and 99),
  -- 장수는 둘이 같이 정한다 (RLS 주석 참고). 누가 마지막으로 바꿨는지 남긴다.
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),

  -- 사람당 한 줄. 위젯은 커플의 두 줄을 통째로 읽는데, 선두 컬럼이 couple_id인
  -- 이 기본키 인덱스가 그대로 쓰이므로 조회용 인덱스를 따로 두지 않는다.
  primary key (couple_id, owner_id)
);

-- 3. 쓴 소원권 하나가 한 row ----------------------------------
create table if not exists public.wishes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  -- 쓴 사람 = 소원권을 가졌던 사람. wish_quotas.owner_id와 같은 뜻이다.
  owner_id uuid not null references public.profiles (id) on delete cascade,
  -- 무엇을 부탁했는지. 위젯이 아니라 다이얼로그 목록에 뜨므로 콕 찌르기
  -- 문구(20자)보다 길게 잡았지만, 한 줄로 읽히는 선에서 끊는다.
  content text not null check (char_length(btrim(content)) between 1 and 100),
  created_at timestamptz not null default now()
);

-- 목록은 최근에 쓴 것부터 본다.
create index if not exists wishes_couple_created_idx
  on public.wishes (couple_id, created_at desc);

-- 잔량 검사가 사람별로 세므로 그쪽도 인덱스를 탄다.
create index if not exists wishes_couple_owner_idx
  on public.wishes (couple_id, owner_id);

-- 4. 남은 장수를 넘겨 쓸 수 없다 ------------------------------
-- 화면도 남은 장수가 0이면 버튼을 잠그지만, 그건 안내다. 실제 차단은 여기서
-- 한다 — 두 기기에서 동시에 쓰면 화면의 잠금은 둘 다 통과한다.
--
-- security definer인 이유: 세는 일이 RLS에 가려지면 안 된다. 가려지면 쓴
-- 장수가 실제보다 적게 보여서 잔량 검사가 오히려 더 쓰게 허락해버린다.
create or replace function public.check_wish_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_used int;
begin
  -- 같은 사람이 마지막 한 장을 동시에 두 번 쓰는 경우를 직렬화한다. 이게
  -- 없으면 아래 count와 insert 사이에 다른 트랜잭션이 끼어들어 잔량이 음수가
  -- 된다 (send_poke의 연타 방지와 같은 장치다).
  perform pg_advisory_xact_lock(hashtext('wish:' || new.owner_id::text));

  select total into v_total
    from public.wish_quotas
    where couple_id = new.couple_id and owner_id = new.owner_id;

  -- 아직 장수를 정한 적이 없으면 기본값으로 본다. 소원권을 쓰려고 설정부터
  -- 하게 만들 이유가 없다.
  v_total := coalesce(v_total, public.wish_default_total());

  select count(*) into v_used
    from public.wishes
    where couple_id = new.couple_id and owner_id = new.owner_id;

  if v_used >= v_total then
    raise exception 'no_wish_left';
  end if;

  return new;
end;
$$;

drop trigger if exists wishes_check_quota on public.wishes;
create trigger wishes_check_quota
  before insert on public.wishes
  for each row
  execute function public.check_wish_quota();

-- 5. 이미 쓴 것보다 적게 줄일 수 없다 -------------------------
-- 5장 중 3장을 쓴 사람의 총 장수를 2장으로 내리면 "남은 -1장"이 된다. 줄이고
-- 싶으면 쓴 소원을 먼저 지우라는 뜻으로 여기서 끊는다.
create or replace function public.check_wish_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used int;
begin
  select count(*) into v_used
    from public.wishes
    where couple_id = new.couple_id and owner_id = new.owner_id;

  if new.total < v_used then
    raise exception 'wish_total_below_used';
  end if;

  return new;
end;
$$;

drop trigger if exists wish_quotas_check_total on public.wish_quotas;
create trigger wish_quotas_check_total
  before insert or update on public.wish_quotas
  for each row
  execute function public.check_wish_total();

-- 6. RLS ------------------------------------------------------
alter table public.wish_quotas enable row level security;
alter table public.wishes enable row level security;

-- wish_quotas: 장수는 둘이 같이 정하는 약속이라 커플 범위다. 내 장수를 나만
-- 정할 수 있으면 그건 약속이 아니라 자기 신고가 된다.
-- delete 정책이 없는 것은 의도다 — 없애고 싶으면 0장으로 두면 되고, 줄을
-- 지우면 다음에 읽을 때 조용히 기본값(5장)으로 되살아난다.
drop policy if exists "wish_quotas_select_couple" on public.wish_quotas;
create policy "wish_quotas_select_couple"
  on public.wish_quotas for select
  using (couple_id = public.current_couple_id());

drop policy if exists "wish_quotas_insert_couple" on public.wish_quotas;
create policy "wish_quotas_insert_couple"
  on public.wish_quotas for insert
  with check (couple_id = public.current_couple_id());

drop policy if exists "wish_quotas_update_couple" on public.wish_quotas;
create policy "wish_quotas_update_couple"
  on public.wish_quotas for update
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

-- wishes: 읽기는 둘 다. 상대가 무엇을 바랐는지 보여야 소원권이 의미가 있다.
drop policy if exists "wishes_select_couple" on public.wishes;
create policy "wishes_select_couple"
  on public.wishes for select
  using (couple_id = public.current_couple_id());

-- 쓰기는 여기서만 커플 범위보다 좁다. 지도나 콕 찌르기 버튼과 달리 소원권은
-- **내 것을 내가 쓰는** 것이라, 상대가 내 이름으로 한 장을 쓰거나 내가 말한
-- 소원을 고치고 지울 수 있으면 안 된다.
drop policy if exists "wishes_insert_own" on public.wishes;
create policy "wishes_insert_own"
  on public.wishes for insert
  with check (couple_id = public.current_couple_id() and owner_id = auth.uid());

drop policy if exists "wishes_update_own" on public.wishes;
create policy "wishes_update_own"
  on public.wishes for update
  using (owner_id = auth.uid())
  with check (couple_id = public.current_couple_id() and owner_id = auth.uid());

-- 지우면 그 한 장이 되돌아온다 (남은 장수를 세어서 구하므로 자동이다).
drop policy if exists "wishes_delete_own" on public.wishes;
create policy "wishes_delete_own"
  on public.wishes for delete
  using (owner_id = auth.uid());
