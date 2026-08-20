import type { CSSProperties } from 'react'

import type { AppEffectId } from '../types'

type Variant = Extract<AppEffectId, 'cherry_blossom' | 'snow' | 'custom_image'>

interface FallingParticlesProps {
  variant: Variant
  /** 화면에 동시에 떠 있는 조각 수. 많을수록 화려하지만 그만큼 무겁다. */
  count?: number
  /** variant가 'custom_image'일 때만 쓴다 — 떨어뜨릴 이미지의 주소. */
  imageUrl?: string
}

const PARTICLE_CLASS: Record<Variant, string> = {
  cherry_blossom: 'effect-particle-petal',
  snow: 'effect-particle-snow',
  custom_image: 'effect-particle-image',
}

/**
 * 화면 위에서 아래로 흩날리는 조각들 (벚꽃 잎 · 눈송이 · 관리자가 올린 이미지).
 *
 * 각자 CSS 애니메이션 하나로 떨어진다 — JS로 위치를 매 프레임 계산하는 대신
 * `animation-delay`를 음수로 줘서 처음부터 화면 중간중간에 이미 떨어지고
 * 있는 것처럼 시작한다 (안 그러면 켜지는 순간 다 같이 맨 위에서 출발해
 * 파도처럼 한 줄로 쏟아진다).
 *
 * 좌표는 Math.random 대신 골든 앵글(137.508°)로 흩뿌린다 — 인덱스만으로
 * 정해지는 결정론적 값이라 재렌더링될 때마다 조각들이 다시 튀지 않는다.
 */
export function FallingParticles({ variant, count = 22, imageUrl }: FallingParticlesProps) {
  return (
    <div className="effects-layer" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => {
        const left = (index * 137.508) % 100
        // 벚꽃은 눈보다 느리게 둔다 — 꽃잎은 눈보다 가볍고 넓적해서 공기
        // 저항을 더 받고, 좌우로 크게 흔들리며 내려오는 동안 더 오래 떠
        // 있어야 "팔랑인다"는 느낌이 산다. 이미지는 그보다 더 크고 무거운
        // 물체처럼 보여야 해서 눈과 벚꽃의 중간 속도로 둔다.
        const duration =
          variant === 'cherry_blossom'
            ? 11 + (index % 5) * 2
            : variant === 'custom_image'
              ? 9 + (index % 5) * 1.8
              : 8 + (index % 5) * 1.5
        const delay = -((index * 0.37 * duration) % duration)
        const drift = ((index % 7) - 3) * 20
        // 이미지는 도형보다 존재감이 커야 알아볼 수 있다 — 32~44px.
        const size = variant === 'custom_image' ? 32 + (index % 4) * 4 : 6 + (index % 4) * 2

        const style: CSSProperties & Record<'--effect-drift' | '--effect-sway', string> = {
          left: `${left}%`,
          width: size,
          height: size,
          animationDuration: `${duration}s`,
          animationDelay: `${delay}s`,
          '--effect-drift': `${drift}px`,
          // 눈·이미지의 effect-fall 키프레임은 이 값을 아예 안 쓴다 —
          // 벚꽃만 좌우로 오갈 폭이다 (index.css의 effect-fall-petal 참고).
          '--effect-sway': `${34 + (index % 5) * 9}px`,
        }

        if (variant === 'custom_image') {
          return (
            <img
              key={index}
              src={imageUrl}
              alt=""
              className={`effect-particle ${PARTICLE_CLASS[variant]}`}
              style={style}
            />
          )
        }

        return (
          <span key={index} className={`effect-particle ${PARTICLE_CLASS[variant]}`} style={style} />
        )
      })}
    </div>
  )
}
