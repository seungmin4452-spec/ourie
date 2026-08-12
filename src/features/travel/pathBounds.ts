export interface PathBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 이미 재본 path는 다시 재지 않는다. 전국 지도는 한 번 그릴 때 191개를 훑고,
 * 사진을 한 장 올릴 때마다 다시 그려진다.
 */
const CACHE = new Map<string, PathBounds>()

/** 좌표 하나. path 안의 숫자는 x, y가 번갈아 나온다. */
const NUMBER = /-?\d*\.?\d+/g

/**
 * SVG path가 차지하는 사각형.
 *
 * `districts.ts`·`regions.ts`의 path는 **M·L·Z만 쓰는 직선 다각형**이다
 * (생성 스크립트가 그렇게만 낸다). 곡선 제어점이 없으니 숫자를 x, y 순으로
 * 읽으면 그게 곧 꼭짓점이고, 최소/최대가 그대로 경계 상자가 된다.
 *
 * 사진 지도가 구역마다 사진을 앉힐 자리를 이걸로 구한다. 생성 데이터에 미리
 * 넣지 않은 이유는 시군구 191개 × 숫자 4개가 모든 사용자에게 실리는데 정작
 * 쓰는 쪽은 사진이 걸린 구역뿐이기 때문이다 — 대신 여기서 캐시한다.
 *
 * 브라우저의 `getBBox()`를 쓰지 않는 이유: 그건 DOM에 그려진 뒤에야 답을
 * 주므로, 그리기 전에 좌표를 정해야 하는 이 자리에서는 한 프레임 늦는다.
 */
export function pathBounds(d: string): PathBounds {
  const cached = CACHE.get(d)
  if (cached) return cached

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const numbers = d.match(NUMBER)
  if (numbers) {
    // 마지막 홀수 하나는 짝이 없으므로 버린다 (그럴 일은 없지만, 여기서
    // NaN이 새어 나가면 사진이 화면 밖에 그려져 원인을 찾기 어려워진다).
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      const x = Number(numbers[i])
      const y = Number(numbers[i + 1])
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  const bounds: PathBounds =
    minX === Infinity
      ? { x: 0, y: 0, width: 0, height: 0 }
      : { x: minX, y: minY, width: maxX - minX, height: maxY - minY }

  CACHE.set(d, bounds)
  return bounds
}
