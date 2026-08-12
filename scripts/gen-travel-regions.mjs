/**
 * 행정동 경계 GeoJSON -> src/features/travel/{regions,districts}.ts 생성기.
 *
 * 원본은 행정동 3,558개다. 여기서 시도(16개)와 시군구(256개)로 합쳐서 두 벌의
 * SVG path를 만든다. 자세한 배경과 실행법은 src/features/travel/README.md 참고.
 *
 *   node scripts/gen-travel-regions.mjs <행정동.geojson> <출력 디렉터리>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = process.argv[2] ?? 'HangJeongDong.geojson'
const OUT_DIR = process.argv[3] ?? 'src/features/travel'

/** 결과 뷰박스의 높이. 폭은 한국 비율대로 따라온다. */
const VIEW_HEIGHT = 760
/** 단순화 허용 오차 (뷰박스 단위). 크게 잡을수록 파일이 작아지고 해안선이 뭉뚝해진다. */
const TOLERANCE = 0.45
/** 삽입도 안의 섬은 이미 확대돼 있어서 더 곱게 남긴다. */
const INSET_TOLERANCE = 0.2
/**
 * 이보다 작은 **섬**은 버린다 (제곱도, 약 25km² = 한 변 5km쯤).
 *
 * 남해안의 섬 수백 개가 점으로 흩어지는 걸 막는 것이 목적이다. 처음에는
 * 100km²였는데, 그러면 백령도(46km²)처럼 알아볼 만한 섬까지 사라진다.
 * 화면에서 25km²는 한 변 5픽셀쯤이라 여기가 "점"과 "섬"의 경계다.
 *
 * **섬에만 적용된다.** 다른 구역과 경계를 맞대는 조각은 크기와 무관하게 남긴다
 * (아래 markIslands 참고).
 */
const MIN_ISLAND_AREA_DEG2 = 0.00245
/** 이 경도보다 동쪽은 울릉도·독도다. 실제 위치에 그리면 지도 폭이 65% 늘어난다. */
const EAST_ISLAND_MIN_LON = 130.4
/** 독도와 울릉도를 가르는 경도. */
const DOKDO_MIN_LON = 131.5
/**
 * 옹진군에서 이 경도보다 서쪽은 서해 5도(백령·대청·소청·연평)다.
 *
 * 옹진군으로 한정하는 것이 중요하다. 경도만 보면 신안군의 가거도·홍도까지
 * 딸려 들어와 엉뚱한 상자에 담긴다.
 */
const WEST_ISLAND_MAX_LON = 125.9
const WEST_ISLAND_DISTRICT = '28720'

/**
 * 삽입도. 먼 섬을 실제 위치에 그리면 빈 바다가 지도를 잡아먹고, 정작 섬은
 * 화면에서 안 보인다. 본토 옆에 띠를 붙이고 그 안에 확대해 그린다 — 한국
 * 지도들이 쓰는 방식이다.
 *
 * `sido`/`district`는 이 섬들을 소유한 구역이다. 그 구역을 긁으면 상자 안
 * 섬도 같이 드러나고, 그 구역을 크게 볼 때 상자도 함께 보인다.
 */
