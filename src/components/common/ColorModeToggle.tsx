import { IconButton } from '@astryxdesign/core/IconButton'
import { Moon, Sun } from 'lucide-react'

import { useColorMode } from '@/app/useColorMode'

export function ColorModeToggle() {
  const { mode, toggle } = useColorMode()
  const isLight = mode === 'light'

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
