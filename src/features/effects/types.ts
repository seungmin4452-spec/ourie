/**
 * 관리자가 켜고 끄면 모든 사용자의 홈 화면에 적용되는 특수효과.
 *
 * 이 배열의 순서가 관리자 화면에 뜨는 순서다. 서버(api/admin/effects.ts,
 * api/admin/effect-image.ts)도 같은 파일을 `.js`로 가져가 "아는 효과인지"를
 * 검사한다 — 클라이언트가 보낸 임의의 id로 DB에 없는 row를 만들면 안 되기
 * 때문이다.
 */
export const APP_EFFECT_IDS = ['cherry_blossom', 'snow', 'custom_image'] as const

export type AppEffectId = (typeof APP_EFFECT_IDS)[number]

export const APP_EFFECT_LABELS: Record<AppEffectId, string> = {
  cherry_blossom: '벚꽃',
  snow: '눈',
  custom_image: '이미지',
}

export function isAppEffectId(value: unknown): value is AppEffectId {
  return typeof value === 'string' && (APP_EFFECT_IDS as readonly string[]).includes(value)
}

/** app_effects 테이블을 읽어 만드는 켜짐/꺼짐. 모르는 효과는 켜져 있을 수 없다. */
export type AppEffectState = Record<AppEffectId, boolean>

export const ALL_EFFECTS_OFF: AppEffectState = {
  cherry_blossom: false,
  snow: false,
  custom_image: false,
}

/**
 * app_effects 조회 결과 전체. custom_image만 켜짐/꺼짐 말고 "무엇을
 * 떨어뜨릴지"도 필요해서 image_url을 따로 둔다 — 벚꽃·눈은 도형을 CSS로
 * 그리므로 이 값이 필요 없다.
 */
export interface AppEffectsData {
  enabled: AppEffectState
  /** custom_image 효과가 떨어뜨릴 이미지. 관리자가 아직 안 올렸으면 null. */
  customImageUrl: string | null
}

export const APP_EFFECTS_EMPTY: AppEffectsData = {
  enabled: ALL_EFFECTS_OFF,
  customImageUrl: null,
}
