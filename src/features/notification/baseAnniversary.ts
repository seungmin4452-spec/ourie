// 알림이 기준으로 삼을 기념일을 고르는 규칙. 화면(설정 미리보기)과 서버
// (api/notify-dday.ts)가 같은 규칙을 써야 "설정에서 본 문구"와 "실제로 오는
// 알림"이 어긋나지 않으므로 한 군데에 둔다.

/** 기념일 중 이 함수가 보는 부분만. 서버는 두 컬럼만 읽어오면 된다. */
export interface BaseAnniversaryCandidate {
  title: string
  date: string
}

/**
 * 하루 한 번 오는 알림은 하나의 숫자만 셀 수 있다. 여러 기념일 중 **기준일이
 * 가장 이른 것**을 그 하나로 쓴다 — 커플이 가장 먼저 등록하는 "처음 만난 날",
 * "사귄 날"이 보통 가장 오래된 날이고, 그게 곧 "우리가 며칠째인지"를 세는
 * 기준이기 때문이다.
 *
 * 홈 위젯의 큰 숫자(`pickHighlight`)는 이와 달리 "가장 가까이 다가온" 기념일을
 * 고른다. 위젯은 다음에 뭐가 오는지를 알려주는 자리이고, 알림은 오늘이
 * 며칠째인지를 알려주는 자리라 기준이 다르다.
 */
export function pickBaseAnniversary<T extends BaseAnniversaryCandidate>(
  anniversaries: T[],
): T | null {
  if (anniversaries.length === 0) return null
  // date는 YYYY-MM-DD라 문자열 비교가 곧 날짜 비교다.
  return anniversaries.reduce((earliest, candidate) =>
    candidate.date < earliest.date ? candidate : earliest,
  )
}
