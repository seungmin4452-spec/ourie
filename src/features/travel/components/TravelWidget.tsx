import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { useToast } from '@astryxdesign/core/Toast'
import { VStack } from '@astryxdesign/core/VStack'
import { useQueryClient } from '@tanstack/react-query'
import { ImagePlus } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'

import { useAuth } from '@/features/auth'
import type { Profile } from '@/features/onboarding/api/profile'
import { objectParticle } from '@/lib/korean'
import { setTravelMapPhoto } from '../api/map'
import { countKnownVisits, DISTRICT_COUNT } from '../districtIndex'
import type { TravelDistrict } from '../districts'
import { travelMapPhotoQueryKey, useTravelMapPhoto } from '../hooks/useTravelMapPhoto'
import { useToggleTravelVisit, useTravelVisits } from '../hooks/useTravelVisits'
import { useRegionPhotos } from '../hooks/useRegionPhotos'
import { photoFileProblem } from '../photoFile'
import type { TravelRegion } from '../regions'
import { NearestBadgeLine } from './NearestBadgeLine'
import { RegionScratchDialog } from './RegionScratchDialog'
import { RegionMap } from './RegionMap'

interface TravelWidgetProps {
  /** 홈이 이미 가져온 내 프로필. 같은 걸 또 조회하지 않으려고 받아 쓴다. */
  profile: Profile | null | undefined
  /** 위젯 편집 모드인지. 편집 중에는 지도를 열거나 긁을 수 없다. */
  isEditing: boolean
  /**
   * 절반 폭 타일일 때 true. 시도 도형이 너무 작아져 어느 지역인지도 안
   * 보이므로, 절반 폭에서는 지도를 직접 긁지 않는다 — 진행률만 보여주고,
   * 타일을 누르면 지금과 같은 전국 지도가 다이얼로그로 크게 열려 그 안에서
   * 그대로 긁는다. 시군구 상세는 원래도 다이얼로그였으니 한 단계 앞으로
   * 옮기는 셈이라 기능은 그대로다.
   */
  isCompact?: boolean
  /** 절반 폭에서 여는 다이얼로그의 제목. HomePage가 상대 이름을 넣어 만든다. */
  title?: string
}

/**
 * 홈 위젯 "우리가 다녀온 곳"의 본문.
 *
 * 커플이 고른 사진이 대한민국 모양으로 깔려 있고, 아직 안 다녀온 시군구는
 * 코팅으로 덮여 있다. 시도를 누르면 그 안이 크게 열리고, 거기서 시군구를
 * 하나씩 긁는다. 256곳을 다 긁으면 사진이 온전히 드러난다 — 그 마지막 그림이
 * 이 위젯의 목적이다.
 *
 * 사진과 칠한 지역 둘 다 커플 공용이다. 한쪽이 부산 해운대구를 칠하면 다른 쪽
 * 홈에서도 그 조각이 벗겨져 있다.
 */
