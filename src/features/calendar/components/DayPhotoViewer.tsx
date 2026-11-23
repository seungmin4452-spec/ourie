import { Lightbox, type LightboxMedia } from '@astryxdesign/core/Lightbox'
import type { MouseEvent } from 'react'

interface DayPhotoViewerProps {
  media: LightboxMedia[]
  /** 지금 보는 사진. null이면 닫혀 있다. */
  index: number | null
  onIndexChange: (index: number | null) => void
}

/**
 * 날짜별 사진 전체 화면 보기.
 *
 * Lightbox를 그대로 쓰면 앱에서 닫을 길이 없다. 두 가지를 여기서 메운다.
 * - 닫기 버튼이 화면 맨 위에 붙는데 이 앱은 상태바 아래까지 그리므로
 *   (viewport-fit=cover) 버튼이 상태바에 깔린다. 안전 영역만큼 안쪽으로 민다.
 * - Lightbox의 바깥 클릭 닫기는 클릭 대상이 dialog일 때만 도는데, 내부
 *   컨테이너가 dialog를 꽉 채워서 실제로는 발동하지 않는다.
 */
export function DayPhotoViewer({ media, index, onIndexChange }: DayPhotoViewerProps) {
  function handleClick(event: MouseEvent<HTMLDialogElement>) {
    const target = event.target as Element
    if (target.closest('button')) return

    // 사진은 pointer-events가 꺼져 있어 클릭 대상으로 잡히지 않는다. 좌표로 본다.
    const image = event.currentTarget.querySelector('img')
    if (image) {
      const rect = image.getBoundingClientRect()
      const isOnImage =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      if (isOnImage) return
    }
    onIndexChange(null)
  }

  return (
    <Lightbox
      isOpen={index != null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onIndexChange(null)
      }}
      media={media}
      index={index ?? 0}
      onIndexChange={onIndexChange}
      hasZoom
      onClick={handleClick}
      className="box-border h-dvh! pt-[env(safe-area-inset-top)]! pr-[env(safe-area-inset-right)]! pb-[env(safe-area-inset-bottom)]! pl-[env(safe-area-inset-left)]!"
    />
  )
}
