-- ============================================================
-- 재활운동 — 운동하는 사람 지정 (증분 스크립트)
--
-- 재활운동은 커플 중 **한 사람만** 한다. 그 사람(couples.exercise_owner_id)만
-- 시작/종료를 누를 수 있고, 다른 한 사람은 위젯에서 진행 상황을 보기만 한다.
--
-- 지정은 위젯에서 처음 한 번 고른다 (set_exercise_owner — 아직 아무도
-- 지정되지 않았을 때만). 잘못 골랐으면 관리자 화면에서 바꾼다
-- (api/admin/_exercise.ts가 service role로 직접 고친다).
--
-- 선행 조건: 2026-10-25-exercise.sql. 여러 번 돌려도 안전하다.
-- 내용을 고칠 일이 생기면 schema.sql을 먼저 고치고 둘을 같이 반영한다.
-- ============================================================

-- 1. 운동하는 사람 ------------------------------------------------
-- 커플 범위 값이라 couples에 둔다. null = 아직 안 골랐다.
alter table public.couples
  add column if not exists exercise_owner_id uuid references public.profiles (id) on delete set null;

-- 2. 처음 한 번 고르기 ---------------------------------------------
-- 커플 둘 중 누구든 고를 수 있지만, 이미 정해져 있으면 바꾸지 못한다 —
-- 보는 쪽이 자기를 운동하는 사람으로 바꿔 대신 눌러주는 길을 막는다.
create or replace function public.set_exercise_owner(p_owner_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid := public.current_couple_id();
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if v_couple_id is null then
    raise exception 'no_couple';
  end if;
  if not exists (
    select 1 from public.profiles where id = p_owner_id and couple_id = v_couple_id
  ) then
    raise exception 'invalid_target';
  end if;

  update public.couples
    set exercise_owner_id = p_owner_id
    where id = v_couple_id and exercise_owner_id is null;

  if not found then
    raise exception 'exercise_owner_already_set';
  end if;

  return p_owner_id;
end;
$$;

-- 3. 시작/종료는 운동하는 사람만 --------------------------------------
-- 화면도 보는 쪽에는 버튼을 그리지 않지만, 그건 안내다. 실제 차단은 여기서 한다.
create or replace function public.check_is_exercise_owner()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.couples
    where id = public.current_couple_id() and exercise_owner_id = auth.uid()
  ) then
    raise exception 'not_exercise_owner';
  end if;
end;
$$;

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
  perform public.check_is_exercise_owner();

  insert into public.exercise_logs (owner_id, exercise_date, couple_id, started_at)
  values (v_uid, v_today, v_couple_id, now())
  on conflict (owner_id, exercise_date) do update
    set started_at = coalesce(public.exercise_logs.started_at, excluded.started_at),
        couple_id = excluded.couple_id
  returning * into v_row;

  return v_row;
end;
$$;

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
  perform public.check_is_exercise_owner();

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

-- 4. 위젯이 보는 것 — is_exerciser 열 추가 -----------------------------
-- 반환 모양이 바뀌므로 create or replace로는 안 되고 지웠다가 만든다.
drop function if exists public.exercise_board();
create function public.exercise_board()
returns table (
  owner_id uuid,
  is_exerciser boolean,
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
    coalesce(c.exercise_owner_id = p.id, false),
    l.exercise_date,
    l.started_at,
    l.ended_at,
    public.exercise_day_done(p.id, (now() at time zone 'Asia/Seoul')::date),
    s.streak,
    s.rewards
  from public.profiles p
  join public.couples c on c.id = p.couple_id
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
