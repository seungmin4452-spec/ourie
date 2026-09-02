import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { downscaleImage } from '@/lib/image'
import { saveAiAvatarGeneration } from '../api/aiAvatar'
import type { AiAvatarTheme } from '../themes'
import { withTimeout } from '../withTimeout'
import { usePuterToken } from './usePuterToken'

/**
 * Puter의 드라이버 호출 엔드포인트. `@heyputer/puter.js`(1.0.1)의
 * `puter.ai.txt2img`가 내부적으로 이 주소를 그대로 부른다
 * (node_modules/@heyputer/puter.js/src/lib/utils.js의 driverCall_).
 *
 * **SDK를 거치지 않고 이 엔드포인트를 직접 부르는 이유** — 실제 운영에서
 * "요청 기록"(당시엔 XHR 이벤트를 가로채는 방식으로 관찰했다)으로 확인한
 * 것: 이미지 생성 HTTP 요청 자체는 12초 만에 status 200과 완성된 이미지를
 * 정상적으로 받았는데, 그 이후 SDK 내부에서 결과를 처리하는 단계가 계속
 * 멈춰 있었다(수 분간 다음 단계로 못 넘어감). 원인을 소스까지 따라가보니,
 * `import puter from '@heyputer/puter.js'` 한 줄만으로 우리가 전혀 쓰지
 * 않는 실시간 파일시스템 동기화 기능(FSRelayService)까지 자동으로
 * 초기화되고, 이게 socket.io 연결을 끝없이 재시도하며 계속 400 에러를
 * 냈다 — 이 배경 소음이 브라우저를 바쁘게 만들어 정작 이미지 처리 콜백이
 * 실행될 차례를 못 얻는 것으로 보인다. SDK를 아예 import하지 않으면 이
 * 문제의 기능도 초기화되지 않는다.
 */
const PUTER_DRIVER_ENDPOINT = 'https://api.puter.com/drivers/call'

/**
 * Puter가 부르는 이름은 "나노바나나"지만, 라우팅은 우리가 직접 짠다 — 위
 * 이유로 SDK의 모델→드라이버 매핑(node_modules/@heyputer/puter.js/src/
 * modules/AI.js의 txt2img)도 더는 거치지 않기 때문이다. 그 매핑을 그대로
 * 옮기면: model이 "gemini-2.5-flash-image-preview"일 때만 driver가
 * "gemini-image-generation"이고, 그 외(나노바나나 프로/2 포함)엔 매핑이
 * 없어 엉뚱한 driver("openai-image-generation")로 빠진다. 그래서 이 모델
 * 문자열과 DRIVER_NAME은 항상 짝을 맞춰야 한다.
 */
const MODEL = 'gemini-2.5-flash-image-preview'
const DRIVER_INTERFACE = 'puter-image-generation'
const DRIVER_NAME = 'gemini-image-generation'
const DRIVER_METHOD = 'generate'

/** Puter에 보낼 사진의 긴 변 최대 길이. 원본을 그대로 보내면 요청이 무거워지고
 * 응답도 느려진다 — 스타일 변환은 이 정도 해상도로도 충분하다. */
const MAX_SOURCE_SIDE = 1024

/** 출력 이미지 크기. 갤러리 썸네일(64px)과 위젯 미리보기 정도에는 큰 해상도가
 * 필요 없으니, 작게 요청해서 생성 시간과 응답 크기를 함께 줄인다. */
const OUTPUT_RATIO = { w: 768, h: 768 }

/**
 * 생성 호출 하나를 기다리는 진짜 최후의 상한.
 *
 * 처음엔 90초로 짧게 잡았다가 실제 운영에서 문제를 봤다 — 화면은 90초 만에
 * 실패로 끝났는데 Puter 사용량(크레딧)은 계속 늘어났다. 즉 요청은 그 뒤로도
 * 계속 진행돼 결국 성공했다는 뜻이고, 우리가 먼저 포기해버려서 크레딧만
 * 쓰고 결과물은 못 받은 셈이었다. 지금은 SDK를 거치지 않으니 그 특정 원인은
 * 없어졌지만, 공용 무료 계정이 유독 밀리는 날을 대비해 최후의 안전장치는
 * 넉넉히 남겨둔다.
 */
const GENERATION_TIMEOUT_MS = 5 * 60 * 1000

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
export type AiAvatarStage = 'resizing' | 'generating' | 'uploading'

const STAGE_LABEL: Record<AiAvatarStage, string> = {
  resizing: '사진 준비하는 중',
  generating: '이미지 생성 요청 중',
  uploading: '결과 저장하는 중',
}

export function aiAvatarStageLabel(stage: AiAvatarStage): string {
  return STAGE_LABEL[stage]
}

function logStage(stage: AiAvatarStage) {
  console.log(`[ai-avatar] ${stage} (${STAGE_LABEL[stage]})`)
}

