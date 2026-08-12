import { useQuery } from '@tanstack/react-query'

import type { Profile } from '@/features/onboarding/api/profile'
import { getPartner } from '../api/partner'

export function partnerQueryKey(coupleId: string | null | undefined) {
  return ['partner', coupleId] as const
}

/**
 * 커플의 상대방 프로필.
 *
 * 콕 찌르기 위젯(수신 동의 안내)과 홈(위젯 제목의 "진선이와")이 같은 값을
 * 본다. 각자 조회하면 같은 row를 두 번 읽게 되므로 캐시 키를 공유하는 이
 * 훅 하나로 모은다.
 */
export function usePartner(profile: Profile | null | undefined) {
  const coupleId = profile?.couple_id
  return useQuery({
    queryKey: partnerQueryKey(coupleId),
    queryFn: () => getPartner(coupleId!, profile!.id),
    enabled: coupleId != null && profile != null,
  })
}
