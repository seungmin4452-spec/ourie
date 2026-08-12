import { useSyncExternalStore } from 'react'

/**
 * 홈 위젯 편집 모드가 켜져 있는지.
 *
 * 이 값을 컴포넌트 밖에 두는 이유는 화면 두 곳이 같은 자리를 두고 다투기
 * 때문이다. 편집 도구 막대(HomePage)가 화면 맨 위를 통째로 쓰는데, 거기엔
 * 라이트/다크 전환 버튼(ColorModeToggle)이 페이지와 상관없이 고정되어 떠
 * 있다. 편집 중에는 전환 버튼이 비켜줘야 하고, 그러려면 서로 남남인 두
 * 컴포넌트가 같은 값을 봐야 한다.
 *
 * Context 대신 작은 스토어를 쓴다. 저장되지도 않고 앱 전체가 필요로 하지도
 * 않는 잠깐의 화면 상태라, Provider를 하나 더 끼우는 것보다 읽는 쪽이 훅
 * 하나만 부르는 편이 가볍다.
 */
let isEditing = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setWidgetEditMode(next: boolean) {
  if (isEditing === next) return

  isEditing = next
  for (const listener of listeners) listener()
}

export function useWidgetEditMode() {
  return useSyncExternalStore(subscribe, () => isEditing)
}
