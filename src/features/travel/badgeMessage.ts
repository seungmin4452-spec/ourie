// 지역 뱃지 알림 문구.
//
// 브라우저와 서버(api/badge.ts) 양쪽에서 쓴다. 순수 함수와 상수만 두고,
// DOM·Supabase·환경변수처럼 한쪽에만 있는 것에는 손대지 않는다
// (poke/message.ts, wish/message.ts와 같은 규칙이다).
//
// 지역 이름을 여기서 찾지 않고 **인자로 받는** 이유가 있다. 이름은 regions.ts에
// 있는데 그 파일은 도형까지 들고 있어 263KB다. 여기서 import하면 이 문구를
// 쓰는 모든 곳이 그 무게를 지게 되므로, 찾는 일은 부르는 쪽에 맡긴다.

export interface BadgeNotification {
  title: string
  body: string
  tag: string
  renotify: true
}

/** 'visited' = 다 다녀옴, 'photo' = 사진까지 채움. badges.ts의 BadgeTier와 같아야 한다. */
export type EarnedTier = 'visited' | 'photo'

/**
 * 뱃지를 땄을 때 상대방 기기에 뜰 알림.
 *
 * **"우리가"라고 쓴다.** 마지막 칸을 누른 사람이 누구든 이건 둘이 함께 채운
 * 것이라, "승민님이 강원도를 채웠어요"는 이 앱이 할 말이 아니다. 그래서 콕
 * 찌르기·소원권과 달리 보낸 사람 이름이 문구에 없다.
 */
export function buildBadgeNotification(
  regionName: string,
  tier: EarnedTier,
): BadgeNotification {
  return {
    title:
      tier === 'photo'
        ? `${regionName}을 우리 사진으로 다 채웠어요`
        : `우리가 ${regionName}을 다 다녀왔어요`,
    body:
      tier === 'photo'
        ? '뱃지가 사진으로 바뀌었어요. 홈에서 확인해보세요.'
        : '지역 뱃지를 하나 얻었어요. 홈에서 확인해보세요.',
    // 지역·등급마다 tag가 달라야 서로를 덮지 않는다. 여행 다녀와서 한꺼번에
    // 칠하면 뱃지가 여러 개 나올 수 있는데, 그때 알림함에 하나만 남으면 안 된다.
    tag: `ourie-badge-${regionName}-${tier}`,
    renotify: true,
  }
}
