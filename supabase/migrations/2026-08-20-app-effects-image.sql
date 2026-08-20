-- ============================================================
-- app_effects에 세 번째 효과 "custom_image" — 관리자가 올린 이미지가
-- 회전하며 홈 화면에 떨어진다.
--
-- 벚꽃·눈과 달리 이 효과는 on/off 말고 "무엇을 떨어뜨릴지"도 필요해서
-- image_url 컬럼을 더한다. 벚꽃·눈은 이 컬럼이 항상 null이다 — 도형은
-- CSS로 그리지 이미지가 없다.
--
-- 이미지 자체은 별도 Storage 버킷(effect-images)에 올라간다. 공개
-- 버킷이다 — 로그인한 사용자 전체의 홈 화면이 봐야 하고, 민감한 사진이
-- 아니라 커플 사진 버킷(travel-maps)처럼 비공개로 가둘 이유가 없다.
--
-- **여기도 쓰기 정책이 없는 건 실수가 아니다.** 업로드는 오직 관리자
-- 인증을 거친 api/admin/effect-image.ts가 service role로 한다
-- (api/admin/effects.ts와 같은 구조).
-- ============================================================

alter table public.app_effects add column if not exists image_url text;

insert into public.app_effects (id, is_enabled) values
  ('custom_image', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('effect-images', 'effect-images', true)
on conflict (id) do nothing;

create policy "effect_images_public_read"
  on storage.objects for select
  using (bucket_id = 'effect-images');
