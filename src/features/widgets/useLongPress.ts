import { useCallback, useEffect, useRef } from 'react'
import type { MouseEvent, PointerEvent } from 'react'

/** 이 시간만큼 누르고 있으면 "꾹 누른" 것으로 본다. iOS 홈 화면과 비슷한 길이. */
const HOLD_MS = 450

/** 손가락이 이보다 많이 움직이면 스크롤로 보고 취소한다. */
const MOVE_TOLERANCE_PX = 10

/**
 * 카드를 꾹 누르는 제스처. 홈 화면 아이콘을 길게 눌러 정리 모드로 들어가는
 * 것과 같은 동작을 위젯에 준다 (WidgetList.tsx에서 쓴다).
 *
 * 터치에서 어려운 부분은 "누른 것"과 "스크롤한 것"을 가르는 일이다. 손가락이
 * 조금이라도 움직이거나 브라우저가 스크롤을 가져가면(pointercancel) 취소해서,
 * 홈을 훑어 내리다가 편집 모드가 켜지지 않게 한다.
 */
export function useLongPress(onLongPress: () => void, isEnabled = true) {
  const timerRef = useRef<number | null>(null)
  const originRef = useRef<{ x: number; y: number } | null>(null)
  const didFireRef = useRef(false)

  const cancel = useCallback(() => {
    if (timerRef.current === null) return
    window.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  // 누른 채로 화면을 벗어나면 사라진 카드를 두고 편집 모드가 켜진다.
  useEffect(() => cancel, [cancel])

  const handlePointerDown = useCallback(
    (event: PointerEvent) => {
      // button !== 0은 마우스 오른쪽·가운데 클릭이다. 터치는 항상 0으로 온다.
      if (!isEnabled || event.button !== 0) return

      cancel()
      didFireRef.current = false
      originRef.current = { x: event.clientX, y: event.clientY }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        didFireRef.current = true
        onLongPress()
      }, HOLD_MS)
    },
    [cancel, isEnabled, onLongPress],
  )

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const origin = originRef.current
      if (timerRef.current === null || origin === null) return

      const distance = Math.hypot(event.clientX - origin.x, event.clientY - origin.y)
      if (distance > MOVE_TOLERANCE_PX) cancel()
    },
    [cancel],
  )

  const handleClickCapture = useCallback((event: MouseEvent) => {
    if (!didFireRef.current) return

    // 꾹 누른 손을 떼면 클릭이 따라온다. 그대로 두면 편집 모드를 켜면서
    // 손가락 아래 있던 위젯 속 버튼까지 같이 눌린다.
    didFireRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const handleContextMenu = useCallback(
    (event: MouseEvent) => {
      // 안드로이드 크롬은 길게 누르면 컨텍스트 메뉴를 띄워 제스처를 가로챈다.
      if (isEnabled) event.preventDefault()
    },
    [isEnabled],
  )

  return {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onClickCapture: handleClickCapture,
    onContextMenu: handleContextMenu,
  }
}
