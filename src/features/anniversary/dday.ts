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
}

export function summarize(anniversary: Anniversary, today: Date): DdaySummary {
  const origin = parseDateKey(anniversary.date)
  const nextDate = nextOccurrence(anniversary, today)
  const elapsed = diffInDays(origin, today)

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
  }
}

/**
 * 홈 화면이 읽는 순서대로 정렬한다. 가장 먼저 다가오는 것부터, 그 뒤에 이미
 * 지나간 일회성 기념일을 최근 순으로 — 오래된 항목이 사라지지 않고 뒤로만
 * 밀리게.
 */
export function summarizeAll(anniversaries: Anniversary[], today: Date): DdaySummary[] {
  return anniversaries
    .map((anniversary) => summarize(anniversary, today))
    .sort((a, b) => {
      if (a.daysUntil == null && b.daysUntil == null) {
        return b.anniversary.date.localeCompare(a.anniversary.date)
      }
      if (a.daysUntil == null) return 1
      if (b.daysUntil == null) return -1
      return a.daysUntil - b.daysUntil
    })
}

/**
 * 홈 위젯이 큰 글씨로 보여줄 기념일 — 가장 가까이 다가온 것. 다가오는 게
 * 하나도 없으면(반복하지 않는 기념일만 등록했고 전부 지난 경우) 그중 가장
 * 최근 것을 쓴다. 등록된 기념일이 있는데 위젯이 비어 보이는 게 더 이상하다.
 */
export function pickHighlight(summaries: DdaySummary[]): DdaySummary | null {
  return summaries.find((summary) => summary.daysUntil != null) ?? summaries[0] ?? null
}

/**
 * 화면에 크게 뜨는 디데이 표기.
 *
 * 기준일을 1일째로 센다 — 등록한 날이 D+1이고 그 이튿날이 D+2다 (국내 커플
 * 앱들의 관례이자 PRD §3.2가 말하는 "만난 날부터 N일"). 기준일이 아직
 * 오지 않았으면 그날까지 남은 날을 D-N으로 센다.
 */
export function formatDayCount(summary: DdaySummary): string {
  const { daysSince, daysUntilOrigin } = summary
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
