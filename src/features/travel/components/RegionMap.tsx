import { useId, useMemo, useState, type FocusEvent, type KeyboardEvent } from 'react'

import { districtsOf } from '../districtIndex'
import { TRAVEL_DISTRICTS, type TravelDistrict } from '../districts'
import { pathBounds } from '../pathBounds'
import { MAP_HEIGHT, MAP_WIDTH, TRAVEL_INSETS, TRAVEL_REGIONS, type TravelRegion } from '../regions'

/** 위젯 카드 안쪽 폭. 탭 목표가 44px에 못 미치는 구역을 고르는 기준이 된다. */
const ASSUMED_RENDER_WIDTH = 320
/** UI_GUIDE §8의 최소 터치 타겟. */
const MIN_TAP_PX = 44
/** 상세 화면의 시군구 이름 크기. UI_GUIDE §3의 보조 텍스트(13px)보다 한 단계 작다. */
const LABEL_PX = 10
/**
 * 한글 한 글자의 폭은 대략 글자 크기만큼이다. 이름이 도형보다 넓어지면 라벨을
 * 접는다 — 안 그러면 글자가 옆 구역까지 삐져나가 어느 쪽 이름인지 알 수 없다.
 */
const KOREAN_GLYPH_RATIO = 0.95

/**
 * 코팅 아래에 무엇이 있고, 어디가 드러나 있는지.
 *
 * 두 위젯이 같은 지도를 쓰지만 "드러남"의 뜻이 다르다:
 *
 * - `photo` — 사진 **한 장**이 지도 전체에 깔려 있고, 긁은 구역만 그 조각이
 *   보인다 (우리가 다녀온 곳 · 스크래치 지도)
 * - `mosaic` — 구역마다 **사진이 따로** 있고, 사진이 있다는 것이 곧 드러났다는
 *   뜻이다 (사진으로 채우는 지도)
 *
 * 드러난 구역 목록을 밖에서 따로 받지 않고 각 갈래가 안고 있는 이유가 이것이다.
 * mosaic에서 "사진은 없는데 드러난 구역" 같은 상태는 존재할 수 없어야 한다.
 */
export type RegionMapReveal =
  | { kind: 'photo'; url: string | null; revealedCodes: ReadonlySet<string> }
  | { kind: 'mosaic'; photos: ReadonlyMap<string, string> }

interface RegionMapProps {
  /**
   * 그릴 범위. null이면 전국(시도를 눌러 상세로 들어간다), 시도가 오면 그
   * 시도만 크게 보여준다(시군구를 누른다).
   */
  region: TravelRegion | null
  reveal: RegionMapReveal
  /** 지금 고른 시군구. 사진 지도에서 "이 구역에 사진을 건다"를 가리킨다. */
  selectedCode?: string | null
  /**
   * 위젯 편집 모드에서는 false. 카드를 옮기거나 떼는 중에 손가락이 스치면서
   * 지도가 열리거나 칠해지면 안 된다.
   */
  isInteractive: boolean
  onSelectRegion?: (region: TravelRegion) => void
  onSelectDistrict?: (district: TravelDistrict) => void
}

/**
 * 대한민국 지도를 그리고, **아직 드러나지 않은 시군구만** 코팅으로 덮는다.
 *
 * 층은 아래에서부터 이렇다:
 *   1. 사진 — 지도 전체에 깔린 한 장이거나(photo), 구역마다 한 장씩이거나(mosaic)
 *   2. 시군구 코팅. 드러난 곳은 fill이 transparent가 되어 사진이 비친다
 *   3. 경계선 — 시군구는 가늘게, 시도는 굵게. 삽입도 상자도 여기서 그린다
 *   4. 탭 목표. 전국이면 시도, 상세면 시군구다
 *
 * 3층까지가 pointer-events-none인 것이 중요하다. 칠하는 층과 누르는 층을
 * 나눠야 "전국에서는 시도를 누르고, 상세에서는 시군구를 누른다"가 같은 그림
 * 위에서 성립한다.
 *
 * Astryx에는 지도가 없어서 SVG를 직접 쓴다. 색은 전부 토큰 기반 유틸리티고
 * (fill-skeleton = "아직 안 드러난 자리"), 좌표만 뷰박스 단위의 숫자다.
 */
