-- ============================================================
-- 소셜 프로필 사진을 https로 — 증분 스크립트
--
-- 카카오가 주는 프로필 사진 주소는 **http**다:
--   http://k.kakaocdn.net/dn/.../img_640x640.jpg
--
-- 앱은 https로 서비스되므로 이 주소는 브라우저가 혼합 콘텐츠로 막는다. 사진이
-- 깨지는 것도 아니고 조용히 안 뜬다 — 사진을 "받고 있는데 안 보이는" 상태의
-- 정체가 이것이다. 홈 화면 아이콘(AppMetaSync·api/pwa-install.ts)과 꾸미기
-- 미리보기, 마이페이지가 전부 같은 값을 보므로 세 군데가 함께 비어 있었다.
--
-- kakaocdn은 https로도 같은 파일을 준다. 그래서 스킴만 올린다.
--
-- 프로토콜 없는 주소(`//host/...`)로 바꾸지 않는 이유: 이 값은 브라우저의
-- <img>만 쓰는 게 아니라 서버 함수가 fetch하기도 하는데, 거기에는 "현재
-- 페이지의 스킴"이라는 것이 없다.
--
-- 여러 번 돌려도 안전하다.
-- ============================================================

-- 1. 앞으로 가입하는 사람 -------------------------------------
-- 이 함수는 schema.sql에도 같은 내용이 있어야 한다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, avatar_url)
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
    -- 소셜 프로필 사진. 온보딩 "꾸미기"에서 바꿀 수 있지만 기본값이 있는 편이
    -- 첫 화면이 덜 비어 보인다. 이메일 가입이면 둘 다 없어서 그냥 null이다.
    --
    -- http를 https로 올린다 (위 머리말 참고). 제공자를 가리지 않고 거는 이유는
    -- https 페이지에서 http 이미지는 어느 제공자 것이든 똑같이 막히기 때문이다.
    regexp_replace(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'picture'), '')
      ),
      '^http://', 'https://'
    )
  );
  return new;
end;
$$;

-- 2. 이미 가입한 사람 -----------------------------------------
-- 직접 올린 사진(Supabase Storage)은 이미 https라 걸리지 않는다.
update public.profiles
   set avatar_url = regexp_replace(avatar_url, '^http://', 'https://')
 where avatar_url like 'http://%';
