import { useAppEffects } from '../hooks/useAppEffects'
import { FallingParticles } from './FallingParticles'

/**
 * 관리자가 켠 특수효과를 홈 화면 위에 띄운다. 화면 전체를 덮는 장식일
 * 뿐이라 `pointer-events: none`이고(FallingParticles의 .effects-layer),
 * 아무것도 안 켜져 있으면 그냥 아무것도 그리지 않는다.
 *
 * 둘 다 켜져 있으면 둘 다 뜬다 — 관리자가 정할 몫이라 여기서 막지 않는다.
 */
export function EffectsLayer() {
  const { data } = useAppEffects()

  return (
    <>
      {data?.cherry_blossom && <FallingParticles variant="cherry_blossom" />}
      {data?.snow && <FallingParticles variant="snow" />}
    </>
  )
}
