import { CalendarHeart, Images, MapPin } from 'lucide-react'
import type { ReactNode } from 'react'

import { WIDGET_IDS, type WidgetId, type WidgetMeta } from './types'

/**
 * 위젯 하나하나가 무엇인지 적어둔 곳. 홈 화면과 "위젯 추가" 목록이 같은
 * 이름·설명·아이콘을 쓰도록 한 군데에 모았다.
 *
 * 아직 못 만든 기능(추억 타임라인, 여행 지도)도 isReady: false로 올려둔다.
 * 위젯을 붙이고 떼는 감각을 지금 확인할 수 있고, 기능이 붙는 날 이 플래그와
 * 본문만 갈아끼우면 된다.
 */
const WIDGET_META: Record<WidgetId, WidgetMeta> = {
  dday: {
    id: 'dday',
    title: '디데이',
    description: '기념일을 등록해두면 오늘이 며칠째인지 크게 보여줘요.',
    isReady: true,
  },
  memories: {
    id: 'memories',
    title: '추억',
    description: '사진과 함께 남긴 최근 추억을 미리 보여줘요.',
    isReady: false,
  },
  travel: {
    id: 'travel',
    title: '여행 지도',
    description: '둘이 다녀온 곳을 지도 위에 모아서 보여줘요.',
    isReady: false,
  },
}

const WIDGET_ICONS: Record<WidgetId, ReactNode> = {
  dday: <CalendarHeart className="size-4" />,
  memories: <Images className="size-4" />,
  travel: <MapPin className="size-4" />,
}

export function widgetMeta(id: WidgetId): WidgetMeta {
  return WIDGET_META[id]
}

export function widgetIcon(id: WidgetId): ReactNode {
  return WIDGET_ICONS[id]
}

/** 카탈로그 순서대로의 전체 위젯 목록. */
export const ALL_WIDGETS: WidgetMeta[] = WIDGET_IDS.map(widgetMeta)
