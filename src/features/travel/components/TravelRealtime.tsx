import type { Profile } from '@/features/onboarding/api/profile'
import { useTravelRealtime } from '../hooks/useTravelRealtime'

interface TravelRealtimeProps {
  profile: Profile | null | undefined
}

/**
 * 지도 관련 변경 구독을 켜두는 자리. **화면에 아무것도 그리지 않는다.**
 *
 * 위젯 안이 아니라 홈에서 한 번만 마운트한다 — 지도 위젯과 사진 지도 위젯이
 * 각자 구독하면 같은 이름의 채널을 두 벌 열게 된다 (BadgeTracker와 같은 이유로
 * 같은 자리에 둔다).
 */
export function TravelRealtime({ profile }: TravelRealtimeProps) {
  useTravelRealtime(profile?.couple_id)
  return null
}
