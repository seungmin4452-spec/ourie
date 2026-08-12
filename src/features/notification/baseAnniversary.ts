// 알림이 기준으로 삼을 기념일을 고르는 규칙. 화면(설정 미리보기)과 서버
// (api/notify-dday.ts)가 같은 규칙을 써야 "설정에서 본 문구"와 "실제로 오는
// 알림"이 어긋나지 않으므로 한 군데에 둔다.

/** 기념일 중 이 함수가 보는 부분만. 서버는 세 컬럼만 읽어오면 된다. */
export interface BaseAnniversaryCandidate {
  title: string
  date: string
  /** 커플이 기념일 화면의 라디오로 직접 고른 것 (`anniversaries.is_primary`). */
  is_primary: boolean
}

/**
 * 하루 한 번 오는 알림은 하나의 숫자만 셀 수 있다. **커플이 직접 고른 기념일**
 * (`is_primary`, 홈 위젯에 크게 뜨는 바로 그것)을 그 하나로 쓴다 — 알림과 위젯이
 * 서로 다른 날을 세면 같은 앱에서 숫자가 두 개 보인다.
 *
 * 한때는 기준일이 가장 이른 것을 자동으로 골랐다. 그러면 오래전에 넣어둔 날이
 * 늘 이겨서, 정작 보고 싶어 골라둔 기념일은 알림에 한 번도 나오지 않았다.
 *
 * 고른 적이 없을 때만 그 예전 규칙으로 떨어진다 — 커플이 가장 먼저 등록하는
 * "처음 만난 날", "사귄 날"이 보통 가장 오래된 날이고, 그게 곧 "우리가
 * 며칠째인지"를 세는 기준이기 때문이다.
 */
export function pickBaseAnniversary<T extends BaseAnniversaryCandidate>(
  anniversaries: T[],
): T | null {
  const chosen = anniversaries.find((candidate) => candidate.is_primary)
  if (chosen) return chosen

  if (anniversaries.length === 0) return null
  // date는 YYYY-MM-DD라 문자열 비교가 곧 날짜 비교다.
  return anniversaries.reduce((earliest, candidate) =>
    candidate.date < earliest.date ? candidate : earliest,
  )
}
