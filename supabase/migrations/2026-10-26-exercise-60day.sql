-- ============================================================
-- 재활운동 — 60일 연속 보상 (증분 스크립트)
--
-- 원래는 30일을 채우면 소원권 1장을 주고 카운트를 0으로 되돌렸다. 이제는
-- 30일째에 1장을 주고 카운트를 끊지 않고 이어가서, 60일째에 3장을 더 준다.
-- 60일째 뒤로 카운트가 0부터 다시 시작한다. 중간에 하루라도 빠지면 처음부터다
-- (이미 받은 30일 소원권은 그대로 둔다).
--
-- - exercise_rewards에 milestone(30/60)과 tickets(늘어난 장수) 열을 더한다.
--   기존 줄은 전부 30일 달성(1장)으로 남는다.
-- - exercise_streak는 60일 달성일에서만 멈추고, rewards는 장수 합계를 돌려준다.
-- - settle_exercise_rewards가 30일·60일을 나눠 준다.
--
-- 선행 조건: 2026-10-25-exercise.sql. 여러 번 돌려도 안전하다.
-- 내용을 고칠 일이 생기면 schema.sql을 먼저 고치고 둘을 같이 반영한다.
-- ============================================================

-- 1. 달성 종류와 장수 ---------------------------------------------
alter table public.exercise_rewards
  add column if not exists milestone int not null default 30;
alter table public.exercise_rewards
  add column if not exists tickets int not null default 1;

alter table public.exercise_rewards drop constraint if exists exercise_rewards_milestone_check;
alter table public.exercise_rewards
  add constraint exercise_rewards_milestone_check check (milestone in (30, 60));
alter table public.exercise_rewards drop constraint if exists exercise_rewards_tickets_check;
alter table public.exercise_rewards
  add constraint exercise_rewards_tickets_check check (tickets > 0);

-- 함수 교체 (schema.sql과 같은 내용) ------------------------------
-- 반환 모양은 그대로라 create or replace로 충분하다. 실행 권한(revoke)도
-- 그대로 유지된다.

-- 2. 지금의 연속 일수 -------------------------------------------
-- 오늘을 이미 했으면 오늘부터, 아직이면 어제부터 거꾸로 센다 — 오늘은 아직
-- 끝나지 않았으니 "오늘 안 했음"이 기록을 끊지 않는다. 어제를 빠뜨렸으면 0이다.
-- 가장 최근 60일 달성일(last_reward_date)에서 멈춘다. 30일 달성일에서는
-- 멈추지 않는다. rewards는 지금까지 받은 소원권 장수의 합이다.
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
  select max(r.reward_date) filter (where r.milestone = 60),
         coalesce(sum(r.tickets), 0)::int
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

-- 3. 30일·60일을 채웠으면 소원권을 준다 ----------------------------
-- 운동 종료와 관리자 인정 둘 다 끝에 이걸 부른다. 몇 번을 불러도 안전하다.
-- - 30일째(1장): 지금 이어지는 연속 기록 안(run_start 이후)에 30일 달성이
--   이미 있으면 다시 주지 않는다. 관리자 인정으로 시작일이 앞당겨져 30일째
--   날짜가 바뀌어도 두 번 받지 않게 "날짜 일치"가 아니라 "범위 안"으로 본다.
-- - 60일째(3장): 이미 준 60일은 exercise_streak가 세지 않는다. 주고 나면
--   카운트가 0부터 다시 시작한다.
-- 중간에 끊기면 그때까지 받은 30일 소원권은 그대로 두고 처음부터 다시 센다.
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
  v_milestone int;
  v_tickets int;
  v_granted int := 0;
begin
  -- 종료와 관리자 인정이 동시에 들어와 같은 달성으로 두 번 주는 일을 막는다.
  perform pg_advisory_xact_lock(hashtext('exercise:' || p_owner_id::text));

  select couple_id into v_couple_id from public.profiles where id = p_owner_id;
  if v_couple_id is null then
    return 0;
  end if;

  loop
    select s.streak, s.run_start into v_streak, v_run_start
      from public.exercise_streak(p_owner_id) s;

    if v_streak >= 30 and not exists (
      select 1 from public.exercise_rewards r
      where r.owner_id = p_owner_id
        and r.milestone = 30
        and r.reward_date >= v_run_start
    ) then
      v_milestone := 30;
      v_tickets := 1;
    elsif v_streak >= 60 then
      v_milestone := 60;
      v_tickets := 3;
    else
      exit;
    end if;

    insert into public.exercise_rewards (owner_id, reward_date, couple_id, milestone, tickets)
    values (p_owner_id, v_run_start + v_milestone - 1, v_couple_id, v_milestone, v_tickets);

    perform set_config('wish.quota_request_approval', 'on', true);
    insert into public.wish_quotas (couple_id, owner_id, total, updated_by)
    values (v_couple_id, p_owner_id, least(public.wish_default_total() + v_tickets, 99), null)
    on conflict (couple_id, owner_id) do update
      set total = least(public.wish_quotas.total + v_tickets, 99),
          updated_at = now();
    perform set_config('wish.quota_request_approval', '', true);

    v_granted := v_granted + v_tickets;
  end loop;

  return v_granted;
end;
$$;

