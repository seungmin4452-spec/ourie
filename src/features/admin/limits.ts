/**
 * 전체 알림 문구의 길이 제한. client(입력칸)와 server(api/admin/broadcast.ts,
 * `.js`로 가져감)가 같은 값을 봐야 해서 한 곳에 둔다 — wish/types.ts의
 * WISH_CONTENT_MAX와 같은 이유다.
 */
export const BROADCAST_TITLE_MAX = 40
export const BROADCAST_BODY_MAX = 150
