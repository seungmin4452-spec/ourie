/**
 * 주어진 시간 안에 안 끝나면 대신 실패시킨다.
 *
 * useGenerateAiAvatar.ts의 Puter 호출은 AbortController를 안 물려서(끊어도
 * 되는 요청이 아니라 — 성공 직전에 끊으면 크레딧만 날리고 결과는 못 받는
 * 셈이라, 실제로 겪은 뒤로는 어설프게 끊느니 넉넉히 기다리는 쪽을 택했다),
 * 이건 진짜 네트워크 요청을 끊는 게 아니라 **화면만이라도 무한정 기다리지
 * 않게** 만드는 최후의 안전장치다. 원래 요청은 배경에서 계속 돌다 조용히
 * 버려질 수 있지만, 그래도 사용자가 스피너를 영영 보는 것보다는 낫다.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}
