-- ============================================================
-- 캘린더 사진 교체·순서 변경 — 증분 스크립트
--
-- photos에는 select / insert / delete 정책만 있어서 기존 row를 고칠 수
-- 없었다. 교체는 storage_path를, 순서 변경은 sort_order를 바꾼다.
-- 교체를 "지우고 새로 넣기"로 하지 않는 이유는 row id가 바뀌면 대표 사진
-- 지정(memories.cover_photo_id)이 풀리기 때문이다.
--
-- 여러 번 돌려도 안전하다.
-- 선행 조건: 2026-11-23-calendar-day-photos.sql
-- ============================================================

drop policy if exists "photos_update_couple" on public.photos;
create policy "photos_update_couple"
  on public.photos for update
  using (
    memory_id in (
      select id from public.memories where couple_id = public.current_couple_id()
    )
  )
  with check (
    memory_id in (
      select id from public.memories where couple_id = public.current_couple_id()
    )
  );
