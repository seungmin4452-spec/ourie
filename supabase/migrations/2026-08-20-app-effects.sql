-- ============================================================
-- app_effects — 관리자가 켜고 끄면 모든 사용자의 홈 화면에 적용되는 특수효과
-- (벚꽃, 눈)
--
-- 커플 범위도 개인 범위도 아니라 앱 전체 범위인 값이라, 기존 테이블 어디에도
-- 안 맞는다. key-value 한 줄이 효과 하나다 — 새 효과를 늘릴 때 컬럼을 더하는
-- 대신 row 하나를 추가하면 된다 (poke_presets의 icon처럼, id에 허용 목록을
-- check로 박지 않는다).
--
-- **쓰기 정책이 없는 건 실수가 아니다.** update는 오직 관리자 계정으로 인증한
-- api/admin/effects.ts가 service role 키로 한다 (api/admin/broadcast.ts와 같은
-- 구조 — access.ts의 isAdminEmail을 서버가 다시 확인한다). 클라이언트가 RLS를
-- 뚫고 직접 켤 수 있으면 아무나 전체 사용자 화면에 효과를 띄울 수 있다.
--
-- 읽기는 누구나 — 홈 화면이 로그인한 모든 사용자에게 이 값을 보고 효과를
-- 켠다. 민감한 값이 아니라 커플 범위로 좁힐 이유가 없다.
-- ============================================================

create table public.app_effects (
  id text primary key,
  is_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.app_effects (id, is_enabled) values
  ('cherry_blossom', false),
  ('snow', false)
on conflict (id) do nothing;

create trigger app_effects_set_updated_at
  before update on public.app_effects
  for each row
  execute function public.set_updated_at();

alter table public.app_effects enable row level security;

create policy "app_effects_select_all"
  on public.app_effects for select
  using (true);

-- ------------------------------------------------------------
-- 관리자가 켜고 끄는 순간 열려 있는 모든 홈 화면에 그대로 반영되도록
-- Realtime 발행에 얹는다 (src/features/effects/hooks/useAppEffects.ts).
-- 커플 범위가 아니라 필터를 걸 게 없다 — 이 테이블은 원래도 누구나 읽는다.
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_effects'
  ) then
    alter publication supabase_realtime add table public.app_effects;
  end if;
end $$;
