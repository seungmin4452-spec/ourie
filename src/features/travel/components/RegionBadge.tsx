import { useId } from 'react'

import { badgeSize, type RegionBadgeProgress } from '../badges'
import { districtsOf } from '../districtIndex'
import { mainlandBounds } from '../mainlandBounds'
import { pathBounds } from '../pathBounds'

/**
 * 뱃지 좌표계. 원이 딱 들어가는 정사각형이라, 지름이 몇 px이든 안쪽 계산이
 * 그대로 쓰인다.
 */
const VIEW = 100

/**
 * 도형이 들어갈 안쪽 정사각형의 한 변.
 *
 * 원 안에 정사각형을 내접시키면 한 변이 지름의 약 0.707이다. 지역 도형은
 * 정사각형을 꽉 채우지 않으므로 조금 더 키워도 원 밖으로 넘지 않는다. 76은
 * 경기(가로로 넓다)와 강원(세로로 길다) 둘 다 원 안에 머무는 선이다.
 */
const INNER = 76

interface RegionBadgeProps {
  progress: RegionBadgeProgress
  /**
   * 시군구마다 걸린 사진. `photo` 등급일 때 모자이크로 깔린다.
   *
   * 없으면 도형만으로 모자이크를 그린다 — 사진을 받아오기 전이나 진열장
   * 미리보기에서도 뱃지가 제 모습으로 보여야 하기 때문이다.
   */
  photos?: ReadonlyMap<string, string>
  /** 지름(px). 기본값은 시군구 수에서 정해진다 (badgeSize). */
  size?: number
}

/**
 * 시도 하나의 뱃지. 원 안에 그 지역 실루엣이 들어간다.
 *
 * **원형(B안)으로 정한 이유**는 진열장이다 (docs/REGION_BADGE.md §3). 도형을
 * 그대로 쓰면 높이가 제각각이라 격자가 들쭉날쭉하고, 못 얻은 칸이 어디였는지
 * 눈으로 세기 어렵다. 원은 작아도 뱃지로 읽히고 사진 모자이크가 예쁘게 잘린다.
 *
 * **프레임을 전체 도형이 아니라 본토 기준으로 잡는다** (mainlandBounds). 인천을
 * 통째로 담으면 서해 5도 때문에 본토가 점 몇 개로 사라진다. 먼 섬은 원 밖으로
 * 잘려 나가는 편이 "인천처럼 보이는" 뱃지에 가깝다.
 *
 * 등급이 색이 아니라 **얼마나 채워졌나**로 드러난다 — 비어 있다(locked) →
 * 채워진다(visited) → 우리 사진이 된다(photo). 금·은 메달을 쓰지 않는 이유는
 * neutral 팔레트뿐인 이 앱에서 트로피가 제일 화려한 물건이 되기 때문이다.
 */
export function RegionBadge({ progress, photos, size }: RegionBadgeProps) {
  const { region, tier, total, visited } = progress
  const diameter = size ?? badgeSize(total)

  // clipPath id는 문서 안에서 유일해야 한다. 진열장에 16개가 함께 뜨고 지도
  // 위젯에도 같은 뱃지가 나올 수 있다.
  const clipId = useId()

  const box = mainlandBounds(region.path)
  // 본토가 가로로 넓든 세로로 길든 원 안에 들어가게 긴 변을 기준으로 줄인다.
  const scale = INNER / Math.max(box.width, box.height, 1)
  // 도형의 가운데를 원의 가운데(50, 50)로 옮긴다.
  const tx = VIEW / 2 - (box.x + box.width / 2) * scale
  const ty = VIEW / 2 - (box.y + box.height / 2) * scale

  const districts = tier === 'photo' ? districtsOf(region.code) : []

  const label =
    tier === 'locked'
      ? `${region.shortName} 뱃지 잠김 — ${total}곳 중 ${visited}곳`
      : tier === 'visited'
        ? `${region.shortName} 뱃지 — 다 다녀왔어요`
        : `${region.shortName} 뱃지 — 사진까지 다 채웠어요`

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      width={diameter}
      height={diameter}
      role="img"
      aria-label={label}
    >
      <defs>
        {/* 도형이 원 밖으로 새지 않게 자른다. 먼 섬이 잘리는 것도 여기서다. */}
        <clipPath id={clipId}>
          <circle cx={VIEW / 2} cy={VIEW / 2} r={VIEW / 2} />
        </clipPath>
        {/* 변환을 걸지 않는다. 이 clipPath를 쓰는 <image>가 이미 변환된 <g>
            안에 있어서, 자르는 도형도 같은 좌표계(지도 좌표)로 놓인다. */}
        {districts.map((district) => (
          <clipPath key={district.code} id={`${clipId}-${district.code}`}>
            <path d={district.path} />
          </clipPath>
        ))}
      </defs>

      {/* 뱃지 바탕. 잠긴 칸도 원은 남는다 — 빈 칸이 보여야 모으고 싶어진다
          (docs/REGION_BADGE.md §2). */}
      <circle
        cx={VIEW / 2}
        cy={VIEW / 2}
        r={VIEW / 2 - 1}
        className={tier === 'locked' ? 'fill-transparent stroke-border' : 'fill-muted stroke-border'}
        strokeWidth={1}
      />

      <g clipPath={`url(#${clipId})`}>
        <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
          {tier === 'locked' && (
            // 외곽선만. 안이 비어 있어야 "아직"이 읽힌다.
            // vectorEffect가 없으면 선 굵기까지 scale에 곱해져서, 작은 시도일수록
            // 선이 두꺼워진다 (scale이 크다).
            <path
              d={region.path}
              className="fill-transparent stroke-secondary"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}

          {tier === 'visited' && <path d={region.path} className="fill-secondary" />}

          {tier === 'photo' &&
            districts.map((district) => {
              const url = photos?.get(district.code)
              if (!url) {
                // 사진을 아직 못 받아온 칸. 도형만으로도 모자이크가 읽히도록
                // 경계선을 남긴다 (배경색으로 그어 조각들이 갈린다).
                return (
                  <path
                    key={district.code}
                    d={district.path}
                    className="fill-secondary stroke-body"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                )
              }
              const tile = pathBounds(district.path)
              return (
                <image
                  key={district.code}
                  href={url}
                  x={tile.x}
                  y={tile.y}
                  width={tile.width}
                  height={tile.height}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#${clipId}-${district.code})`}
                />
              )
            })}
        </g>
      </g>
    </svg>
  )
}
