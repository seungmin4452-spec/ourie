-- ============================================================
-- 프로필 사진이 어디서 왔는지 — 증분 스크립트
--
-- 소셜 사진을 로그인할 때마다 최신으로 따라가게 하고 싶은데, 그러려면
-- **직접 올린 사진은 절대 건드리지 않는다**는 것을 보장해야 한다. 아니면
-- 고쳐준 게 아니라 뺏은 것이 된다.
--
-- 주소만 보고 가를 수도 있다 (Storage 도메인이면 직접 올린 것). 그렇게 하지
-- 않는 이유: 버킷 이름이나 도메인이 바뀌는 날 그 추측이 조용히 뒤집히고,
-- 그때 벌어지는 일이 "직접 올린 사진이 지워지는 것"이다. 추측이 틀렸을 때의
-- 대가가 너무 크면 추측하지 말고 적어둔다.
--
-- 여러 번 돌려도 안전하다.
-- 선행 조건: 2026-08-13-social-avatar-https.sql
-- ============================================================

-- 1. 컬럼 ----------------------------------------------------
-- null은 "사진이 없거나 출처를 모른다". 그때는 자동 갱신도 하지 않는다 —
-- 모르면 건드리지 않는 쪽이 안전한 기본값이다.
alter table public.profiles
  add column if not exists avatar_source text;

alter table public.profiles drop constraint if exists profiles_avatar_source_check;
alter table public.profiles
  add constraint profiles_avatar_source_check
    check (avatar_source is null or avatar_source in ('social', 'upload'));

-- 2. 이미 있는 사람 -------------------------------------------
-- 지금까지는 출처를 적지 않았으므로 주소로 한 번만 추정한다. 앞으로는 쓰는
-- 쪽이 직접 적으므로 이 추정이 다시 쓰일 일은 없다.
update public.profiles
   set avatar_source = case
     when avatar_url is null then null
     when avatar_url like '%/storage/v1/object/public/profile-avatars/%' then 'upload'
     else 'social'
   end
 where avatar_source is null;

-- 3. 앞으로 가입하는 사람 -------------------------------------
-- 이 함수는 schema.sql에도 같은 내용이 있어야 한다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avatar text;
begin
  -- 소셜 프로필 사진. 키 이름이 제공자마다 제각각이라 둘을 본다.
  --
  -- http를 https로 올린다. 카카오가 주는 주소는 http인데, https로 서비스되는
  -- 앱에서는 브라우저가 혼합 콘텐츠로 막아서 깨지는 것도 아니고 조용히 안
  -- 뜬다. 제공자를 가리지 않고 거는 이유는 어느 제공자 것이든 똑같이 막히기
  -- 때문이다 (2026-08-13-social-avatar-https.sql 참고).
  v_avatar := regexp_replace(
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'picture'), '')
    ),
    '^http://', 'https://'
  );

  insert into public.profiles (id, name, avatar_url, avatar_source)
  values (
    new.id,
    -- 순서가 곧 우선순위다. 'name'이 맨 앞인 이유는 이메일 가입에서 우리가 직접
    -- 넣는 키가 그것이고, 사람이 적어 넣은 이름이 제공자가 준 것보다 먼저여야
    -- 하기 때문이다. 공백만 넣은 경우까지 null로 떨어뜨린다 — "이름 없음"의
    -- 표현이 하나여야 화면에서 분기가 갈라지지 않는다.
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'preferred_username'), '')
    ),
    v_avatar,
    -- 사진이 있으면 그건 제공자가 준 것이다. 이메일 가입이면 둘 다 null이다.
    case when v_avatar is null then null else 'social' end
  );
  return new;
end;
$$;
