-- ============================================================
-- 1일 1문답 — 증분 스크립트
--
-- 커플이 매일 같은 질문 하나에 각자 답하고 서로 확인한다. 소원권과 달리 이
-- 기능의 정체성은 "오늘 것만"이다 — 어제 질문도 어제 답도 화면에 남지 않고,
-- KST 자정이 지나면 질문이 바뀐다.
--
-- 날짜별 질문을 저장해두지 않는다. wish_quotas가 "남은 장수를 컬럼으로 들고
-- 있지 않는 것"과 같은 철학 — 질문 풀의 순서 + 오늘 날짜만으로 오늘의 질문이
-- 정해지므로(todays_question()), 자정마다 새 질문 row를 만드는 cron이 필요
-- 없다.
--
-- 순서대로 한 번에 실행한다. 여러 번 돌려도 안전하다.
-- 내용을 고칠 일이 생기면 schema.sql을 먼저 고치고 둘을 같이 반영한다.
--
-- 선행 조건: couples / profiles / current_couple_id() / set_updated_at()가
-- 이미 있어야 한다.
-- ============================================================

-- 1. 질문 풀 --------------------------------------------------
-- 커플 범위가 아니라 앱 전체 범위다 (app_effects와 같은 자리). 배포 없이
-- 질문을 늘릴 수 있도록 코드가 아니라 여기 둔다 — 화면에서 관리하는 기능은
-- 아직 없고, 늘릴 때는 Supabase SQL Editor에서 직접 insert한다.
create table if not exists public.daily_question_pool (
  id uuid primary key default gen_random_uuid(),
  content text not null check (char_length(btrim(content)) between 1 and 80),
  created_at timestamptz not null default now()
);

insert into public.daily_question_pool (content) values
  ('오늘 하루 중 가장 기분 좋았던 순간은?'),
  ('요즘 가장 자주 떠오르는 고민은 뭐야?'),
  ('최근에 나 때문에 웃었던 적 있어?'),
  ('오늘 저녁 메뉴, 딱 하나만 고른다면?'),
  ('요즘 부쩍 하고 싶어진 일이 있어?'),
  ('나에게 배우고 싶은 점이 있다면?'),
  ('최근에 본 것 중 가장 인상 깊었던 건?'),
  ('스트레스 풀리는 나만의 방법은?'),
  ('요즘 자기 전에 무슨 생각을 해?'),
  ('같이 가보고 싶은 곳이 새로 생겼어?'),
  ('요즘 가장 듣기 좋은 노래는?'),
  ('오늘 나에게 하고 싶은 칭찬 한마디는?'),
  ('최근에 가장 크게 웃었던 순간은?'),
  ('요즘 배우고 싶은 게 있어?'),
  ('오늘 있었던 일 중 나한테 말하고 싶은 건?'),
  ('요즘 잠들기 전 습관이 있어?'),
  ('최근에 감동받았던 순간이 있어?'),
  ('오늘 하루를 색깔로 표현한다면?'),
  ('요즘 가장 고마운 사람은?'),
  ('같이 해보고 싶은 새로운 취미가 있어?'),
  ('오늘 컨디션을 한마디로 표현하면?'),
  ('최근에 부러웠던 순간이 있어?'),
  ('요즘 제일 맛있게 먹은 음식은?'),
  ('오늘 하루 나에게 점수를 준다면 몇 점?')
on conflict do nothing;

-- 앱 전체 범위 값이라 누구나 읽는다 (app_effects_select_all과 같은 이유).
alter table public.daily_question_pool enable row level security;

drop policy if exists "daily_question_pool_select_all" on public.daily_question_pool;
create policy "daily_question_pool_select_all"
  on public.daily_question_pool for select
  using (true);

