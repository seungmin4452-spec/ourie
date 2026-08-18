import { IconButton } from '@astryxdesign/core/IconButton'
import { Moon, Sun } from 'lucide-react'

import { toggleAdminMode } from '@/app/adminMode'
import { useColorMode } from '@/app/useColorMode'
import { useWidgetEditMode } from '@/app/widgetEditMode'
import { useAuth } from '@/features/auth'
import { isAdminEmail } from '@/features/admin/access'
import { useLongPress } from '@/features/widgets/useLongPress'

export function ColorModeToggle() {
  const { mode, toggle } = useColorMode()
  const isWidgetEditMode = useWidgetEditMode()
  const { user } = useAuth()
  const isLight = mode === 'light'

  // 길게 누르면 화면이 뒤집히며 관리자 모드로 넘어간다 — 지도 뒤집기와 같은
  // 제스처(useLongPress.ts)를 이 버튼에 그대로 얹었다. 관리자 계정이 아니면
  // isEnabled가 꺼져서 오래 눌러도 그냥 평범한 버튼이다. **이건 UX일 뿐
  // 진짜 권한 검사가 아니다** — 실제 검사는 서버가 한다
  // (src/features/admin/access.ts, api/admin/broadcast.ts).
  const longPressProps = useLongPress(toggleAdminMode, isAdminEmail(user?.email))

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
      {...longPressProps}
    />
  )
}
