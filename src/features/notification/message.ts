// 하루 한 번 보내는 디데이 알림의 문구를 만든다.
//
// 이 파일은 브라우저와 서버(api/notify-dday.ts) 양쪽에서 쓴다. 그래서 순수
// 함수만 두고, DOM·Supabase·환경변수 같은 한쪽에만 있는 것에는 절대 손대지
// 않는다. api/ 쪽은 tsconfig에서 경로 별칭(@/)을 쓸 수 없으므로 여기서도
// 상대 경로로만 import한다 (Vercel이 api/의 tsconfig path mapping을 지원하지
// 않는다).
//
// 아래 import의 `.js` 확장자도 서버 쪽 제약이다. 이 파일은 Node 런타임 함수로
// 딸려 들어가는데 그쪽은 번들되지 않고 ESM으로 그대로 실행되므로, 확장자가
// 없으면 런타임에 ERR_MODULE_NOT_FOUND가 난다 (api/notify-dday.ts의 주석 참고).
// Vite는 `.js`를 `.ts`로 알아서 해석하므로 브라우저 빌드에는 영향이 없다.

import { parseDateKey, toDateKey } from '../anniversary/dday.js'
import type { DateKey } from '../anniversary/types.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** 마일스톤을 며칠 전에 미리 알릴지. */
export const LEAD_DAYS = 3

/** 100일 단위로 센다 — 100일, 200일, ... 국내 커플 앱들의 관례다. */
const HUNDRED_STEP = 100

/** 1000일 단위는 같은 100일 단위여도 한 번 더 특별하게 다룬다. */
const SPECIAL_STEP = 1000

export interface DdayNotification {
  /** 알림 제목. iOS는 이 위에 앱 이름을 따로 보여준다. */
  title: string
  body: string
}

export interface DdayNotificationInput {
  /** 기준이 되는 기념일의 이름. 예: "처음 만난 날" */
  anniversaryTitle: string
  /** 그 기념일의 기준일 (YYYY-MM-DD). */
  date: string
  /** 알림을 보내는 날 (커플의 달력 기준, YYYY-MM-DD). */
  today: string
}

/**
 * 날짜 문자열을 로컬 자정으로 파싱한다.
 *
 * 입력을 `DateKey`가 아닌 평범한 문자열로 받는 이유: 서버는 DB에서 읽은
 * `date` 컬럼(그냥 string)과 자기가 만든 오늘 날짜를 넘기는데, 그때마다
 * 호출부가 템플릿 리터럴 타입으로 캐스팅하게 만들면 캐스트가 여기저기 번진다.
 * 형태 보장은 이 한 줄로 모은다.
 */
function parse(value: string): Date {
  return parseDateKey(value as DateKey)
}

/**
 * 기준일을 1일째로 센 날짜 수 — 화면의 D+N과 같은 N이다
 * (`dday.ts`의 `daysSince`).
 *
 * 두 날짜 모두 같은 방식으로 로컬 자정으로 파싱하므로, 서버가 어느 타임존에서
 * 돌든 차이는 달력상의 일수 그대로다.
 */
export function dayCount(date: string, today: string): number {
  const from = parse(date)
  const to = parse(today)
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY) + 1
}

type Occasion =
  | { kind: 'year'; years: number }
  | { kind: 'hundred'; days: number }

/**
 * `date`(기준일)로부터 센 `on` 날이 축하할 만한 날인지.
 *
 * 주년과 100일 단위가 겹치면 주년이 이긴다 — "7300일"보다 "20주년"이 훨씬
 * 와닿는다.
 */
