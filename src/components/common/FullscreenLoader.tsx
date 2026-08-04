import { Spinner } from '@astryxdesign/core/Spinner'

export function FullscreenLoader() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Spinner label="불러오는 중..." />
    </div>
  )
}
