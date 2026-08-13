-- ============================================================
-- 지도가 상대 화면에서도 그 순간 바뀌게 — Realtime 발행 등록
--
-- 지금까지 상대가 건 사진은 내 쪽에서 목록을 다시 조회할 때에야 보였다. 주기를
-- 아무리 줄여도 "홈을 켜둔 채로 바뀌는" 것은 안 되고, 줄일수록 아무 일도 없는
-- 시간에 왕복만 늘어난다. 바뀐 쪽이 알려주는 편이 맞다.
--
-- 앱은 이 세 테이블의 변경을 구독해 그 순간 다시 읽는다
-- (src/features/travel/hooks/useTravelRealtime.ts). 여기서 하는 일은 그 변경이
-- 발행되도록 supabase_realtime 발행에 테이블을 얹는 것뿐이다.
--
-- 남의 커플 것이 새어나가지 않는 이유: Realtime은 postgres_changes를 보낼 때
-- 구독자의 RLS를 그대로 적용한다. 세 테이블 모두 couple_id = current_couple_id()
-- 로 막혀 있어서 우리 커플의 변경만 온다.
--
-- 지우는 이벤트까지 걸러지는 이유: 기본 replica identity에서는 delete 이벤트에
-- 기본키만 실려 오는데, 세 테이블 모두 couple_id가 기본키에 들어 있어서 커플로
-- 거르는 필터가 그대로 먹는다. 그래서 replica identity full로 바꾸지 않는다 —
-- 그렇게 하면 지운 행 전체(사진 경로까지)가 WAL에 통째로 실린다.
--
-- 이 앱에서 Realtime이 감당할 부하는 커플당 두 명이다. 무료 플랜의 동시 접속
-- 한도(200)와는 자릿수가 다르다.
--
-- 여러 번 돌려도 안전하다.
-- ============================================================

-- Supabase 프로젝트에는 이 발행이 기본으로 있다. 없는 프로젝트에서도 이
-- 스크립트 하나로 끝나도록 만들어 둔다.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare
  target text;
begin
  foreach target in array array['travel_visits', 'travel_maps', 'travel_region_photos'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target);
    end if;
  end loop;
end $$;
