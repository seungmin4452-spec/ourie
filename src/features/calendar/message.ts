// 캘린더 알림 문구.
//
// 지금은 서버(api/calendar.ts)만 이 파일을 쓰지만, poke/message.ts·
// wish/message.ts와 같은 규칙(순수 함수와 상수만, DOM·Supabase·환경변수처럼
// 한쪽에만 있는 것은 두지 않음)을 그대로 따른다 — 나중에 설정 화면에 미리보기
// 같은 걸 붙일 때 브라우저에서도 그대로 가져다 쓸 수 있어야 한다.
//
// import를 하나도 하지 않는 것도 같은 이유다. 서버 쪽에서 상대 경로 import에
// `.js` 확장자를 붙여야 하는 제약(api/poke.ts 주석 참고)을 애초에 만들지
// 않는다.

export interface CalendarNotification {
  title: string
  body: string
  tag: string
  renotify: true
}

/**
 * 사람을 부르는 말. 넘기는 값은 반드시 `profiles.name`이어야 한다 —
 * `profiles.app_name`은 앱 이름이라 넣으면 "승민 ♥ 진선님이 우리 약속을
 * 등록했어요"가 된다.
 */
export function calendarNameLabel(personName: string | null | undefined): string {
  const trimmed = personName?.trim()
  return trimmed ? `${trimmed}님` : '상대방'
}

/**
 * "우리 약속"(is_shared)을 등록했을 때 상대방 기기에 뜰 알림.
 *
 * `detail`(날짜·시간·장소)은 호출하는 쪽이 이미 갖고 있는 값을 " · "로 이어
 * 붙여 넘긴다 — CalendarEventList가 목록 한 줄을 만드는 방식과 같다. 여기서
 * 다시 포맷하지 않는 이유는 위 주석의 무-import 규칙 때문이다.
 */
export function buildCalendarNotification(
  eventId: string,
  /** 일정을 등록한 사람의 `profiles.name`. `app_name`이 아니다 — 위 주석 참고. */
  senderName: string | null | undefined,
  title: string,
  detail: string,
): CalendarNotification {
  return {
    title: `${calendarNameLabel(senderName)}이 우리 약속을 등록했어요`,
    body: detail ? `${title} · ${detail}` : title,
    // 일정마다 tag가 달라야 서로를 덮지 않는다 — 오늘 잡은 약속이 어제 잡은
    // 약속 알림을 지우면, 알림함만 보고 있던 사람은 하나를 통째로 놓친다.
    tag: `ourie-calendar-${eventId}`,
    renotify: true,
  }
}