const INSETS = [
  {
    id: 'seohae',
    label: '서해 5도',
    side: 'left',
    /** 백령도의 실제 위도에 맞춰 세로 위치를 잡는다. */
    anchorLat: 37.9,
    gap: 14,
    width: 88,
    height: 88,
    sido: '28',
    district: WEST_ISLAND_DISTRICT,
    /**
     * 인천 상세 화면에는 넣지 않는다. 상자가 인천 본토에서 멀어 프레임이
     * 세 배로 넓어지고, 그러면 정작 인천 자치구 열한 개가 손톱만 해져 누를 수
     * 없다. 옹진군은 영흥도·덕적도 같은 앞바다 섬으로 상세에서도 누를 수 있고,
     * 옹진군을 긁으면 서해 5도도 같이 드러난다 (같은 구역이다).
     */
    showInDetail: false,
    /** 서로 가까이 모여 있어 한 배율로 담을 수 있다. */
    items: [{ group: 'seohae', x: 10, y: 10, width: 68, height: 68 }],
  },
  {
    id: 'east',
    label: '울릉도 · 독도',
    side: 'right',
    anchorLat: 37.5,
    gap: 14,
    width: 96,
    height: 92,
    sido: '47',
    district: '47940',
    /**
     * 경북 상세에는 반드시 넣는다. 울릉군은 이 두 섬이 전부라, 상자를 빼면
     * 상세 화면에서 울릉군을 누를 방법이 아예 없어진다.
     */
    showInDetail: true,
    /**
     * 울릉도와 독도는 **배율이 다르다.** 독도(0.17km²)를 울릉도(74.7km²)와 같은
     * 배율로 그리면 화면에서 0.6픽셀이라 아예 안 보인다. 실제 축척이 아니라는
     * 것은 상자와 이름표로 드러낸다.
     */
    items: [
      { group: 'ulleung', x: 12, y: 20, width: 46, height: 46 },
      { group: 'dokdo', x: 70, y: 58, width: 16, height: 12 },
    ],
  },
]

/** 구 단위를 그대로 두는 유일한 시도. */
const SEOUL_SIDO = '11'
/** 서울을 뺀 광역시. 자치구를 하나로 합친다 (군은 남긴다). */
const METRO_SIDOS = new Set(['26', '27', '28', '30', '31'])
/**
 * 통합 전 광주의 자치구 다섯을 합칠 자리.
 *
 * 2026년 7월 광주가 전남과 합쳐지면서 자치구들이 통합시의 직속 시군구가 됐고,
 * 그 위에 "광주시"에 해당하는 코드가 원본에 없다. 그래서 광주 구 코드가 쓰는
 * 12210~12330 바로 앞의 빈 자리를 쓴다. 원본에 없는 코드임을 확인했다.
 */
const GWANGJU = { sido: '12', code: '12200', name: '광주' }

const SIDO_SHORT = {
  11: '서울',
  12: '전남광주',
  26: '부산',
  27: '대구',
  28: '인천',
  30: '대전',
  31: '울산',
  36: '세종',
  41: '경기',
  43: '충북',
  44: '충남',
  47: '경북',
  48: '경남',
  50: '제주',
  51: '강원',
  52: '전북',
}

// ── 기하 유틸 ────────────────────────────────────────────────

/** 메르카토르. 위도를 그냥 y로 쓰면 남북이 눌려서 한반도가 뚱뚱해진다. */
function project([lon, lat]) {
  return [(lon * Math.PI) / 180, Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))]
}

function ringArea(ring) {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  }
  return Math.abs(sum / 2)
}

function bbox(rings) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return { minX, minY, maxX, maxY }
}

/** Douglas-Peucker. 닫힌 고리라 시작점을 고정한 채 돌린다. */
function simplify(points, tolerance) {
  if (points.length < 4) return points

  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1

  const stack = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [first, last] = stack.pop()
    let maxDist = 0
    let index = -1

    const [x1, y1] = points[first]
    const [x2, y2] = points[last]
    const dx = x2 - x1
    const dy = y2 - y1
    const lenSq = dx * dx + dy * dy

    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i]
      let dist
      if (lenSq === 0) {
        dist = Math.hypot(px - x1, py - y1)
      } else {
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq))
        dist = Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
      }
      if (dist > maxDist) {
        maxDist = dist
        index = i
      }
    }

    if (maxDist > tolerance && index !== -1) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }

  return points.filter((_, i) => keep[i] === 1)
}

/**
 * 아래 단위(행정동)의 고리들을 상위 구역 하나의 경계로 합친다.
 *
 * 방향이 반대인 같은 변끼리 지우는 방식이다. 두 행정동이 맞닿은 변은 한쪽에서
 * a→b, 다른 쪽에서 b→a로 나타나므로, 짝이 맞는 변을 모두 빼면 바깥 경계만
 * 남는다. 진짜 다각형 합집합 연산보다 빠르고 부동소수점 오차가 끼지 않는다 —
 * 대신 원본이 위상적으로 깨끗해야(맞닿은 꼭짓점이 정확히 같은 값이어야) 한다.
 * SGIS 경계는 한 벌의 커버리지에서 나온 것이라 이 조건을 만족하고, 실제로
 * 시도 16개·시군구 256개 전부에서 고리가 하나도 남김없이 닫힌다. 닫히지 않은
 * 고리가 생기면 아래에서 소리내어 실패한다.
 */
