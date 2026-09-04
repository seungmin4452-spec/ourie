// `.js` 확장자: 이 파일은 message.ts를 거쳐 Node 런타임 함수(api/notify-dday.ts)로
// 딸려 들어가고, 그쪽은 번들 없이 ESM으로 실행된다. 자세한 이유는 그 파일의 주석에.
import type { Anniversary, DateKey } from './types.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * `date` 컬럼 값을 로컬 자정으로 파싱한다.
 *
 * `new Date('2023-05-01')`은 이 문자열을 UTC 자정으로 읽기 때문에 UTC보다
 * 서쪽에서는 하루 전날이 되고 KST에서는 같은 날이어도 시각이 어긋난다.
 * 기념일은 달력상의 하루이므로 전부 보는 사람의 로컬 달력 기준으로 다룬다.
 */
export function parseDateKey(key: DateKey): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function toDateKey(date: Date): DateKey {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  // DateKey는 자릿수까지 강제하는 템플릿 리터럴 타입이라 문자열 조합만으로는
  // 좁혀지지 않는다. 위 padStart가 그 형태를 보장한다.
  return `${date.getFullYear()}-${month}-${day}` as DateKey
}

export function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/**
 * 두 로컬 자정 사이의 일수. 반올림으로 서머타임 전환에서 생기는 ±1시간을
 * 흡수한다 (한국엔 없지만 커플이 여행 간 곳에서도 앱은 돌아간다).
 */
function diffInDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY)
}

/**
 * 이 기념일이 다음으로 돌아오는 날. 이미 지났고 반복하지 않으면 null.
 * 오늘은 "지난 날"이 아니라 다음 기념일로 친다 — 이게 D-DAY 케이스다.
 */
export function nextOccurrence(anniversary: Anniversary, today: Date): Date | null {
  const origin = parseDateKey(anniversary.date)

  if (!anniversary.repeat_yearly) {
    return origin.getTime() >= today.getTime() ? origin : null
  }

  // 평년의 2월 29일은 Date 자체의 정규화로 3월 1일로 넘어간다. 국내 달력
  // 앱들이 윤일 기념일을 처리하는 방식과 같다.
  const thisYear = new Date(today.getFullYear(), origin.getMonth(), origin.getDate())
  if (thisYear.getTime() >= today.getTime()) return thisYear

  return new Date(today.getFullYear() + 1, origin.getMonth(), origin.getDate())
}

/**
 * 이 기념일이 가장 최근에 지나간 날. 반복하지 않거나, 아직 한 번도 돌아온
 * 적이 없으면(등록한 지 1년이 안 됐으면) null.
 *
 * `nextOccurrence`의 1년 전이 곧 "가장 최근에 지난 날"이다 — 다음이 올해면
 * 작년 것이 최근이고, 다음이 내년이면(올해 것을 이미 지났으면) 올해 것이
 * 최근이다. 기준일(`origin`)보다 앞서면 아직 한 번도 안 지난 것이므로 버린다.
 */
function lastOccurrence(anniversary: Anniversary, today: Date): Date | null {
  if (!anniversary.repeat_yearly) return null
  const origin = parseDateKey(anniversary.date)
  const next = nextOccurrence(anniversary, today)
  if (!next) return null

  const last = new Date(next.getFullYear() - 1, origin.getMonth(), origin.getDate())
  return last.getTime() >= origin.getTime() ? last : null
}

export interface DdaySummary {
  anniversary: Anniversary
  /** 반복하지 않는 기념일이 이미 지났으면 null. */
  nextDate: Date | null
  /** 오늘부터 nextDate까지의 일수. 0이면 오늘. nextDate가 null이면 null. */
  daysUntil: number | null
  /**
   * nextDate가 몇 번째 반복인지. 1이면 1주년, 0이면 기준일 그 자체.
   * 반복하지 않는 기념일은 주년 개념이 없으므로 null.
   */
  yearsAt: number | null
  /**
   * 기준일부터 센 날짜 수. 한국식으로 기준일이 1일째이며, 이 값이 "D+N"의
   * N이다. 기준일이 아직 오지 않았으면 null.
   */
  daysSince: number | null
  /** 기준일이 아직 오지 않았을 때 그날까지 남은 일수. 이미 지났으면 null. */
  daysUntilOrigin: number | null
  /**
   * 매년 반복하는 기념일이 가장 최근에 지난 날부터 센 일수(오늘 포함 0부터).
   * 반복하지 않거나 아직 한 번도 돌아온 적이 없으면 null. `formatDayCount`가
   * "고른 기준 기념일이 아닌 반복 기념일"(생일 등)의 주기 표기에 쓴다.
   */
  daysSinceLastOccurrence: number | null
}

