-- ============================================================
-- 콕 찌르기를 커플이 직접 만든다 — 증분 스크립트
--
-- 그전까지 보낼 수 있는 말은 코드에 박힌 세 개(miss/kakao/call)뿐이었다.
-- 여기서 커플이 아이콘·제목·알림 내용을 직접 적어 버튼을 늘릴 수 있게 한다.
--
-- 왜 localStorage가 아니라 DB인가: 알림 문구를 **서버가** 알아야 한다.
-- api/poke.ts는 보내는 사람의 기기가 아니라 서버에서 상대방 기기로 쏘고,
-- 무엇보다 클라이언트가 보낸 문구를 그대로 믿으면 누구든 아무 말이나 상대방
-- 잠금화면에 띄울 수 있다. 그래서 문구는 DB에 두고 send_poke가 읽는다.
-- 커플 단위인 것도 같은 맥락이다 — 둘이 같은 버튼을 본다.
--
-- 순서대로 한 번에 실행한다. 여러 번 돌려도 안전하다.
-- 내용을 고칠 일이 생기면 schema.sql을 먼저 고치고 둘을 같이 반영한다.
--
-- 선행 조건: 2026-08-11-poke.sql, 2026-08-11-names.sql이 이미 적용돼 있어야
-- 한다 (pokes 테이블과 profiles.name이 있어야 아래가 돈다).
-- ============================================================

-- 1. 커플이 만든 버튼 ----------------------------------------
create table if not exists public.poke_presets (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  -- 아이콘 이름. 허용 목록을 check로 박지 않는 이유는 아이콘을 하나 더할 때마다
  -- 마이그레이션을 돌려야 하기 때문이다. 대신 화면이 모르는 이름을 만나면
  -- 기본 아이콘으로 떨어진다 (src/features/poke/icons.tsx).
  icon text not null check (char_length(icon) between 1 and 40),
  -- 위젯 버튼에 적히고 알림 제목에도 쓰이는 말. 잠금화면에서 잘리지 않을 길이.
  label text not null check (char_length(btrim(label)) between 1 and 20),
  -- 알림 본문.
  body text not null check (char_length(btrim(body)) between 1 and 80),
  created_at timestamptz not null default now()
);

-- 위젯이 커플의 버튼을 만든 순서대로 읽는다.
create index if not exists poke_presets_couple_created_idx
  on public.poke_presets (couple_id, created_at);

alter table public.poke_presets enable row level security;

drop policy if exists "poke_presets_select_couple" on public.poke_presets;
create policy "poke_presets_select_couple"
  on public.poke_presets for select
  using (couple_id = public.current_couple_id());

drop policy if exists "poke_presets_insert_couple" on public.poke_presets;
create policy "poke_presets_insert_couple"
  on public.poke_presets for insert
  with check (couple_id = public.current_couple_id());

drop policy if exists "poke_presets_update_couple" on public.poke_presets;
create policy "poke_presets_update_couple"
  on public.poke_presets for update
  using (couple_id = public.current_couple_id());

-- 상대가 만든 버튼도 지울 수 있다. 둘이 함께 쓰는 목록이라 "내가 만든 것만"으로
-- 좁히면 상대가 없을 때 정리할 방법이 없어진다.
drop policy if exists "poke_presets_delete_couple" on public.poke_presets;
create policy "poke_presets_delete_couple"
  on public.poke_presets for delete
  using (couple_id = public.current_couple_id());

-- 2. 기록에 어떤 버튼이었는지 남긴다 --------------------------
alter table public.pokes
  add column if not exists preset_id uuid
    references public.poke_presets (id) on delete cascade;

-- kind는 이제 'custom'도 받는다. check 제약은 if not exists가 없어서 지우고 건다.
alter table public.pokes drop constraint if exists pokes_kind_check;
alter table public.pokes
  add constraint pokes_kind_check check (kind in ('miss', 'kakao', 'call', 'custom'));