function dissolve(rings, label) {
  const key = (p) => `${p[0]},${p[1]}`
  const edges = new Map()

  for (const ring of rings) {
    for (let i = 0; i + 1 < ring.length; i++) {
      const a = key(ring[i])
      const b = key(ring[i + 1])
      if (a === b) continue
      const backward = `${b}|${a}`
      if (edges.has(backward)) edges.delete(backward)
      else edges.set(`${a}|${b}`, [ring[i], ring[i + 1]])
    }
  }

  const bySource = new Map()
  for (const [k, edge] of edges) {
    const from = k.slice(0, k.indexOf('|'))
    if (!bySource.has(from)) bySource.set(from, [])
    bySource.get(from).push(edge)
  }

  const out = []
  for (const [, bucket] of bySource) {
    while (bucket.length > 0) {
      const first = bucket.pop()
      const ring = [first[0], first[1]]
      const start = key(first[0])
      let cursor = key(first[1])

      while (cursor !== start) {
        const next = bySource.get(cursor)
        if (!next || next.length === 0) {
          throw new Error(`${label}: 경계 고리가 닫히지 않았다 (원본 위상이 깨졌을 수 있다)`)
        }
        const edge = next.pop()
        ring.push(edge[1])
        cursor = key(edge[1])
      }
      out.push(ring)
    }
  }

  return out
}

/**
 * 어떤 조각이 **섬**인지 표시한다. 섬 = 다른 구역과 경계를 한 변도 맞대지 않는 조각.
 *
 * 이게 없으면 크기만 보고 버리게 되는데, 그러면 작은 내륙 조각까지 사라져서
 * 지도 한복판에 구멍이 뚫린다. 실제로 두 번 당했다:
 *
 *   - **달성군의 떨어진 반쪽**(74km²). 달성군은 대구 시가지에 갈려 두 조각인데,
 *     작은 쪽이 섬으로 오인돼 사라지면서 대구 한가운데가 뚫렸다.
 *   - **신안군**. 한 섬을 신안군과 무안군이 나눠 가진 경우, 시도 단위에서는 하나로
 *     합쳐져 살아남지만 시군구 단위에서는 각자 작아서 죽는다. 그래서 시도에는
 *     있는데 시군구에는 없는 땅이 생겼다.
 *
 * 판정은 정확하다. 맞닿은 두 구역은 같은 변을 방향만 반대로 갖고 있다
 * (dissolve와 같은 성질).
 */
function markIslands(regions) {
  const key = (p) => `${p[0]},${p[1]}`
  const owner = new Map() // 방향 있는 변 -> 그 변을 가진 구역 코드

  for (const region of regions) {
    for (const ring of region.rings) {
      for (let i = 0; i + 1 < ring.length; i++) {
        owner.set(`${key(ring[i])}|${key(ring[i + 1])}`, region.code)
      }
    }
  }

  for (const region of regions) {
    region.isIsland = region.rings.map((ring) => {
      for (let i = 0; i + 1 < ring.length; i++) {
        const neighbor = owner.get(`${key(ring[i + 1])}|${key(ring[i])}`)
        if (neighbor !== undefined && neighbor !== region.code) return false
      }
      return true
    })
  }
}

/**
 * 너무 작은 **섬**만 버린다. 내륙 조각은 크기와 무관하게 남긴다.
 *
 * 옹진군처럼 **전부가 작은 섬인 구역**도 있다. 문턱을 그대로 적용하면 그런 구역이
 * 지도에서 통째로 사라지므로, 하나도 안 남으면 제일 큰 조각은 살린다.
 */
