-- ============================================================
-- 커플 캘린더 — 증분 스크립트
--
-- 커플이 함께 보는 일정 목록. 한 row가 일정 하나다. "우리 약속"
-- (is_shared)이 켜져 있으면 둘 다 고치고 지울 수 있고, 꺼져 있으면
-- 등록한 사람만 고치고 지울 수 있다. 읽기는 토글과 무관하게 둘 다 된다 —
-- 개인 일정도 상대방에게 보여야 "함께 보는 캘린더"이지, 안 보이면 그건
-- wish처럼 따로 감춰야 할 데이터다.
--
-- 순서대로 한 번에 실행한다. 여러 번 돌려도 안전하다.
-- 내용을 고칠 일이 생기면 schema.sql을 먼저 고치고 둘을 같이 반영한다.
--
-- 선행 조건: couples / profiles / current_couple_id() / set_updated_at()가
-- 이미 있어야 한다.
-- ============================================================

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 60),
  event_date date not null,
  -- 시간을 안 적으면 종일 일정. timestamptz가 아니라 date+time인 이유는
  -- anniversaries.date와 같다 — 달력상의 하루/시각이라, 보는 사람의
  -- 타임존만큼 밀리면 여행 중인 쪽에게 엉뚱한 날짜·시각이 보인다.
  event_time time,
  location text check (location is null or char_length(btrim(location)) between 1 and 100),
  -- "우리 약속" 토글. 꺼져 있으면(기본값) 개인 일정이라 등록한 사람만
  -- 고치고 지울 수 있다 (아래 RLS).
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 목록은 다가오는 날짜순으로 본다 (src/features/calendar/api/calendar.ts).
create index if not exists calendar_events_couple_id_event_date_idx
  on public.calendar_events (couple_id, event_date);

drop trigger if exists calendar_events_set_updated_at on public.calendar_events;
create trigger calendar_events_set_updated_at
  before update on public.calendar_events
  for each row
  execute function public.set_updated_at();

-- RLS ---------------------------------------------------------
alter table public.calendar_events enable row level security;

-- 읽기는 커플 범위 전체 — 개인 일정도 상대방에게 보인다.
drop policy if exists "calendar_events_select_couple" on public.calendar_events;
create policy "calendar_events_select_couple"
  on public.calendar_events for select
  using (couple_id = public.current_couple_id());

drop policy if exists "calendar_events_insert_couple" on public.calendar_events;
create policy "calendar_events_insert_couple"
  on public.calendar_events for insert
  with check (couple_id = public.current_couple_id() and created_by = auth.uid());

-- 고치고 지우는 건 "우리 약속"이면 둘 다, 아니면 등록한 사람만.
-- with check을 따로 두지 않는다 — poke_presets와 같은 이유로, 그때는 using
-- 식이 새 row에도 그대로 적용되어 다른 커플로 옮기는 update도, 개인
-- 일정을 상대방이 "우리 약속"으로 몰래 못 바꾸는 것도 함께 막힌다.
drop policy if exists "calendar_events_update_shared_or_own" on public.calendar_events;
create policy "calendar_events_update_shared_or_own"
  on public.calendar_events for update
  using (
    couple_id = public.current_couple_id()
    and (is_shared or created_by = auth.uid())
  );

drop policy if exists "calendar_events_delete_shared_or_own" on public.calendar_events;
create policy "calendar_events_delete_shared_or_own"
  on public.calendar_events for delete
  using (
    couple_id = public.current_couple_id()
    and (is_shared or created_by = auth.uid())
  );