function occasionOn(date: string, on: string): Occasion | null {
  const days = dayCount(date, on)
  if (days <= 1) return null // 기준일 당일과 그 이전은 축하 대상이 아니다.

  const origin = parse(date)
  const target = parse(on)
  const years = target.getFullYear() - origin.getFullYear()

  // 평년의 2월 29일 기념일은 3월 1일로 넘긴다. new Date(2025, 1, 29)가
  // 2025-03-01로 정규화되는 성질을 그대로 쓴다 — dday.ts의 nextOccurrence와
  // 같은 규칙이라 화면과 알림이 어긋나지 않는다.
  const yearlyReturn = new Date(target.getFullYear(), origin.getMonth(), origin.getDate())
  if (years >= 1 && toDateKey(yearlyReturn) === on) {
    return { kind: 'year', years }
  }

  if (days >= HUNDRED_STEP && days % HUNDRED_STEP === 0) {
    return { kind: 'hundred', days }
  }

  return null
}

function occasionLabel(occasion: Occasion): string {
  return occasion.kind === 'year' ? `${occasion.years}주년` : `${occasion.days}일`
}

/** `key`에서 `days`일 뒤의 날짜. */
function addDays(key: string, days: number): string {
  const date = parse(key)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

// 매일 같은 문장이 오면 며칠 만에 읽지 않게 된다. 날짜 수로 골라 돌려쓰기
// 때문에 같은 날 두 번 받아도 문구는 같고, 하루가 지나면 바뀐다.
const DAILY_LINES = [
  '오늘도 하루가 쌓였어요.',
  '어제보다 하루 더 함께예요.',
  '오늘은 어떤 하루였나요?',
  '이 숫자가 계속 커지고 있어요.',
  '오늘의 기록도 남겨볼까요?',
  '평범한 오늘도 언젠가 추억이 돼요.',
  '서로에게 한마디 남겨보는 건 어때요?',
]

/**
 * 오늘 보낼 알림 문구. 보낼 이유가 없으면(기준일이 아직 오지 않은 것도 아니고
 * 계산이 불가능한 경우) null.
 *
 * 우선순위는 오늘의 마일스톤 → 사흘 뒤 마일스톤 예고 → 평범한 하루다.
 */
export function buildDdayNotification({
  anniversaryTitle,
  date,
  today,
}: DdayNotificationInput): DdayNotification {
  const days = dayCount(date, today)

  // 기준일이 아직 오지 않은 기념일(예정된 결혼기념일 등)은 세는 방향이 반대다.
  if (days < 1) {
    const remaining = 1 - days
    return {
      title: `${anniversaryTitle}까지 D-${remaining}`,
      body: `${remaining}일 뒤면 ${anniversaryTitle}이에요.`,
    }
  }

  const todayOccasion = occasionOn(date, today)
  if (todayOccasion) {
    return celebrate(anniversaryTitle, todayOccasion, days)
  }

  const upcoming = occasionOn(date, addDays(today, LEAD_DAYS))
  if (upcoming) {
    return {
      title: `${occasionLabel(upcoming)}까지 ${LEAD_DAYS}일 남았어요`,
      body: `오늘은 ${anniversaryTitle}부터 ${days}일째예요. 슬슬 준비해볼까요?`,
    }
  }

  return {
    title: `오늘로 D+${days}`,
    body: `${anniversaryTitle}부터 ${days}일째. ${DAILY_LINES[days % DAILY_LINES.length]}`,
  }
}

function celebrate(
  anniversaryTitle: string,
  occasion: Occasion,
  days: number,
): DdayNotification {
  if (occasion.kind === 'year') {
    return {
      title: `🎉 오늘 ${occasion.years}주년이에요`,
      body: `${anniversaryTitle}부터 ${days}일. 함께한 ${occasion.years}년을 축하해요.`,
    }
  }

  if (occasion.days % SPECIAL_STEP === 0) {
    return {
      title: `🎉 오늘 ${occasion.days}일이에요`,
      body: `${anniversaryTitle}부터 ${occasion.days}일. 네 자리가 된 날이니 오늘만큼은 크게 축하해요.`,
    }
  }

  return {
    title: `🎉 오늘 ${occasion.days}일이에요`,
    body: `${anniversaryTitle}부터 딱 ${occasion.days}일째. 오늘은 조금 특별하게 보내요.`,
  }
}