-- 2. 오늘의 질문 — 로테이션의 유일한 정의 --------------------
-- 질문 풀 순서(created_at) + 2024-01-01부터의 날짜 수를 질문 개수로 나눈
-- 나머지로 고른다. 클라이언트와 아래 트리거 둘 다 이 함수 하나만 보므로
-- "오늘이 며칠인지"가 두 곳에서 따로 계산되어 자정 경계에서 어긋나는 일이
-- 없다.
create or replace function public.todays_question()
returns table (id uuid, content text, question_date date)
language sql
stable
as $$
  with pool as (
    select
      p.id,
      p.content,
      row_number() over (order by p.created_at, p.id) - 1 as idx,
      count(*) over () as n
    from public.daily_question_pool p
  )
  select pool.id, pool.content, (now() at time zone 'Asia/Seoul')::date
  from pool
  where n > 0
    and idx = (((now() at time zone 'Asia/Seoul')::date - date '2024-01-01') % n)
$$;

-- 3. 답변 — 커플 × 사람 × 날짜당 한 줄 -------------------------
-- 복합 기본키가 "하루에 한 줄, 자정 전까지 upsert로 고쳐 쓴다"는 규칙을 그대로
-- 표현한다 (wish_quotas, travel_visits와 같은 패턴).
create table if not exists public.daily_question_answers (
  couple_id uuid not null references public.couples (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  question_date date not null,
  question_id uuid not null references public.daily_question_pool (id),
  content text not null check (char_length(btrim(content)) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (couple_id, owner_id, question_date)
);

drop trigger if exists daily_question_answers_set_updated_at on public.daily_question_answers;
create trigger daily_question_answers_set_updated_at
  before update on public.daily_question_answers
  for each row
  execute function public.set_updated_at();

-- "오늘 것만" 답할 수 있다는 것의 실제 차단. 화면도 미리 막지만 그건 안내다
-- (다른 기기·직접 API 호출로 지난 질문에 답을 끼워 넣을 수 있으면 이 기능의
-- 정체성이 깨진다).
create or replace function public.check_daily_question_answer_is_today()
returns trigger
language plpgsql
as $$
declare
  v_today record;
begin
  select * into v_today from public.todays_question();

  if v_today.id is null then
    raise exception 'no_question_today';
  end if;

  if new.question_id is distinct from v_today.id
     or new.question_date is distinct from v_today.question_date then
    raise exception 'not_todays_question';
  end if;

  return new;
end;
$$;

drop trigger if exists daily_question_answers_check_today on public.daily_question_answers;
create trigger daily_question_answers_check_today
  before insert or update on public.daily_question_answers
  for each row
  execute function public.check_daily_question_answer_is_today();

-- 4. RLS --------------------------------------------------------
alter table public.daily_question_answers enable row level security;

-- "어제는 안 보인다"는 약속 자체를 select 정책에 넣는다. 하루가 지나는 순간
-- 그 전 row는 본인 커플에게도 조회 결과에서 사라진다 — 별도 정리(cron/delete)
-- 없이 자동이고, 화면 버그로 어제 답이 새어 보이는 경로도 원천 차단된다.
drop policy if exists "daily_question_answers_select_today" on public.daily_question_answers;
create policy "daily_question_answers_select_today"
  on public.daily_question_answers for select
  using (
    couple_id = public.current_couple_id()
    and question_date = (now() at time zone 'Asia/Seoul')::date
  );

-- 쓰기는 소원권과 같은 이유로 본인 것만 — 상대가 내 이름으로 답을 넣거나
-- 고칠 수 있으면 안 된다.
drop policy if exists "daily_question_answers_insert_own" on public.daily_question_answers;
create policy "daily_question_answers_insert_own"
  on public.daily_question_answers for insert
  with check (couple_id = public.current_couple_id() and owner_id = auth.uid());

drop policy if exists "daily_question_answers_update_own" on public.daily_question_answers;
create policy "daily_question_answers_update_own"
  on public.daily_question_answers for update
  using (owner_id = auth.uid())
  with check (couple_id = public.current_couple_id() and owner_id = auth.uid());

-- delete 정책 없음 — 지울 이유가 없다. 자정 전엔 update로 고쳐 쓰고, 지나면
-- 위 select 정책 때문에 어차피 안 보인다. row는 pokes/app_visits처럼 지우지
-- 않고 쌓아둔다 — 지금 화면은 절대 과거 row를 읽지 않는다.
