import { WISH_DEFAULT_TOTAL, type Wish, type WishQuota, type WishStatus } from './types'

/**
 * 소원권 현황판의 셈. 순수 함수만 둔다 — 위젯과 다이얼로그가 같은 숫자를
 * 보여줘야 하는데, 각자 계산하면 언젠가 한쪽만 고치게 된다.
 */

/**
 * 한 사람의 현황 한 줄.
 *
 * 장수를 정한 적 없는 사람은 quotas에 아예 없다. 그때는 기본값으로 떨어진다 —
 * DB의 잔량 검사도 같은 기본값을 쓰므로(`wish_default_total()`) 화면에 보이는
 * 남은 장수가 실제로 쓸 수 있는 장수와 같다.
 */
export function wishStatus(
  ownerId: string,
  name: string,
  wishes: Wish[],
  quotas: WishQuota[],
): WishStatus {
  const total = quotas.find((quota) => quota.owner_id === ownerId)?.total ?? WISH_DEFAULT_TOTAL
  const used = wishes.filter((wish) => wish.owner_id === ownerId).length

  return {
    ownerId,
    name,
    total,
    used,
    // 총 장수를 줄이는 길은 DB가 이미 막아두었지만(check_wish_total), 화면이
    // 낡은 캐시를 들고 있는 순간에는 음수가 나올 수 있다. "남은 -1장"을 보여줄
    // 이유는 없다.
    remaining: Math.max(0, total - used),
  }
}

/**
 * 소원을 쓴 사람의 이름. 목록에서 누가 부탁한 것인지 가르는 데 쓴다.
 *
 * 내 것이면 "나"다 — 이름을 적으면 목록 절반이 내 이름으로 채워져서 정작
 * 구분해야 할 상대의 줄이 눈에 안 들어온다. 상대의 이름이 비어 있는 경우
 * (name 컬럼이 생기기 전에 가입한 계정)는 "상대방"으로 떨어진다.
 */
export function wishOwnerName(
  ownerId: string,
  selfId: string | null | undefined,
  partnerName: string | null | undefined,
): string {
  if (ownerId === selfId) return '나'
  return partnerName?.trim() || '상대방'
}

/**
 * 소원을 쓴 날. 목록에서 이름 옆에 붙는 한 조각이라 연도는 뺀다 — 대부분
 * 올해 안의 일이고, "2026년 8월 13일"은 그 한 줄에서 가장 긴 말이 된다.
 */
export function wishDateLabel(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
  })
}