function dropSpecks(rings, isIsland) {
  const kept = rings.filter(
    (ring, i) => !isIsland[i] || ringArea(ring) >= MIN_ISLAND_AREA_DEG2,
  )
  if (kept.length > 0) return kept
  // 울릉군은 전부가 삽입도로 빠져서 여기 남는 게 없다. 도형은 나중에
  // toPath가 삽입도에서 채운다.
  if (rings.length === 0) return []
  return [rings.reduce((a, b) => (ringArea(a) > ringArea(b) ? a : b))]
}

/** 고리 묶음을 비율을 지킨 채 목표 사각형 안에 가운데 맞춤으로 밀어 넣는다. */
function fitInto(rings, rect) {
  const { minX, minY, maxX, maxY } = bbox(rings)
  const scale = Math.min(rect.width / (maxX - minX), rect.height / (maxY - minY))
  const offsetX = rect.x + (rect.width - (maxX - minX) * scale) / 2
  const offsetY = rect.y + (rect.height - (maxY - minY) * scale) / 2
  // 투영 좌표는 y가 위로 자라고 SVG는 아래로 자라므로 여기서 뒤집는다.
  return rings.map((ring) =>
    ring.map(([x, y]) => [offsetX + (x - minX) * scale, offsetY + (maxY - y) * scale]),
  )
}

/** "수원시장안구" -> ["수원시 장안구", "장안구"]. 붙어 있으면 읽기 어렵다. */
function splitDistrictName(raw) {
  const match = /^(.+시)(.+[구군])$/.exec(raw)
  if (!match) return [raw, raw]
  return [`${match[1]} ${match[2]}`, match[2]]
}

/**
 * 긁는 단위를 정한다: **서울만 구까지, 나머지는 구를 상위로 합친다.**
 *
 * 여행 기록에서 "부산 해운대구"는 너무 잘다 — 부산에 다녀왔으면 부산이 칠해지는
 * 게 맞다. 서울만 예외인 것은 서울이 그만큼 넓어서 구 단위가 실제로 의미가 있기
 * 때문이다. 군(기장·달성·군위·강화·옹진·울주)은 시내와 전혀 다른 여행지라
 * 합치지 않고 남긴다.
 *
 * 판별은 **코드가 아니라 이름**으로 한다. 코드 끝자리로 일반구를 가리려 했더니
 * 광진구(11215)·미추홀구(28177)·증평군(43745)처럼 자치구·군인데도 끝자리가 0이
 * 아닌 경우가 수두룩했다.
 */
function mergeTarget(sido, sgg, sggnm, parentCodeOf) {
  if (sido === SEOUL_SIDO) return { code: sgg, name: sggnm }

  const isGu = sggnm.endsWith('구')
  if (isGu && METRO_SIDOS.has(sido)) return { code: `${sido}000`, name: SIDO_SHORT[sido] }
  if (isGu && sido === GWANGJU.sido) return { code: GWANGJU.code, name: GWANGJU.name }

  // 일반구(수원시장안구 등)는 이름에 시와 구가 함께 들어 있다.
  const general = /^(.+시)(.+구)$/.exec(sggnm)
  if (general) return { code: parentCodeOf(general[1]), name: general[1] }

  return { code: sgg, name: sggnm }
}

// ── 1. 원본 읽기 ────────────────────────────────────────────

const geo = JSON.parse(readFileSync(SRC, 'utf8'))

const sidoNames = new Map()
const districtGroups = new Map()
/** 삽입도로 빼둘 먼 섬들. 본 흐름을 타면 빈 바다가 지도를 잡아먹는다. */
const farIslands = { ulleung: [], dokdo: [], seohae: [] }

// 1차: 일반구를 가진 시의 상위 코드를 정한다.
//
// 원본에는 "수원시장안구"만 있고 "수원시" 행이 없어서, 자식 코드들의 공통
// 접두(4자리) + '0'으로 되돌린다 — 41111·41113·41115·41117 -> 41110. 이게 실제
// 행정안전부 시 코드다. 규칙이 어긋나면(접두가 4자리가 아니거나 이미 쓰이는
// 코드면) 조용히 틀린 코드를 만들지 말고 여기서 실패한다.
const generalGuChildren = new Map()
for (const feature of geo.features) {
  const { sido, sgg, sggnm } = feature.properties
  if (sido === SEOUL_SIDO || METRO_SIDOS.has(sido) || sido === GWANGJU.sido) continue
  const match = /^(.+시)(.+구)$/.exec(sggnm)
  if (!match) continue
  if (!generalGuChildren.has(match[1])) generalGuChildren.set(match[1], new Set())
  generalGuChildren.get(match[1]).add(sgg)
}

