import { Lightbox, type LightboxMedia } from '@astryxdesign/core/Lightbox'
import { useRef, type MouseEvent, type TouchEvent } from 'react'
import { flushSync } from 'react-dom'

/** 이만큼 끌면 천천히 움직여도 넘어간다 (px). */
const SWIPE_DISTANCE = 60
/** 빠르게 튕기면 이 거리만으로도 넘어간다. */
const FLICK_DISTANCE = 24
const FLICK_MS = 250
/** 가로/세로 중 어느 쪽으로 미는지 정하기 전에 기다리는 거리. */
const AXIS_LOCK_DISTANCE = 8
/** 더 넘길 사진이 없는 쪽으로 끌 때 따라오는 비율. */
const EDGE_RESISTANCE = 0.3
const SLIDE_OUT_MS = 160
const SLIDE_IN_MS = 200

/**
 * 애니메이션이 끝나길 기다리되 정해진 시간이 지나면 끝낸다. 프레임이 밀리면
 * `finished`가 한참 늦어져서, 그동안 사진이 안 바뀌고 다음 넘기기도 막힌다.
 */
function finishWithin(animation: Animation, ms: number): Promise<Animation> {
  const timer = window.setTimeout(() => animation.finish(), ms + 80)
  return animation.finished.finally(() => window.clearTimeout(timer))
}

interface SwipeGesture {
  startX: number
  startY: number
  startTime: number
  dx: number
  axis: 'x' | 'y' | null
  /** 사진과 메모를 함께 감싼 요소. 사진 자체는 제 상자에 잘려서 이쪽을 옮긴다. */
  group: HTMLElement
}

interface DayPhotoViewerProps {
  media: LightboxMedia[]
  /** 지금 보는 사진. null이면 닫혀 있다. */
  index: number | null
  onIndexChange: (index: number | null) => void
}

/**
 * 날짜별 사진 전체 화면 보기.
 *
 * Lightbox를 그대로 쓰면 앱에서 부족한 것을 여기서 메운다.
 * - 닫기 버튼이 화면 맨 위에 붙는데 이 앱은 상태바 아래까지 그리므로
 *   (viewport-fit=cover) 버튼이 상태바에 깔린다. 안전 영역만큼 안쪽으로 민다.
 * - Lightbox의 바깥 클릭 닫기는 클릭 대상이 dialog일 때만 도는데, 내부
 *   컨테이너가 dialog를 꽉 채워서 실제로는 발동하지 않는다.
 * - 터치로 넘기는 기능이 없다. 사진이 손가락을 따라오게 한다.
 */
