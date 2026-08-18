import { VStack } from '@astryxdesign/core/VStack'
import { motion, useReducedMotion } from 'framer-motion'
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'

import { useAdminMode } from './adminMode'

/**
 * AdminScreen 번들을 캐싱하며 부르는 함수. `lazy()`와 뒤집기 연출이 각자
 * import()를 부르면 매번 새 프라미스가 생기니, 하나로 모아 재사용한다 —
 * 이 프라미스가 먼저 끝나야 콘텐츠를 바꿔치기하기 때문에(아래
 * `preloadAdminScreen` 참고) `lazy()`가 참조하는 것과 같은 프라미스여야
 * 한다.
 */
let adminScreenModule: ReturnType<typeof importAdminScreen> | null = null
function importAdminScreen() {
  return import('@/features/admin/AdminScreen')
}
function preloadAdminScreen() {
  adminScreenModule ??= importAdminScreen()
  return adminScreenModule
}

const AdminScreen = lazy(async () => ({ default: (await preloadAdminScreen()).AdminScreen }))

/** 뒤집는 연출 한 쪽 절반의 길이(초) — 절반 지점에 콘텐츠를 바꾸고, 그 뒤로
 * 같은 시간만큼 더 오버레이가 덮고 있다가 걷힌다. */
const HALF_FLIP_S = 0.25

interface AdminFlipStageProps {
  /** 라우터 아웃렛 — 평소에 보이는 내용. */
  children: ReactNode
}

/**
 * 관리자 모드로 넘어가는 연출과, 그 뒤에 실제로 무엇을 보여줄지.
 *
 * **뒤집는 동안만 3D이고, 뒤집힌 뒤에는 완전히 다른 화면이다.** 처음엔
 * PhotoMapWidget처럼 앞뒤 두 면을 항상 같이 띄워두고 backface-visibility로
 * 감추는 방식을 페이지 스케일로 그대로 옮겼는데, 문제가 있었다 — 페이지
 * 전체가 상시로 `perspective`/`transform` 무대 안에 있다 보니 진입 시
 * 비율이 어긋났고, 뒤집은 뒤에도 반대쪽 면이 완전히 사라지지 않았다.
 *
 * 그래서 지금은 **화면을 가리는 짧은 연출(오버레이)**과 **실제로 렌더링할
 * 내용**을 분리했다. 평소엔 `children`이든 `AdminScreen`이든 딱 하나만,
 * 아무 3D 변환도 없이 보통의 페이지로 렌더링된다. 오버레이가 화면 전체를
 * 덮고 있는 동안에만 안쪽 내용을 통째로 바꿔치기한다.
 *
 * **오버레이를 걷기 전에 AdminScreen이 실제로 로드됐는지까지 기다린다.**
 * `AdminScreen`은 `lazy()`로 갈라진 별도 번들이라, 처음 들어갈 때 네트워크가
 * 느리면 그 다운로드가 뒤집기 애니메이션(0.5초)보다 오래 걸릴 수 있다.
 * 시간만 보고 오버레이를 걷으면 아직 테마 CSS도 못 받은 빈 화면이
 * 잠깐(검게) 드러난다 — "가끔 초록색, 가끔 검정색"으로 보이던 것이 이것이다.
 * 그래서 절반 지점에서 타이머와 로딩을 `Promise.all`로 같이 기다린 뒤에만
 * 바꿔치기한다.
 */
export function AdminFlipStage({ children }: AdminFlipStageProps) {
  const isAdminMode = useAdminMode()
  const prefersReducedMotion = useReducedMotion()

  // displayedMode: 지금 실제로 렌더링할 내용. settledMode: 연출이 완전히
  // 끝났을 때의 값(오버레이가 사라지는 시점). 오버레이는 `isAdminMode`와
  // `settledMode`가 다른 동안 떠 있다.
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

    let isCancelled = false
    const wait = (seconds: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, seconds * 1000))

    async function runFlip() {
      // 관리자 모드로 들어가는 쪽일 때만 로딩을 기다린다 — 나가는 쪽(children)은
      // 이미 항상 로드돼 있는 라우터 아웃렛이라 기다릴 게 없다.
      await Promise.all([wait(HALF_FLIP_S), isAdminMode ? preloadAdminScreen() : null])
      if (isCancelled) return
      setDisplayedMode(isAdminMode)

      await wait(HALF_FLIP_S)
      if (isCancelled) return
      setSettledMode(isAdminMode)
    }

    void runFlip()
    return () => {
      isCancelled = true
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
            transition={{ duration: HALF_FLIP_S * 2, ease: 'easeInOut' }}
          >
            {/* 앞면 — 지금 나가는 쪽. 뒷면도 일부러 테마 없이 순수 CSS
                색으로만 칠한다(admin-flip-overlay-face-back, index.css) —
                여기서 또 다른 <Theme> 인스턴스를 마운트하면 그 순간 새로
                런타임 CSS 주입이 한 번 더 일어나 로딩 경합만 늘어난다. */}
            <div className="admin-flip-overlay-face bg-body" />
            <div className="admin-flip-overlay-face admin-flip-overlay-face-back" />
          </motion.div>
        </VStack>
      )}
    </>
  )
}
