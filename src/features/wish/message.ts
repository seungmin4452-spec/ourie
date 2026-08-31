// 소원권 알림 문구.
//
// 이 파일은 브라우저와 서버(api/wish.ts) 양쪽에서 쓴다. 그래서 순수 함수와
// 상수만 두고, DOM·Supabase·환경변수처럼 한쪽에만 있는 것에는 손대지 않는다
// (poke/message.ts와 같은 규칙이다).
//
// import를 하나도 하지 않는 건 우연이 아니다. 서버 쪽에서 상대 경로 import에
// `.js` 확장자를 붙여야 하는 제약(api/poke.ts 주석 참고)을 애초에 만들지
// 않으려는 것이다.

export interface WishNotification {
  title: string
  body: string
  tag: string
  renotify: true
}

/**
 * 사람을 부르는 말. 넘기는 값은 반드시 `profiles.name`이어야 한다 —
 * `profiles.app_name`은 앱 이름이라 넣으면 "승민 ♥ 진선님이 소원권을 썼어요"가
 * 된다.
 *
 * poke/message.ts의 `pokeNameLabel`과 같은 일을 한다. 불러다 쓰지 않고 세 줄을
 * 다시 적은 이유는 이 파일이 아무것도 import하지 않는다는 규칙(위 주석)을
 * 지키기 위해서다 — 콕 찌르기 문구가 바뀌어도 소원권 문구는 흔들리지 않는다.
 */
export function wishNameLabel(personName: string | null | undefined): string {
  const trimmed = personName?.trim()
  return trimmed ? `${trimmed}님` : '상대방'
}

/**
 * 소원권을 썼을 때 상대방 기기에 뜰 알림.
 *
 * 본문에 소원 내용을 그대로 싣는다. 잠금화면에서 "소원권을 썼어요"만 보면
 * 무엇을 부탁했는지 알려고 앱을 열어야 하는데, 이 알림의 목적은 부탁이
 * 닿는 것이지 앱을 열게 하는 것이 아니다.
 *
 * `content`는 반드시 **DB에서 읽은 값**이어야 한다. 보내는 쪽 화면이 넘긴
 * 값을 그대로 쓰면 상대방 잠금화면에 아무 말이나 띄울 수 있다 (그래서
 * api/wish.ts는 wish id만 받아 자기가 조회한다).
 */
export function buildWishNotification(
  wishId: string,
  /** 소원권을 쓴 사람의 `profiles.name`. `app_name`이 아니다 — 위 주석 참고. */
  senderName: string | null | undefined,
  content: string,
): WishNotification {
  return {
    title: `${wishNameLabel(senderName)}이 소원권을 썼어요`,
    body: `"${content}" — 꼭 이뤄주세요!`,
    // 소원마다 tag가 달라야 서로를 덮지 않는다. 어제 빈 소원이 오늘 빈
    // 소원에 지워지면, 알림함만 보고 있던 사람은 하나를 통째로 놓친다.
    tag: `ourie-wish-${wishId}`,
    renotify: true,
  }
}

/**
 * 소원권 추가 요청이 왔을 때 상대방(=승인해야 하는 사람) 기기에 뜰 알림.
 *
 * 늘어날 사람이 요청한 사람 자신인지 아닌지에 따라 문구가 갈린다 — 전자는
 * "나 좀 늘려줘"고 후자는 "너 늘려줄게"라, 같은 문장으로 뭉치면 누가 늘고
 * 누가 부탁하는 건지 알림만 보고는 알 수 없다.
 */
export function buildWishQuotaRequestNotification(
  requestId: string,
  /** 요청을 만든 사람의 `profiles.name`. `app_name`이 아니다. */
  requesterName: string | null | undefined,
  /** target_owner_id === requested_by — 요청한 사람 자신의 소원권이 느는가. */
  isForRequesterThemself: boolean,
): WishNotification {
  const name = wishNameLabel(requesterName)
  const body = isForRequesterThemself
    ? `${name}이 자신의 소원권을 1장 늘려달라고 요청했어요. 앱에서 승인하거나 거절할 수 있어요.`
    : `${name}이 내 소원권을 1장 늘려주겠다고 요청했어요. 앱에서 승인하거나 거절할 수 있어요.`

  return {
    title: `${name}이 소원권 추가를 요청했어요`,
    body,
    // 요청마다 tag가 달라야 서로를 덮지 않는다 (buildWishNotification과 같은 이유).
    tag: `ourie-wish-quota-request-${requestId}`,
    renotify: true,
  }
}