const allCodes = new Set(geo.features.map((f) => f.properties.sgg))
const generalGuParent = new Map()
for (const [name, codes] of generalGuChildren) {
  const list = [...codes]
  let prefix = list[0]
  for (const code of list) {
    let i = 0
    while (i < prefix.length && prefix[i] === code[i]) i++
    prefix = prefix.slice(0, i)
  }
  const parent = `${prefix}0`
  if (prefix.length !== 4 || allCodes.has(parent)) {
    throw new Error(`${name}: 상위 시 코드를 정할 수 없다 (자식 ${list.join(',')} -> ${parent})`)
  }
  generalGuParent.set(name, parent)
}

for (const sido of [...METRO_SIDOS, GWANGJU.sido]) {
  const merged = sido === GWANGJU.sido ? GWANGJU.code : `${sido}000`
  if (allCodes.has(merged)) throw new Error(`합친 구에 쓸 코드 ${merged}가 원본에 이미 있다`)
}

// 2차: 합친 단위로 묶는다.
for (const feature of geo.features) {
  const { sido, sidonm, sgg, sggnm } = feature.properties

  sidoNames.set(sido, sidonm)
  const target = mergeTarget(sido, sgg, sggnm, (si) => generalGuParent.get(si))
  if (!districtGroups.has(target.code)) {
    districtGroups.set(target.code, { name: target.name, sido, rings: [] })
  }

  for (const polygon of feature.geometry.coordinates) {
    for (const ring of polygon) {
      const group = farIslandGroup(ring, sgg)
      if (group) farIslands[group].push(ring.map(project))
      else districtGroups.get(target.code).rings.push(ring)
    }
  }
}

function farIslandGroup(ring, sgg) {
  if (ring.every(([lon]) => lon > EAST_ISLAND_MIN_LON)) {
    return ring.some(([lon]) => lon > DOKDO_MIN_LON) ? 'dokdo' : 'ulleung'
  }
  if (sgg === WEST_ISLAND_DISTRICT && ring.every(([lon]) => lon < WEST_ISLAND_MAX_LON)) {
    return 'seohae'
  }
  return null
}

for (const [name, rings] of Object.entries(farIslands)) {
  if (rings.length === 0) {
    throw new Error(`삽입도에 넣을 ${name} 섬을 찾지 못했다 — 원본의 경계 범위를 확인할 것`)
  }
}

// ── 2. 합치기 + 잔섬 정리 ──────────────────────────────────

// 먼저 시군구를 만든다. 시도는 **여기서 살아남은 조각으로만** 만든다 (아래 참고).
const districts = [...districtGroups]
  .map(([code, group]) => ({
    code,
    name: group.name,
    sido: group.sido,
    rings: dissolve(group.rings, `${code} ${group.name}`),
  }))
  .sort((a, b) => a.code.localeCompare(b.code))

markIslands(districts)
for (const district of districts) {
  district.rings = dropSpecks(district.rings, district.isIsland)
}

/**
 * 시도는 행정동에서 따로 합치지 않고, **살아남은 시군구 조각을 다시 합쳐서** 만든다.
 *
 * 따로 합치면 두 단계가 서로 다른 땅을 그리게 된다. 잔섬 문턱이 시도 단계에서는
 * 통과하고 시군구 단계에서는 걸리는 조각이 있기 때문인데(한 섬을 두 시군구가
 * 나눠 가진 경우가 그렇다), 그러면 "시도에는 있는데 덮을 시군구가 없는 땅"이
 * 생겨 지도에 구멍이 뚫린다. 여기서 만들면 그런 일이 원천적으로 불가능하다.
 *
 * 이어붙이기가 되는 이유는 시군구 조각이 원본의 변을 그대로 물려받았기 때문이다 —
 * 맞닿은 두 시군구는 같은 변을 방향만 반대로 갖고 있어서 그대로 상쇄된다.
 */
