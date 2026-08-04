import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useToast } from '@astryxdesign/core/Toast'
import { useQueryClient } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { DefaultAvatar } from '@/components/common/DefaultAvatar'
import { useAuth } from '@/features/auth'
import { updateProfile, uploadAvatar } from '../api/profile'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export function CustomizeForm() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const showToast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showToast({ type: 'error', body: '이미지 파일만 업로드할 수 있어요.' })
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showToast({ type: 'error', body: '이미지 용량은 5MB 이하여야 해요.' })
      return
    }

    setImageFile(file)
    setPreviewUrl(URL.createObjectURL(file))
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
      await queryClient.invalidateQueries({ queryKey: ['profile', user.id] })
      navigate('/onboarding/pwa')
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
          {previewUrl ? (
            <img src={previewUrl} alt="" className="size-full object-cover" />
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
        value={name}
        onChange={setName}
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
