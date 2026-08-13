/**
 * 소원권 — 한 사람이 몇 장을 들고 있고, 그중 몇 장을 무엇에 썼는지.
 *
 * 소원권을 **가진** 사람이 한 장을 써서 상대에게 소원을 말한다. 그래서 어느
 * 테이블이든 owner_id는 "이 소원권의 주인 = 쓴 사람"이지 들어주는 사람이
 * 아니다 (supabase/schema.sql의 wish_quotas 주석).
 */

/** 쓴 소원권 하나. */
export interface Wish {
  id: string
  couple_id: string
  owner_id: string
  content: string
  created_at: string
}

/** 한 사람이 들고 있는 총 장수. 정한 적 없는 사람은 아예 row가 없다. */
export interface WishQuota {
  owner_id: string
  total: number
}

/**
 * 화면이 그리는 단위 — 한 사람의 현황 한 줄.
 *
 * `remaining`을 저장하지 않고 여기서 계산한다. DB도 같은 방식이라
 * (총 장수 - 쓴 소원 수), 두 곳의 셈이 어긋날 여지가 없다.
 */
export interface WishStatus {
  ownerId: string
  /** 위젯 한 줄에 적히는 이름. 나는 "나", 상대는 이름(없으면 "상대방"). */
  name: string
  total: number
  used: number
  remaining: number
}

/**
 * 아직 장수를 정한 적 없는 사람이 들고 시작하는 수.
 *
 * DB의 `wish_default_total()`과 **반드시 같아야 한다**. 어긋나면 위젯이
 * 보여주는 남은 장수와 실제로 쓸 수 있는 장수가 달라진다.
 */
export const WISH_DEFAULT_TOTAL = 5

/** 정할 수 있는 총 장수의 범위. DB의 check 제약과 같아야 한다. */
export const WISH_TOTAL_MAX = 99

/** 소원 한 줄의 길이. DB의 check 제약과 같아야 한다. */
export const WISH_CONTENT_MAX = 100
