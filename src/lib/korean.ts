const HANGUL_FIRST = 0xac00
const HANGUL_LAST = 0xd7a3
/** 한글 한 글자는 초성 19 × 중성 21 × 종성 28 로 배열돼 있다. */
const JONGSEONG_COUNT = 28

/**
 * 목적격 조사. 앞말의 받침에 따라 "을"과 "를"이 갈린다.
 *
 * 문구를 `${name}을`로 박아두면 "제주을"이, `${name}를`로 박아두면 "강원를"이
 * 나온다. 지역 이름처럼 값이 데이터에서 오는 자리에는 이 함수를 쓴다.
 *
 * 한글이 아닌 글자로 끝나면 "를"로 떨어진다. 숫자·영문의 실제 규칙은 읽는 법에
 * 달려 있어서(3은 "삼을", 5는 "오를") 한 가지로 정할 수 없는데, 지금 이 함수를
 * 쓰는 자리에는 한글 지역 이름만 들어온다.
 */
export function objectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1)
  if (Number.isNaN(code) || code < HANGUL_FIRST || code > HANGUL_LAST) return '를'
  return (code - HANGUL_FIRST) % JONGSEONG_COUNT === 0 ? '를' : '을'
}
