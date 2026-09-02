import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { downscaleImage } from '@/lib/image'
import { saveAiAvatarGeneration } from '../api/aiAvatar'
import type { AiAvatarTheme } from '../themes'
import { withTimeout } from '../withTimeout'
import { formatXhrTrace, traceXhrTo, type XhrTrace } from '../xhrTrace'
import { usePuterToken } from './usePuterToken'

/**
 * 이미지 생성 요청이 실제로 나가는 엔드포인트만 잡는다.
 * (node_modules/@heyputer/puter.js/src/lib/utils.js의 driverCall_이
 * `initXhr('/drivers/call', ...)`로 만든다.)
 *
 * 처음엔 `api.puter.com` 전체로 잡았다가 실제 기록을 보니 SDK가 백그라운드로
 * 계속 돌리는 socket.io 실시간 연결(끊임없이 재연결·400 에러를 내며 도는
 * 것으로 보인다 — 아마 filesystem/실시간 기능용)까지 다 섞여 들어와서, 정작
 * 봐야 할 이미지 생성 요청 한 줄이 소음에 묻혔다. 경로까지 좁혀서 그 소음을
 * 걷어낸다.
 */
const PUTER_API_HOST = '/drivers/call'

/** Puter에 보낼 사진의 긴 변 최대 길이. 원본을 그대로 보내면 요청이 무거워지고
 * 응답도 느려진다 — 스타일 변환은 이 정도 해상도로도 충분하다. */
const MAX_SOURCE_SIDE = 1024

/**
 * 생성 호출 하나를 기다리는 진짜 최후의 상한.
 *
 * 처음엔 90초로 짧게 잡았다가 실제 운영에서 문제를 봤다 — 화면은 90초 만에
 * 실패로 끝났는데 Puter 사용량(크레딧)은 계속 늘어났다. 즉 요청은 그 뒤로도
 * 계속 진행돼 결국 성공했다는 뜻이고, 우리가 먼저 포기해버려서 **크레딧만
 * 쓰고 결과물은 못 받은** 셈이었다 — 공용 무료 계정이라 다른 사용자 트래픽에
 * 밀리면 몇 분씩 걸리는 게 이 백엔드에선 예외가 아니라 정상 범위다.
 *
 * 그래서 여기서는 값을 훨씬 넉넉히 잡아 "진짜 죽은 요청"만 걸러내는
 * 최후의 안전장치로만 쓰고, "오래 걸린다"는 안내는 대신 화면 쪽에서
 * 요청을 그대로 살려둔 채 메시지만 바꿔서 보여준다(AiAvatarDialog.tsx의
 * SLOW_NOTICE_MS 참고) — 그래야 느리게라도 성공한 요청의 결과를 버리지 않는다.
 */
const GENERATION_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Puter가 부르는 이름은 "나노바나나"지만, 클라이언트 SDK(@heyputer/puter.js
 * 1.0.1)의 모델→드라이버 라우팅이 아직 이 문자열 하나만 안다
 * (node_modules/@heyputer/puter.js/src/modules/AI.js의 txt2img 참고 —
 * "gemini-3-pro-image-preview"(나노바나나 프로)나 "gemini-3.1-flash-image-
 * preview"(나노바나나 2)를 넘기면 라우팅 조건에 안 걸려 엉뚱한 드라이버로
 * 빠진다). 실제 Puter 웹앱(AI Image Project)에서는 최신 모델도 고를 수
 * 있었지만, 그건 이 npm 패키지를 거치지 않는 별도 경로다. SDK가 업데이트되면
 * 이 값도 최신 모델로 올린다.
 */
const MODEL = 'gemini-2.5-flash-image-preview'

