import type { PokeKind } from './message'

/**
 * 커플이 직접 만든 콕 찌르기 버튼 하나 (poke_presets 한 row).
 */
export interface PokePreset {
  id: string
  couple_id: string
  created_by: string
  /** 아이콘 이름. 목록에 없는 값일 수 있다 — icons.tsx가 기본값으로 떨어뜨린다. */
  icon: string
  /** 위젯 버튼에 적히는 말이자 알림 제목의 뒷부분. */
  label: string
  /** 알림 본문. */
  body: string
  created_at: string
}

export interface PokePresetInput {
  icon: string
  label: string
  body: string
}

/**
 * 보내려는 것 하나. 기본 세 개와 커플이 만든 버튼은 서버에 넘기는 값이 달라서
 * (kind냐 preset id냐) 화면에서부터 구분해 들고 다닌다.
 */
export type PokeTarget =
  | { type: 'builtin'; kind: PokeKind }
  | { type: 'custom'; preset: PokePreset }
