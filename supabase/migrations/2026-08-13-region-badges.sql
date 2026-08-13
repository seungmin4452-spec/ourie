-- ============================================================
-- 지역 뱃지 — 증분 스크립트
--
-- 시도 안의 시군구를 전부 채우면 뱃지 하나를 얻는다. 두 지도가 뱃지를 나눠
-- 갖는다 — 전부 방문하면 'visited', 사진까지 걸면 'photo'.
--
-- **판정은 화면이 하고 DB는 중복만 막는다.** 트리거로 판정하려면 시도별 시군구
-- 총개수(분모)를 DB가 알아야 하는데, 이 프로젝트는 이미 반대를 정했다 —
-- travel_visits.region_code는 형식만 검사하고 코드를 아는 쪽은 화면이다
-- (행정구역이 실제로 바뀐다. 2026년 7월 광주·전남 통합). 분모만 DB로 옮기면
-- 그 결정이 반쪽이 되고, 행정구역이 바뀔 때마다 마이그레이션이 하나 더 붙는다.
-- 커플 둘만 쓰는 폐쇄 앱이라 자기 커플 뱃지를 위조해도 남에게 피해가 없다.
--
-- 여러 번 돌려도 안전하다.
-- 선행 조건: couples / profiles / current_couple_id()
-- ============================================================

-- 1. 테이블 --------------------------------------------------
create table if not exists public.travel_badges (
  couple_id uuid not null references public.couples (id) on delete cascade,
  -- 행정안전부 시도 코드 두 자리. travel_visits.region_code의 앞 두 자리와 같은
  -- 체계이고, 허용 목록 대신 형식만 보는 이유도 같다.
  sido_code text not null check (sido_code ~ '^[0-9]{2}$'),
  -- 두 지도가 각각 하나씩 채운다. 시도 코드와 달리 이건 우리가 정하는 값이고
  -- 늘어날 일이 드물어서 check로 박는다.
  tier text not null check (tier in ('visited', 'photo')),
  earned_at timestamptz not null default now(),
  earned_by uuid references public.profiles (id) on delete set null,

  primary key (couple_id, sido_code, tier)
);

-- 진열장이 커플의 뱃지를 통째로 읽는다. 선두 컬럼이 couple_id인 이 기본키
-- 인덱스가 그대로 쓰이므로 조회용 인덱스를 따로 두지 않는다.

alter table public.travel_badges enable row level security;

-- 다른 travel 테이블과 같은 모양이되 **update·delete가 없다.**
--
-- 한 번 딴 뱃지는 회수하지 않는다. 나중에 한 칸을 취소해도 지우지 않는다 —
-- 지우면 earned_at이 "처음 완성한 날"이 아니라 "마지막으로 완성한 날"이 되고,
-- 그러면 연대기로서의 가치가 사라진다. 방문 기록만 보면 "지금 완성 상태인지"는
-- 알아도 "언제 처음 완성했는지"는 영영 알 수 없다 — 이게 파생 계산으로 때우지
-- 않고 테이블을 두는 이유다.
drop policy if exists "travel_badges_select_couple" on public.travel_badges;
create policy "travel_badges_select_couple"
  on public.travel_badges for select
  using (couple_id = public.current_couple_id());

-- insert 정책도 둔다. 아래 RPC가 security definer라 이걸 거치지는 않지만,
-- 정책이 없으면 "왜 못 넣지"를 RPC 안에서만 확인할 수 있게 된다.
drop policy if exists "travel_badges_insert_couple" on public.travel_badges;
create policy "travel_badges_insert_couple"
  on public.travel_badges for insert
  with check (couple_id = public.current_couple_id());

-- 2. 획득 -----------------------------------------------------
-- 새로 얻었으면 true, 이미 있었으면 false. **이 반환값이 푸시를 보낼지 정한다** —
-- 둘이 동시에 마지막 칸을 채워도 뱃지는 하나만 생기고 알림도 한 번만 나간다
-- (send_poke가 연타를 막는 것과 같은 자리의 문제다).
--
-- security definer지만 신원을 인자로 받지 않는다. 커플도 earned_by도 auth.uid()에서
-- 직접 읽으므로 남의 커플에 뱃지를 꽂을 방법이 없다 — 그래서 send_poke와 달리
-- authenticated의 실행 권한을 회수하지 않는다 (set_primary_anniversary와 같은 판단).
create or replace function public.claim_region_badge(p_sido_code text, p_tier text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  v_couple_id := public.current_couple_id();
  if v_couple_id is null then
    raise exception 'no_couple';
  end if;

  -- 화면이 판정하지만, 값의 모양까지 믿지는 않는다. 여기서 안 거르면 잘못된
  -- 값이 check 제약에 걸려 사용자에게 알 수 없는 에러로 보인다.
  if p_sido_code !~ '^[0-9]{2}$' or p_tier not in ('visited', 'photo') then
    raise exception 'invalid_badge';
  end if;

  insert into public.travel_badges (couple_id, sido_code, tier, earned_by)
  values (v_couple_id, p_sido_code, p_tier, v_uid)
  on conflict (couple_id, sido_code, tier) do nothing;

  -- 방금 이 문장이 실제로 넣었는지. 이미 있었으면 0줄이라 false다.
  return found;
end;
$$;
