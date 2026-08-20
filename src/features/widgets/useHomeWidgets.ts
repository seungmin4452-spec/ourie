import { useCallback, useEffect, useState } from 'react'

import { widgetSizing } from './catalog'
import { isWidgetId, isWidgetSize, type WidgetId, type WidgetSize } from './types'

const STORAGE_KEY = 'ourie-home-widgets'

/** 홈 그리드에 올라간 위젯 하나. 순서는 배열 순서 그대로다. */
export interface WidgetEntry {
  id: WidgetId
  size: WidgetSize
}

/** 처음 홈에 들어왔을 때의 기본 구성. */
const DEFAULT_WIDGETS: WidgetId[] = ['dday', 'poke', 'memories']

/** 저장 못 하는 폭을 걸러낸다 — 리사이즈 불가 위젯은 항상 전체 폭이다. */
function normalizeSize(id: WidgetId, size: WidgetSize): WidgetSize {
  return widgetSizing(id).resizable ? size : 'full'
}

function toEntry(id: WidgetId): WidgetEntry {
  return { id, size: widgetSizing(id).defaultSize }
}

/**
 * 저장된 구성을 읽는다. 손상됐거나(수동 편집, 예전 버전의 id) 비어 있으면
 * 기본 구성으로 되돌린다 — 홈이 아예 빈 화면으로 열리는 것보다 낫다.
 *
 * 폭 토글이 생기기 전 저장 형태(`WidgetId[]`)도 읽는다 — 그때는 다들 각자
 * 카탈로그의 기본 폭으로 시작한 것과 같으므로, 지금 그 기본값을 그대로
 * 붙여준다.
 */
function readStoredWidgets(): WidgetEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_WIDGETS.map(toEntry)

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_WIDGETS.map(toEntry)

    const entries: WidgetEntry[] = []
    const seen = new Set<WidgetId>()

    for (const item of parsed) {
      // 예전 형태: 문자열 하나가 위젯 id였다.
      if (isWidgetId(item)) {
        if (seen.has(item)) continue
        seen.add(item)
        entries.push(toEntry(item))
        continue
      }

      // 지금 형태: { id, size }.
      if (
        item != null &&
        typeof item === 'object' &&
        'id' in item &&
        isWidgetId((item as { id: unknown }).id)
      ) {
        const id = (item as { id: WidgetId }).id
        if (seen.has(id)) continue
        seen.add(id)
        const rawSize = (item as { size?: unknown }).size
        const size = isWidgetSize(rawSize) ? rawSize : widgetSizing(id).defaultSize
        entries.push({ id, size: normalizeSize(id, size) })
      }
    }

    return entries.length > 0 ? entries : DEFAULT_WIDGETS.map(toEntry)
  } catch {
    // JSON 파싱 실패, 사파리 프라이빗 모드의 localStorage 접근 거부 등.
    return DEFAULT_WIDGETS.map(toEntry)
  }
}

/**
 * 홈 화면에 올려둔 위젯 목록과 그 순서·폭. 이 기기에만 저장된다 — iOS 홈 화면
 * 앱은 사파리와 저장소를 공유하지 않으므로, 앱을 다시 설치하면 기본 구성으로
 * 돌아온다.
 */
export function useHomeWidgets() {
  const [widgets, setWidgets] = useState<WidgetEntry[]>(readStoredWidgets)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets))
    } catch {
      // 저장에 실패해도 이번 세션의 화면은 그대로 동작한다. 위젯 구성 때문에
      // 홈 전체를 에러로 만들 이유는 없다.
    }
  }, [widgets])

  const addWidget = useCallback((id: WidgetId) => {
    setWidgets((current) => (current.some((entry) => entry.id === id) ? current : [...current, toEntry(id)]))
  }, [])

  const removeWidget = useCallback((id: WidgetId) => {
    setWidgets((current) => current.filter((entry) => entry.id !== id))
  }, [])

  /**
   * 편집 모드의 폭 토글에서 부른다. 리사이즈가 안 되는 위젯(디데이)에 잘못
   * 걸려도 조용히 무시한다 — 토글 자체를 안 보여주니 정상 경로로는 못
   * 일어나지만, 저장된 값을 직접 만지는 경우까지 막아둔다.
   */
  const setWidgetSize = useCallback((id: WidgetId, size: WidgetSize) => {
    if (!widgetSizing(id).resizable) return
    setWidgets((current) => current.map((entry) => (entry.id === id ? { ...entry, size } : entry)))
  }, [])

  /**
   * 위젯 하나를 위/아래 이웃과 맞바꾼다. WidgetCard의 이동 버튼이 부른다.
   * 목록의 끝에서 더 밀면 아무 일도 일어나지 않는다 (버튼 자체도 그쪽은
   * 비활성화된다 — WidgetList.tsx의 canMoveUp/canMoveDown).
   */
  const moveWidget = useCallback((id: WidgetId, direction: 'up' | 'down') => {
    setWidgets((current) => {
      const from = current.findIndex((entry) => entry.id === id)
      const to = direction === 'up' ? from - 1 : from + 1
      if (from === -1 || to < 0 || to >= current.length) return current

      const next = [...current]
      next[from] = current[to]
      next[to] = current[from]
      return next
    })
  }, [])

  return { widgets, addWidget, removeWidget, moveWidget, setWidgetSize }
}