/**
 * 출력 이미지 크기. 실제 운영에서 확인된 문제 하나 — Puter의 이미지 생성
 * SDK는 완성된 이미지 전체를 한 번의 XHR 응답(`responseType: 'blob'`)으로
 * 받는 방식이라(node_modules/@heyputer/puter.js/src/lib/utils.js의
 * driverCall_), 기본 해상도로 받으면 완성된 뒤에도 그 큰 파일 전체가 폰
 * 연결로 끝까지 내려와야 한다. 모바일 데이터가 불안정하면 이 마지막 다운로드
 * 구간에서 에러 없이 그냥 멈춰버리는 것으로 보인다(Puter 사용량 대시보드엔
 * output:image 크레딧이 이미 찍혀 있었다 — 서버는 다 만들어서 과금했는데
 * 응답이 못 왔다는 뜻). 갤러리 썸네일(64px)과 위젯 미리보기 정도에는 굳이
 * 큰 해상도가 필요 없으니, 작게 요청해서 생성 시간과 다운로드 용량을 함께
 * 줄인다.
 */
const OUTPUT_RATIO = { w: 768, h: 768 }

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // "data:image/jpeg;base64,xxxx"에서 콤마 뒤만 남긴다.
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error('이미지를 읽지 못했어요.'))
    reader.readAsDataURL(blob)
  })
}

interface GenerateArgs {
  coupleId: string
  userId: string
  theme: AiAvatarTheme
  file: File
}

/**
 * 생성 한 번이 실제로 어느 단계에 있는지. 폰으로 쓰는 사람은 콘솔을 열어볼
 * 수 없으니, 이 값을 화면(AiAvatarDialog.tsx)에 그대로 보여줘서 "느린 건지
 * 멈춘 건지, 멈췄다면 어디서 멈췄는지"를 눈으로 볼 수 있게 한다.
 */
export type AiAvatarStage = 'resizing' | 'connecting' | 'generating' | 'uploading'

const STAGE_LABEL: Record<AiAvatarStage, string> = {
  resizing: '사진 준비하는 중',
  connecting: 'Puter에 연결하는 중',
  generating: '이미지 생성 요청 중',
  uploading: '결과 저장하는 중',
}

export function aiAvatarStageLabel(stage: AiAvatarStage): string {
  return STAGE_LABEL[stage]
}

/**
 * 실패 시 "어디서 막혔는지"를 사람이 읽을 수 있는 네트워크 기록과 함께
 * 던지는 에러. xhrTrace.ts가 관찰한 open/send/progress/load/error 이벤트를
 * 그대로 들고 있어서, 화면(AiAvatarDialog.tsx)이 이걸 그대로 보여주면
 * 콘솔 없이도 "요청이 나갔는지, 응답이 왔는지, 몇 바이트나 받았는지"를 볼 수
 * 있다.
 */
export class AiAvatarGenerationError extends Error {
  readonly traceLines: string[]

  constructor(message: string, traceLines: string[]) {
    super(message)
    this.name = 'AiAvatarGenerationError'
    this.traceLines = traceLines
  }
}

/** 콘솔에서 이 위젯만 걸러 보고 싶을 때 쓰는 접두사(claude-in-chrome 등으로
 * 확인할 때 pattern: "\\[ai-avatar\\]"로 필터링하면 된다). */
function logStage(stage: AiAvatarStage) {
  console.log(`[ai-avatar] ${stage} (${STAGE_LABEL[stage]})`)
}

