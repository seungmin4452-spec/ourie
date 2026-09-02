-- ============================================================
-- AI 아바타 삭제 — 증분 스크립트
--
-- 처음 만들 때는 "한 번 만든 건 안 지운다"고 보고 delete 정책을 안 뒀는데,
-- 실제로 마음에 안 드는 결과물을 지우고 싶다는 요청이 있어 추가한다.
--
-- 선행 조건: 2026-09-02-ai-avatar.sql이 이미 적용되어 있어야 한다.
-- ============================================================

-- travel_visits와 같은 이유로 상대가 만든 것도 지울 수 있다 — 둘이 같이
-- 보는 갤러리라 "내가 만든 것만"으로 좁히면 상대가 없을 때 마음에 안 드는
-- 결과물을 못 지운다.
drop policy if exists "ai_avatar_generations_delete_couple" on public.ai_avatar_generations;
create policy "ai_avatar_generations_delete_couple"
  on public.ai_avatar_generations for delete
  using (couple_id = public.current_couple_id());

-- Storage 쪽도 같은 범위로 열어야 실제 이미지 파일이 지워진다 — DB row만
-- 지우면 버킷에 안 쓰이는 파일이 계속 쌓인다.
drop policy if exists "ai_avatars_couple_delete" on storage.objects;
create policy "ai_avatars_couple_delete"
  on storage.objects for delete
  using (
    bucket_id = 'ai-avatars'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );
