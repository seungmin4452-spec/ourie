import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useToast } from '@astryxdesign/core/Toast'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { cacheAppMeta, readCachedAppMeta } from '@/app/appMeta'
import { DefaultAvatar } from '@/components/common/DefaultAvatar'
import { useAuth } from '@/features/auth'
import { cropImageToSquare } from '@/lib/cropImageToSquare'
import { getProfile, updateProfile, uploadAvatar } from '../api/profile'
import { openPwaInstallPage } from '../pwaInstall'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export function CustomizeForm() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const showToast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [typedAppName, setTypedAppName] = useState<string | null>(null)
  const [typedName, setTypedName] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
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
  const appName = typedAppName ?? profile?.app_name ?? ''

  // 사람 이름. 원래 회원가입에서 받지만, 그 필드가 생기기 전에 가입한 사람은
  // 채울 곳이 여기밖에 없다 (회원가입을 다시 할 수는 없다). 이름이 비어 있으면
  // 상대방이 받는 콕 찌르기 알림에 "상대방이 보고 싶대요"로 나간다.
  const name = typedName ?? profile?.name ?? ''

  // The locally cropped pick wins while it exists; otherwise show what's
  // already saved so reopening the form doesn't look like the photo is gone.
  const displayedAvatarUrl = previewUrl ?? profile?.avatar_url ?? null

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
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

    // 위치/확대를 직접 맞추게 하지 않고 가운데 정사각형으로 알아서 자른다.
    try {
      const blob = await cropImageToSquare(file)
      setImageFile(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }))
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(blob)
      })
    } catch (err) {
      showToast({
        type: 'error',
        body: err instanceof Error ? err.message : '이미지를 처리하지 못했어요.',
      })
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return

    setIsSubmitting(true)
    try {
      const avatarUrl = imageFile ? await uploadAvatar(user.id, imageFile) : null
      await updateProfile(user.id, {
        app_name: appName.trim(),
        name: name.trim() || null,
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      })

      const previousMeta = readCachedAppMeta()
      // 홈 화면 아이콘에 굽는 건 앱 이름이다. 사람 이름이 아니다.
      const title = appName.trim()
      const icon = avatarUrl ?? profile?.avatar_url ?? previousMeta?.icon ?? ''
      cacheAppMeta(title, icon)

      // The next screen is reached by client-side navigation now, so the
      // cached profile has to catch up: RequireOnboarding reads this same
      // query, and a stale row with no app_name would send them right back
      // here.
      await queryClient.invalidateQueries({ queryKey: ['profile', user.id] })

      // This is the first onboarding step, so the couple usually isn't paired
      // yet -- send them there and let CoupleInvitePage close the flow with
      // the install page. Re-editing the name later skips straight to the
      // install page so the new name can be baked onto the icon.
      if (!profile?.couple_id) {
        navigate('/onboarding/couple')
      } else {
        await openPwaInstallPage(title, icon)
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
      </div>

      <TextInput
        label="앱 이름"
        htmlName="app-name"
        placeholder="예: 승민 ♥ 진선"
        isRequired
        value={appName}
        onChange={setTypedAppName}
        description="홈 화면 아이콘과 앱 상단에 표시돼요."
      />

      {/* 앱 이름 바로 아래 두고 description으로 쓰임을 갈라놓는다. 둘 다 그냥
          "이름"이면 여기에도 커플 이름을 적게 되고, 그러면 상대방 알림이
          "승민 ♥ 진선님이 보고 싶대요"가 된다 (실제로 그랬다). */}
      <TextInput
        label="내 이름"
        htmlName="name"
        placeholder="예: 승민"
        value={name}
        onChange={setTypedName}
        description="상대방에게 보내는 알림에 표시돼요."
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
