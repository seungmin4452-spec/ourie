-- ============================================================
-- 재활운동 — 증분 스크립트
--
-- 홈 위젯 "재활운동을 하자!". 운동 시작/종료를 누르면 상대방에게 알림이 가고,
-- 하루에 시작과 종료를 둘 다 누르면 그날이 1회로 센다. 30일을 하루도 빠짐없이
-- 채우면 그 사람의 소원권이 한 장 늘고, 카운트는 0부터 다시 시작한다. 하루라도
-- 빠지면 그때까지 쌓인 연속 기록은 사라진다.
--
-- 시작/종료를 깜빡 안 누른 날은 관리자 화면에서 "했다"고 인정해 줄 수 있다
-- (admin_confirmed_at).
--
-- **연속 일수를 컬럼으로 들고 있지 않는다.** wish_quotas가 남은 장수를 세어서
-- 구하는 것과 같은 철학이다 — 관리자가 지난 날짜를 인정해 끊긴 기록을 이어도,
-- 세어서 구하므로 따로 맞출 카운터가 없다 (exercise_streak()).
--
-- 순서대로 한 번에 실행한다. 여러 번 돌려도 안전하다.
-- 내용을 고칠 일이 생기면 schema.sql을 먼저 고치고 둘을 같이 반영한다.
--
-- 선행 조건: couples / profiles / current_couple_id() / set_updated_at() /
-- wish_quotas / wish_default_total()가 이미 있어야 한다.
-- ============================================================

-- 1. 운동 기록 — 사람 × 날짜(KST)당 한 줄 ------------------------
-- 기본키가 couple_id를 포함하지 않는 이유: 연속 기록은 "사람"의 것이다.
-- couple_id는 RLS(상대방도 보이게)와 소원권을 어느 커플에 늘릴지에만 쓴다.
create table if not exists public.exercise_logs (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  -- 운동을 **시작한** 날(KST). 23:50에 시작해 00:20에 끝내도 시작한 날의
  -- 기록이다 (finish_exercise 참고).
  exercise_date date not null,
  couple_id uuid not null references public.couples (id) on delete cascade,
  started_at timestamptz,
  ended_at timestamptz,
  -- 관리자가 "이날은 했다"고 인정한 시각. 있으면 시작/종료와 상관없이 완료다.
  admin_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (owner_id, exercise_date),
  -- 시작 없이 끝날 수는 없다.
  constraint exercise_logs_end_after_start check (ended_at is null or started_at is not null)
);

create index if not exists exercise_logs_couple_date_idx
  on public.exercise_logs (couple_id, exercise_date desc);

drop trigger if exists exercise_logs_set_updated_at on public.exercise_logs;
create trigger exercise_logs_set_updated_at
  before update on public.exercise_logs
  for each row
  execute function public.set_updated_at();

-- 2. 30일 달성 기록 — 소원권을 한 장 줄 때마다 한 줄 ---------------
-- reward_date는 30일째 되는 날이다. 연속 일수는 "가장 최근 reward_date
-- 다음 날부터" 센다 — 그래서 소원권을 받으면 카운트가 0으로 돌아가고, 같은
-- 30일로 소원권을 두 번 받는 일도 없다.
create table if not exists public.exercise_rewards (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  reward_date date not null,
  couple_id uuid not null references public.couples (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (owner_id, reward_date)
);

-- 3. 하루가 "완료"인지 — 정의는 여기 한 군데에만 둔다 --------------
create or replace function public.exercise_day_done(p_owner_id uuid, p_date date)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.exercise_logs
    where owner_id = p_owner_id
      and exercise_date = p_date
      and (
        (started_at is not null and ended_at is not null)
        or admin_confirmed_at is not null
      )
  )
$$;

-- 4. 지금의 연속 일수 -------------------------------------------
-- 오늘을 이미 했으면 오늘부터, 아직이면 어제부터 거꾸로 센다 — 오늘은 아직
-- 끝나지 않았으니 "오늘 안 했음"이 기록을 끊지 않는다. 어제를 빠뜨렸으면 0이다.
-- 가장 최근 소원권을 받은 날(last_reward_date)에서 멈춘다.
--
-- security invoker다: 화면에서 부르면 RLS(같은 커플만)가 그대로 걸리고,
-- 아래 security definer 함수들 안에서 부르면 전부 보인다.
create or replace function public.exercise_streak(p_owner_id uuid)
returns table (streak int, run_start date, last_reward_date date, rewards int)
language plpgsql
stable
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_last date;
  v_rewards int;
  v_day date;
  v_count int := 0;
