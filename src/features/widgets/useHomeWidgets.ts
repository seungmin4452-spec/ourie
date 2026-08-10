import { useCallback, useEffect, useState } from 'react'

import { isWidgetId, type WidgetId } from './types'

const STORAGE_KEY = 'ourie-home-widgets'

/** 처음 홈에 들어왔을 때의 기본 구성. */
const DEFAULT_WIDGETS: WidgetId[] = ['dday', 'memories']

/**
 * 저장된 구성을 읽는다. 손상됐거나(수동 편집, 예전 버전의 id) 비어 있으면
 * 기본 구성으로 되돌린다 — 홈이 아예 빈 화면으로 열리는 것보다 낫다.
 */
function readStoredWidgets(): WidgetId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_WIDGETS

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_WIDGETS

    // 중복 제거까지 여기서 한다. 아래 addWidget이 막고 있긴 하지만, 저장된
    // 값은 우리 코드 밖에서도 바뀔 수 있고 중복된 key는 React가 싫어한다.
    const widgets = [...new Set(parsed.filter(isWidgetId))]
    return widgets
  } catch {
    // JSON 파싱 실패, 사파리 프라이빗 모드의 localStorage 접근 거부 등.
    return DEFAULT_WIDGETS
  }
}

/**
 * 홈 화면에 올려둔 위젯 목록과 그 순서. 이 기기에만 저장된다 — iOS 홈 화면
 * 앱은 사파리와 저장소를 공유하지 않으므로, 앱을 다시 설치하면 기본 구성으로
 * 돌아온다.
 */
export function useHomeWidgets() {
  const [widgets, setWidgets] = useState<WidgetId[]>(readStoredWidgets)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets))
    } catch {
      // 저장에 실패해도 이번 세션의 화면은 그대로 동작한다. 위젯 구성 때문에
      // 홈 전체를 에러로 만들 이유는 없다.
    }
  }, [widgets])

  const addWidget = useCallback((id: WidgetId) => {
    setWidgets((current) => (current.includes(id) ? current : [...current, id]))
  }, [])

  const removeWidget = useCallback((id: WidgetId) => {
    setWidgets((current) => current.filter((widget) => widget !== id))
  }, [])

  return { widgets, addWidget, removeWidget }
}
