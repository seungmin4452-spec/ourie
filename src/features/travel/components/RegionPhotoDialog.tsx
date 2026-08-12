import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { ImagePlus } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'

import { objectParticle } from '@/lib/korean'
import { districtsOf } from '../districtIndex'
import type { TravelDistrict } from '../districts'
import type { TravelRegion } from '../regions'
import { RegionMap } from './RegionMap'

interface RegionPhotoDialogProps {
  /** 열려 있는 시도. null이면 닫힌 상태다. */
  region: TravelRegion | null
  onClose: () => void
  /** 시군구 코드 -> 걸어둔 사진 URL. */
  photos: ReadonlyMap<string, string>
  onPickPhoto: (district: TravelDistrict, file: File) => void
  onRemovePhoto: (district: TravelDistrict) => void
  /** 사진을 올리거나 빼는 중. 끝날 때까지 버튼이 기다린다. */
  isSaving: boolean
}

/**
 * 시도 하나를 크게 펴놓고 시군구에 사진을 한 장씩 거는 화면.
 *
 * 전국 지도에서 바로 시군구를 누르게 하지 않는 이유는 스크래치 지도와 같다 —
 * 서울 종로구는 전국 지도에서 3픽셀이라 손가락으로 찍을 수가 없다.
 */
export function RegionPhotoDialog({
  region,
  onClose,
  photos,
  onPickPhoto,
  onRemovePhoto,
  isSaving,
}: RegionPhotoDialogProps) {
  return (
    <Dialog isOpen={region != null} onOpenChange={(isOpen) => !isOpen && onClose()} width={420}>
      <Layout>
        <LayoutContent>
          {region && (
            // key가 있어야 다른 시도를 열 때 골라둔 시군구가 따라오지 않는다.
            // 경기도에서 수원시를 고른 채로 닫고 강원도를 열면, 그 화면에는
            // 없는 구역이 선택된 상태로 남는다.
            <RegionPhotoPanel
              key={region.code}
              region={region}
              onClose={onClose}
              photos={photos}
              onPickPhoto={onPickPhoto}
              onRemovePhoto={onRemovePhoto}
              isSaving={isSaving}
            />
          )}
        </LayoutContent>
      </Layout>
    </Dialog>
  )
}

interface RegionPhotoPanelProps extends Omit<RegionPhotoDialogProps, 'region'> {
  region: TravelRegion
}

function RegionPhotoPanel({
  region,
  onClose,
  photos,
  onPickPhoto,
  onRemovePhoto,
  isSaving,
}: RegionPhotoPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<TravelDistrict | null>(null)

  const districts = districtsOf(region.code)
  const filled = districts.filter((district) => photos.has(district.code)).length
  const hasPhoto = selected != null && photos.has(selected.code)

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // 같은 파일을 다시 고를 수 있게 비운다. 안 그러면 업로드가 한 번 실패한
    // 뒤에 똑같은 사진을 다시 골라도 change가 안 뜬다.
    event.target.value = ''
    if (file && selected) onPickPhoto(selected, file)
  }

  return (
    <VStack gap={3}>
      <DialogHeader title={region.name} onOpenChange={onClose} />

      <RegionMap
        region={region}
        reveal={{ kind: 'mosaic', photos }}
        selectedCode={selected?.code ?? null}
        isInteractive
        onSelectDistrict={setSelected}
      />

      <Text type="supporting" justify="center">
        {filled === districts.length
          ? `${region.shortName}${objectParticle(region.shortName)} 사진으로 다 채웠어요.`
          : `${districts.length}곳 중 ${filled}곳`}
      </Text>

      {/* 누르면 바로 파일 선택창이 뜨게 하지 않는다. 지도를 훑다가 손가락이
          스치는 것만으로 사진첩이 열리면 놀라기도 하고, 무엇보다 이미 사진이
          걸린 곳을 "빼는" 길이 사라진다. 한 번 골라 이름을 확인하고 나서
          무엇을 할지 여기서 정한다. */}
      {selected ? (
        <VStack gap={2}>
          <Text justify="center">{selected.name}</Text>
          <Button
            label={hasPhoto ? '사진 바꾸기' : '사진 고르기'}
            variant="primary"
            width="100%"
            icon={<ImagePlus className="size-4" />}
            isLoading={isSaving}
            isDisabled={isSaving}
            onClick={() => fileInputRef.current?.click()}
          />
          {hasPhoto && (
            <Button
              label="사진 빼기"
              variant="ghost"
              width="100%"
              isDisabled={isSaving}
              onClick={() => onRemovePhoto(selected)}
            />
          )}
        </VStack>
      ) : (
        <Text type="supporting" justify="center">
          지역을 누르면 그 자리에 사진을 걸 수 있어요.
        </Text>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </VStack>
  )
}