begin
  select max(r.reward_date), count(*)::int
    into v_last, v_rewards
    from public.exercise_rewards r
    where r.owner_id = p_owner_id;

  v_day := case
    when public.exercise_day_done(p_owner_id, v_today) then v_today
    else v_today - 1
  end;

  while (v_last is null or v_day > v_last)
        and public.exercise_day_done(p_owner_id, v_day) loop
    v_count := v_count + 1;
    v_day := v_day - 1;
  end loop;

  return query select v_count, v_day + 1, v_last, v_rewards;
end;
$$;

-- 5. 30일을 채웠으면 소원권을 준다 ---------------------------------
-- 운동 종료와 관리자 인정 둘 다 끝에 이걸 부른다. 몇 번을 불러도 안전하다
-- — 이미 준 30일은 exercise_streak가 세지 않는다.
--
-- 소원권을 늘리는 길은 원래 resolve_wish_quota_request 하나뿐이다
-- (check_wish_total_increase_requires_approval). 이 보상은 상대방 승인 없이
-- 늘어나야 하므로 같은 표시를 이 트랜잭션 동안만 켠다 — 이 함수는 클라이언트가
-- 직접 부를 수 없으니(아래 revoke) 그 표시를 아무나 켜는 길이 되지는 않는다.
--
-- 소원권이 이미 최대(99장)면 장수는 그대로 두고 달성 기록만 남긴다 — 그것
-- 때문에 운동 종료가 실패하면 안 된다.
create or replace function public.settle_exercise_rewards(p_owner_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
  v_streak int;
  v_run_start date;
  v_granted int := 0;
begin
  -- 종료와 관리자 인정이 동시에 들어와 같은 30일로 두 번 주는 일을 막는다.
  perform pg_advisory_xact_lock(hashtext('exercise:' || p_owner_id::text));

  select couple_id into v_couple_id from public.profiles where id = p_owner_id;
  if v_couple_id is null then
    return 0;
  end if;

  loop
    select s.streak, s.run_start into v_streak, v_run_start
      from public.exercise_streak(p_owner_id) s;
    exit when v_streak < 30;

    insert into public.exercise_rewards (owner_id, reward_date, couple_id)
    values (p_owner_id, v_run_start + 29, v_couple_id);

    perform set_config('wish.quota_request_approval', 'on', true);
    insert into public.wish_quotas (couple_id, owner_id, total, updated_by)
    values (v_couple_id, p_owner_id, least(public.wish_default_total() + 1, 99), null)
    on conflict (couple_id, owner_id) do update
      set total = least(public.wish_quotas.total + 1, 99),
          updated_at = now();
    perform set_config('wish.quota_request_approval', '', true);

    v_granted := v_granted + 1;
  end loop;

  return v_granted;
end;
$$;

-- 6. 운동 시작 ---------------------------------------------------
-- 신원을 인자로 받지 않고 auth.uid()에서 읽는다 (request_wish_quota_add와
-- 같은 모양) — 남의 이름으로 시작할 방법이 없다.
-- 오늘 이미 시작했으면 처음 시작한 시각을 그대로 둔다.
create or replace function public.start_exercise()
returns public.exercise_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_couple_id uuid := public.current_couple_id();
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_row public.exercise_logs;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_couple_id is null then
    raise exception 'no_couple';
  end if;

  insert into public.exercise_logs (owner_id, exercise_date, couple_id, started_at)
  values (v_uid, v_today, v_couple_id, now())
  on conflict (owner_id, exercise_date) do update
    set started_at = coalesce(public.exercise_logs.started_at, excluded.started_at),
        couple_id = excluded.couple_id
  returning * into v_row;

  return v_row;
end;
$$;

-- 7. 운동 종료 ---------------------------------------------------
-- 끝나지 않은 가장 최근 운동을 끝낸다. 어제 밤에 시작해 자정을 넘겨 끝내는
-- 경우를 위해 어제 것까지 본다 — 그 기록은 어제의 1회가 된다.
-- 끝낸 뒤 30일을 채웠는지 보고, 몇 장을 줬는지 함께 돌려준다.
create or replace function public.finish_exercise()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_date date;
  v_rewarded int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select l.exercise_date into v_date
    from public.exercise_logs l
    where l.owner_id = v_uid
      and l.exercise_date >= v_today - 1
      and l.started_at is not null
      and l.ended_at is null
    order by l.exercise_date desc
    limit 1
    for update;

  if v_date is null then
    raise exception 'exercise_not_started';
  end if;

  update public.exercise_logs
    set ended_at = now()
    where owner_id = v_uid and exercise_date = v_date;

  v_rewarded := public.settle_exercise_rewards(v_uid);

  return jsonb_build_object('exerciseDate', v_date, 'rewarded', v_rewarded);
end;
$$;

-- 8. 위젯이 보는 것 — 커플 두 사람의 오늘 상태와 연속 일수 -----------
-- "지금 진행 중인 운동"은 오늘 기록이 있으면 그것, 없으면 어제 시작해서 아직
-- 안 끝낸 것이다 (finish_exercise와 같은 기준).
create or replace function public.exercise_board()
returns table (
  owner_id uuid,
  session_date date,
  started_at timestamptz,
  ended_at timestamptz,
  today_done boolean,
  streak int,
  rewards int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    l.exercise_date,
    l.started_at,
    l.ended_at,
    public.exercise_day_done(p.id, (now() at time zone 'Asia/Seoul')::date),
    s.streak,
    s.rewards
  from public.profiles p
  cross join lateral public.exercise_streak(p.id) s
  left join lateral (
    select e.exercise_date, e.started_at, e.ended_at
    from public.exercise_logs e
    where e.owner_id = p.id
      and (
        e.exercise_date = (now() at time zone 'Asia/Seoul')::date
        or (
          e.exercise_date = (now() at time zone 'Asia/Seoul')::date - 1
          and e.started_at is not null
          and e.ended_at is null
        )
      )
    order by e.exercise_date desc
    limit 1
  ) l on true
  where p.couple_id = public.current_couple_id()
$$;

-- 9. 관리자 인정 / 인정 취소 ---------------------------------------
-- 서버(api/admin/_exercise.ts, service role)만 부른다.
-- 인정을 취소해도 그 사이 이미 준 소원권은 되돌리지 않는다 — 이미 썼을 수도
-- 있는 소원권을 조용히 빼앗으면 안 된다.
create or replace function public.admin_confirm_exercise(
  p_owner_id uuid,
  p_date date,
  p_confirm boolean
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
begin
  if p_date > (now() at time zone 'Asia/Seoul')::date then
    raise exception 'future_date';
  end if;

  if not p_confirm then
    update public.exercise_logs
      set admin_confirmed_at = null
      where owner_id = p_owner_id and exercise_date = p_date;
    -- 인정만 있던 빈 줄은 지운다 — 시작 기록이 있으면 남긴다.
    delete from public.exercise_logs
      where owner_id = p_owner_id
        and exercise_date = p_date
        and started_at is null
        and admin_confirmed_at is null;
    return 0;
  end if;

  select couple_id into v_couple_id from public.profiles where id = p_owner_id;
  if v_couple_id is null then
    raise exception 'no_couple';
  end if;

  insert into public.exercise_logs (owner_id, exercise_date, couple_id, admin_confirmed_at)
  values (p_owner_id, p_date, v_couple_id, now())
  on conflict (owner_id, exercise_date) do update
    set admin_confirmed_at = coalesce(public.exercise_logs.admin_confirmed_at, now());

  return public.settle_exercise_rewards(p_owner_id);
end;
$$;

-- 10. 실행 권한 ---------------------------------------------------
-- settle_exercise_rewards / admin_confirm_exercise는 신원을 인자로 받으므로
-- 클라이언트가 부르면 남의 기록을 고치거나 소원권을 늘릴 수 있다. send_poke와
-- 같은 이유로 anon/authenticated까지 명시적으로 빼앗는다 (schema.sql의
-- send_poke 주석 참고 — `from public`만으로는 안 막힌다).
revoke execute on function public.settle_exercise_rewards(uuid) from public, anon, authenticated;
grant execute on function public.settle_exercise_rewards(uuid) to service_role;

revoke execute on function public.admin_confirm_exercise(uuid, date, boolean) from public, anon, authenticated;
grant execute on function public.admin_confirm_exercise(uuid, date, boolean) to service_role;

-- 11. RLS ---------------------------------------------------------
-- 읽기는 커플 둘 다 (상대가 오늘 했는지 보여야 한다). insert/update/delete
-- 정책은 일부러 없다 — 쓰기는 전부 위 함수를 거친다. 직접 쓸 수 있으면
-- 지난 날짜를 스스로 "완료"로 채워 소원권을 받을 수 있다.
alter table public.exercise_logs enable row level security;
alter table public.exercise_rewards enable row level security;

drop policy if exists "exercise_logs_select_couple" on public.exercise_logs;
create policy "exercise_logs_select_couple"
  on public.exercise_logs for select
  using (couple_id = public.current_couple_id());

drop policy if exists "exercise_rewards_select_couple" on public.exercise_rewards;
create policy "exercise_rewards_select_couple"
  on public.exercise_rewards for select
  using (couple_id = public.current_couple_id());
