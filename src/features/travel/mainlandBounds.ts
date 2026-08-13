import { pathBounds, type PathBounds } from './pathBounds'

/**
 * 먼 섬을 뺀 "본토"의 경계 상자.
 *
 * 뱃지를 만들면서 생긴 함수다. 시도 도형 전체를 경계 상자로 잡으면 **인천은
 * 본토가 사라진다** — 서해 5도가 한참 서쪽에 있어서 상자가 확 넓어지고, 그
 * 안에서 본토는 점 몇 개로 쪼그라든다. 경북(울릉·독도)도 같은 방향이다.
 * 전국 지도는 이 문제를 삽입도로 풀었지만(regions.ts의 TRAVEL_INSETS),
 * 60px짜리 뱃지에 삽입도를 넣을 자리는 없다.
 *
 * 그래서 뱃지는 **가장 큰 덩어리를 기준으로** 프레임을 잡는다. 먼 섬은 원
 * 밖으로 잘려 나가고, 인천은 인천처럼 보인다.
 *
 * 지도(RegionMap)는 이걸 쓰지 않는다. 거기서는 섬도 눌러야 하는 실제 지역이라
 * 화면 밖으로 밀어낼 수 없다.
 */

/** 서브패스 하나. path는 `M`으로 시작하는 덩어리들이 이어 붙은 모양이다. */
interface SubPath {
  bounds: PathBounds
  /** 어느 것이 "본토"인지 고르는 기준. 넓이가 아니라 경계 상자 면적이다. */
  area: number
}

/**
 * 본토에 붙여 볼 이웃의 거리 문턱. 본토 긴 변의 비율이다.
 *
 * 0이면 본토 상자에 닿는 것만 들어와서, 코앞의 섬(강화도, 남해안 섬들)이
 * 잘려 지역 모양이 어색해진다. 반대로 크게 잡으면 서해 5도까지 도로
 * 들어온다. 실제 데이터에서 이 둘이 갈리는 자리가 20% 언저리다.
 */
const NEAR_RATIO = 0.2

/** 두 상자 사이의 거리. 겹치거나 닿으면 0이다. */
function gapBetween(a: PathBounds, b: PathBounds): number {
  const dx = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width))
  const dy = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height))
  return Math.max(dx, dy)
}

function union(a: PathBounds, b: PathBounds): PathBounds {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}

const CACHE = new Map<string, PathBounds>()

export function mainlandBounds(d: string): PathBounds {
  const cached = CACHE.get(d)
  if (cached) return cached

  // `M`마다 새 덩어리가 시작된다 (생성 스크립트가 M·L·Z만 낸다 —
  // pathBounds.ts의 같은 자리 주석 참고).
  const subPaths: SubPath[] = d
    .split('M')
    .filter((chunk) => chunk.trim() !== '')
    .map((chunk) => {
      const bounds = pathBounds(`M${chunk}`)
      return { bounds, area: bounds.width * bounds.height }
    })

  if (subPaths.length === 0) {
    const empty = { x: 0, y: 0, width: 0, height: 0 }
    CACHE.set(d, empty)
    return empty
  }

  // 가장 큰 덩어리가 본토다. 섬이 아무리 많아도 하나하나는 본토보다 작다.
  const seed = subPaths.reduce((best, item) => (item.area > best.area ? item : best))

  const near = Math.max(seed.bounds.width, seed.bounds.height) * NEAR_RATIO
  const result = subPaths.reduce(
    (acc, item) => (gapBetween(seed.bounds, item.bounds) <= near ? union(acc, item.bounds) : acc),
    seed.bounds,
  )

  CACHE.set(d, result)
  return result
}
