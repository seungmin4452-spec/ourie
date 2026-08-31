-- ============================================================
-- 소원권 장수 추가 요청 — 증분 스크립트
--
-- 지금까지는 총 장수를 늘리는 것도 줄이는 것과 똑같이 즉시 반영이었다
-- (setWishTotal이 곧바로 upsert). 이제는 **늘리는 쪽만** 상대방의 승인을
-- 거친다 — 소원권을 늘린다는 건 "앞으로 이만큼 더 부탁할 수 있다"는 약속이라,
-- 상대가 모르는 새 조용히 늘어나면 안 된다. 줄이는 쪽은 그대로 즉시 반영이다
-- (누가 자기 부담을 스스로 줄이는 것은 상대의 동의가 필요한 일이 아니다).
--
-- 순서대로 한 번에 실행한다. 여러 번 돌려도 안전하다.
-- 내용을 고칠 일이 생기면 schema.sql을 먼저 고치고 둘을 같이 반영한다.
--
-- 선행 조건: 2026-08-13-wish.sql이 이미 적용되어 있어야 한다.
-- ============================================================

-- 1. 요청 한 건이 한 row -----------------------------------------
create table if not exists public.wish_quota_requests (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  -- 승인되면 소원권이 늘어날 사람. 요청한 사람 자신일 수도("내 소원권 늘려줘"),
  -- 상대일 수도 있다("네 소원권 늘려줄게") — 어느 쪽이든 **요청하지 않은 다른
  -- 한 사람**이 승인한다 (resolve_wish_quota_request 참고).
  target_owner_id uuid not null references public.profiles (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- 대기 중인 요청은 사람당 하나뿐이다. 버튼을 연달아 눌러도 목록이 늘어나지
-- 않고, 화면도 이 인덱스를 보고 버튼을 미리 잠글 수 있다. 부분 유니크라
-- 승인/거절된 뒤에는 다시 걸리지 않는다.
create unique index if not exists wish_quota_requests_pending_target_idx
  on public.wish_quota_requests (couple_id, target_owner_id)
  where status = 'pending';

-- 목록은 최근 요청부터. 화면은 status = 'pending'인 것만 보여주지만(이미
-- 승인·거절된 항목은 감춘다), 인덱스는 couple_id 선두라 그 필터에도 그대로 쓰인다.
create index if not exists wish_quota_requests_couple_created_idx
  on public.wish_quota_requests (couple_id, created_at desc);

-- 2. 요청을 만든다 -------------------------------------------------
-- claim_region_badge와 같은 모양이다: 신원을 인자로 받지 않고 auth.uid()에서
-- 직접 읽으므로 남의 이름으로 요청을 만들 방법이 없고, 그래서 send_poke와
-- 달리 authenticated의 실행 권한을 회수하지 않는다.
create or replace function public.request_wish_quota_add(p_target_owner_id uuid)
returns public.wish_quota_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid := public.current_couple_id();
  v_uid uuid := auth.uid();
  v_row public.wish_quota_requests;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_couple_id is null then
    raise exception 'no_couple';
  end if;
  -- 대상이 정말 같은 커플 사람인지(나 또는 상대). 아니면 남의 커플에 요청을
  -- 꽂을 방법이 된다.
  if not exists (
    select 1 from public.profiles
    where id = p_target_owner_id and couple_id = v_couple_id
  ) then
    raise exception 'invalid_target';
  end if;

  insert into public.wish_quota_requests (couple_id, target_owner_id, requested_by)
  values (v_couple_id, p_target_owner_id, v_uid)
  returning * into v_row;

  return v_row;
exception
  -- wish_quota_requests_pending_target_idx가 막은 것. 대기 중인 요청이 이미
  -- 있다는 뜻이라, 화면이 알아들을 수 있는 이름으로 바꿔 던진다.
  when unique_violation then
    raise exception 'request_already_pending';
end;
$$;

-- 3. 요청에 응답한다 -----------------------------------------------
-- 승인/거절 둘 다 여기 하나로 처리한다 — 둘 다 "대기 중인 요청을 딱 한 번만
-- 상태를 바꾼다"는 같은 모양이라, 나누면 그 보장(하나만 유효한 응답)을 두 번
-- 지켜야 한다.
--
-- **요청한 사람은 자기 요청을 승인할 수 없다.** 그러면 승인이라는 절차가
-- 없는 것과 같아진다 (아래 where의 requested_by <> v_uid가 이걸 막는다).
--
-- 승인일 때만 set_config로 이번 트랜잭션에 표시를 남기고 wish_quotas를
-- 늘린다. 이 표시가 없으면 check_wish_total_increase_requires_approval이
-- 막는다 — 그 트리거가 지키는 게 정확히 "늘리는 건 이 함수를 거쳐야 한다"이다.
create or replace function public.resolve_wish_quota_request(
  p_request_id uuid,
  p_approve boolean
)
returns public.wish_quota_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_couple_id uuid := public.current_couple_id();
  v_row public.wish_quota_requests;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_row
    from public.wish_quota_requests
    where id = p_request_id
      and couple_id = v_couple_id
      and status = 'pending'
      and requested_by <> v_uid
    for update;

  if not found then
    raise exception 'invalid_request';
  end if;

  if p_approve then
    -- 이번 트랜잭션 동안만 켜진다(세 번째 인자 true = is_local). 커밋되면
    -- 저절로 꺼지므로 다음 update가 실수로 이 표시를 물려받을 일이 없다.
    perform set_config('wish.quota_request_approval', 'on', true);

    insert into public.wish_quotas (couple_id, owner_id, total, updated_by)
    values (v_row.couple_id, v_row.target_owner_id, public.wish_default_total() + 1, v_uid)
    on conflict (couple_id, owner_id) do update
      set total = public.wish_quotas.total + 1,
          updated_by = v_uid,
          updated_at = now();
  end if;

  update public.wish_quota_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        resolved_by = v_uid,
        resolved_at = now()
    where id = p_request_id
    returning * into v_row;

  return v_row;
end;
$$;

-- 4. 늘리는 건 위 함수를 거쳐야 한다 --------------------------------
-- 화면은 이제 "소원권 추가 요청" 버튼만 보여주고 총 장수를 직접 올리는
-- 길을 두지 않지만, 그건 안내일 뿐이다. wish_quotas의 update RLS는 여전히
-- 커플 범위 전체라(줄이는 쪽은 계속 직접 할 수 있어야 하므로), 실제 차단은
-- 여기서 한다 — resolve_wish_quota_request가 남긴 표시가 없는 늘림은 전부 막는다.
--
-- 줄이는 쪽(new.total <= 기준값)은 그대로 통과한다. 기준값은 기존 row가
-- 있으면 그 total, 새로 만드는 row라면 wish_default_total()이다 — INSERT를
-- 통해서도 이 검사를 우회할 수 없게 하려는 것이다(장수를 정한 적 없는
-- 사람의 row를 처음부터 기본값보다 높게 만들면 그것도 승인 없는 늘림이다).
create or replace function public.check_wish_total_increase_requires_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_baseline int;
begin
  v_baseline := case when tg_op = 'INSERT' then public.wish_default_total() else old.total end;

  if new.total > v_baseline
     and coalesce(current_setting('wish.quota_request_approval', true), '') <> 'on'
  then
    raise exception 'wish_increase_requires_request';
  end if;

  return new;
end;
$$;

drop trigger if exists wish_quotas_check_increase_approval on public.wish_quotas;
create trigger wish_quotas_check_increase_approval
  before insert or update on public.wish_quotas
  for each row
  execute function public.check_wish_total_increase_requires_approval();

-- 5. RLS -------------------------------------------------------------
alter table public.wish_quota_requests enable row level security;

-- 읽기는 둘 다 — 내가 만든 요청도, 상대가 만든 요청도 같은 목록에서 본다.
drop policy if exists "wish_quota_requests_select_couple" on public.wish_quota_requests;
create policy "wish_quota_requests_select_couple"
  on public.wish_quota_requests for select
  using (couple_id = public.current_couple_id());

-- 쓰기 정책이 없는 건 실수가 아니다(pokes와 같은 이유). insert/update는
-- 오직 request_wish_quota_add / resolve_wish_quota_request(둘 다 security
-- definer)만 한다 — 클라이언트가 직접 넣으면 "요청 없이 바로 승인" 같은
-- row를 만들어 위 트리거를 우회할 수 있다.
