/**
 * 주어진 시간 안에 안 끝나면 대신 실패시킨다.
 *
 * `puter.ai.txt2img`에는 취소할 방법이 없다 — SDK가 AbortSignal을 받지
 * 않는다(node_modules/@heyputer/puter.js/src/modules/AI.js 참고). 그래서
 * 이건 진짜 네트워크 요청을 끊는 게 아니라 **화면만이라도 무한정 기다리지
 * 않게** 만드는 안전장치다. 원래 요청은 배경에서 계속 돌다 조용히 버려질 수
 * 있지만, 그래도 사용자가 스피너를 영영 보는 것보다는 낫다 — 실제로 2분 넘게
 * 도는 채로 멈춘 사례가 있었다(공용 Puter 계정이 다른 사용자 트래픽에 밀려
 * 응답이 없던 것으로 보인다).
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