interface PuterDriverBody {
  success?: boolean
  /** 성공이면 이 자리에 이미지가 온다 — "data:image/png;base64,..." 형태의
   * data URI 문자열로 온다는 걸 실제 응답을 보고 나서야 알았다(원래
   * parseResponse의 content-type 분기만 보고 raw 바이너리를 예상했었다). */
  result?: unknown
  error?: { code?: string; message?: string } | string
}

/** "data:image/png;base64,...." 형태의 data URI를 실제 Blob으로 되돌린다. */
function dataUriToBlob(dataUri: string): Blob {
  const commaIndex = dataUri.indexOf(',')
  const header = dataUri.slice(0, commaIndex)
  const base64 = dataUri.slice(commaIndex + 1)
  const mimeMatch = /^data:([^;]+);base64$/.exec(header)
  const mime = mimeMatch?.[1] ?? 'image/png'

  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/**
 * `/drivers/call`을 직접 두드려 이미지를 만든다.
 *
 * Puter의 driverCall_이 하던 것과 같은 모양의 요청이다 — 인증은 헤더가
 * 아니라 **본문의 `auth_token` 필드**로 보낸다(SDK도 그렇게 한다).
 *
 * **응답은 항상 JSON이다.** 처음엔 "JSON이면 에러, 이미지 content-type이면
 * 성공"이라고 짰었는데 틀렸다 — 실제로는 성공해도 `{"success":true,"result":
 * "data:image/png;base64,..."}`처럼 **JSON 안에 이미지가 data URI로
 * 들어있다.** `success` 값으로만 갈라야 한다.
 */
async function callPuterImageGeneration(
  token: string,
  args: Record<string, unknown>,
): Promise<Blob> {
  const response = await fetch(PUTER_DRIVER_ENDPOINT, {
    method: 'POST',
    // SDK와 같은 값이다 — 'application/json'을 쓰면 브라우저가 먼저 OPTIONS
    // preflight를 보내는데, Puter의 CORS 설정이 그걸 허용하는지 알 수
    // 없으니 SDK가 검증해온 그대로 맞춘다.
    headers: { 'Content-Type': 'text/plain;actually=json' },
    body: JSON.stringify({
      interface: DRIVER_INTERFACE,
      driver: DRIVER_NAME,
      method: DRIVER_METHOD,
      test_mode: false,
      args,
      auth_token: token,
    }),
  })

  const text = await response.text()
  let body: PuterDriverBody | null = null
  try {
    body = JSON.parse(text) as PuterDriverBody
  } catch {
    // JSON이 아니었다 — 아래에서 원본 텍스트를 그대로 보여준다.
  }

  if (body?.success === true && typeof body.result === 'string' && body.result.startsWith('data:')) {
    return dataUriToBlob(body.result)
  }

  if (!response.ok || body?.success === false) {
    const message = typeof body?.error === 'string' ? body.error : body?.error?.message
    throw new Error(
      message ?? `Puter가 오류를 돌려줬어요 (status ${response.status}): ${text.slice(0, 300) || '(빈 응답)'}`,
    )
  }

  // success도 error도 아닌, 예상 못한 모양 — 짐작으로 넘어가지 않고 원본을
  // 그대로 보여준다.
  throw new Error(`Puter 응답을 이해하지 못했어요: ${text.slice(0, 300)}`)
}

/**
 * 사진 한 장 + 주제 하나로 아바타를 만든다.
 *
 * 이 기능은 이 프로젝트에서 유일하게 **서버를 거치지 않는** 외부 호출이다.
 * 원래는 다른 위젯들처럼 api/ 함수에서 서비스 쪽 자격으로 Puter를 부르려
 * 했지만, Node 런타임에서는 Puter SDK의 이미지 생성 함수가 브라우저 전용
 * 타입(`new Image()`)을 만들려다 죽는 미해결 버그가 있다
 * (HeyPuter/puter#1900). 그래서 브라우저가 직접 부른다 — 다만 SDK 자체는
 * 쓰지 않고 `/drivers/call`을 우리가 직접 두드린다(위 PUTER_DRIVER_ENDPOINT
 * 주석 참고, SDK를 그대로 썼을 때 실제로 겪은 문제 때문이다).
 */
export function useGenerateAiAvatar() {
  const { data: puterToken } = usePuterToken()
  const [stage, setStage] = useState<AiAvatarStage | null>(null)

  function goTo(next: AiAvatarStage) {
    setStage(next)
    logStage(next)
  }

  const mutation = useMutation({
    mutationFn: async ({ coupleId, userId, theme, file }: GenerateArgs) => {
      if (!puterToken) {
        throw new Error('Puter 인증을 아직 받지 못했어요. 잠시 후 다시 시도해주세요.')
      }

      goTo('resizing')
      const resized = await downscaleImage(file, MAX_SOURCE_SIDE)
      const base64 = await blobToBase64(resized)

      goTo('generating')
      const generatedAt = Date.now()
      const imageBlob = await withTimeout(
        callPuterImageGeneration(puterToken, {
          prompt: theme.prompt,
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
      const saved = await saveAiAvatarGeneration(coupleId, userId, theme.id, imageBlob)
      setStage(null)
      return saved
    },
  })

  return { ...mutation, stage }
}
