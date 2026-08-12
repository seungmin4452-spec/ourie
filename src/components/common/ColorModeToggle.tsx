import { IconButton } from '@astryxdesign/core/IconButton'
import { Moon, Sun } from 'lucide-react'

import { useColorMode } from '@/app/useColorMode'
import { useWidgetEditMode } from '@/app/widgetEditMode'

export function ColorModeToggle() {
  const { mode, toggle } = useColorMode()
  const isWidgetEditMode = useWidgetEditMode()
  const isLight = mode === 'light'

  // 위젯을 편집하는 동안엔 화면 맨 위가 편집 도구 막대의 자리다. 이 버튼은
  // 페이지와 상관없이 그 오른쪽 끝에 고정되어 있어서 "완료"와 정확히 겹친다.
  if (isWidgetEditMode) return null

  return (
    <IconButton
      label={isLight ? '다크 모드로 전환' : '라이트 모드로 전환'}
      tooltip={isLight ? '다크 모드' : '라이트 모드'}
      icon={isLight ? <Moon className="size-4" /> : <Sun className="size-4" />}
      variant="ghost"
      onClick={toggle}
      className="fixed z-50 top-[calc(1rem+env(safe-area-inset-top))] right-[calc(1rem+env(safe-area-inset-right))]"
    />
  )
}