-- 'custom'이면 어떤 버튼이었는지가 반드시 있어야 하고, 반대로 기본 세 개는
-- preset_id를 가질 수 없다. 이 짝이 어긋나면 알림 문구를 만들 수가 없다.
alter table public.pokes drop constraint if exists pokes_preset_matches_kind;
alter table public.pokes
  add constraint pokes_preset_matches_kind
    check ((kind = 'custom') = (preset_id is not null));

-- 3. 발송 함수 -----------------------------------------------
-- 인자가 하나 늘었다. 인자 수가 다르면 create or replace가 아니라 오버로드가
-- 되어 옛 2인자 함수가 그대로 남으므로 명시적으로 지운다.
drop function if exists public.send_poke(uuid, text);

create or replace function public.send_poke(
  p_sender uuid,
  p_kind text,
  p_preset uuid default null
)
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
  v_kind text;
  v_preset public.poke_presets;
begin
  -- app_name이 아니라 name이다. app_name은 앱 이름이라 알림에 쓰면
  -- "승민 ♥ 진선님이 보고 싶대요"가 된다.
  select couple_id, name into v_couple_id, v_name
    from public.profiles where id = p_sender;

  if v_couple_id is null then
    raise exception 'no_couple';
  end if;

  if p_preset is null then
    if p_kind not in ('miss', 'kakao', 'call') then
      raise exception 'invalid_kind';
    end if;
    v_kind := p_kind;
  else
    -- 커플이 만든 버튼인지 여기서 확인한다. 남의 커플 버튼 id를 넣어도 걸린다.
    -- 문구를 호출자에게서 받지 않고 이 조회 결과만 쓰는 것이 핵심이다 — 받으면
    -- 아무 말이나 상대방 잠금화면에 띄울 수 있다.
    select * into v_preset
      from public.poke_presets
      where id = p_preset and couple_id = v_couple_id;

    if not found then
      raise exception 'invalid_kind';
    end if;

    v_kind := 'custom';
  end if;

  -- 같은 사람이 같은 버튼을 동시에 두 번 누른 것만 직렬화한다. 기본 세 개는
  -- 종류로, 커플이 만든 버튼은 그 id로 구분한다.
  perform pg_advisory_xact_lock(
    hashtext(p_sender::text || ':' || coalesce(p_preset::text, v_kind))
  );

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

  insert into public.pokes (couple_id, sender_id, recipient_id, kind, preset_id)
  select v_couple_id, p_sender, v_recipient, v_kind, p_preset
  where not exists (
    select 1 from public.pokes
    where sender_id = p_sender
      and kind = v_kind
      -- 커플이 만든 버튼끼리는 서로의 쿨다운에 걸리지 않아야 한다.
      and preset_id is not distinct from p_preset
      and created_at > now() - interval '1 second'
  );

  if not found then
    raise exception 'too_soon';
  end if;

  -- preset_label / preset_body는 기본 세 개일 때 null이다 (v_preset이 비어 있다).
  -- 그때의 문구는 코드가 들고 있다 (src/features/poke/message.ts).
  return jsonb_build_object(
    'recipient_id', v_recipient,
    'sender_name', v_name,
    'preset_label', v_preset.label,
    'preset_body', v_preset.body
  );
end;
$$;

-- `from public`만으로는 안 막힌다 — Supabase의 default privileges가 anon과
-- authenticated에게 명시적 grant를 따로 붙이기 때문이다. 자세한 건 schema.sql의
-- 같은 자리 주석 참고.
revoke execute on function public.send_poke(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.send_poke(uuid, text, uuid) to service_role;

-- 확인용. 셋 다 false, service_role만 true여야 한다.
-- select
--   has_function_privilege('anon',          'public.send_poke(uuid,text,uuid)', 'execute') as anon,
--   has_function_privilege('authenticated', 'public.send_poke(uuid,text,uuid)', 'execute') as authenticated,
--   has_function_privilege('service_role',  'public.send_poke(uuid,text,uuid)', 'execute') as service_role;