export function RegionMap({
  region,
  reveal,
  selectedCode,
  isInteractive,
  onSelectRegion,
  onSelectDistrict,
}: RegionMapProps) {
  const outlineId = useId()
  const [focusedCode, setFocusedCode] = useState<string | null>(null)

  // 상세 화면은 그 시도의 bounds를 그대로 viewBox로 쓴다. 시군구 도형이 전국과
  // 같은 좌표계에 있어서, 화면만 잘라내면 사진까지 자연스럽게 확대된다.
  const [vx, vy, vw, vh] = region?.bounds ?? [0, 0, MAP_WIDTH, MAP_HEIGHT]

  const districts = region ? districtsOf(region.code) : TRAVEL_DISTRICTS

  function isRevealed(code: string): boolean {
    return reveal.kind === 'mosaic' ? reveal.photos.has(code) : reveal.revealedCodes.has(code)
  }

  /**
   * 사진을 오려낼 모양. **지금 그리는 구역만** 합친다.
   *
   * 전국 지도의 실루엣을 그대로 쓰면 상세 화면에서 옆 시도까지 사진이 비친다 —
   * 코팅은 이 시도의 시군구에만 덮이므로, 긁지도 않은 이웃이 훤히 드러난
   * 것처럼 보인다.
   */
  const clipOutline = useMemo(() => districts.map((district) => district.path).join(''), [districts])

  /**
   * 사진이 걸린 구역과 그 사진이 앉을 자리. 화면에 지금 그리는 구역만 본다 —
   * 상세 화면에서 옆 시도의 사진까지 받아올 이유가 없다.
   */
  const tiles = useMemo(() => {
    if (reveal.kind !== 'mosaic') return []
    return districts.flatMap((district) => {
      const url = reveal.photos.get(district.code)
      return url ? [{ district, url, box: pathBounds(district.path) }] : []
    })
  }, [districts, reveal])

  /**
   * 도형만으로는 손가락이 안 닿는 구역들. 가운데에 투명한 원을 하나 더 얹어
   * 탭 목표를 넓힌다.
   *
   * 문턱은 화면에서 재야 의미가 있어서 현재 viewBox 폭으로 환산한다 — 상세로
   * 들어가면 같은 구역이 더 크게 그려지므로 도움이 필요한 곳도 줄어든다.
   *
   * 작은 구역끼리도 원이 겹친다. 나중에 그린 쪽이 위로 오므로, 도움이 제일
   * 급한 **작은 순서가 맨 위**에 오도록 큰 것부터 그린다.
   */
  const tapTargets = useMemo(() => {
    const unitsPerPx = vw / ASSUMED_RENDER_WIDTH
    const minSize = MIN_TAP_PX * unitsPerPx
    const all: (TravelRegion | TravelDistrict)[] = region ? districts : TRAVEL_REGIONS
    const small = all.filter((t) => t.size < minSize).sort((a, b) => b.size - a.size)

    return small.map((item) => {
      // 이웃 중심까지 거리의 절반을 넘지 않게 자른다. 인천이나 서울처럼 구가
      // 촘촘한 곳에서는 원이 서로 깊게 겹쳐서, 누른 자리에서 제일 가까운 구가
      // 아니라 나중에 그려진 구가 칠해진다.
      let half = Infinity
      for (const other of all) {
        if (other.code === item.code) continue
        const d = Math.hypot(other.center[0] - item.center[0], other.center[1] - item.center[1])
        if (d / 2 < half) half = d / 2
      }
      return { item, radius: Math.min((MIN_TAP_PX / 2) * unitsPerPx, half) }
    })
  }, [districts, region, vw])

  /**
   * 상세 화면에만 시군구 이름을 적는다. 전국 지도에 191개를 적으면 글자가
   * 도형을 덮어서 지도가 아니라 글자 더미가 된다.
   *
   * 글자 크기는 뷰박스가 아니라 **화면**에서 일정해야 한다. 상세 화면의 프레임은
   * 서울(47)부터 경북(315)까지 여섯 배 넘게 차이 나서, 고정 값을 쓰면 어떤
   * 시도에서는 깨알같고 어떤 시도에서는 화면을 뒤덮는다.
   */
  const labels = useMemo(() => {
    if (!region) return []
    const fontSize = LABEL_PX * (vw / ASSUMED_RENDER_WIDTH)
    return districts
      .filter((d) => d.shortName.length * fontSize * KOREAN_GLYPH_RATIO <= d.size)
      .map((district) => ({ district, fontSize }))
  }, [districts, region, vw])

  const items: (TravelRegion | TravelDistrict)[] = region ? districts : TRAVEL_REGIONS
  const focusedPath = items.find((item) => item.code === focusedCode)?.path ?? null
  const selectedPath = items.find((item) => item.code === selectedCode)?.path ?? null

  function activate(item: TravelRegion | TravelDistrict) {
    if (region) onSelectDistrict?.(item as TravelDistrict)
    else onSelectRegion?.(item as TravelRegion)
  }

  function handleKeyDown(event: KeyboardEvent<SVGElement>, item: TravelRegion | TravelDistrict) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    // 스페이스를 막지 않으면 지역을 누를 때마다 홈이 한 화면씩 내려간다.
    event.preventDefault()
    activate(item)
  }

  /**
   * 키보드로 옮겨온 포커스만 표시한다. React에는 focus-visible에 대응하는
   * 이벤트가 없어서 실제 상태를 요소에 직접 물어본다 — 이걸 안 하면 마우스로
   * 누를 때마다 굵은 테두리가 남아서, 칠하지도 않은 지역이 선택된 것처럼 보인다.
   */
  function handleFocus(event: FocusEvent<SVGElement>, code: string) {
    if (event.currentTarget.matches(':focus-visible')) setFocusedCode(code)
  }

  return (
    <svg
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      className="w-full"
      role="group"
      aria-label={
        region ? `${region.name} 지도` : reveal.kind === 'mosaic' ? '사진 지도' : '다녀온 곳 지도'
      }
    >
      <defs>
        <clipPath id={outlineId}>
          <path d={clipOutline} />
        </clipPath>
        {tiles.map(({ district }) => (
          <clipPath key={district.code} id={`${outlineId}-${district.code}`}>
            <path d={district.path} />
          </clipPath>
        ))}
      </defs>

      {reveal.kind === 'photo' &&
        (reveal.url ? (
          // slice = object-fit: cover. 한반도는 세로로 길어서 어떤 사진을 넣어도
          // 좌우가 잘리는데, 자르는 일을 여기서 해야 저장된 사진이 온전히 남는다
          // (src/lib/image.ts의 downscaleImage 주석 참고).
          //
          // 상세 화면에서도 이 사각형은 전국 크기 그대로다. viewBox만 좁아지므로
          // 사진이 같은 자리에서 확대되고, 전국 지도에서 보던 그 조각이 그대로
          // 커진다.
          <image
            href={reveal.url}
            x={0}
            y={0}
            width={MAP_WIDTH}
            height={MAP_HEIGHT}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${outlineId})`}
          />
        ) : (
          // 사진을 아직 안 골랐을 때의 바탕. 코팅(fill-skeleton)과 뚜렷이 달라야
          // 한다 — 처음에 fill-muted(#f1f1f1)를 썼더니 코팅(#ebebeb)과 거의 같은
          // 색이라, 긁어도 아무 일도 안 일어난 것처럼 보였다. fill-secondary는
          // 라이트에서 중간 회색, 다크에서 밝은 회색이라 양쪽 모드 모두에서
          // 코팅과 갈린다.
          <path d={clipOutline} className="fill-secondary" />
        ))}

      {/* 구역마다 한 장씩. 사진은 그 구역의 경계 상자를 꽉 채우고(slice) 도형
          모양으로 잘린다 — 지도가 사진 조각들로 이어붙여진다. */}
      {tiles.map(({ district, url, box }) => (
        <image
          key={district.code}
          href={url}
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${outlineId}-${district.code})`}
        />
      ))}

      {districts.map((district) => {
        const revealed = isRevealed(district.code)
        return (
          <path
            key={district.code}
            d={district.path}
            // stroke를 fill과 같은 색으로 함께 준다. 구역마다 따로 단순화한
            // 해안선은 이웃과 완벽히 겹치지 않아서, 안 그러면 코팅 사이의
            // 머리카락만 한 틈으로 사진이 새어 나온다.
            strokeWidth={1}
            className={`pointer-events-none transition-colors ease-out ${
              revealed ? 'fill-transparent stroke-transparent' : 'fill-skeleton stroke-skeleton'
            }`}
          />
        )
      })}

      {/* 시군구는 가늘게, 시도는 굵게. 전국 지도에서 "지금 누르는 단위는
          시도"라는 걸 선 굵기가 말해준다. */}
      <g className="pointer-events-none fill-none stroke-border">
        {districts.map((district) => (
          <path key={district.code} d={district.path} strokeWidth={0.5} />
        ))}
        {(region ? [region] : TRAVEL_REGIONS).map((item) => (
          <path key={item.code} d={item.path} strokeWidth={1.4} />
        ))}
      </g>

      {/* 삽입도. 실제 축척이 아니라는 걸 상자와 이름으로 밝힌다. 상세 화면에
          그리는지는 데이터가 정한다 (regions.ts의 showInDetail). */}
      {TRAVEL_INSETS.filter(
        (inset) => region == null || (inset.showInDetail && inset.sido === region.code),
      ).map((inset) => (
        <g key={inset.label} className="pointer-events-none">
          <rect
            x={inset.x}
            y={inset.y}
            width={inset.width}
            height={inset.height}
            rx={4}
            className="fill-none stroke-border"
            strokeWidth={1}
          />
          <text
            x={inset.x + inset.width / 2}
            y={inset.y - 5}
            textAnchor="middle"
            fontSize={11}
            className="fill-secondary"
          >
            {inset.label}
          </text>
        </g>
      ))}

      {/* 지금 고른 구역. 사진을 고르는 동안 화면 아래쪽 버튼이 어느 구역을
          말하는지는 이 선 하나로 이어진다. */}
      {selectedPath && (
        <path
          d={selectedPath}
          className="pointer-events-none fill-none stroke-accent-bg"
          strokeWidth={2}
        />
      )}

      {/* 키보드 포커스 표시. SVG path에는 outline 유틸리티가 브라우저마다 다르게
          먹어서, 포커스된 구역만 굵은 선으로 한 번 더 그린다. */}
      {focusedPath && (
        <path
          d={focusedPath}
          className="pointer-events-none fill-none stroke-accent-bg"
          strokeWidth={2.5}
        />
      )}

      {/* 누르는 층. 전국이면 시도, 상세면 시군구다. */}
      {items.map((item) => (
        <path
          key={item.code}
          d={item.path}
          role="button"
          aria-pressed={
            region == null
              ? undefined
              : reveal.kind === 'mosaic'
                ? item.code === selectedCode
                : isRevealed(item.code)
          }
          aria-label={region ? item.name : `${item.name} 자세히 보기`}
          tabIndex={isInteractive ? 0 : -1}
          // outline-none: 크롬은 SVG 도형에 포커스가 가면 도형이 아니라 그
          // **경계 상자**에 네모를 그린다. 강원도에 커다란 직사각형이 씌워지는
          // 꼴이라 끄고, 위에서 도형을 따라가는 선을 직접 그린다.
          className={`fill-transparent outline-none ${isInteractive ? 'cursor-pointer' : ''}`}
          onClick={isInteractive ? () => activate(item) : undefined}
          onKeyDown={isInteractive ? (event) => handleKeyDown(event, item) : undefined}
          onFocus={(event) => handleFocus(event, item.code)}
          onBlur={() => setFocusedCode(null)}
        />
      ))}

      {/* 시군구 이름. 코팅 위에도, 드러난 사진 위에도 읽혀야 해서 배경색으로
          테두리를 두른다 (paint-order=stroke가 글자 뒤에 깔아준다). */}
      {labels.map(({ district, fontSize }) => (
        <text
          key={district.code}
          x={district.center[0]}
          y={district.center[1]}
          fontSize={fontSize}
          textAnchor="middle"
          dominantBaseline="middle"
          strokeWidth={fontSize * 0.3}
          paintOrder="stroke"
          className="pointer-events-none fill-primary stroke-body"
        >
          {district.shortName}
        </text>
      ))}

      {isInteractive &&
        tapTargets.map(({ item, radius }) => (
          <circle
            key={item.code}
            cx={item.center[0]}
            cy={item.center[1]}
            r={radius}
            className="cursor-pointer fill-transparent"
            // 도형 쪽 path가 이미 버튼 역할과 이름을 갖고 있다. 여기까지 읽히면
            // 스크린 리더에 같은 지역이 두 번 나온다.
            aria-hidden
            onClick={() => activate(item)}
          />
        ))}
    </svg>
  )
}
