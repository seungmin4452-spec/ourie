-- ============================================================
-- 이름 두 개를 컬럼 이름만으로 구분되게 정리 — 증분 스크립트
--
-- 콕 찌르기 알림이 "지영님이 보고 싶대요" 대신 "승민 ♥ 진선님이 보고 싶대요"로
-- 나갔다. 원인은 profiles.nickname을 사람 이름으로 쓴 것인데, 이 프로젝트에서
-- 그 컬럼은 **앱 이름**이었고(홈 화면 아이콘 라벨, 홈 상단 제목) 사람 이름을
-- 담을 자리는 아예 없었다.
--
--   nickname -> app_name   (이름만 바꾼다. 값은 앱 이름 그대로이므로 옮기지 않는다)
--   name                   (새로 만든다. 사람 이름. 회원가입에서 받는다)
--
-- **순서가 중요하다.** rename이 먼저다. Postgres는 함수 본문을 텍스트로
-- 저장하므로 컬럼을 바꿔도 send_poke 안의 참조는 따라오지 않는다 — 아래에서
-- 함수를 다시 만들기 전까지 그 함수는 "column nickname does not exist"로 죽는다.
-- 그래서 이 파일을 통째로, 위에서 아래로 한 번에 실행해야 한다.
--
-- Supabase SQL Editor에 붙여 실행한다. 여러 번 돌려도 안전하다.
-- 내용을 고칠 일이 생기면 schema.sql을 먼저 고치고 둘을 같이 반영한다.
-- ============================================================

-- 1. 컬럼 -----------------------------------------------------
-- rename은 if not exists가 없어서 두 번째 실행 때 에러가 난다. 이미 바꿨는지
-- 보고 넘어가도록 감싼다.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'nickname'
  ) then
    alter table public.profiles rename column nickname to app_name;
  end if;
end
$$;

-- 사람 이름. nullable인 이유는 이 컬럼이 생기기 전에 가입한 계정이 있어서다.
-- 그 계정들은 회원가입을 다시 할 수 없으므로 온보딩 "꾸미기" 화면에서도 채울
-- 수 있게 해두었다.
alter table public.profiles
  add column if not exists name text;

-- 2. 가입 트리거 ----------------------------------------------
-- 이메일 확인이 켜져 있으면 회원가입 직후에 세션이 없다. 세션이 없으면 RLS
-- 때문에 클라이언트가 profiles에 쓸 수 없어서, 가입 폼의 이름을 저장할 방법이
-- auth 메타데이터를 경유하는 이것뿐이다. 키 이름('name')이
-- src/features/auth/api/auth.ts와 같아야 하며, 어긋나면 이름이 조용히 사라진다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'name'), '')
  );
  return new;
end;
$$;

-- 3. 콕 찌르기 발송 함수 --------------------------------------
-- nickname -> name, 반환 키 sender_nickname -> sender_name.
-- 나머지 로직은 2026-08-11-poke.sql과 같다.
create or replace function public.send_poke(p_sender uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple public.couples;
  v_couple_id uuid;
  v_recipient uuid;
  v_name text;
begin
  if p_kind not in ('miss', 'kakao', 'call') then
    raise exception 'invalid_kind';
  end if;

  select couple_id, name into v_couple_id, v_name
    from public.profiles where id = p_sender;

  if v_couple_id is null then
    raise exception 'no_couple';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_sender::text || ':' || p_kind));

  select * into v_couple from public.couples where id = v_couple_id;

  v_recipient := case when v_couple.user_a = p_sender
                      then v_couple.user_b
                      else v_couple.user_a end;

  if v_recipient is null then
    raise exception 'no_couple';
  end if;

  if not exists (
    select 1 from public.profiles where id = v_recipient and poke_opt_in
  ) then
    raise exception 'not_opted_in';
  end if;

  insert into public.pokes (couple_id, sender_id, recipient_id, kind)
  select v_couple_id, p_sender, v_recipient, p_kind
  where not exists (
    select 1 from public.pokes
    where sender_id = p_sender
      and kind = p_kind
      and created_at > now() - interval '1 second'
  );

  if not found then
    raise exception 'too_soon';
  end if;

  return jsonb_build_object(
    'recipient_id', v_recipient,
    'sender_name', v_name
  );
end;
$$;

-- create or replace는 권한을 유지하지만 확실히 하려고 다시 건다.
-- `from public`만으로는 안 막힌다 — Supabase의 default privileges가 anon과
-- authenticated에게 명시적 grant를 따로 붙이기 때문이다.
revoke execute on function public.send_poke(uuid, text) from public, anon, authenticated;
grant execute on function public.send_poke(uuid, text) to service_role;
