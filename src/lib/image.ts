const SQUARE_OUTPUT_SIZE = 512
const JPEG_QUALITY = 0.92

/**
 * 고른 파일을 `<img>`로 디코딩한다.
 *
 * `createImageBitmap`이 아니라 `<img>`인 이유: 그래야 브라우저가 EXIF 방향을
 * 알아서 적용해줘서, 폰으로 세로로 찍은 사진이 눕지 않는다.
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지를 불러오지 못했어요.'))
    }

    img.src = url
  })
}

function toJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
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

/**
 * 고른 사진을 512px 정사각형 JPEG으로 알아서 잘라준다.
 *
 * 잘라내는 방식은 CSS `object-fit: cover`와 같다: 짧은 변에 맞춰 꽉 채우고
 * 가운데를 남긴다. 사람이 손으로 맞추던 시절에도 결국 이 기본값이 제일
 * 좋아 보였기 때문에, 위치/확대 조절 UI 없이 이 결과만 쓴다.
 */
export async function cropImageToSquare(file: File): Promise<Blob> {
  const img = await loadImage(file)

  const canvas = document.createElement('canvas')
  canvas.width = SQUARE_OUTPUT_SIZE
  canvas.height = SQUARE_OUTPUT_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('이미지를 처리하지 못했어요.')

  const side = Math.min(img.naturalWidth, img.naturalHeight)
  const sx = (img.naturalWidth - side) / 2
  const sy = (img.naturalHeight - side) / 2
  ctx.drawImage(img, sx, sy, side, side, 0, 0, SQUARE_OUTPUT_SIZE, SQUARE_OUTPUT_SIZE)

  return toJpegBlob(canvas)
}

/**
 * 비율은 그대로 두고 긴 변만 `maxSide`로 줄인 JPEG.
 *
 * 스크래치 지도 배경이 이걸 쓴다. 거기서 자르지 **않는** 것이 중요하다 —
 * 한반도 도형은 세로로 길어서(가로:세로 ≈ 1:1.9) 그 비율에 맞춰 미리 잘라
 * 저장하면 사진 좌우가 영영 날아간다. 화면에 맞추는 일은 SVG의
 * `preserveAspectRatio="xMidYMid slice"`가 그릴 때 하고, 저장된 원본은
 * 온전히 남겨둔다 (나중에 위치 조절을 붙일 여지도 여기서 생긴다).
 *
 * 원본보다 크게 늘리지는 않는다. 작은 사진을 키워봐야 용량만 커진다.
 */
export async function downscaleImage(file: File, maxSide: number): Promise<Blob> {
  const img = await loadImage(file)

  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('이미지를 처리하지 못했어요.')

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  return toJpegBlob(canvas)
}
