/** 한 장의 상한. 요즘 폰 사진 한 장이 3~5MB라 여유를 두되, 무한정 받지는 않는다. */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024

/**
 * 고른 파일이 지도에 걸 수 있는 사진인지 본다. 문제가 있으면 그대로 보여줄
 * 문장을, 괜찮으면 null을 준다.
 *
 * 두 지도 위젯(스크래치 배경, 지역별 사진)이 같은 기준을 쓴다. 한쪽만 10MB를
 * 넘겨받아도 결국 같은 `downscaleImage`가 브라우저 메모리에서 디코딩한다.
 */
export function photoFileProblem(file: File): string | null {
  if (!file.type.startsWith('image/')) return '이미지 파일만 올릴 수 있어요.'
  if (file.size > MAX_PHOTO_BYTES) return '이미지 용량은 10MB 이하여야 해요.'
  return null
}
