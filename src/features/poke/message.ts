// 콕 찌르기의 종류와 알림 문구.
//
// 이 파일은 브라우저와 서버(api/poke.ts) 양쪽에서 쓴다. 그래서 순수 함수와
// 상수만 두고, DOM·Supabase·환경변수처럼 한쪽에만 있는 것에는 손대지 않는다
// (notification/message.ts와 같은 규칙이다). 아이콘처럼 JSX가 필요한 것은
// 브라우저 전용인 catalog.tsx가 따로 들고 있다.
//
// 이 파일이 import를 하나도 하지 않는 건 우연이 아니다. 서버 쪽에서 상대 경로
// import에 `.js` 확장자를 붙여야 하는 제약(api/notify-dday.ts 주석 참고)을
// 애초에 만들지 않으려는 것이다. 여기에 새 import를 더할 일이 생기면 그때
// 확장자를 챙겨야 한다.

/**
 * 기본으로 주는 세 가지. 이 문자열은 DB의 pokes.kind check 제약과 같아야 한다
 * (supabase/schema.sql). 한쪽만 늘리면 발송이 invalid_kind로 막힌다.
 *
 * 커플이 직접 만든 버튼은 여기 없다 — 그건 poke_presets 테이블에 있고
 * kind는 'custom' 하나로 기록된다. 문구도 이 파일이 아니라 DB에서 온다
 * (아래 buildCustomPokeNotification 참고).
 *
 * 배열 순서가 화면에 버튼이 놓이는 순서다.
 */
export const POKE_KINDS = ['miss', 'kakao', 'call'] as const

export type PokeKind = (typeof POKE_KINDS)[number]

export function isPokeKind(value: unknown): value is PokeKind {
  return typeof value === 'string' && (POKE_KINDS as readonly string[]).includes(value)
}

/** 버튼에 적히는 말. 보내는 사람이 고르는 문장이라 반말이다. */
export const POKE_LABELS: Record<PokeKind, string> = {
  miss: '보고싶어',
  kakao: '카톡 확인해줘',
  call: '전화해줘',
}

export interface PokeNotification {
  title: string
  body: string
  /**
   * 알림을 묶는 이름. 종류별로 다르게 두는 이유는 두 가지다. 디데이 알림
   * (`ourie-dday`)을 덮지 않게 하려는 것이 하나이고, 같은 말을 여러 번 보냈을 때
   * 알림함에 똑같은 줄이 쌓이는 대신 마지막 하나로 덮이게 하려는 것이 다른
   * 하나다. 종류가 다르면 따로 뜬다 — "보고싶어"가 "전화해줘"를 지우면 안 된다.
   */
  tag: string
  /**
   * 같은 tag로 덮어쓸 때도 소리·진동을 다시 내라는 뜻. 이게 없으면 두 번째
   * "보고싶어"는 조용히 교체만 되어 상대가 눈치채지 못한다. iOS는 이 값을
   * 무시하지만 안드로이드·데스크톱에서는 효과가 있다.
   */
  renotify: true
}

/**
 * 사람을 부르는 말. 넘기는 값은 반드시 `profiles.name`이어야 한다 —
 * `profiles.app_name`은 앱 이름이라 넣으면 "승민 ♥ 진선님이 보고 싶대요"가
 * 된다 (실제로 그렇게 나갔다).
 *
 * name이 생기기 전에 가입한 계정은 이 값이 비어 있다. 그때는 이름 없이
 * 자연스럽게 읽히는 쪽으로 떨어진다 — "상대방님이"가 되지 않게 "님"까지 이
 * 함수가 붙인다.
 *
 * 알림 문구(보낸 사람)와 화면 안내(상대방) 양쪽에서 쓴다.
 */
export function pokeNameLabel(personName: string | null | undefined): string {
  const trimmed = personName?.trim()
  return trimmed ? `${trimmed}님` : '상대방'
}

const BODIES: Record<PokeKind, string> = {
  miss: '지금 당신 생각을 하고 있대요.',
  kakao: '메시지를 보내두고 기다리고 있어요.',
  call: '목소리가 듣고 싶대요.',
}

const TITLES: Record<PokeKind, (who: string) => string> = {
  miss: (who) => `${who}이 보고 싶대요`,
  kakao: (who) => `${who}이 카톡을 기다려요`,
  call: (who) => `${who}이 전화를 기다려요`,
}

/**
 * 상대방 기기에 뜰 알림.
 *
 * 문구를 무작위로 고르지 않는다. 보내는 쪽 버튼에 "이렇게 갑니다"를 그대로
 * 보여줄 수 있어야 하고, 무엇이 갈지 알고 누르는 것이 이 기능의 전부이기
 * 때문이다.
 */
export function buildPokeNotification(
  kind: PokeKind,
  /** 보낸 사람의 `profiles.name`. `app_name`이 아니다 — 위 주석 참고. */
  senderName: string | null | undefined,
): PokeNotification {
  return {
    title: TITLES[kind](pokeNameLabel(senderName)),
    body: BODIES[kind],
    tag: `ourie-poke-${kind}`,
    renotify: true,
  }
}

/** 커플이 만든 버튼에 적을 수 있는 길이. DB의 check 제약과 같아야 한다. */
export const POKE_PRESET_LIMITS = { label: 20, body: 80 } as const

/**
 * 한 커플이 만들 수 있는 버튼 수. DB가 아니라 화면에서만 막는다 — 위젯에
 * 버튼이 끝없이 쌓이는 걸 막는 게 목적이고, 넘겨도 데이터가 깨지지는 않는다.
 */
export const POKE_PRESET_MAX = 12

/**
 * 커플이 직접 만든 버튼으로 나가는 알림.
 *
 * 제목에 보낸 사람을 앞세우는 이유는 기본 세 개("승민님이 보고 싶대요")와 같다 —
 * 잠금화면에서 제목 한 줄만 보고도 누가 불렀는지 알아야 한다. 사용자가 적은
 * 말은 그 뒤에 그대로 붙는다.
 *
 * label과 body는 반드시 **DB에서 읽은 값**이어야 한다. 보내는 쪽 화면이 넘긴
 * 값을 그대로 쓰면 상대방 잠금화면에 아무 말이나 띄울 수 있다 (그래서
 * api/poke.ts는 send_poke가 돌려준 값만 여기에 넘긴다).
 */
export function buildCustomPokeNotification(
  presetId: string,
  label: string,
  body: string,
  senderName: string | null | undefined,
): PokeNotification {
  return {
    title: `${pokeNameLabel(senderName)}: ${label}`,
    body,
    // 버튼마다 tag가 달라야 서로를 덮지 않는다. "밥 먹자"가 "잘 자"를 지우면
    // 안 되는 건 "보고싶어"가 "전화해줘"를 지우면 안 되는 것과 같은 이유다.
    tag: `ourie-poke-custom-${presetId}`,
    renotify: true,
  }
}