export function summarize(anniversary: Anniversary, today: Date): DdaySummary {
  const origin = parseDateKey(anniversary.date)
  const nextDate = nextOccurrence(anniversary, today)
  const elapsed = diffInDays(origin, today)
  const last = lastOccurrence(anniversary, today)

  return {
    anniversary,
    nextDate,
    daysUntil: nextDate ? diffInDays(today, nextDate) : null,
    yearsAt:
      nextDate && anniversary.repeat_yearly
        ? nextDate.getFullYear() - origin.getFullYear()
        : null,
    daysSince: elapsed >= 0 ? elapsed + 1 : null,
    daysUntilOrigin: elapsed < 0 ? -elapsed : null,
    daysSinceLastOccurrence: last ? diffInDays(last, today) : null,
  }
}

/**
 * 받은 순서를 그대로 지킨다 — 목록에 뜨는 순서는 등록 순이고, 그 정렬은
 * 조회하는 쪽이 한다 (`api/anniversary.ts`).
 *
 * 한때 여기서 "가장 먼저 다가오는 것"부터로 다시 정렬했다. 그러면 기념일을
 * 하나 추가할 때마다 목록 순서가 통째로 흔들려서 방금 넣은 것을 눈으로 찾아야
 * 했고, 무엇보다 `pickHighlight`가 "배열의 앞쪽"이라는 암묵적 약속에 기대게
 * 됐다. 지금은 그 함수가 스스로 고른다.
 */
export function summarizeAll(anniversaries: Anniversary[], today: Date): DdaySummary[] {
  return anniversaries.map((anniversary) => summarize(anniversary, today))
}

/**
 * 홈 위젯이 큰 글씨로 보여줄 기념일.
 *
 * 커플이 기념일 화면에서 직접 고른 것(`is_primary`)이 항상 이긴다. 자동으로
 * 고르던 때는 생일을 하나 등록하는 순간 그게 늘 가장 가까운 기념일이 되어,
 * 정작 보고 싶던 "처음 만난 날"을 밀어냈다.
 *
 * 아무것도 고르지 않았으면 예전 규칙 그대로다 — 가장 가까이 다가온 것, 다가오는
 * 게 하나도 없으면(반복하지 않는 기념일만 있고 전부 지난 경우) 그중 가장 최근
 * 것. 등록된 기념일이 있는데 위젯이 비어 보이는 게 더 이상하다.
 */
export function pickHighlight(summaries: DdaySummary[]): DdaySummary | null {
  const chosen = summaries.find((summary) => summary.anniversary.is_primary)
  if (chosen) return chosen

  const nearest = nearestUpcoming(summaries)
  if (nearest) return nearest

  // 다가오는 게 하나도 없는 경우 (반복하지 않는 기념일만 있고 전부 지났다).
  // 그중 가장 최근 것 — 등록된 기념일이 있는데 위젯이 비어 보이면 더 이상하다.
  let latest: DdaySummary | null = null
  for (const summary of summaries) {
    if (latest == null || summary.anniversary.date > latest.anniversary.date) {
      latest = summary
    }
  }
  return latest
}

/**
 * 지나지 않은 기념일 중 가장 먼저 다가오는 것. `pickHighlight`의 자동 선택
 * 규칙과 위젯 보조 문구(`formatUpcomingLabel`)가 함께 쓴다 — 후자는 커플이
 * 직접 고른 기념일이 있어도 그와 무관하게 "다음으로 뭐가 오는지"를 알려줘야
 * 하기 때문이다.
 */
export function nearestUpcoming(summaries: DdaySummary[]): DdaySummary | null {
  let nearest: DdaySummary | null = null
  for (const summary of summaries) {
    if (summary.daysUntil == null) continue
    if (nearest?.daysUntil == null || summary.daysUntil < nearest.daysUntil) {
      nearest = summary
    }
  }
  return nearest
}

/**
 * 화면에 뜨는 디데이 표기.
 *
 * 커플이 직접 고른 기준 기념일(`is_primary`)이거나 반복하지 않는 기념일은
 * 기준일을 1일째로 센 누적이다 — 등록한 날이 D+1이고 그 이튿날이 D+2다
 * (국내 커플 앱들의 관례이자 PRD §3.2가 말하는 "만난 날부터 N일"). 기준일이
 * 아직 오지 않았으면 그날까지 남은 날을 D-N으로 센다.
 *
 * 그 외의 매년 반복 기념일(생일처럼 기준으로 고르지 않은 것)은 누적이 의미가
 * 없다 — "태어난 지 10023일째"는 생일에 아무 뜻이 없다. 대신 그 해의 주기로
 * 센다: 가장 최근에 지난 날이 더 가까우면 그날부터 D+N, 다음 돌아올 날이 더
 * 가까우면 그날까지 D-N.
 */
export function formatDayCount(summary: DdaySummary): string {
  const { anniversary, daysSince, daysUntilOrigin, daysUntil, daysSinceLastOccurrence } = summary

  if (!anniversary.is_primary && anniversary.repeat_yearly) {
    const sinceIsCloser =
      daysSinceLastOccurrence != null &&
      (daysUntil == null || daysSinceLastOccurrence <= daysUntil)

    if (sinceIsCloser) {
      return daysSinceLastOccurrence === 0 ? 'D-DAY' : `D+${daysSinceLastOccurrence}`
    }
    if (daysUntil != null) {
      return daysUntil === 0 ? 'D-DAY' : `D-${daysUntil}`
    }
  }

  return daysSince != null ? `D+${daysSince}` : `D-${daysUntilOrigin ?? 0}`
}

