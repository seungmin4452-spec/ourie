// Renders an emoji onto a colored square as a data URL, for use as a
// dynamic apple-touch-icon. Safari can't point a home-screen icon at an
// emoji glyph directly -- it needs an actual image resource.
export function renderEmojiIconDataUrl(emoji: string, size = 512): string | null {
  if (typeof document === 'undefined') return null

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const gradient = ctx.createLinearGradient(0, 0, size, size)
  gradient.addColorStop(0, '#FF7A9C')
  gradient.addColorStop(1, '#FF4D6D')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  ctx.font = `${Math.round(size * 0.55)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.04)

  return canvas.toDataURL('image/png')
}
