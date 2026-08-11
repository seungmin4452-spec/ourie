import { Heart, MessageCircle, PhoneCall } from 'lucide-react'
import type { ReactNode } from 'react'

import type { PokeKind } from './message'

/**
 * 종류별 아이콘. message.ts가 아니라 여기 있는 이유는 JSX가 필요해서다 —
 * message.ts는 서버(api/poke.ts)도 import하므로 브라우저 전용인 것을 들일 수
 * 없다 (widgets/catalog.tsx와 같은 구조다).
 */
const POKE_ICONS: Record<PokeKind, ReactNode> = {
  miss: <Heart className="size-4" />,
  kakao: <MessageCircle className="size-4" />,
  call: <PhoneCall className="size-4" />,
}

export function pokeIcon(kind: PokeKind): ReactNode {
  return POKE_ICONS[kind]
}
