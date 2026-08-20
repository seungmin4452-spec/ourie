import { useAppEffects } from '../hooks/useAppEffects'
import { FallingParticles } from './FallingParticles'

/**
 * 관리자가 켠 특수효과를 홈 화면 위에 띄운다. 화면 전체를 덮는 장식일
 * 뿐이라 `pointer-events: none`이고(FallingParticles의 .effects-layer),
 * 아무것도 안 켜져 있으면 그냥 아무것도 그리지 않는다.
 *
 * custom_image는 켜져 있어도 이미지를 아직 안 올렸으면(customImageUrl이
 * null) 띄우지 않는다 — 관리자가 스위치부터 켜고 이미지를 나중에 고르는
 * 순서로 조작해도 빈 자리가 떨어지지 않는다.
 *
 * 여러 개가 동시에 켜져 있으면 다 뜬다 — 관리자가 정할 몫이라 여기서
 * 막지 않는다.
 */
export function EffectsLayer() {
  const { data } = useAppEffects()

  return (
    <>
      {data?.enabled.cherry_blossom && <FallingParticles variant="cherry_blossom" />}
      {data?.enabled.snow && <FallingParticles variant="snow" />}
      {data?.enabled.custom_image && data.customImageUrl && (
        <FallingParticles variant="custom_image" imageUrl={data.customImageUrl} count={10} />
      )}
    </>
  )
}
