// 1일 1문답 알림 문구.
//
// 이 파일은 브라우저와 서버(api/daily-question.ts) 양쪽에서 쓴다. 그래서
// 순수 함수와 상수만 두고, DOM·Supabase·환경변수처럼 한쪽에만 있는 것에는
// 손대지 않는다 (wish/message.ts, calendar/message.ts와 같은 규칙).
//
// import를 하나도 하지 않는 것도 같은 이유다 — 서버 쪽 상대 경로 import에
// `.js` 확장자를 붙여야 하는 제약(api/poke.ts 주석 참고)을 애초에 만들지
// 않는다.

export interface DailyQuestionNotification {
  title: string
  body: string
  tag: string
  renotify: true
}

/** wish/message.ts의 wishNameLabel과 같은 일을 한다. 이 파일이 아무것도
 * import하지 않는다는 규칙을 지키려고 세 줄을 다시 적는다. */
function dailyQuestionNameLabel(personName: string | null | undefined): string {
  const trimmed = personName?.trim()
  return trimmed ? `${trimmed}님` : '상대방'
}

/**
 * 오늘의 질문에 답했을 때 상대방 기기에 뜰 알림.
 *
 * 소원권과 달리 답변 내용을 본문에 싣지 않는다. 소원권은 "무엇을 부탁했는지"가
 * 잠금화면에서 바로 전해져야 의미가 있지만, 이 기능은 오늘 뭐라고 답했는지
 * 앱에서 직접 확인하는 작은 기다림이 이 기능다운 결이라고 판단했다.
 *
 * `questionDate`를 tag에 넣는 이유는 wish의 wishId와 같다 — 날마다 알림이
 * 서로를 덮지 않아야 한다.
 */
export function buildDailyQuestionNotification(
  questionDate: string,
  /** 답한 사람의 `profiles.name`. `app_name`이 아니다 — DATABASE.md §2.1 참고. */
  senderName: string | null | undefined,
): DailyQuestionNotification {
  const name = dailyQuestionNameLabel(senderName)
  return {
    title: `${name}이 오늘의 질문에 답했어요`,
    body: '오늘 뭐라고 답했는지 앱에서 확인해보세요.',
    tag: `ourie-daily-question-${questionDate}`,
    renotify: true,
  }
}
