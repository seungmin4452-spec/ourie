import type { ComponentType } from 'react'

import { BroadcastWidget } from './components/BroadcastWidget'
import { EffectsWidget } from './components/EffectsWidget'
import { SignupStatsWidget } from './components/SignupStatsWidget'

export interface AdminWidgetMeta {
  id: string
  title: string
  description: string
  Component: ComponentType
}

/**
 * 관리자 화면에 쌓을 위젯 목록.
 *
 * 홈의 위젯 시스템(추가/삭제/드래그 순서 변경, localStorage 영속화)은 여러
 * 위젯을 자유롭게 편집하는 사용자용 장치라 여기엔 안 맞는다 — 운영자는
 * 한 명이고 목록은 코드로 고정한다. 다음 관리자 위젯부터는 이 배열에 항목
 * 하나를 추가하는 것으로 끝난다.
 *
 * 현황판을 맨 위에 둔 이유: 무언가 하기(전체 알림) 전에 지금 상황부터
 * 보는 게 순서다.
 */
export const ADMIN_WIDGETS: AdminWidgetMeta[] = [
  {
    id: 'signup-stats',
    title: '가입자 현황',
    description: '지금까지 가입한 사람 수와 최근 활동을 한눈에 봐요.',
    Component: SignupStatsWidget,
  },
  {
    id: 'broadcast',
    title: '전체 알림',
    description: '가입자 전체에게 푸시 알림을 즉시 보내요.',
    Component: BroadcastWidget,
  },
  {
    id: 'effects',
    title: '특수효과',
    description: '켜면 그 순간 모든 사용자의 홈 화면에 떨어져요.',
    Component: EffectsWidget,
  },
]
