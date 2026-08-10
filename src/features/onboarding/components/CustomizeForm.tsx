import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useToast } from '@astryxdesign/core/Toast'
import { useQuery } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'

import { cacheAppMeta, readCachedAppMeta } from '@/app/appMeta'
import { DefaultAvatar } from '@/components/common/DefaultAvatar'
import { ImageCropDialog } from '@/components/common/ImageCropDialog'
import { useAuth } from '@/features/auth'
import { getProfile, updateProfile, uploadAvatar } from '../api/profile'
import { buildPwaInstallUrl, isIOS } from '../pwaInstall'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export function CustomizeForm() {
  const { user } = useAuth()
  const showToast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [typedName, setTypedName] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: user != null,
  })

  // "꾸미기 다시 하기" reopens this form on an already-configured couple, and
  // the name field is isRequired -- starting blank would force them to retype
  // a name they already chose just to get back to the install step. Derived
  // rather than synced into state by an effect: null means "untouched, show
  // whatever is saved", and the first keystroke takes over for good.
  const name = typedName ?? profile?.nickname ?? ''

  // The locally cropped pick wins while it exists; otherwise show what's
  // already saved so reopening the form doesn't look like the photo is gone.
  const displayedAvatarUrl = previewUrl ?? profile?.avatar_url ?? null

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showToast({ type: 'error', body: '이미지 파일만 업로드할 수 있어요.' })
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showToast({ type: 'error', body: '이미지 용량은 5MB 이하여야 해요.' })
      return
    }

    setPendingCropFile(file)
  }

  function handleCropConfirm(blob: Blob) {
    const croppedFile = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
    setImageFile(croppedFile)
    setPreviewUrl(URL.createObjectURL(blob))
    setPendingCropFile(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return

    setIsSubmitting(true)
    try {
      const avatarUrl = imageFile ? await uploadAvatar(user.id, imageFile) : null
      await updateProfile(user.id, {
        nickname: name.trim(),
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      })

      const previousMeta = readCachedAppMeta()
      const title = name.trim()
      const icon = avatarUrl ?? profile?.avatar_url ?? previousMeta?.icon ?? ''
      cacheAppMeta(title, icon)

      if (isIOS()) {
        window.location.assign(buildPwaInstallUrl(title, icon))
      } else {
        window.location.assign(`${import.meta.env.BASE_URL}onboarding/pwa`)
      }
    } catch (err) {
      showToast({
        type: 'error',
        body: err instanceof Error ? err.message : '저장에 실패했습니다.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          aria-label="프로필 이미지 선택"
          onClick={() => fileInputRef.current?.click()}
          className="relative flex size-24 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface"
        >
          {displayedAvatarUrl ? (
            <img src={displayedAvatarUrl} alt="" className="size-full object-cover" />
          ) : (
            <DefaultAvatar className="size-full" />
          )}
          <span className="absolute right-1 bottom-1 flex size-6 items-center justify-center rounded-full bg-accent text-on-accent">
            <Camera className="size-3.5" />
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageChange}
        />
        <ImageCropDialog
          file={pendingCropFile}
          onCancel={() => setPendingCropFile(null)}
          onConfirm={handleCropConfirm}
        />
      </div>

      <TextInput
        label="앱 이름"
        htmlName="app-name"
        placeholder="예: 승민 ♥ 진선"
        isRequired
        value={name}
        onChange={setTypedName}
      />

      <Button
        type="submit"
        label={isSubmitting ? '저장 중...' : '다음'}
        variant="primary"
        isLoading={isSubmitting}
        width="100%"
      />
    </form>
  )
}