/**
 * 사진 한 장 + 주제 하나로 아바타를 만든다.
 *
 * 이 기능은 이 프로젝트에서 유일하게 **서버를 거치지 않는** 외부 호출이다.
 * 원래는 다른 위젯들처럼 api/ 함수에서 서비스 쪽 자격으로 Puter를 부르려
 * 했지만, Node 런타임에서는 Puter의 이미지 생성 함수가 브라우저 전용 타입
 * (`new Image()`)을 만들려다 죽는 미해결 버그가 있다(HeyPuter/puter#1900,
 * node_modules/@heyputer/puter.js/src/modules/AI.js의 txt2img가 정확히
 * 그렇게 짜여 있다). 그래서 여기서만 브라우저가 직접 부른다.
 *
 * 로그인 팝업이 뜨지 않는 이유: `puter.setAuthToken(token)`을 먼저 호출해두면
 * SDK의 401 처리 로직(node_modules/@heyputer/puter.js/src/lib/utils.js의
 * `if(!puter.authToken && puter.env === 'web')`)이 애초에 걸리지 않는다.
 * 토큰이 만료되거나 잘못됐을 때만 예외적으로 SDK가 자체 로그인 팝업을 띄운다
 * — 흔한 경우는 아니지만, 그럴 땐 공용 계정 토큰을 다시 발급받아야 한다는
 * 신호로 봐도 된다.
 */
export function useGenerateAiAvatar() {
  const { data: puterToken } = usePuterToken()
  const [stage, setStage] = useState<AiAvatarStage | null>(null)
  const traceRef = useRef<XhrTrace | null>(null)

  // 어느 단계에서 실패했는지 에러 메시지에 그대로 남긴다 — 실패 시점의
  // stage 값은 mutationFn이 던질 때 이미 최신이라 그걸 그대로 읽으면 된다.
  function goTo(next: AiAvatarStage) {
    setStage(next)
    logStage(next)
  }

  /** 화면이 1초마다 이걸 불러 지금까지의 네트워크 기록을 그려준다(진행 중에도,
   * 실패한 뒤에도 같은 함수로 읽는다). */
  function getTraceLines(): string[] {
    return traceRef.current ? formatXhrTrace(traceRef.current) : []
  }

  const mutation = useMutation({
    mutationFn: async ({ coupleId, userId, theme, file }: GenerateArgs) => {
      if (!puterToken) {
        throw new Error('Puter 인증을 아직 받지 못했어요. 잠시 후 다시 시도해주세요.')
      }

      goTo('resizing')
      const resized = await downscaleImage(file, MAX_SOURCE_SIDE)
      const base64 = await blobToBase64(resized)

      goTo('connecting')
      // 모듈 최상단에서 import하면 이 위젯을 한 번도 안 쓴 사람도 그 초기화
      // 코드(전역 메시지 리스너 등록 등)를 매번 받는다. 실제로 쓸 때만 받는다.
      const { default: puter } = await import('@heyputer/puter.js')
      puter.setAuthToken(puterToken)

      goTo('generating')
      const generatedAt = Date.now()
      const trace = traceXhrTo(PUTER_API_HOST)
      traceRef.current = trace
      try {
        const result = await withTimeout(
          puter.ai.txt2img(theme.prompt, {
            model: MODEL,
            input_image: base64,
            input_image_mime_type: 'image/jpeg',
            ratio: OUTPUT_RATIO,
          }),
          GENERATION_TIMEOUT_MS,
          '이미지 생성이 너무 오래 걸려요. 잠시 후 다시 시도해주세요.',
        )
        console.log(`[ai-avatar] generating done in ${Date.now() - generatedAt}ms`)

        goTo('uploading')
        // txt2img는 브라우저에서 <img> 엘리먼트를 돌려준다(src가 blob: URL).
        // Storage에 올리려면 실제 바이트가 필요해서 그 src를 다시 fetch한다.
        const response = await fetch(result.src)
        const imageBlob = await response.blob()

        const saved = await saveAiAvatarGeneration(coupleId, userId, theme.id, imageBlob)
        setStage(null)
        return saved
      } catch (error) {
        const traceLines = formatXhrTrace(trace)
        console.log('[ai-avatar] xhr trace:\n' + traceLines.join('\n'))
        throw new AiAvatarGenerationError(
          error instanceof Error ? error.message : '아바타를 만들지 못했어요.',
          traceLines,
        )
      } finally {
        trace.stop()
      }
    },
  })

  return { ...mutation, stage, getTraceLines }
}