const bySido = new Map()
for (const district of districts) {
  if (!bySido.has(district.sido)) bySido.set(district.sido, [])
  bySido.get(district.sido).push(...district.rings)
}

const sidos = [...bySido]
  .map(([code, rings]) => ({
    code,
    name: sidoNames.get(code),
    rings: dissolve(rings, `${code} ${sidoNames.get(code)}`),
  }))
  .sort((a, b) => a.code.localeCompare(b.code))

// 투영은 합치기가 끝난 뒤에 한 번만. (dissolve는 원본 좌표가 정확히 같아야 돈다.)
for (const entry of [...sidos, ...districts]) {
  entry.rings = entry.rings.map((ring) => ring.map(project))
}

// ── 3. 뷰박스 확정 ──────────────────────────────────────────
// 본토만으로 크기를 정하고, 그 양옆에 삽입도용 띠를 덧붙인다.

const world = bbox(sidos.flatMap((s) => s.rings))
const scale = VIEW_HEIGHT / (world.maxY - world.minY)
const mainlandWidth = (world.maxX - world.minX) * scale

const round = (n) => Math.round(n * 10) / 10

/** 왼쪽 띠의 폭. 본토가 그만큼 오른쪽으로 밀린다. */
const leftStrip = INSETS.filter((i) => i.side === 'left').reduce(
  (w, i) => w + i.gap + i.width,
  0,
)
const rightStrip = INSETS.filter((i) => i.side === 'right').reduce(
  (w, i) => w + i.gap + i.width,
  0,
)

const toView = ([x, y]) => [leftStrip + (x - world.minX) * scale, (world.maxY - y) * scale]

const MAP_WIDTH = round(leftStrip + mainlandWidth + rightStrip)

// 각 삽입도의 상자 자리와, 그 안에 확대해 넣은 섬 도형.
let leftCursor = 0
let rightCursor = leftStrip + mainlandWidth
const insets = INSETS.map((spec) => {
  const x = spec.side === 'left' ? leftCursor + spec.gap : rightCursor + spec.gap
  if (spec.side === 'left') leftCursor = x + spec.width
  else rightCursor = x + spec.width

  const box = {
    x: round(x),
    y: round(toView(project([0, spec.anchorLat]))[1] - spec.height / 2),
    width: spec.width,
    height: spec.height,
  }

  const rings = spec.items.flatMap((item) =>
    fitInto(farIslands[item.group], {
      x: box.x + item.x,
      y: box.y + item.y,
      width: item.width,
      height: item.height,
    }),
  )

  return { ...spec, box, rings }
})

// ── 4. 단순화 -> path ───────────────────────────────────────

/** 코드 -> 그 구역에 붙는 삽입도 섬 도형. */
const INSET_RINGS_BY_CODE = new Map()
for (const inset of insets) {
  for (const code of [inset.sido, inset.district]) {
    INSET_RINGS_BY_CODE.set(code, [...(INSET_RINGS_BY_CODE.get(code) ?? []), ...inset.rings])
  }
}

function toPath(entry) {
  // 본토 조각과 삽입도 조각을 나눠 둔다. bounds(상세 화면의 프레임)는 본토만
  // 보고 잡아야 한다 — 멀리 있는 상자까지 담으면 프레임이 몇 배로 넓어지면서
  // 정작 그 시도의 시군구가 손톱만 해진다.
  const mainland = entry.rings
    .map((ring) => simplify(ring.map(toView), TOLERANCE))
    .filter((ring) => ring.length >= 4)

  const insetRings = (INSET_RINGS_BY_CODE.get(entry.code) ?? [])
    .map((ring) => simplify(ring, INSET_TOLERANCE))
    .filter((ring) => ring.length >= 4)

  const rings = [...mainland, ...insetRings]

  const path = rings
    .map((ring) => `M${ring.map(([x, y]) => `${round(x)} ${round(y)}`).join('L')}Z`)
    .join('')

  // 가장 큰 조각의 무게중심 = 라벨/탭 목표 지점.
  const largest = rings.reduce((a, b) => (ringArea(a) > ringArea(b) ? a : b))
  let cx = 0
  let cy = 0
  let a2 = 0
  for (let i = 0, j = largest.length - 1; i < largest.length; j = i++) {
    const cross = largest[j][0] * largest[i][1] - largest[i][0] * largest[j][1]
    a2 += cross
    cx += (largest[j][0] + largest[i][0]) * cross
    cy += (largest[j][1] + largest[i][1]) * cross
  }

  const box = bbox(rings)
  // 울릉군처럼 본토 조각이 하나도 없는 구역은 삽입도가 곧 그 구역이다.
  const frame = bbox(mainland.length > 0 ? mainland : rings)
  return {
    path,
    center: [round(cx / (3 * a2)), round(cy / (3 * a2))],
    size: round(Math.max(box.maxX - box.minX, box.maxY - box.minY)),
    bounds: [
      round(frame.minX),
      round(frame.minY),
      round(frame.maxX - frame.minX),
      round(frame.maxY - frame.minY),
    ],
    points: rings.reduce((n, r) => n + r.length, 0),
  }
}