/**
 * 다가오는 반복 기념일까지의 카운트다운. 큰 숫자가 아니라 그 아래 보조
 * 문구용이다 — 큰 숫자는 formatDayCount가 맡는다.
 */
export function formatDday(daysUntil: number): string {
  if (daysUntil === 0) return 'D-DAY'
  return daysUntil > 0 ? `D-${daysUntil}` : `D+${-daysUntil}`
}

export function formatDateKey(key: DateKey): string {
  const date = parseDateKey(key)
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`
}

/** "3주년". 기준일이 있는 해와 일회성 기념일은 null. */
export function formatMilestone(yearsAt: number | null): string | null {
  return yearsAt != null && yearsAt > 0 ? `${yearsAt}주년` : null
}

/**
 * 디데이 위젯 큰 숫자 아래 보조 문구.
 *
 * `highlighted`는 위젯이 크게 보여주는 기념일(커플이 직접 고른 것, 없으면
 * 자동 선택). `upcoming`은 그와 별개로 등록된 기념일 전체 중 지나지 않고
 * 가장 먼저 다가오는 것 — 둘이 같은 기념일이면 그 주년("1주년까지 D-N")을,
 * 다르면 더 가까운 쪽 이름("생일까지 D-N")을 알려준다. 크게 뜬 기념일을
 * 고정해서 봐도 정작 다음으로 뭐가 다가오는지는 놓치지 않게 하려는 것이다.
 */
export function formatUpcomingLabel(
  highlighted: DdaySummary,
  upcoming: DdaySummary | null,
): string | null {
  if (upcoming == null || upcoming.daysUntil == null) return null

  const isSame = upcoming.anniversary.id === highlighted.anniversary.id
  const label = isSame ? formatMilestone(upcoming.yearsAt) : upcoming.anniversary.title
  if (label == null) return null

  return upcoming.daysUntil === 0 ? `오늘이 ${label}이에요` : `${label}까지 ${formatDday(upcoming.daysUntil)}`
}

/** 100일 단위 마일스톤 간격 — 국내 커플 앱들의 관례 (`notification/message.ts`와 같은 규칙). */
const MILESTONE_HUNDRED_STEP = 100

export interface Milestone {
  /** "1주년" 또는 "100일". */
  label: string
  date: Date
  /** 오늘부터 이 날까지 남은 일수. 0이면 오늘. */
  daysUntil: number
}

/** `origin`으로부터 `days`일 뒤(D+`days`가 이 날짜다). */
function dayCountDate(origin: Date, days: number): Date {
  const result = new Date(origin)
  result.setDate(result.getDate() + days - 1)
  return result
}

/**
 * 기준 기념일로부터 다가오는 마일스톤(100일 단위·1년 단위) 목록.
 *
 * DB에 저장하지 않고 그때그때 계산만 한다 — 기준 기념일 하나가 이미 매일
 * 알림의 100일·주년 문구(`notification/message.ts`의 `occasionOn`)를 만들고
 * 있으므로, 여기서는 "다음으로 뭐가 오는지"를 같은 규칙으로 미리 보여주는
 * 화면 전용 계산이다. 100일 단위와 주년이 겹치는 날은 주년이 이긴다(알림과
 * 같은 우선순위) — 정렬이 안정적이라(stable sort) 주년을 먼저 채워두면
 * 같은 날짜에서 항상 주년이 앞선다.
 */
export function upcomingMilestones(anniversary: Anniversary, today: Date, count: number): Milestone[] {
  const origin = parseDateKey(anniversary.date)
  const candidates: Milestone[] = []

  function collect(labelFor: (n: number) => string, dateFor: (n: number) => Date) {
    let found = 0
    for (let n = 1; found < count; n++) {
      const date = dateFor(n)
      const daysUntil = diffInDays(today, date)
      if (daysUntil >= 0) {
        candidates.push({ label: labelFor(n), date, daysUntil })
        found++
      }
      // origin이 미래라면(등록만 해두고 아직 시작 전) 무한 루프를 막는다 —
      // n이 아무리 커져도 항상 미래이므로 count에 닿는 순간 멈춘다는 보장이
      // 없고, 대신 넉넉히 훑고 멈춘다.
      if (n > count + 3650) break
    }
  }

  collect(
    (years) => `${years}주년`,
    (years) => new Date(origin.getFullYear() + years, origin.getMonth(), origin.getDate()),
  )
  collect(
    (steps) => `${steps * MILESTONE_HUNDRED_STEP}일`,
    (steps) => dayCountDate(origin, steps * MILESTONE_HUNDRED_STEP),
  )

  candidates.sort((a, b) => a.date.getTime() - b.date.getTime())

  const deduped: Milestone[] = []
  for (const candidate of candidates) {
    const prev = deduped[deduped.length - 1]
    if (prev && prev.date.getTime() === candidate.date.getTime()) continue
    deduped.push(candidate)
  }

  return deduped.slice(0, count)
}
