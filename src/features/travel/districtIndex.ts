import { TRAVEL_DISTRICTS, type TravelDistrict } from './districts'

/**
 * 시도 코드 -> 그 안의 시군구들. districts.ts는 생성물이라 손대지 않고, 이렇게
 * 쓰기 좋게 묶는 일만 여기서 한다.
 *
 * 모듈이 처음 불릴 때 한 번만 만든다. 191개를 훑는 일이 상세 화면을 열 때마다,
 * 지도를 다시 그릴 때마다 반복될 이유가 없다.
 */
const BY_SIDO = TRAVEL_DISTRICTS.reduce<Record<string, TravelDistrict[]>>((acc, district) => {
  ;(acc[district.sido] ??= []).push(district)
  return acc
}, {})

export function districtsOf(sidoCode: string): TravelDistrict[] {
  return BY_SIDO[sidoCode] ?? []
}

/** 긁을 수 있는 지역의 총 개수. 진행률의 분모다. */
export const DISTRICT_COUNT = TRAVEL_DISTRICTS.length

/**
 * 저장된 코드 중 지금 지도가 아는 것만 센다.
 *
 * 행정구역은 바뀐다 — 2026년 7월에 광주와 전남이 합쳐지면서 시도가 하나
 * 줄었다. 그때 사라진 코드가 travel_visits에 남아 있어도 지도에는 그릴 도형이
 * 없으므로, 진행률이 "191곳 중 193곳"이 되지 않게 여기서 걸러낸다.
 *
 * Set(긁은 곳)과 Map(지역별 사진) 둘 다 받는다. 두 지도 위젯이 묻는 것은
 * 어느 쪽이든 "이 코드가 들어 있나"뿐이다.
 */
export function countKnownVisits(codes: { has(code: string): boolean }): number {
  return TRAVEL_DISTRICTS.reduce(
    (count, district) => count + (codes.has(district.code) ? 1 : 0),
    0,
  )
}
