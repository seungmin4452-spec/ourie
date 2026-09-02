-- ============================================================
-- AI 아바타 — 증분 스크립트
--
-- 홈 위젯 "AI 아바타". 커플 사진을 고른 주제 스타일로 바꿔주는 기능이다.
--
-- 이 기능은 다른 위젯들과 달리 **서버(api/)를 거치지 않는다.** 생성은
-- 클라이언트가 무료 공용 Puter 계정으로 직접 부른다 — Node 런타임에서
-- Puter의 이미지 생성 함수가 브라우저 전용 타입(HTMLImageElement)을
-- 반환하려다 죽는 미해결 버그가 있어서다(HeyPuter/puter#1900,
-- src/features/aiAvatar/hooks/useGenerateAiAvatar.ts 참고). 그래서 이
-- 마이그레이션이 만드는 건 "무엇을 만들었는지"의 기록뿐이고, service role을
-- 쓰는 서버 코드는 따로 없다 — 쓰기는 커플 본인이 RLS로 직접 한다.
--
-- 순서대로 한 번에 실행한다. 여러 번 돌려도 안전하다.
-- 내용을 고칠 일이 생기면 schema.sql을 먼저 고치고 둘을 같이 반영한다.
--
-- 선행 조건: couples, profiles가 이미 있어야 한다 (schema.sql).
-- ============================================================

-- 1. 만든 아바타 한 장이 한 row -----------------------------------
create table if not exists public.ai_avatar_generations (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  -- 어떤 주제로 만들었는지. src/features/aiAvatar/themes.ts의 프리셋 id다.
  -- 그 파일이 프롬프트 본문을 들고 있으므로 여기엔 텍스트가 아니라 id만
  -- 남긴다 — 나중에 프롬프트 문구를 다듬어도 지난 기록의 "무슨 주제였는지"는
  -- 안 흔들린다.
  theme_id text not null,
  -- ai-avatars 버킷 안의 경로. Storage 정책은 아래 2번 참고.
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table public.ai_avatar_generations enable row level security;

drop policy if exists "ai_avatar_generations_select_couple" on public.ai_avatar_generations;
create policy "ai_avatar_generations_select_couple"
  on public.ai_avatar_generations for select
  using (couple_id = public.current_couple_id());

-- 만든 사람(requested_by)은 남기되, 커플 둘 다 서로 만든 걸 볼 수 있어야
-- 하는 물건이라 wish_quotas처럼 owner 범위가 아니라 커플 범위로 쓴다. 그래도
-- requested_by는 auth.uid()로 고정해 남의 이름으로 기록을 남기지 못하게 한다.
drop policy if exists "ai_avatar_generations_insert_couple" on public.ai_avatar_generations;
create policy "ai_avatar_generations_insert_couple"
  on public.ai_avatar_generations for insert
  with check (
    couple_id = public.current_couple_id()
    and requested_by = auth.uid()
  );

-- 목록은 커플 단위로 최신순. couple_id가 선두 컬럼이라 위 select 정책의
-- 필터에도 그대로 쓰인다.
create index if not exists ai_avatar_generations_couple_created_idx
  on public.ai_avatar_generations (couple_id, created_at desc);

-- 2. Storage: 만든 아바타 이미지 ------------------------------------
-- travel-maps와 같은 이유로 비공개 버킷이다 — 원본도 결과물도 두 사람 얼굴이
-- 그대로 드러나는 사진이라, URL만 알면 누구나 열리는 자리에 둘 이유가 없다.
-- 클라이언트는 createSignedUrl(s)로 읽는다.
insert into storage.buckets (id, name, public)
values ('ai-avatars', 'ai-avatars', false)
on conflict (id) do nothing;

-- 객체는 `{couple_id}/...`에 쌓인다. 커플 두 사람 모두 읽고 쓸 수 있어야
-- 하므로 auth.uid()가 아니라 current_couple_id()로 잠근다. 한 번 만든
-- 이미지는 갈아 끼우지 않으므로(생성마다 새 경로) update 정책은 없다.
drop policy if exists "ai_avatars_couple_read" on storage.objects;
create policy "ai_avatars_couple_read"
  on storage.objects for select
  using (
    bucket_id = 'ai-avatars'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );

drop policy if exists "ai_avatars_couple_write" on storage.objects;
create policy "ai_avatars_couple_write"
  on storage.objects for insert
  with check (
    bucket_id = 'ai-avatars'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );
