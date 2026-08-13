/**
 * 홈 화면에 올릴 수 있는 위젯의 종류.
 *
 * 이 배열의 순서가 "위젯 추가" 목록에 뜨는 순서다. 저장된 값은
 * localStorage에 남으므로(useHomeWidgets.ts) id는 한 번 정하면 바꾸지 않는다
 * — 이름이 바뀌면 기존 사용자의 홈에서 그 위젯이 조용히 사라진다.
 */
export const WIDGET_IDS = ['dday', 'poke', 'wish', 'memories', 'travel', 'photomap', 'badges'] as const

export type WidgetId = (typeof WIDGET_IDS)[number]

export interface WidgetMeta {
  id: WidgetId
  /** 위젯 카드 머리말이자 추가 목록에 뜨는 이름. */
  title: string
  /** 추가 목록에서 이 위젯이 뭘 보여주는지 한 줄 설명. */
  description: string
  /** 기능이 아직 구현되지 않았으면 false — 자리표시자로만 뜬다. */
  isReady: boolean
}

export function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === 'string' && (WIDGET_IDS as readonly string[]).includes(value)
}
