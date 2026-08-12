-- ============================================================
-- 디데이 알림 트리거를 Vercel Cron에서 pg_cron으로 옮긴다 — 증분 스크립트
--
-- 왜 옮기는가. Vercel Hobby의 cron은 두 가지가 걸렸다.
--   1. 실행 시각 정밀도가 ±59분이다. 09:00에 걸어도 09:59에 갈 수 있었다.
--   2. **cron이 현재 프로덕션 배포에 묶인다.** 새 배포가 올라가면 cron이 새
--      배포 기준으로 다시 등록되므로, 아직 안 돈 그날 몫은 그대로 유실된다.
--      2026-08-12에 실제로 이걸로 알림이 안 갔다 — 09:13/09:49/09:52에 main을
--      푸시했고, 그 세 번의 배포가 09:00~09:59 발동 구간을 덮어썼다.
-- pg_cron은 DB 안에서 도니 배포와 무관하고 시각도 정확하다.
--
-- 무엇이 달라지지 않는가. **발송 로직은 그대로 api/notify-dday.ts다.** 여기서
-- 하는 일은 "매일 정해진 시각에 그 엔드포인트를 부른다"뿐이다. web-push의 VAPID
-- 서명·페이로드 암호화는 Postgres에서 할 수 있는 일이 아니다.
--
-- 여러 번 돌려도 안전하다. cron.schedule은 잡 이름이 같으면 갈아끼운다.
--
-- **두 번에 나눠 실행한다.** Supabase SQL Editor는 붙여넣은 걸 통째로 한
-- 트랜잭션에 묶으므로, 뒤쪽 cron.schedule이 실패하면 앞쪽 create extension까지
-- 같이 되감긴다 — 확장이 깔린 줄 알았는데 cron 스키마가 없는 상태가 된다
-- (실제로 겪었던 문제). 1번을 먼저 실행해 확장을 확정 짓고, 그다음 2번을 실행한다.
--
-- ------------------------------------------------------------
-- 먼저 할 일 (이 파일에는 담지 않는다)
--
-- CRON_SECRET을 Vault에 넣어야 한다. 아래를 SQL Editor에 붙여넣고 실제 값으로
-- 바꿔 한 번만 실행한다. **이 SQL은 커밋하지 말 것** — 이 파일에 비밀값을 적어
-- 두면 저장소를 읽을 수 있는 누구나 알림을 발송할 수 있다.
--
--   select vault.create_secret(
--     '<Vercel 환경변수 CRON_SECRET과 같은 값>',
--     'cron_secret',
--     '디데이 알림 엔드포인트 호출용 Bearer 토큰'
--   );
--
-- 값을 바꿀 땐 create_secret이 아니라 vault.update_secret(id, new_secret)이다.
-- 이름이 같은 비밀을 또 만들면 아래 조회가 어느 쪽을 집을지 알 수 없어진다.
-- ============================================================

-- 1. 확장 -----------------------------------------------------
-- pg_cron은 스케줄러, pg_net은 Postgres 안에서 바깥으로 HTTP를 쏘는 쪽이다.
-- 잡 테이블은 cron 스키마, HTTP 함수는 net 스키마에 생긴다.
--
-- **여기서 grant를 하지 않는다.** 일반적인 pg_cron 안내문에는
--
--   grant usage on schema cron to postgres;
--   grant all privileges on all tables in schema cron to postgres;
--
-- 가 따라붙지만 그건 셀프호스팅 기준이고, Supabase에서는 쓰면 안 된다.
-- create extension이 끝나면 Supabase가 after-create 스크립트를 자동으로 돌려
-- 필요한 권한을 이미 붙여주는데, 그 마지막이
--
--   revoke all on table cron.job from postgres;
--   grant select on table cron.job to postgres with grant option;
--
-- 즉 postgres에게 cron.job의 **select만** 남기는 것이다. 위 grant all은 이
-- 의도를 거슬러 전체 권한을 얹고, 그러면 다음번 create extension 때 저 revoke가
-- "dependent privileges exist"로 죽어 확장을 다시 깔 수 없게 된다
-- (실제로 겪었던 문제).
--
-- 이미 저 grant를 한 번 실행해 버렸다면 cron.job에 `postgres → postgres SELECT`
-- 행이 남아 있다. postgres 자격으로 아래를 돌려 그것만 걷어낸다 (supabase_admin이
-- 준 grantable SELECT는 그대로 남으므로 잡을 읽는 데 지장이 없다):
--
--   revoke select on table cron.job from postgres;
--
-- 확장을 켜는 건 SQL보다 Dashboard → Database → Extensions에서 토글하는 쪽이
-- 안전하다. 아래 두 줄은 그 경우 그냥 no-op으로 지나간다.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. 매일 KST 오전 8시 --------------------------------------------
-- pg_cron의 스케줄은 **UTC 기준**이다. KST 08:00 = 전날 UTC 23:00이라 날짜가
-- 하루 밀린 것처럼 보이지만 맞다. 함수 쪽 날짜 계산은 이 어긋남을 이미 견딘다 —
-- todayKey()가 절대 시각에 +9시간을 해서 읽으므로, UTC 23:00에 깨어나도 KST
-- 달력의 "내일"(= 사용자가 맞이하는 오늘)이 나온다.
--
-- 시각을 바꿀 땐 여기 하나만 고치면 된다. api/notify-dday.ts는 자기가 몇 시에
-- 불리는지 모르고, KST_OFFSET_MINUTES는 시각이 아니라 "커플이 사는 달력"이라
-- 같이 고칠 필요가 없다.
select cron.schedule(
  'notify-dday',
  '0 23 * * *',
  $$
  select net.http_get(
    url := 'https://ourie.vercel.app/api/notify-dday',
    -- 엔드포인트가 GET만 export한다 (POST로 부르면 405다).
    -- 비밀값을 이 명령문에 박지 않고 실행할 때마다 Vault에서 꺼내 쓴다.
    -- 그래야 값을 바꿀 때 잡을 다시 만들지 않아도 된다.
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'
      )
    ),
    -- pg_net 기본값은 5초인데, 구독을 하나씩 순회하며 푸시 서비스의 응답을
    -- 기다리는 함수라 그 안에 못 끝날 수 있다. 응답 자체는 안 쓰지만 여기서
    -- 끊기면 요청이 중간에 잘린다.
    timeout_milliseconds := 60000
  );
  $$
);

-- 3. 확인용 ---------------------------------------------------
-- 잡이 걸렸는지:
--   select jobid, jobname, schedule, active from cron.job where jobname = 'notify-dday';
--
-- 어젯밤에 돌았는지 (pg_cron이 남기는 실행 기록):
--   select status, start_time, return_message
--     from cron.job_run_details
--     where jobid = (select jobid from cron.job where jobname = 'notify-dday')
--     order by start_time desc limit 5;
--
-- 상대가 실제로 200을 줬는지 (pg_net이 남기는 응답. 몇 분 뒤 정리된다):
--   select status_code, content from net._http_response order by created desc limit 5;
--
-- 되돌리려면:
--   select cron.unschedule('notify-dday');
