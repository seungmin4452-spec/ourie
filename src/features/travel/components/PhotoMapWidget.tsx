import { Text } from '@astryxdesign/core/Text'
import { useToast } from '@astryxdesign/core/Toast'
import { VStack } from '@astryxdesign/core/VStack'
import { useState } from 'react'

import { useAuth } from '@/features/auth'
import type { Profile } from '@/features/onboarding/api/profile'
import { countKnownVisits, DISTRICT_COUNT } from '../districtIndex'
import type { TravelDistrict } from '../districts'
import { useRegionPhotos, useRemoveRegionPhoto, useSetRegionPhoto } from '../hooks/useRegionPhotos'
import { photoFileProblem } from '../photoFile'
import type { TravelRegion } from '../regions'
import { RegionMap } from './RegionMap'
import { RegionPhotoDialog } from './RegionPhotoDialog'

interface PhotoMapWidgetProps {
  /** 홈이 이미 가져온 내 프로필. 같은 걸 또 조회하지 않으려고 받아 쓴다. */
  profile: Profile | null | undefined
  /** 위젯 편집 모드인지. 편집 중에는 지도를 열 수 없다. */
  isEditing: boolean
}

/**
 * 홈 위젯 "사진으로 채우는 지도"의 본문.
 *
 * 스크래치 지도("우리가 다녀온 곳")의 다른 판이다. 그쪽은 사진 **한 장**을
 * 지도 전체에 깔아두고 다녀온 곳을 긁어 그 조각을 드러내지만, 이쪽은 지역마다
 * **사진을 한 장씩** 건다. 다 채우면 마지막에 남는 그림이 한 장의 사진이
 * 아니라 전국을 덮은 우리 사진들이다.
 *
 * 둘은 서로의 상태를 건드리지 않는다. 여기에 해운대구 사진을 걸어도 스크래치
 * 지도의 해운대구는 그대로 덮여 있다 — 한쪽에서 사진을 뺐을 때 다른 쪽의
 * "다녀왔다"까지 사라지면 그건 사용자가 시킨 일이 아니다.
 */
export function PhotoMapWidget({ profile, isEditing }: PhotoMapWidgetProps) {
  const { user } = useAuth()
  const showToast = useToast()
  const [openRegion, setOpenRegion] = useState<TravelRegion | null>(null)

  const coupleId = profile?.couple_id
  const { photos } = useRegionPhotos(coupleId)
  const setPhoto = useSetRegionPhoto(coupleId, user?.id)
  const removePhoto = useRemoveRegionPhoto(coupleId)

  // 지금 지도가 아는 코드만 센다. 행정구역이 바뀌어 사라진 코드의 사진이 남아
  // 있어도 진행률이 "191곳 중 193곳"이 되지 않는다 (districtIndex.ts 참고).
  const filledCount = countKnownVisits(photos)
  const isComplete = filledCount === DISTRICT_COUNT

  // 커플이 연결돼야 사진을 걸 수 있다 — 사진도 지도도 커플 것이고, RLS가
  // 커플 없는 insert를 막는다. 연결 전에도 지도 자체는 보여준다.
  const canFill = coupleId != null && user != null && !isEditing

  function handlePickPhoto(district: TravelDistrict, file: File) {
    const problem = photoFileProblem(file)
    if (problem) {
      showToast({ type: 'error', body: problem })
      return
    }

    setPhoto.mutate(
      { regionCode: district.code, file },
      {
        onSuccess: () =>
          showToast({ type: 'info', body: `${district.shortName} 사진을 걸었어요.` }),
        onError: (error) =>
          showToast({
            type: 'error',
            body: error instanceof Error ? error.message : '사진을 올리지 못했어요.',
          }),
      },
    )
  }

  function handleRemovePhoto(district: TravelDistrict) {
    removePhoto.mutate(district.code, {
      onError: () =>
        showToast({
          type: 'error',
          body: `${district.shortName} 사진을 빼지 못했어요.`,
        }),
    })
  }

  return (
    <VStack gap={3}>
      <RegionMap
        region={null}
        reveal={{ kind: 'mosaic', photos }}
        isInteractive={canFill}
        onSelectRegion={setOpenRegion}
      />

      <Text type="supporting" justify="center">
        {isComplete
          ? '전국을 우리 사진으로 다 채웠어요.'
          : `${DISTRICT_COUNT}곳 중 ${filledCount}곳 · ${Math.round(
              (filledCount / DISTRICT_COUNT) * 100,
            )}%`}
      </Text>

      <Text type="supporting" justify="center">
        {coupleId == null
          ? '커플이 연결되면 함께 채울 수 있어요.'
          : '지역을 누르면 그 안의 시·군·구에 사진을 한 장씩 걸 수 있어요.'}
      </Text>

      <RegionPhotoDialog
        region={openRegion}
        onClose={() => setOpenRegion(null)}
        photos={photos}
        onPickPhoto={handlePickPhoto}
        onRemovePhoto={handleRemovePhoto}
        isSaving={setPhoto.isPending || removePhoto.isPending}
      />
    </VStack>
  )
}
