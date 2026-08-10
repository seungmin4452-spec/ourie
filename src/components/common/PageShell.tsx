import { VStack } from '@astryxdesign/core/VStack'
import type { ReactNode } from 'react'

interface PageShellProps {
  children: ReactNode
  gap?: 3 | 4 | 5 | 6
  /** 로그인·온보딩처럼 내용이 짧은 화면을 세로 가운데로 모은다. */
  isCentered?: boolean
  /** 폼 위주 화면은 좁게(384), 콘텐츠 화면은 넓게(560). */
  maxWidth?: number
}

/**
 * 모든 페이지의 바깥 컨테이너.
 *
 * 페이지마다 VStack + 여백 + 최대 폭을 따로 쓰다 보니 iOS 안전 영역 대응이
 * 한 군데도 없었고, 홈 화면 앱에서 상단이 상태바에 잘려 뒤로가기 버튼을 누를
 * 수 없었다 (UI_GUIDE §4 "안전 영역 대응"). 여백 규칙을 여기 한 곳에 모아
 * 페이지가 다시 어긋나지 않게 한다.
 */
export function PageShell({
  children,
  gap = 5,
  isCentered = false,
  maxWidth = 560,
}: PageShellProps) {
  return (
    <VStack
      as="section"
      gap={gap}
      width="100%"
      maxWidth={maxWidth}
      minHeight="100svh"
      vAlign={isCentered ? 'center' : undefined}
      className="page-safe-padding mx-auto"
    >
      {children}
    </VStack>
  )
}