const sidoOut = sidos.map((s) => ({ ...s, ...toPath(s) }))
const districtOut = districts.map((d) => ({ ...d, ...toPath(d) }))

// 삽입도를 품는 시도의 bounds는 섬 도형이 아니라 **상자와 이름표**까지 담아야
// 한다. 그러지 않으면 그 시도를 크게 볼 때 상자 가장자리와 위의 이름이 화면
// 밖으로 잘린다.
const LABEL_ROOM = 18
for (const inset of insets) {
  if (!inset.showInDetail) continue
  const region = sidoOut.find((r) => r.code === inset.sido)
  if (!region) continue
  const [x, y, w, h] = region.bounds
  const minX = Math.min(x, inset.box.x - 2)
  const minY = Math.min(y, inset.box.y - LABEL_ROOM)
  const maxX = Math.max(x + w, inset.box.x + inset.box.width + 2)
  const maxY = Math.max(y + h, inset.box.y + inset.box.height + 2)
  region.bounds = [round(minX), round(minY), round(maxX - minX), round(maxY - minY)]
}

// ── 5. 파일로 쓰기 ──────────────────────────────────────────

const HEADER = `// 이 파일은 손으로 고치지 않는다 — 행정동 경계 GeoJSON에서 생성했다.
// 생성 방법과 출처(통계청 SGIS · 공공누리 1유형)는 src/features/travel/README.md 참고.
`

const regionsTs = `${HEADER}
export interface TravelRegion {
  /** 행정안전부 시도 코드 두 자리. travel_visits에는 이 코드가 아니라 시군구 코드가 쌓인다. */
  code: string
  /** 정식 명칭. */
  name: string
  /** 지도 위/목록에 쓰는 짧은 이름. */
  shortName: string
  /** 라벨과 탭 목표의 기준점 (뷰박스 좌표). */
  center: [number, number]
  /** 뷰박스 좌표에서의 최대 변 길이. 탭 목표를 넓혀야 하는지 판단하는 데 쓴다. */
  size: number
  /** 이 시도만 크게 볼 때 쓰는 viewBox: [x, y, width, height]. */
  bounds: [number, number, number, number]
  /** SVG path의 d 속성. 시도 경계선과 탭 목표로 쓴다. */
  path: string
}

/** 지도 전체가 들어가는 좌표계. 시도·시군구 도형이 모두 이 안의 값이다. */
export const MAP_WIDTH = ${MAP_WIDTH}
export const MAP_HEIGHT = ${VIEW_HEIGHT}

export interface TravelInset {
  x: number
  y: number
  width: number
  height: number
  label: string
  /** 이 상자를 품은 시도. */
  sido: string
  /**
   * 그 시도의 상세 화면에도 그릴지. false면 전국 지도에서만 보인다 —
   * 상자가 본토에서 멀면 상세 프레임이 넓어져 시군구가 못 누를 만큼 작아진다.
   * 그 구역이 이 섬들뿐이라 상자를 빼면 누를 수 없어지는 경우에만 true다.
   */
  showInDetail: boolean
}

/**
 * 삽입도의 자리.
 *
 * 먼 섬을 실제 좌표에 그리면 빈 바다가 지도를 잡아먹으면서 정작 섬은 화면에서
 * 안 보인다 (독도는 1픽셀도 안 된다). 그래서 본토 옆에 상자를 두고 확대해
 * 넣는다 — 한국 지도들이 쓰는 방식이다. **실제 축척이 아니다**: 상자 안 섬들의
 * 배율은 서로 다를 수 있다 (README.md 참고).
 */
export const TRAVEL_INSETS: TravelInset[] = [
${insets
  .map(
    (i) => `  {
    x: ${i.box.x},
    y: ${i.box.y},
    width: ${i.box.width},
    height: ${i.box.height},
    label: '${i.label}',
    sido: '${i.sido}',
    showInDetail: ${i.showInDetail},
  },`,
  )
  .join('\n')}
]

/** 시도 ${sidoOut.length}개. 2026년 7월 1일 기준 (전남광주통합특별시 출범 반영). */
export const TRAVEL_REGIONS: TravelRegion[] = [
${sidoOut
  .map(
    (r) => `  {
    code: '${r.code}',
    name: '${r.name}',
    shortName: '${SIDO_SHORT[r.code]}',
    center: [${r.center[0]}, ${r.center[1]}],
    size: ${r.size},
    bounds: [${r.bounds.join(', ')}],
    path: '${r.path}',
  },`,
  )
  .join('\n')}
]
`

