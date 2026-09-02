/**
 * 홈 화면에 올릴 수 있는 위젯의 종류.
 *
 * 이 배열의 순서가 "위젯 추가" 목록에 뜨는 순서다. 저장된 값은
 * localStorage에 남으므로(useHomeWidgets.ts) id는 한 번 정하면 바꾸지 않는다
 * — 이름이 바뀌면 기존 사용자의 홈에서 그 위젯이 조용히 사라진다.
 */
export const WIDGET_IDS = [
  'dday',
  'poke',
  'wish',
  'calendar',
  'memories',
  'travel',
  'photomap',
  'aiAvatar',
] as const

export type WidgetId = (typeof WIDGET_IDS)[number]

/**
 * 홈 그리드에서 이 위젯이 한 칸(절반)을 쓸지 두 칸(전체)을 쓸지.
 *
 * 어떤 위젯이 절반이어야 하는지는 정해진 규칙이 아니라 편집 모드에서 사용자가
 * 위젯마다 직접 고른다 (WidgetCard의 폭 토글). 여기 있는 건 그 값의 타입뿐이다.
 */
export type WidgetSize = 'half' | 'full'

export interface WidgetMeta {
  id: WidgetId
  /** 위젯 카드 머리말이자 추가 목록에 뜨는 이름. */
  title: string
  /** 추가 목록에서 이 위젯이 뭘 보여주는지 한 줄 설명. */
  description: string
  /** 기능이 아직 구현되지 않았으면 false — 자리표시자로만 뜬다. */
  isReady: boolean
  /** 처음 추가됐을 때의 폭. */
  defaultSize: WidgetSize
  /**
   * 폭 토글을 보여줄지. 디데이만 false다 — 큰 숫자가 이 위젯의 전부라
   * 절반으로 줄이면 있으나 마나 한 카드가 된다.
   * @default true
   */
  resizable?: boolean
}

export function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === 'string' && (WIDGET_IDS as readonly string[]).includes(value)
}

export function isWidgetSize(value: unknown): value is WidgetSize {
  return value === 'half' || value === 'full'
}
