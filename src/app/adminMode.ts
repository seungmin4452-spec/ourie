import { useSyncExternalStore } from 'react'

/**
 * 관리자 모드(화면 뒤집기 뒷면)가 켜져 있는지.
 *
 * widgetEditMode.ts와 같은 이유로 Context 대신 모듈 스코프 스토어를 쓴다 —
 * 트리거인 ColorModeToggle과 화면을 그리는 AdminFlipStage가 서로 남남인
 * 컴포넌트라 Provider 하나를 더 끼우는 것보다 훅 하나만 부르는 편이 가볍다.
 *
 * 새로고침하면 초기화된다(영속화하지 않는다) — 관리자 모드는 잠깐의 화면
 * 상태이지, 다시 열었을 때도 이어져야 할 설정이 아니다.
 */
let isAdminMode = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setAdminMode(next: boolean) {
  if (isAdminMode === next) return

  isAdminMode = next
  for (const listener of listeners) listener()
}

export function toggleAdminMode() {
  setAdminMode(!isAdminMode)
}

export function useAdminMode() {
  return useSyncExternalStore(subscribe, () => isAdminMode)
}
