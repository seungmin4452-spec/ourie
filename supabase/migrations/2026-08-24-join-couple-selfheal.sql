-- ============================================================
-- join_couple 자가치유 + profiles 고아 행 백필 — 증분 스크립트
--
-- 실사고 (2026-08-22): 카카오로 막 가입한 사용자의 profiles 행이 통째로
-- 없는 채로 상대방의 초대 코드를 입력했다. join_couple은 couples 행을
-- 정상적으로 연결시켰지만 `update profiles set couple_id = ... where id in
-- (user_a, uid)`가 이 사용자 쪽은 대상 행이 없어 조용히 0건만 갱신하고
-- 에러 없이 끝났다 -- RPC는 "성공"을 돌려줬지만 이 사용자의 couple_id는
-- 영원히 안 잡혀서 화면이 "커플 연결하기"에서 못 벗어났다. 정확히 "같은
-- 코드를 입력해도 매칭이 안 된다"는 증상이다.
--
-- profiles 행이 왜 애초에 안 생겼는지는(트리거 자체는 멀쩡하다 -- 아래
-- 함수와 schema.sql이 같다) 재현하지 못했다. 원인을 못 찾았어도 결과는
-- 고칠 수 있다: join_couple이 그 전제(양쪽 다 profiles 행이 있다)를 직접
-- 보장하게 만든다.
--
-- 여러 번 돌려도 안전하다.
-- ============================================================

-- 1. 이미 있는 사람 -------------------------------------------
-- auth.users에는 있는데 profiles가 없는 행을 백필한다. handle_new_user와
-- 같은 규칙으로 이름/사진을 채운다 (다른 이유로 트리거를 못 탄 계정이 이
-- 두 명 말고도 더 있을 수 있어 조건은 이메일/소셜 가리지 않는다).
insert into public.profiles (id, name, avatar_url, avatar_source)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'preferred_username'), '')
  ),
  regexp_replace(
    coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'avatar_url'), ''),
      nullif(trim(u.raw_user_meta_data ->> 'picture'), '')
    ),
    '^http://', 'https://'
  ),
  case
    when coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'avatar_url'), ''),
      nullif(trim(u.raw_user_meta_data ->> 'picture'), '')
    ) is null then null
    else 'social'
  end
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- 그렇게 막 백필된 사람이 이미 connected_at이 찍힌 couples 행의 당사자라면
-- (2026-08-22 사고가 정확히 이 모양이다), couple_id를 놓치지 않게 같이
-- 채운다. 같은 두 사람 사이에 connected 행이 여러 개면(코드를 여러 번
-- 새로 만들어 중복 연결된 경우) 가장 최근 것을 따른다.
update public.profiles p
set couple_id = latest.id
from (
  select distinct on (member)
    c.id, member
  from public.couples c
  cross join lateral (values (c.user_a), (c.user_b)) as m(member)
  where c.connected_at is not null
  order by member, c.connected_at desc
) as latest
where p.id = latest.member
  and p.couple_id is null;

-- 2. 앞으로 -----------------------------------------------------
-- 이 함수는 schema.sql에도 같은 내용이 있어야 한다.
create or replace function public.join_couple(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_couple public.couples%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if exists (
    select 1 from public.profiles where id = v_uid and couple_id is not null
  ) then
    raise exception 'already_connected';
  end if;

  select * into v_couple
    from public.couples
    where invite_code = p_invite_code and user_b is null and connected_at is null
    for update;

  if not found then
    raise exception 'invalid_code';
  end if;

  if v_couple.created_at < now() - interval '1 hour' then
    raise exception 'expired_code';
  end if;

  if v_couple.user_a = v_uid then
    raise exception 'own_code';
  end if;

  -- 방어적 자가치유. 정상적으로는 handle_new_user 트리거가 가입 즉시
  -- profiles 행을 만든다. 그 트리거가 어떤 이유로 못 돌면(2026-08-22 실사고
  -- -- 카카오로 막 가입한 사용자의 profiles 행이 통째로 없었다), 아래
  -- UPDATE는 대상 행이 없으니 조용히 0건만 갱신하고 끝난다 -- join_couple
  -- 자체는 에러 없이 "성공"하고 couples 행도 연결되지만, 그 사용자 화면은
  -- couple_id를 영원히 못 받아 "코드를 넣어도 매칭이 안 된다"는 상태에
  -- 갇힌다. 여기서 미리 채워 넣어 그 전제 자체를 보장한다.
  insert into public.profiles (id)
    values (v_couple.user_a), (v_uid)
  on conflict (id) do nothing;

  update public.couples
    set user_b = v_uid, connected_at = now()
    where id = v_couple.id;

  update public.profiles
    set couple_id = v_couple.id
    where id in (v_couple.user_a, v_uid);

  -- Either side may have minted their own never-used invite before this one
  -- connected (both people default to the "create code" tab on first visit).
  -- Those rows would otherwise sit around forever with user_b/connected_at
  -- null -- harmless, but confusing to find in the table. Clear them out now
  -- that this couple is settled.
  delete from public.couples
    where id <> v_couple.id
      and user_b is null
      and connected_at is null
      and user_a in (v_couple.user_a, v_uid);

  return v_couple.id;
end;
$$;
