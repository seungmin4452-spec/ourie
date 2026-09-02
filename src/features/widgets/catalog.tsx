import {
  CalendarDays,
  CalendarHeart,
  Images,
  MapPin,
  MapPinned,
  Pointer,
  Ticket,
  Wand2,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { WIDGET_IDS, type WidgetId, type WidgetMeta, type WidgetSize } from './types'

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
    defaultSize: 'full',
    resizable: false,
  },
  poke: {
    id: 'poke',
    title: '콕 찌르기',
    description: '보고싶다고, 카톡 보라고 상대방에게 바로 알림을 보내요.',
    isReady: true,
    defaultSize: 'half',
  },
  wish: {
    id: 'wish',
    title: '소원권',
    description: '각자 몇 장이 남았는지 보고, 소원을 적어 한 장씩 써요.',
    isReady: true,
    defaultSize: 'half',
  },
  calendar: {
    id: 'calendar',
    title: '커플 캘린더',
    description: '서로의 일정을 함께 보고, "우리 약속"은 둘 다 고치고 지울 수 있어요.',
    isReady: true,
    defaultSize: 'full',
  },
  memories: {
    id: 'memories',
    title: '추억',
    description: '사진과 함께 남긴 최근 추억을 미리 보여줘요.',
    isReady: false,
    defaultSize: 'half',
  },
  travel: {
    id: 'travel',
    title: '우리가 다녀온 곳',
    description: '고른 사진을 지도로 덮어두고, 다녀온 지역을 긁어서 드러내요.',
    isReady: true,
    defaultSize: 'half',
  },
  photomap: {
    id: 'photomap',
    title: '사진으로 채우는 지도',
    description: '지역마다 사진을 한 장씩 걸어서 전국을 우리 사진으로 채워요.',
    isReady: true,
    defaultSize: 'half',
  },
  aiAvatar: {
    id: 'aiAvatar',
    title: 'AI 이미지 생성',
    description: '사진을 올리면 고른 주제 스타일로 바꿔줘요.',
    isReady: true,
    defaultSize: 'half',
  },
}

const HANGUL_FIRST = 0xac00
const HANGUL_LAST = 0xd7a3

/**
 * 이름을 "누구와"로 만든다 — "진선" → "진선이와", "지수" → "지수와".
 *
 * 받침이 있는 이름에만 "이"를 끼운다. 한국어에서 이름을 부르는 자연스러운
 * 방식이고, 이게 없으면 "진선와"가 된다.
 *
 * 한글이 아닌 이름(영문 등)은 받침을 셀 수 없으니 마지막 글자가 모음인지로
 * 가른다 — "Anna와", "Kevin과". 완벽한 규칙은 아니지만 "Kevin와"보다는 낫다.
 */
function withCompanion(name: string): string {
  const last = name[name.length - 1]
  const code = name.charCodeAt(name.length - 1)

  if (code >= HANGUL_FIRST && code <= HANGUL_LAST) {
    const hasFinalConsonant = (code - HANGUL_FIRST) % 28 !== 0
    return hasFinalConsonant ? `${name}이와` : `${name}와`
  }

  return /[aeiouAEIOU]/.test(last) ? `${name}와` : `${name}과`
}

const WIDGET_ICONS: Record<WidgetId, ReactNode> = {
  dday: <CalendarHeart className="size-4" />,
  // 펼친 손이 아니라 검지를 세운 손이다 — "콕" 찌르는 손가락.
  poke: <Pointer className="size-4" />,
  wish: <Ticket className="size-4" />,
  calendar: <CalendarDays className="size-4" />,
  memories: <Images className="size-4" />,
  travel: <MapPin className="size-4" />,
  photomap: <MapPinned className="size-4" />,
  aiAvatar: <Wand2 className="size-4" />,
}

/** 상대방 이름이 있을 때 쓰는 제목. "우리"를 그 사람 이름으로 바꾼다. */
const TITLE_WITH_PARTNER: Partial<Record<WidgetId, (companion: string) => string>> = {
  travel: (companion) => `${companion} 다녀온 곳`,
  photomap: (companion) => `${companion} 채우는 지도`,
}

/**
 * 위젯 하나의 이름·설명.
 *
 * 상대방 이름을 받으면 "우리가 다녀온 곳"이 "진선이와 다녀온 곳"이 된다.
 * 커플 앱에서 "우리"는 누구든 될 수 있지만 이름은 이 둘뿐이라, 홈에 이름이
 * 적혀 있는 편이 내 화면답다. 아직 커플이 연결되지 않았거나 상대가 이름을
 * 넣지 않았으면 원래 제목으로 떨어진다.
 */
export function widgetMeta(id: WidgetId, partnerName?: string | null): WidgetMeta {
  const meta = WIDGET_META[id]
  const title = TITLE_WITH_PARTNER[id]
  const name = partnerName?.trim()
  if (!title || !name) return meta

  return { ...meta, title: title(withCompanion(name)) }
}

export function widgetIcon(id: WidgetId): ReactNode {
  return WIDGET_ICONS[id]
}

/** 이 위젯이 처음 놓일 폭과, 폭 토글을 보여줘도 되는지. */
export function widgetSizing(id: WidgetId): { defaultSize: WidgetSize; resizable: boolean } {
  const meta = WIDGET_META[id]
  return { defaultSize: meta.defaultSize, resizable: meta.resizable ?? true }
}

/** 카탈로그 순서대로의 전체 위젯 목록. */
export function allWidgets(partnerName?: string | null): WidgetMeta[] {
  return WIDGET_IDS.map((id) => widgetMeta(id, partnerName))
}
