import { Grid } from '@astryxdesign/core/Grid'
import { Selector } from '@astryxdesign/core/Selector'
import { useMemo } from 'react'

import { parseDateKey, toDateKey } from '../dday'
import type { DateKey } from '../types'

/** 연도 목록의 시작. 이보다 앞선 생일을 등록할 사람은 이 앱의 사용자가 아니다. */
const FIRST_YEAR = 1930

interface DatePartsInputProps {
  value: DateKey
  onChange: (value: DateKey) => void
}

/**
 * 년·월·일을 따로 고르는 날짜 입력.
 *
 * Astryx의 `DateInput`을 쓰지 않는 이유가 분명하다. 그 달력에는 연도 점프가
 * 없어서 1999년 생일을 넣으려면 월 화살표를 300번 넘게 눌러야 한다 (Astryx
 * 문서도 "생일처럼 먼 과거 날짜에는 달력을 쓰지 말라"고 적어두었다). 드롭다운
 * 셋이면 어느 해든 탭 세 번이고, 휴대폰에서 키보드가 뜨지 않는다.
 *
 * 연도는 최근이 위로 오게 내림차순이다 — 기념일은 대개 요 몇 년 안이고, 생일은
 * 검색으로 바로 찾는 편이 스크롤보다 빠르다.
 */
export function DatePartsInput({ value, onChange }: DatePartsInputProps) {
  const selected = parseDateKey(value)
  const year = selected.getFullYear()
  const month = selected.getMonth() + 1
  const day = selected.getDate()

  // 내년까지 열어둔다. 예정된 결혼기념일처럼 아직 오지 않은 날도 등록할 수 있고
  // (dday.ts가 D-N으로 센다), 그보다 먼 미래를 기념일로 적는 경우는 없다.
  const years = useMemo(() => {
    const lastYear = new Date().getFullYear() + 1
    return Array.from({ length: lastYear - FIRST_YEAR + 1 }, (_, index) => {
      const value = lastYear - index
      return { value: String(value), label: `${value}년` }
    })
  }, [])

  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => ({
        value: String(index + 1),
        label: `${index + 1}월`,
      })),
    [],
  )

  const days = useMemo(
    () =>
      Array.from({ length: daysInMonth(year, month) }, (_, index) => ({
        value: String(index + 1),
        label: `${index + 1}일`,
      })),
    [year, month],
  )

  /**
   * 31일을 고른 뒤 2월로 바꾸는 것 같은 조합은 말일로 당긴다. 날짜를 조용히
   * 다음 달로 넘기면(3월 3일이 된다) 사용자가 알아채지 못한 채 저장된다.
   */
  function commit(nextYear: number, nextMonth: number, nextDay: number) {
    const lastDay = daysInMonth(nextYear, nextMonth)
    onChange(toDateKey(new Date(nextYear, nextMonth - 1, Math.min(nextDay, lastDay))))
  }

  return (
    <Grid columns={3} gap={2}>
      <Selector
        label="년"
        options={years}
        value={String(year)}
        // 100개가 넘는 목록이라 검색을 켠다. "1999"를 치면 바로 걸린다.
        hasSearch
        searchPlaceholder="연도 검색"
        width="100%"
        onChange={(next) => commit(Number(next), month, day)}
      />
      <Selector
        label="월"
        options={months}
        value={String(month)}
        width="100%"
        onChange={(next) => commit(year, Number(next), day)}
      />
      <Selector
        label="일"
        options={days}
        value={String(day)}
        width="100%"
        onChange={(next) => commit(year, month, Number(next))}
      />
    </Grid>
  )
}

/** 그 달의 마지막 날. 0일은 앞 달의 말일이라는 Date의 성질을 그대로 쓴다. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}
