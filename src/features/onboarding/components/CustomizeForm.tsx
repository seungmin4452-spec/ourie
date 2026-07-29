import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/features/auth'
import { updateProfile, uploadAvatar } from '../api/profile'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export function CustomizeForm() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드할 수 있어요.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('이미지 용량은 5MB 이하여야 해요.')
      return
    }

    setError(null)
    setImageFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return

    setError(null)
    setIsSubmitting(true)
    try {
      const avatarUrl = imageFile ? await uploadAvatar(user.id, imageFile) : null
      await updateProfile(user.id, {
        nickname: name.trim(),
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      })
      navigate('/onboarding/pwa')
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex size-24 items-center justify-center overflow-hidden rounded-full border border-dashed border-border bg-muted text-xs text-muted-foreground"
        >
          {previewUrl ? (
            <img src={previewUrl} alt="" className="size-full object-cover" />
          ) : (
            '이미지 선택'
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageChange}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="app-name">앱 이름</Label>
        <Input
          id="app-name"
          placeholder="예: 승민 ♥ 진선"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? '저장 중...' : '다음'}
      </Button>
    </form>
  )
}
