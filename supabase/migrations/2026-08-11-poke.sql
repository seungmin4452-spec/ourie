-- ============================================================
-- 콕 찌르기 (poke) — 이미 만들어진 데이터베이스에 적용하는 증분 스크립트
--
-- schema.sql은 "처음부터 만들 때"의 전체 모습이라 이미 살아 있는 DB에는 그대로
-- 돌릴 수 없다 (create table이 전부 실패한다). Supabase SQL Editor에 이 파일을
-- 붙여 한 번 실행하면 schema.sql과 같은 상태가 된다.
--
-- 여러 번 돌려도 안전하다 (if not exists / or replace / drop policy if exists).
-- 내용을 고칠 일이 생기면 이 파일이 아니라 schema.sql을 먼저 고치고, 둘이
-- 어긋나지 않게 같이 반영한다.
-- ============================================================

-- 1. 수신 동의 -----------------------------------------------
-- 기본값 false. 켠 적 없는 사람에게는 절대 가지 않아야 한다.
alter table public.profiles
  add column if not exists poke_opt_in boolean not null default false;

-- 2. 기록 테이블 ---------------------------------------------
create table if not exists public.pokes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('miss', 'kakao', 'call')),
  created_at timestamptz not null default now()
);

create index if not exists pokes_sender_kind_created_idx
  on public.pokes (sender_id, kind, created_at desc);

create index if not exists pokes_couple_created_idx
  on public.pokes (couple_id, created_at desc);

alter table public.pokes enable row level security;

drop policy if exists "pokes_select_couple" on public.pokes;
create policy "pokes_select_couple"
  on public.pokes for select
  using (couple_id = public.current_couple_id());

-- 3. 발송 함수 -----------------------------------------------
-- 설명은 schema.sql의 같은 함수 위 주석에 있다.
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
  v_nickname text;
begin
  if p_kind not in ('miss', 'kakao', 'call') then
    raise exception 'invalid_kind';
  end if;

  select couple_id, nickname into v_couple_id, v_nickname
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
    'sender_nickname', v_nickname
  );
end;
$$;

revoke execute on function public.send_poke(uuid, text) from public;
grant execute on function public.send_poke(uuid, text) to service_role;
