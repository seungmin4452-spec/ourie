import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Slider } from '@astryxdesign/core/Slider'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

const VIEWPORT_SIZE = 280
const OUTPUT_SIZE = 512

interface ImageCropDialogProps {
  file: File | null
  onCancel: () => void
  onConfirm: (blob: Blob) => void
}

export function ImageCropDialog({ file, onCancel, onConfirm }: ImageCropDialogProps) {
  return (
    <Dialog isOpen={file != null} onOpenChange={(open) => !open && onCancel()} purpose="form" width={340}>
      <DialogHeader title="사진 위치 조절" subtitle="드래그로 위치를, 슬라이더로 확대/축소를 조절하세요" />
      {file && (
        // Keying on the file remounts the cropper (and resets zoom/pan state)
        // fresh for each newly picked photo, instead of an effect resetting it.
        <Cropper key={`${file.name}-${file.lastModified}-${file.size}`} file={file} onCancel={onCancel} onConfirm={onConfirm} />
      )}
    </Dialog>
  )
}

function Cropper({
  file,
  onCancel,
  onConfirm,
}: {
  file: File
  onCancel: () => void
  onConfirm: (blob: Blob) => void
}) {
  const imgRef = useRef<HTMLImageElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number } | null>(null)

  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    // Set the object URL directly on the <img> DOM node rather than through
    // React state: this is an external resource, and each effect invocation
    // creates its own fresh URL, so it survives StrictMode's dev-only
    // double-invoke cleanly (no stale revoked URL ever gets used as a src).
    const url = URL.createObjectURL(file)
    if (imgRef.current) imgRef.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  const baseScale =
    naturalSize.width > 0
      ? Math.max(VIEWPORT_SIZE / naturalSize.width, VIEWPORT_SIZE / naturalSize.height)
      : 1
  const scale = baseScale * zoom
  const displayedWidth = naturalSize.width * scale
  const displayedHeight = naturalSize.height * scale

  function clamp(value: { x: number; y: number }, width: number, height: number) {
    const minX = Math.min(0, VIEWPORT_SIZE - width)
    const minY = Math.min(0, VIEWPORT_SIZE - height)
    return {
      x: Math.min(0, Math.max(minX, value.x)),
      y: Math.min(0, Math.max(minY, value.y)),
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { startX: event.clientX, startY: event.clientY, offsetX: offset.x, offsetY: offset.y }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return
    const dx = event.clientX - dragRef.current.startX
    const dy = event.clientY - dragRef.current.startY
    setOffset(
      clamp(
        { x: dragRef.current.offsetX + dx, y: dragRef.current.offsetY + dy },
        displayedWidth,
        displayedHeight,
      ),
    )
  }

  function handlePointerUp() {
    dragRef.current = null
  }

  function handleZoomChange(value: number) {
    setZoom(value)
    const nextScale = baseScale * value
    setOffset((prev) =>
      clamp(prev, naturalSize.width * nextScale, naturalSize.height * nextScale),
    )
  }

  function handleConfirm() {
    const img = imgRef.current
    if (!img) return

    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const sx = -offset.x / scale
    const sy = -offset.y / scale
    const sSize = VIEWPORT_SIZE / scale
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

    canvas.toBlob(
      (blob) => {
        if (blob) onConfirm(blob)
      },
      'image/jpeg',
      0.92,
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <div
        className="relative touch-none overflow-hidden rounded-2xl bg-surface"
        style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <img
          ref={imgRef}
          alt=""
          draggable={false}
          onLoad={(event) => {
            const el = event.currentTarget
            setNaturalSize({ width: el.naturalWidth, height: el.naturalHeight })

            // Start centered instead of pinned to the image's top-left edge.
            const initialScale = Math.max(
              VIEWPORT_SIZE / el.naturalWidth,
              VIEWPORT_SIZE / el.naturalHeight,
            )
            setOffset({
              x: (VIEWPORT_SIZE - el.naturalWidth * initialScale) / 2,
              y: (VIEWPORT_SIZE - el.naturalHeight * initialScale) / 2,
            })
          }}
          className="absolute select-none"
          style={{ left: offset.x, top: offset.y, width: displayedWidth, height: displayedHeight }}
        />
      </div>

      <Slider
        label="확대/축소"
        isLabelHidden
        min={1}
        max={3}
        step={0.01}
        value={zoom}
        onChange={handleZoomChange}
        width="100%"
      />

      <div className="flex w-full gap-2">
        <Button label="취소" variant="secondary" onClick={onCancel} width="100%" />
        <Button label="적용" variant="primary" onClick={handleConfirm} width="100%" />
      </div>
    </div>
  )
}
