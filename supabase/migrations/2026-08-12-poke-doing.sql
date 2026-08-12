-- ============================================================
-- 콕 찌르기 "뭐해?" 추가 — 이미 만들어진 데이터베이스에 적용하는 증분 스크립트
--
-- schema.sql은 "처음부터 만들 때"의 전체 모습이라 이미 살아 있는 DB에는 그대로
-- 돌릴 수 없다. Supabase SQL Editor에 이 파일을 붙여 한 번 실행하면 schema.sql과
-- 같은 상태가 된다. 여러 번 돌려도 안전하다.
--
-- 기본 버튼에 'doing'("뭐해?")이 하나 늘었다. 코드(src/features/poke/message.ts의
-- POKE_KINDS)만 고치고 여기를 안 고치면, 그 버튼은 화면에 뜨지만 누르는 순간
-- send_poke가 invalid_kind로 막는다. 두 곳이 항상 같아야 한다.
-- ============================================================

-- 1. 기록 테이블이 새 종류를 받게 한다 -----------------------
-- check 제약은 if not exists가 없어서 지우고 다시 건다.
alter table public.pokes drop constraint if exists pokes_kind_check;
alter table public.pokes
  add constraint pokes_kind_check
    check (kind in ('miss', 'kakao', 'call', 'doing', 'custom'));

-- 2. 발송 함수의 허용 목록 -----------------------------------
-- 본문에서 바뀐 건 p_kind를 검사하는 한 줄뿐이다. 인자 수가 그대로라
-- create or replace로 덮인다 (오버로드가 생기지 않는다).
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
  -- "승민 ♥ 진선님이 보고 싶대요"가 된다 (profiles 위 주석 참고).
  select couple_id, name into v_couple_id, v_name
    from public.profiles where id = p_sender;

  if v_couple_id is null then
    raise exception 'no_couple';
  end if;

  if p_preset is null then
    if p_kind not in ('miss', 'kakao', 'call', 'doing') then
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

  -- 같은 사람이 같은 버튼을 동시에 두 번 누르는 것만 직렬화한다. 기본 세 개는
  -- 종류로, 커플이 만든 버튼은 그 id로 구분한다.
  perform pg_advisory_xact_lock(
    hashtext(p_sender::text || ':' || coalesce(p_preset::text, v_kind))
  );

  select * into v_couple from public.couples where id = v_couple_id;

  -- 커플의 두 자리 중 보낸 사람이 아닌 쪽. 아직 상대가 안 붙었으면 null이다.
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

  -- 같은 버튼은 1초에 한 번. 실수로 두 번 눌린 것을 거르는 게 목적이라 창이
  -- 짧다 (하루 총량 제한은 두지 않는다).
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

-- 권한은 함수를 다시 만들 때마다 초기화되지 않지만, create or replace 뒤에
-- 한 번 더 확인해 두는 편이 안전하다. 이유는 schema.sql의 같은 자리 주석 참고 —
-- Supabase의 default privileges 때문에 `from public`만으로는 안 막힌다.
revoke execute on function public.send_poke(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.send_poke(uuid, text, uuid) to service_role;
