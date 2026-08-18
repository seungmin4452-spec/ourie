import { Text } from '@astryxdesign/core/Text'
import { motion, useReducedMotion } from 'framer-motion'
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'

import { useAdminMode } from './adminMode'

const AdminScreen = lazy(async () => ({
  default: (await import('@/features/admin/AdminScreen')).AdminScreen,
}))

interface AdminFlipStageProps {
  /** 라우터 아웃렛 — 앞면. */
  children: ReactNode
}

/**
 * 화면 전체를 뒤집어 관리자 모드로 넘어가는 무대.
 *
 * PhotoMapWidget의 카드 뒤집기(지도 ↔ 뱃지)와 같은 기법을 페이지 스케일로
 * 옮긴 것이다 — 두 면의 실제 높이를 재서 지금 보이는 면에 맞춰 카드 높이를
 * 직접 지정한다. 안 그러면 짧은 면을 보고 있을 때 아래가 빈다 (커밋
 * `ae3dec7`에서 이미 한 번 겪은 버그).
 *
 * `AdminScreen`은 관리자 모드에 한 번이라도 들어간 뒤에만 마운트한다
 * (`hasEntered`). 대부분의 세션에서는 한 번도 뒤집지 않으므로 그 번들이
 * 아예 안 실린다 — `lazy` + `Suspense`로 감싼 이유다.
 *
 * **이 컴포넌트 서브트리 안에는 `position: fixed` 요소를 두지 말 것**
 * (src/index.css의 `.admin-flip-scene` 주석 참고). `ColorModeToggle`이 이
 * 컴포넌트의 형제로(자식이 아니라) providers.tsx에 남아 있는 이유이기도 하다.
 */
export function AdminFlipStage({ children }: AdminFlipStageProps) {
  const isAdminMode = useAdminMode()
  const prefersReducedMotion = useReducedMotion()

  // 관리자 모드에 한 번이라도 들어간 적 있으면 계속 true로 남는다. ref가
  // 아니라 state인 이유: 렌더 중에 ref.current를 읽고 쓰면 안 된다는 게
  // react-hooks 규칙이다 — 이건 "이전 렌더에서 온 값을 보고 상태를
  // 조정"하는, React가 렌더 중 setState를 명시적으로 허용하는 패턴이다.
  const [hasEntered, setHasEntered] = useState(false)
  if (isAdminMode && !hasEntered) setHasEntered(true)

  const frontRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLDivElement>(null)
  const [faceHeights, setFaceHeights] = useState({ front: 0, back: 0 })

  useEffect(() => {
    const front = frontRef.current
    const back = backRef.current
    if (!front || !back) return

    const observer = new ResizeObserver(() => {
      setFaceHeights({ front: front.scrollHeight, back: back.scrollHeight })
    })
    observer.observe(front)
    observer.observe(back)
    return () => observer.disconnect()
  }, [])

  const activeHeight = isAdminMode ? faceHeights.back : faceHeights.front

  return (
    <div className="admin-flip-scene">
      <motion.div
        className="admin-flip-card"
        animate={{
          rotateY: isAdminMode ? 180 : 0,
          height: activeHeight > 0 ? activeHeight : 'auto',
        }}
        transition={
          prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 140, damping: 22 }
        }
      >
        <motion.div className="admin-flip-face" ref={frontRef} aria-hidden={isAdminMode}>
          {children}
        </motion.div>

        <motion.div
          className="admin-flip-face admin-flip-face-back"
          ref={backRef}
          aria-hidden={!isAdminMode}
        >
          {hasEntered && (
            <Suspense
              fallback={
                <Text type="supporting" justify="center">
                  불러오는 중...
                </Text>
              }
            >
              <AdminScreen />
            </Suspense>
          )}
        </motion.div>
      </motion.div>
    </div>
  )
}
