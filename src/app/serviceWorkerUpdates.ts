// 새 배포가 실행 중인 앱에 반영되게 만드는 나머지 절반.
//
// src/sw.ts의 skipWaiting()/clients.claim()이 새 서비스워커를 곧바로 담당자로
// 세우지만, 그것만으로는 이미 그려진 화면이 갱신되지 않는다. 화면은 여전히
// 구버전 JS로 돌아가면서 앞으로의 요청만 새 서비스워커가 받게 되어, 둘이 섞인
// 상태가 된다. 담당자가 바뀌는 순간을 잡아 한 번 새로고침해서 그 상태를 없앤다.
//
// 등록 자체는 vite-plugin-pwa가 index.html에 넣어주는 registerSW.js가 한다
// (injectRegister 기본값). 여기서는 교체 시점만 지켜본다.

export function watchForServiceWorkerUpdate(): void {
  if (!('serviceWorker' in navigator)) return

  // 이 페이지가 서비스워커의 통제 아래 열렸는지. 앱을 처음 설치할 때는
  // controller가 없다가 생기면서 controllerchange가 한 번 발생하는데, 그건
  // 업데이트가 아니라 최초 등록이라 새로고침할 이유가 없다 -- 오히려 첫 실행이
  // 이유 없이 한 번 깜빡이게 된다.
  if (navigator.serviceWorker.controller == null) return

  let isReloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // controllerchange는 한 번만 오지만, 새로고침이 시작된 뒤에 또 들어와도
    // 재진입하지 않게 막아둔다. 이게 풀리면 새로고침 무한 루프가 된다.
    if (isReloading) return
    isReloading = true
    window.location.reload()
  })
}