const districtsTs = `${HEADER}
export interface TravelDistrict {
  /** 행정안전부 시군구 코드 다섯 자리. travel_visits.region_code에 그대로 저장된다. */
  code: string
  /** 이 시군구가 속한 시도 코드. */
  sido: string
  /** 정식 명칭 ("수원시 장안구"). */
  name: string
  /** 상위 시도 안에서만 보여줄 때 쓰는 짧은 이름 ("장안구"). */
  shortName: string
  /** 라벨과 탭 목표의 기준점 (뷰박스 좌표). regions.ts와 같은 좌표계다. */
  center: [number, number]
  /** 뷰박스 좌표에서의 최대 변 길이. */
  size: number
  /** SVG path의 d 속성. */
  path: string
}

/** 시군구 ${districtOut.length}개. 긁는 단위이자 진행률의 분모다. */
export const TRAVEL_DISTRICTS: TravelDistrict[] = [
${districtOut
  .map((d) => {
    const [name, shortName] = splitDistrictName(d.name)
    return `  {
    code: '${d.code}',
    sido: '${d.sido}',
    name: '${name}',
    shortName: '${shortName}',
    center: [${d.center[0]}, ${d.center[1]}],
    size: ${d.size},
    path: '${d.path}',
  },`
  })
  .join('\n')}
]
`

writeFileSync(join(OUT_DIR, 'regions.ts'), regionsTs)
writeFileSync(join(OUT_DIR, 'districts.ts'), districtsTs)

// ── 확인용 요약 ─────────────────────────────────────────────
console.log(`viewBox 0 0 ${MAP_WIDTH} ${VIEW_HEIGHT}  (본토 폭 ${round(mainlandWidth)})`)
for (const inset of insets) {
  console.log(
    `삽입도 "${inset.label}" (${inset.side}) x=${inset.box.x} y=${inset.box.y} ` +
      `${inset.box.width}x${inset.box.height} · 소유 ${inset.sido}/${inset.district}`,
  )
}
console.log(`regions.ts   ${(regionsTs.length / 1024).toFixed(1)}KB  시도 ${sidoOut.length}개`)
console.log(`districts.ts ${(districtsTs.length / 1024).toFixed(1)}KB  시군구 ${districtOut.length}개`)
console.log('\n코드 시도       시군구  점     size   bounds')
for (const r of sidoOut) {
  const count = districtOut.filter((d) => d.sido === r.code).length
  console.log(
    `${r.code}  ${SIDO_SHORT[r.code].padEnd(9)}${String(count).padStart(5)}` +
      `${String(r.points).padStart(7)}${String(r.size).padStart(8)}   ${r.bounds.join(', ')}`,
  )
}
