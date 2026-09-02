import { useMutation } from '@tanstack/react-query'

import { downscaleImage } from '@/lib/image'
import { saveAiAvatarGeneration } from '../api/aiAvatar'
import type { AiAvatarTheme } from '../themes'
import { usePuterToken } from './usePuterToken'

/** Puter에 보낼 사진의 긴 변 최대 길이. 원본을 그대로 보내면 요청이 무거워지고
 * 응답도 느려진다 — 스타일 변환은 이 정도 해상도로도 충분하다. */
const MAX_SOURCE_SIDE = 1024

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

  return useMutation({
    mutationFn: async ({ coupleId, userId, theme, file }: GenerateArgs) => {
      if (!puterToken) {
        throw new Error('Puter 인증을 아직 받지 못했어요. 잠시 후 다시 시도해주세요.')
      }

      const resized = await downscaleImage(file, MAX_SOURCE_SIDE)
      const base64 = await blobToBase64(resized)

      // 모듈 최상단에서 import하면 이 위젯을 한 번도 안 쓴 사람도 그 초기화
      // 코드(전역 메시지 리스너 등록 등)를 매번 받는다. 실제로 쓸 때만 받는다.
      const { default: puter } = await import('@heyputer/puter.js')
      puter.setAuthToken(puterToken)

      const result = await puter.ai.txt2img(theme.prompt, {
        model: MODEL,
        input_image: base64,
        input_image_mime_type: 'image/jpeg',
      })

      // txt2img는 브라우저에서 <img> 엘리먼트를 돌려준다(src가 blob: URL).
      // Storage에 올리려면 실제 바이트가 필요해서 그 src를 다시 fetch한다.
      const response = await fetch(result.src)
      const imageBlob = await response.blob()

      return saveAiAvatarGeneration(coupleId, userId, theme.id, imageBlob)
    },
  })
}
