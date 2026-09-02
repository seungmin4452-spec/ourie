/** 한 장의 상한. travel/photoFile.ts와 같은 값이다 — 결국 같은 downscaleImage가
 * 브라우저 메모리에서 디코딩하므로 기준을 다르게 둘 이유가 없다. */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024

/** 고른 파일이 아바타 재료로 쓸 수 있는 사진인지 본다. 문제가 있으면 그대로
 * 보여줄 문장을, 괜찮으면 null을 준다. */
export function aiAvatarPhotoFileProblem(file: File): string | null {
  if (!file.type.startsWith('image/')) return '이미지 파일만 올릴 수 있어요.'
  if (file.size > MAX_PHOTO_BYTES) return '이미지 용량은 10MB 이하여야 해요.'
  return null
}
