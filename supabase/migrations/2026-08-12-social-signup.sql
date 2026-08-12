-- ============================================================
-- 소셜 가입(구글·카카오)에서도 이름과 사진이 채워지게 — 증분 스크립트
--
-- 가입 트리거는 지금까지 `raw_user_meta_data ->> 'name'` 하나만 봤다. 이메일
-- 가입은 그 키를 우리가 직접 넣으니(src/features/auth/api/auth.ts) 맞았지만,
-- 소셜 가입은 그 자리를 제공자가 채우고 키 이름이 제공자마다 다르다:
--
--   구글    name, full_name, avatar_url, picture
--   카카오  name(닉네임), avatar_url  — full_name이 없는 경우가 있다
--
-- 그래서 소셜로 가입하면 profiles.name이 null로 떨어졌고, 그 계정이 콕 찌르기를
-- 보내면 상대방 알림이 "상대방이 보고 싶대요"로 나갔다 (send_poke의 sender_name).
--
-- 사진(avatar_url)도 같이 받아둔다. 온보딩 "꾸미기"에서 어차피 바꿀 수 있지만,
-- 기본값이 있는 편이 첫 화면이 덜 비어 보인다. 제공자가 주는 건 https 주소이고,
-- 홈 화면 아이콘을 만들 때도 그대로 쓸 수 있다 (api/_shared.ts의 sanitizeIconUrl).
--
-- Supabase SQL Editor에 붙여 실행한다. 여러 번 돌려도 안전하다.
-- 내용을 고칠 일이 생기면 schema.sql을 먼저 고치고 둘을 같이 반영한다.
--
-- **대시보드 설정이 따로 필요하다.** 이 파일만으로는 소셜 로그인이 켜지지
-- 않는다: Authentication > Providers에서 Google과 Kakao를 켜고 각 client
-- id/secret을 넣어야 하며, URL Configuration의 Redirect URLs에 배포 주소와
-- http://localhost:5173/** 를 넣어야 한다. 등록되지 않은 주소로 돌아오면
-- 조용히 Site URL로 떨어진다.
-- ============================================================

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
    -- 순서가 곧 우선순위다. 'name'이 맨 앞인 이유는 이메일 가입에서 우리가
    -- 직접 넣는 키가 그것이고, 사람이 적어 넣은 이름이 제공자가 준 것보다
    -- 먼저여야 하기 때문이다. 공백만 있는 값은 null로 떨어뜨린다 — "이름 없음"의
    -- 표현이 하나여야 화면에서 분기가 갈라지지 않는다.
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'preferred_username'), '')
    ),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'picture'), '')
    )
  );
  return new;
end;
$$;
