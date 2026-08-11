import {
  Bed,
  Cake,
  Coffee,
  Gift,
  HandHeart,
  Heart,
  House,
  MessageCircle,
  Moon,
  Music,
  PhoneCall,
  Smile,
  Sparkles,
  Star,
  Sun,
  Utensils,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * 커플이 버튼을 만들 때 고를 수 있는 아이콘.
 *
 * 이름(키)이 poke_presets.icon에 그대로 저장된다. **한 번 정한 키는 바꾸지
 * 않는다** — 바꾸면 이미 만들어둔 버튼이 조용히 기본 아이콘으로 떨어진다.
 * 목록에 더하는 건 언제든 안전하다 (DB에 허용 목록 check를 두지 않은 이유가
 * 이것이다, supabase/schema.sql 참고).
 *
 * 이모지가 아니라 lucide 아이콘인 이유: 위젯에서 기본 세 버튼과 나란히 서므로
 * 굵기와 크기가 같아야 한다. 이모지는 기기마다 모양도 크기도 달라진다.
 *
 * 객체 순서가 고르는 화면에 뜨는 순서다.
 */
const PRESET_ICONS = {
  heart: Heart,
  'hand-heart': HandHeart,
  message: MessageCircle,
  phone: PhoneCall,
  smile: Smile,
  sparkles: Sparkles,
  star: Star,
  coffee: Coffee,
  utensils: Utensils,
  cake: Cake,
  gift: Gift,
  music: Music,
  sun: Sun,
  moon: Moon,
  bed: Bed,
  house: House,
} satisfies Record<string, LucideIcon>

export type PokeIconName = keyof typeof PRESET_ICONS

/**
 * 아이콘을 고르는 버튼의 이름. 아이콘만 있는 버튼이라 이 말이 스크린 리더가
 * 읽는 전부이고, 마우스로는 툴팁으로 뜬다. 키(`hand-heart`)를 그대로 쓰면
 * 둘 다 영어로 읽힌다.
 */
const PRESET_ICON_LABELS: Record<PokeIconName, string> = {
  heart: '하트',
  'hand-heart': '손하트',
  message: '말풍선',
  phone: '전화',
  smile: '웃는 얼굴',
  sparkles: '반짝임',
  star: '별',
  coffee: '커피',
  utensils: '식사',
  cake: '케이크',
  gift: '선물',
  music: '음악',
  sun: '해',
  moon: '달',
  bed: '잠',
  house: '집',
}

/** 고르는 화면이 도는 순서. */
export const POKE_ICON_NAMES = Object.keys(PRESET_ICONS) as PokeIconName[]

export function pokeIconLabel(name: PokeIconName): string {
  return PRESET_ICON_LABELS[name]
}

/** 새 버튼을 만들 때 미리 골라져 있는 아이콘. */
export const DEFAULT_POKE_ICON: PokeIconName = 'heart'

export function isPokeIconName(value: unknown): value is PokeIconName {
  return typeof value === 'string' && value in PRESET_ICONS
}

/**
 * 이름에 해당하는 아이콘. 모르는 이름이면 기본 아이콘으로 떨어진다 — 목록에서
 * 아이콘을 뺐거나 DB를 손으로 고친 경우인데, 그것 때문에 버튼이 안 그려지는
 * 것보다는 낫다.
 */
export function pokePresetIcon(name: string): ReactNode {
  const Icon = isPokeIconName(name) ? PRESET_ICONS[name] : PRESET_ICONS[DEFAULT_POKE_ICON]
  return <Icon className="size-4" />
}