export function DayPhotoViewer({ media, index, onIndexChange }: DayPhotoViewerProps) {
  const gestureRef = useRef<SwipeGesture | null>(null)
  const isSlidingRef = useRef(false)
  // 밀고 뗀 직후의 클릭이 "사진 바깥 누르기"로 읽혀 창이 닫히지 않게 한다.
  const suppressClickRef = useRef(false)

  const current = index ?? 0
  const hasPhotoInDirection = (dx: number) =>
    dx < 0 ? current < media.length - 1 : current > 0

  function handleClick(event: MouseEvent<HTMLDialogElement>) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }

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

  function snapBack(gesture: SwipeGesture, visualX: number) {
    gesture.group.style.transform = ''
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gesture.group.animate(
        [{ transform: `translateX(${visualX}px)` }, { transform: 'translateX(0)' }],
        { duration: SLIDE_IN_MS, easing: 'ease-out' },
      )
    }
  }

  async function slideTo(group: HTMLElement, fromX: number, direction: 1 | -1) {
    const next = current + direction
    const dialog = group.closest('dialog')
    const width = dialog?.clientWidth ?? window.innerWidth

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      group.style.transform = ''
      onIndexChange(next)
      return
    }

    isSlidingRef.current = true
    const slideOut = group.animate(
      [
        { transform: `translateX(${fromX}px)` },
        { transform: `translateX(${-direction * width}px)` },
      ],
      { duration: SLIDE_OUT_MS, easing: 'ease-in', fill: 'forwards' },
    )
    group.style.transform = ''

    try {
      await finishWithin(slideOut, SLIDE_OUT_MS)
      // 나가는 동안 창을 닫았다면 인덱스를 다시 넣어 창이 도로 열리면 안 된다.
      if (dialog?.open) {
        // 사진이 바뀐 뒤에 들어오는 애니메이션을 시작해야 옛 사진이 비치지 않는다.
        flushSync(() => onIndexChange(next))
        const slideIn = group.animate(
          [{ transform: `translateX(${direction * width}px)` }, { transform: 'translateX(0)' }],
          { duration: SLIDE_IN_MS, easing: 'ease-out' },
        )
        slideOut.cancel()
        await finishWithin(slideIn, SLIDE_IN_MS)
      } else {
        slideOut.cancel()
      }
    } catch {
      // 애니메이션이 취소된 것뿐이다. 사진 상태는 이미 맞다.
    } finally {
      isSlidingRef.current = false
    }
  }

  function handleTouchStart(event: TouchEvent<HTMLDialogElement>) {
    suppressClickRef.current = false

    // 두 손가락은 확대 제스처다. 넘기던 중이었다면 제자리로 돌린다.
    if (event.touches.length !== 1) {
      const active = gestureRef.current
      if (active) active.group.style.transform = ''
      gestureRef.current = null
      return
    }
    if (isSlidingRef.current) return
    if ((event.target as Element).closest('button')) return

    const image = event.currentTarget.querySelector('img')
    const group = image?.parentElement?.parentElement
    if (!image || !group) return
    // 확대한 상태의 끌기는 사진 안을 둘러보는 동작이다.
    if (image.getBoundingClientRect().width > image.offsetWidth + 1) return

    const touch = event.touches[0]
    gestureRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: event.timeStamp,
      dx: 0,
      axis: null,
      group,
    }
  }

  function handleTouchMove(event: TouchEvent<HTMLDialogElement>) {
    const gesture = gestureRef.current
    if (!gesture) return

    const touch = event.touches[0]
    const dx = touch.clientX - gesture.startX
    const dy = touch.clientY - gesture.startY

    if (gesture.axis == null) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK_DISTANCE) return
      gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    if (gesture.axis === 'y') {
      gestureRef.current = null
      return
    }

    gesture.dx = dx
    const visualX = hasPhotoInDirection(dx) ? dx : dx * EDGE_RESISTANCE
    gesture.group.style.transform = `translateX(${visualX}px)`
  }

  function handleTouchEnd(event: TouchEvent<HTMLDialogElement>) {
    const gesture = gestureRef.current
    if (!gesture || event.touches.length > 0) return
    gestureRef.current = null
    if (gesture.axis !== 'x') return

    suppressClickRef.current = true
    const { dx } = gesture
    const distance = Math.abs(dx)
    const isFlick = distance >= FLICK_DISTANCE && event.timeStamp - gesture.startTime < FLICK_MS

    if (hasPhotoInDirection(dx) && (distance >= SWIPE_DISTANCE || isFlick)) {
      void slideTo(gesture.group, dx, dx < 0 ? 1 : -1)
    } else {
      snapBack(gesture, hasPhotoInDirection(dx) ? dx : dx * EDGE_RESISTANCE)
    }
  }

  function handleTouchCancel() {
    const gesture = gestureRef.current
    gestureRef.current = null
    if (gesture) gesture.group.style.transform = ''
  }

  return (
    <Lightbox
      isOpen={index != null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onIndexChange(null)
      }}
      media={media}
      index={current}
      onIndexChange={onIndexChange}
      hasZoom
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      className="box-border h-dvh! touch-pan-y touch-pinch-zoom pt-[env(safe-area-inset-top)]! pr-[env(safe-area-inset-right)]! pb-[env(safe-area-inset-bottom)]! pl-[env(safe-area-inset-left)]!"
    />
  )
}
