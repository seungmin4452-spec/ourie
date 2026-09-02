/**
 * `@heyputer/puter.js`는 타입을 내보내지 않는다(패키지 안에 .d.ts가 없다).
 * 여기서는 이 프로젝트가 실제로 쓰는 부분만 최소한으로 적어둔다 — 전체 SDK를
 * 따라 그리지 않는다. 실제 동작은 node_modules/@heyputer/puter.js/src/index.js와
 * src/modules/AI.js를 직접 읽어서 확인했다 (features/aiAvatar/hooks/
 * useGenerateAiAvatar.ts 참고).
 */
declare module '@heyputer/puter.js' {
  interface PuterTxt2ImgOptions {
    prompt?: string
    model?: string
    input_image?: string
    input_image_mime_type?: string
    ratio?: { w: number; h: number }
  }

  interface PuterAI {
    txt2img(prompt: string, options?: PuterTxt2ImgOptions): Promise<HTMLImageElement>
  }

  interface Puter {
    authToken: string | null
    setAuthToken(token: string): void
    ai: PuterAI
  }

  const puter: Puter
  export default puter
}
