import type { ComponentType } from 'react'

import { BroadcastWidget } from './components/BroadcastWidget'

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
 */
export const ADMIN_WIDGETS: AdminWidgetMeta[] = [
  {
    id: 'broadcast',
    title: '전체 알림',
    description: '가입자 전체에게 푸시 알림을 즉시 보내요.',
    Component: BroadcastWidget,
  },
]
