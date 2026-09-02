/**
 * Puter로 나가는 실제 네트워크 요청 하나를 관찰한다.
 *
 * Puter가 크레딧을 이미 쓰고 있는데 화면은 계속 "생성 중"이라, 짐작이 아니라
 * 실제로 요청이 나갔는지/응답이 왔는지/어디서 끊겼는지를 봐야 했다.
 * `puter.ai.txt2img`가 내부에서 만드는 XHR은 우리가 직접 손댈 수 없어서
 * (node_modules/@heyputer/puter.js/src/lib/utils.js의 driverCall_), 대신
 * `XMLHttpRequest.prototype`을 잠깐 감싸서 Puter API로 나가는 요청만 골라
 * open/send/progress/load/error/timeout 이벤트에 시각을 찍는다.
 *
 * 이 관찰은 우리 앱 코드가 하는 일반적인 계측이라 Puter의 SDK나 서버를
 * 건드리지 않는다 — 브라우저가 원래 보내는 이벤트를 옆에서 읽기만 한다.
 */

export interface XhrTraceEvent {
  /** 관찰을 시작한 시점부터 몇 ms 지나서 일어났는지. */
  atMs: number
  label: string
}

export interface XhrTrace {
  events: XhrTraceEvent[]
  /** 원래 XMLHttpRequest 동작으로 되돌린다 — 반드시 finally에서 불러야 한다. */
  stop: () => void
}

function describeBody(body: unknown): string {
  if (body == null) return '(no body)'
  if (typeof body === 'string') return `${body.length} chars`
  if (body instanceof Blob) return `${body.size} bytes`
  return '(body)'
}

function describeResponse(response: unknown): string {
  if (response == null) return '(no response)'
  if (response instanceof Blob) return `blob ${response.size} bytes`
  if (typeof response === 'string') return `text ${response.length} chars`
  return '(response)'
}

/**
 * urlSubstring이 포함된 URL로 나가는 XHR만 골라 관찰을 시작한다.
 * 관찰이 끝나면 반드시 `stop()`을 불러 원상복구해야 한다 — 안 그러면 이
 * 감시가 페이지에 남아 있는 다른 모든 XHR(Supabase 요청 포함)에도 계속
 * 붙는다.
 */
export function traceXhrTo(urlSubstring: string): XhrTrace {
  const events: XhrTraceEvent[] = []
  const startedAt = Date.now()

  function log(label: string) {
    events.push({ atMs: Date.now() - startedAt, label })
  }

  const proto = XMLHttpRequest.prototype
  const originalOpen = proto.open
  const originalSend = proto.send

  // any를 쓰는 이유: 관찰 대상 표시(__traced)는 XMLHttpRequest 표준 타입에
  // 없는 우리만의 임시 마킹이라, 엄격한 타입으로는 표현할 방법이 없다.
  proto.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    const urlStr = typeof url === 'string' ? url : url.toString()
    const traced = urlStr.includes(urlSubstring)
    ;(this as unknown as { __traced?: boolean }).__traced = traced
    if (traced) log(`open ${method} ${urlStr}`)
    return (originalOpen as (...a: unknown[]) => void).apply(this, [method, url, ...rest])
  }

  proto.send = function (this: XMLHttpRequest, body?: unknown) {
    const self = this as unknown as { __traced?: boolean }
    if (self.__traced) {
      log(`send (${describeBody(body)})`)
      this.addEventListener('loadstart', () => log('loadstart (요청이 실제로 나갔다)'))
      this.addEventListener('progress', (e) => log(`progress ${e.loaded}/${e.total || '?'} bytes`))
      this.addEventListener('load', () =>
        log(`load — status ${this.status}, ${describeResponse(this.response)}`),
      )
      this.addEventListener('error', () => log('error (네트워크 자체가 끊겼다)'))
      this.addEventListener('timeout', () => log('timeout (브라우저/네트워크 자체 타임아웃)'))
      this.addEventListener('abort', () => log('abort'))
    }
    return (originalSend as (b?: unknown) => void).call(this, body)
  }

  return {
    events,
    stop: () => {
      proto.open = originalOpen
      proto.send = originalSend
    },
  }
}

/** 관찰 결과를 화면에 그대로 보여줄 수 있는 줄들로. */
export function formatXhrTrace(trace: XhrTrace): string[] {
  if (trace.events.length === 0) return ['(Puter로 나간 요청이 감지되지 않았어요)']
  return trace.events.map((event) => `${event.atMs}ms: ${event.label}`)
}
