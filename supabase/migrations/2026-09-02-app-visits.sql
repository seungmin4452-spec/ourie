-- ============================================================
-- 앱 접속 기록 — 증분 스크립트
--
-- 결산(src/features/recap)이 "이번 달/올해 몇 번 앱을 열었나"를 보여주기
-- 위한 로그. 앱을 열 때마다 한 줄씩 쌓는다 — 하루에 여러 번 열어도 그만큼
-- 센다. travel_visits처럼 "켜고 끄는" 상태가 아니라 pokes처럼 지나간 사실을
-- 있는 그대로 쌓는다.
--
-- 순서대로 한 번에 실행한다. 여러 번 돌려도 안전하다.
-- 내용을 고칠 일이 생기면 schema.sql을 먼저 고치고 둘을 같이 반영한다.
--
-- 선행 조건: couples, profiles가 이미 있어야 한다 (schema.sql).
-- ============================================================

create table if not exists public.app_visits (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  -- 연 사람. "받는 사람" 개념이 없는 테이블이라 pokes의 sender_id 대신
  -- user_id로 뒀다.
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 결산이 커플 범위로 통째로 읽는다 (pokes_couple_created_idx와 같은 이유).
create index if not exists app_visits_couple_created_idx
  on public.app_visits (couple_id, created_at desc);

alter table public.app_visits enable row level security;

-- 읽기는 커플 범위 — 상대가 몇 번 열었는지도 결산에서 같이 본다.
drop policy if exists "app_visits_select_couple" on public.app_visits;
create policy "app_visits_select_couple"
  on public.app_visits for select
  using (couple_id = public.current_couple_id());

-- 쓰기는 본인 것만. travel_visits(둘이 같이 채우는 지도)와 다르게 이건
-- "누가 열었나"를 있는 그대로 세는 로그라, 상대 이름으로 꽂을 수 있으면 그
-- 숫자를 못 믿게 된다.
drop policy if exists "app_visits_insert_self" on public.app_visits;
create policy "app_visits_insert_self"
  on public.app_visits for insert
  with check (couple_id = public.current_couple_id() and user_id = auth.uid());

-- update/delete 정책 없음 — pokes와 같은 이유로 지나간 로그는 손대지 않는다.
