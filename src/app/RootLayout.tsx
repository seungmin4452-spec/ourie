import { Outlet, ScrollRestoration } from 'react-router-dom'

/**
 * 모든 라우트의 뿌리. ScrollRestoration이 화면 전환마다 스크롤 위치를
 * sessionStorage에 저장하고, 뒤로가기로 같은 화면에 돌아오면 그 위치로
 * 되돌린다 — 이게 없으면 "N개 모두 보기"를 눌러 이동했다가 뒤로가기를 눌러도
 * 늘 맨 위로 돌아가 버린다.
 */
export function RootLayout() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}
