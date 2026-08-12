import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'

import { objectParticle } from '@/lib/korean'
import { districtsOf } from '../districtIndex'
import type { TravelDistrict } from '../districts'
import type { TravelRegion } from '../regions'
import { RegionMap } from './RegionMap'

interface RegionScratchDialogProps {
  /** 열려 있는 시도. null이면 닫힌 상태다. */
  region: TravelRegion | null
  onClose: () => void
  photoUrl: string | null
  visitedCodes: ReadonlySet<string>
  onToggleDistrict: (district: TravelDistrict) => void
}

/**
 * 시도 하나를 크게 펴놓고 시군구를 긁는 화면.
 *
 * 전국 지도에서 바로 시군구를 누르게 하지 않는 이유는 크기다 — 서울 종로구는
 * 전국 지도에서 3픽셀이라 손가락으로 찍을 수가 없다. 한 단계 들어와야 시군구가
 * 누를 만해진다.
 *
 * 사진은 전국 지도와 같은 좌표계에 깔려 있어서, 여기서 보이는 것은 방금 홈에서
 * 보던 그 조각이 그대로 확대된 그림이다 (RegionMap의 image 주석 참고).
 */
export function RegionScratchDialog({
  region,
  onClose,
  photoUrl,
  visitedCodes,
  onToggleDistrict,
}: RegionScratchDialogProps) {
  const districts = region ? districtsOf(region.code) : []
  const visited = districts.filter((district) => visitedCodes.has(district.code)).length

  return (
    <Dialog isOpen={region != null} onOpenChange={(isOpen) => !isOpen && onClose()} width={420}>
      <Layout>
        <LayoutContent>
          {region && (
            <VStack gap={3}>
              <DialogHeader title={region.name} onOpenChange={onClose} />

              <RegionMap
                region={region}
                reveal={{ kind: 'photo', url: photoUrl, revealedCodes: visitedCodes }}
                isInteractive
                onSelectDistrict={onToggleDistrict}
              />

              <Text type="supporting" justify="center">
                {visited === districts.length
                  ? `${region.shortName}${objectParticle(region.shortName)} 다 다녀왔어요.`
                  : `${districts.length}곳 중 ${visited}곳`}
              </Text>
              <Text type="supporting" justify="center">
                다녀온 곳을 누르면 벗겨지고, 한 번 더 누르면 되돌아가요.
              </Text>
            </VStack>
          )}
        </LayoutContent>
      </Layout>
    </Dialog>
  )
}
