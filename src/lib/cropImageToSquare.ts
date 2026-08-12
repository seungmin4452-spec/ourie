const OUTPUT_SIZE = 512
const JPEG_QUALITY = 0.92

/**
 * 고른 사진을 512px 정사각형 JPEG으로 알아서 잘라준다.
 *
 * 잘라내는 방식은 CSS `object-fit: cover`와 같다: 짧은 변에 맞춰 꽉 채우고
 * 가운데를 남긴다. 사람이 손으로 맞추던 시절에도 결국 이 기본값이 제일
 * 좋아 보였기 때문에, 위치/확대 조절 UI 없이 이 결과만 쓴다.
 *
 * 디코딩은 `createImageBitmap`이 아니라 `<img>`로 한다. 그래야 브라우저가
 * EXIF 방향을 알아서 적용해줘서, 폰으로 세로로 찍은 사진이 눕지 않는다.
 */
export function cropImageToSquare(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(url)
      try {
        resolve(drawCenteredSquare(img))
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지를 불러오지 못했어요.'))
    }

    img.src = url
  })
}

function drawCenteredSquare(img: HTMLImageElement): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_SIZE
  canvas.height = OUTPUT_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('이미지를 처리하지 못했어요.')

  const side = Math.min(img.naturalWidth, img.naturalHeight)
  const sx = (img.naturalWidth - side) / 2
  const sy = (img.naturalHeight - side) / 2
  ctx.drawImage(img, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('이미지를 처리하지 못했어요.'))
      },
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}
