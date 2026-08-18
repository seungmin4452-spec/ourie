/**
 * 전체 알림 문구의 길이 제한. client(입력칸)와 server(api/admin/broadcast.ts,
 * `.js`로 가져감)가 같은 값을 봐야 해서 한 곳에 둔다 — wish/types.ts의
 * WISH_CONTENT_MAX와 같은 이유다.
 */
export const BROADCAST_TITLE_MAX = 40
export const BROADCAST_BODY_MAX = 150

/**
 * 가입자 현황판의 "최근 N일 신규 가입"이 세는 기간(일). server(api/admin/stats.ts)가
 * 이 값으로 세고, client(SignupStatsWidget.tsx)는 같은 값으로 라벨을 적는다 —
 * 둘이 따로 적으면 숫자와 라벨이 어긋날 수 있다.
 */
export const RECENT_SIGNUP_WINDOW_DAYS = 7
