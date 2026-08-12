-- ============================================================
-- 홈에 크게 띄울 기념일 고르기 — 이미 만들어진 데이터베이스에 적용하는
-- 증분 스크립트
--
-- schema.sql은 "처음부터 만들 때"의 전체 모습이라 이미 살아 있는 DB에는 그대로
-- 돌릴 수 없다. Supabase SQL Editor에 이 파일을 붙여 한 번 실행하면 schema.sql과
-- 같은 상태가 된다. 여러 번 돌려도 안전하다.
--
-- 그전까지 홈 위젯은 "가장 가까이 다가온 기념일"을 자동으로 골랐다. 생일을
-- 등록하면 그게 늘 이겨서 정작 보고 싶은 날이 밀려났기 때문에, 커플이 직접
-- 하나를 지정할 수 있게 한다. 아무것도 지정하지 않은 커플은 예전과 똑같이
-- 동작한다 (기본값 false, 화면이 가장 가까운 것으로 떨어진다).
-- ============================================================

-- 1. 어느 기념일이 메인인지 ----------------------------------
alter table public.anniversaries
  add column if not exists is_primary boolean not null default false;

-- 2. 고르는 함수 ---------------------------------------------
-- 한 문장으로 끝내는 이유와 부분 유니크 인덱스를 쓰지 않는 이유는 schema.sql의
-- 같은 자리 주석에 적어두었다.
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
