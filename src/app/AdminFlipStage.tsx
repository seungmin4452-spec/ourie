import { Heading } from '@astryxdesign/core/Heading'
import { Theme } from '@astryxdesign/core/theme'
import { VStack } from '@astryxdesign/core/VStack'
import { motion, useReducedMotion } from 'framer-motion'
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'

import { adminTerminalTheme } from './adminTheme'
import { useAdminMode } from './adminMode'

const AdminScreen = lazy(async () => ({
  default: (await import('@/features/admin/AdminScreen')).AdminScreen,
}))

/** 뒤집는 연출의 전체 길이(초). 화면이 가려져 있는 동안 아래 내용을 통째로 바꿔치기한다. */
const FLIP_DURATION_S = 0.5

interface AdminFlipStageProps {
  /** 라우터 아웃렛 — 평소에 보이는 내용. */
  children: ReactNode
}

/**
 * 관리자 모드로 넘어가는 연출과, 그 뒤에 실제로 무엇을 보여줄지.
 *
 * **뒤집는 동안만 3D이고, 뒤집힌 뒤에는 완전히 다른 화면이다.** 처음엔
 * PhotoMapWidget처럼 앞뒤 두 면을 항상 같이 띄워두고 backface-visibility로
 * 감추는 방식을 페이지 스케일로 그대로 옮겼는데, 문제가 있었다 —
 * 페이지 전체가 상시로 `perspective`/`transform` 무대 안에 있다 보니
 * 진입 시 비율이 어긋나고, 뒤집은 뒤에도 반대쪽 면이 완전히 사라지지
 * 않았다(문서 트리 안에 계속 살아 있는 채였다).
 *
 * 그래서 지금은 **화면을 가리는 짧은 연출(오버레이)**과 **실제로 렌더링할
 * 내용**을 분리했다. 평소엔 `children`이든 `AdminScreen`이든 딱 하나만,
 * 아무 3D 변환도 없이 보통의 페이지로 렌더링된다 (그래서 다른 위젯들과
 * 똑같이 정상적인 폭을 가진다). 모드가 바뀌면 `.admin-flip-overlay`가
 * 잠깐 화면 전체를 덮으며 뒤집히고, **그 오버레이가 가리고 있는 순간에만**
 * 실제로 보여줄 내용을 바꿔치기한다 — 반대쪽 면은 그 짧은 순간 말고는
 * 아예 존재하지 않는다.
 */
export function AdminFlipStage({ children }: AdminFlipStageProps) {
  const isAdminMode = useAdminMode()
  const prefersReducedMotion = useReducedMotion()

  // displayedMode: 지금 실제로 렌더링할 내용(오버레이 절반 지점에 바뀐다).
  // settledMode: 연출이 완전히 끝났을 때의 값(오버레이가 사라지는 시점).
  // 오버레이는 이 둘이 아니라 `isAdminMode`와 `settledMode`가 다른 동안
  // 떠 있다 — 콘텐츠 교체(절반 지점)와 오버레이 종료(끝 지점) 타이밍이
  // 서로 달라서 하나의 값으로 줄일 수 없다.
  const [displayedMode, setDisplayedMode] = useState(isAdminMode)
  const [settledMode, setSettledMode] = useState(isAdminMode)
  const isFlipping = isAdminMode !== settledMode

  // 모션에 민감한 사용자에게는 연출 없이 바로 바뀐다. 렌더 중에 이전
  // 렌더의 값을 보고 조정하는, React가 명시적으로 허용하는 패턴이다 —
  // useEffect 안에서 동기적으로 setState하지 않는다.
  if (prefersReducedMotion && isFlipping) {
    setDisplayedMode(isAdminMode)
    setSettledMode(isAdminMode)
  }

  useEffect(() => {
    if (prefersReducedMotion || !isFlipping) return

    // 오버레이가 화면을 완전히 덮은 절반 지점에 콘텐츠를 바꿔치기한다 —
    // 두 면 다 불투명한 색으로 덮여 있어서 정확히 90도일 필요는 없다.
    const swapTimer = window.setTimeout(
      () => setDisplayedMode(isAdminMode),
      (FLIP_DURATION_S * 1000) / 2,
    )
    const endTimer = window.setTimeout(
      () => setSettledMode(isAdminMode),
      FLIP_DURATION_S * 1000,
    )

    return () => {
      window.clearTimeout(swapTimer)
      window.clearTimeout(endTimer)
    }
  }, [isAdminMode, isFlipping, prefersReducedMotion])

  return (
    <>
      {displayedMode ? (
        <Suspense fallback={null}>
          <AdminScreen />
        </Suspense>
      ) : (
        children
      )}

      {isFlipping && (
        <VStack className="admin-flip-overlay">
          <motion.div
            className="admin-flip-overlay-card"
            initial={{ rotateY: isAdminMode ? 0 : 180 }}
            animate={{ rotateY: isAdminMode ? 180 : 0 }}
            transition={{ duration: FLIP_DURATION_S, ease: 'easeInOut' }}
          >
            {/* 앞면 — 지금 나가는 쪽. 중첩 테마가 없으니 지금 화면의 라이트/
                다크를 그대로 잇는다. */}
            <div className="admin-flip-overlay-face bg-body" />

            {/* 뒷면 — 관리자 모드로 들어가는 쪽. 실제 AdminScreen과 같은
                터미널 테마를 미리 씌워, 오버레이가 걷히는 순간 이질감이
                없게 한다. */}
            <Theme theme={adminTerminalTheme} mode="dark">
              <div className="admin-flip-overlay-face admin-flip-overlay-face-back bg-body">
                <VStack height="100%" hAlign="center" vAlign="center">
                  <Heading level={2}>관리자 모드</Heading>
                </VStack>
              </div>
            </Theme>
          </motion.div>
        </VStack>
      )}
    </>
  )
}