export function TravelWidget({ profile, isEditing, isCompact, title }: TravelWidgetProps) {
  const { user } = useAuth()
  const showToast = useToast()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [openRegion, setOpenRegion] = useState<TravelRegion | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)

  const coupleId = profile?.couple_id
  const { visitedCodes } = useTravelVisits(coupleId)
  const { data: photoUrl } = useTravelMapPhoto(coupleId)
  const toggleVisit = useToggleTravelVisit(coupleId, user?.id)

  // 뱃지 진행 한 줄이 두 지도를 함께 본다 — 사진을 건 곳도 다녀온 것으로
  // 세기 때문이다 (badges.ts). 사진 지도 위젯과 캐시를 공유한다.
  const { photos } = useRegionPhotos(coupleId)

  const visitedCount = countKnownVisits(visitedCodes)
  const isComplete = visitedCount === DISTRICT_COUNT

  // 커플이 연결돼야 칠할 수 있다 — travel_visits는 커플 단위이고, RLS도 커플이
  // 없으면 insert를 막는다. 연결 전에도 지도 자체는 보여준다: 이 위젯이 뭘 하는
  // 물건인지는 코팅 덮인 한반도가 제일 잘 설명한다.
  const canScratch = coupleId != null && user != null && !isEditing

  function handleToggleDistrict(district: TravelDistrict) {
    toggleVisit.mutate(
      { regionCode: district.code, isVisited: visitedCodes.has(district.code) },
      {
        onError: () =>
          showToast({
            type: 'error',
            body: `${district.shortName}${objectParticle(district.shortName)} 저장하지 못했어요.`,
          }),
      },
    )
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !coupleId || !user) return

    const problem = photoFileProblem(file)
    if (problem) {
      showToast({ type: 'error', body: problem })
      return
    }

    setIsUploading(true)
    try {
      await setTravelMapPhoto(coupleId, user.id, file)
      await queryClient.invalidateQueries({ queryKey: travelMapPhotoQueryKey(coupleId) })
      showToast({ type: 'info', body: '지도 배경 사진을 바꿨어요.' })
    } catch (error) {
      showToast({
        type: 'error',
        body: error instanceof Error ? error.message : '사진을 올리지 못했어요.',
      })
    } finally {
      setIsUploading(false)
    }
  }

  const progressLine = isComplete
    ? '전국을 다 다녀왔어요. 사진이 온전히 드러났어요.'
    : `${DISTRICT_COUNT}곳 중 ${visitedCount}곳 · ${Math.round(
        (visitedCount / DISTRICT_COUNT) * 100,
      )}%`

  const body = (
    <VStack gap={3}>
      <RegionMap
        region={null}
        reveal={{ kind: 'photo', url: photoUrl ?? null, revealedCodes: visitedCodes }}
        isInteractive={canScratch}
        onSelectRegion={setOpenRegion}
      />

      <Text type="supporting" justify="center">
        {progressLine}
      </Text>

      <NearestBadgeLine visitedCodes={visitedCodes} photoCodes={photos} />

      {coupleId == null ? (
        <Text type="supporting" justify="center">
          커플이 연결되면 함께 칠할 수 있어요.
        </Text>
      ) : (
        <>
          {/* 사진이 없을 때는 이게 이 위젯에서 제일 먼저 할 일이라 안내를 붙인다.
              긁어봐야 회색 밑에 회색이면 아무 일도 일어나지 않은 것처럼 보인다. */}
          <Text type="supporting" justify="center">
            {photoUrl == null
              ? '배경 사진을 고르면 긁을 때마다 조금씩 드러나요.'
              : '지역을 누르면 그 안의 시·군·구를 긁을 수 있어요.'}
          </Text>
          <Button
            label={photoUrl == null ? '배경 사진 고르기' : '배경 사진 바꾸기'}
            variant="ghost"
            width="100%"
            icon={<ImagePlus className="size-4" />}
            isLoading={isUploading}
            isDisabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoChange}
          />
        </>
      )}

      <RegionScratchDialog
        region={openRegion}
        onClose={() => setOpenRegion(null)}
        photoUrl={photoUrl ?? null}
        visitedCodes={visitedCodes}
        onToggleDistrict={handleToggleDistrict}
      />
    </VStack>
  )

  if (!isCompact) return body

  return (
    <>
      {/* 미리보기는 항상 isInteractive={false}다 — 도형이 이 폭에서는 너무
          작아 어느 시도인지도 안 보이는데, 눌리기까지 하면 엉뚱한 지역이
          칠해진다. 누르는 동작은 타일 전체가 대신 받아 다이얼로그를 연다. */}
      <button
        type="button"
        className="w-full cursor-pointer border-0 bg-transparent p-0 text-start"
        onClick={() => setIsExpanded(true)}
      >
        <VStack gap={2}>
          <RegionMap
            region={null}
            reveal={{ kind: 'photo', url: photoUrl ?? null, revealedCodes: visitedCodes }}
            isInteractive={false}
          />
          <Text type="supporting" justify="center">
            {progressLine}
          </Text>
        </VStack>
      </button>

      <Dialog isOpen={isExpanded} onOpenChange={setIsExpanded} width={480}>
        <Layout
          header={
            <DialogHeader title={title ?? '우리가 다녀온 곳'} onOpenChange={() => setIsExpanded(false)} />
          }
          content={<LayoutContent>{body}</LayoutContent>}
        />
      </Dialog>
    </>
  )
}
