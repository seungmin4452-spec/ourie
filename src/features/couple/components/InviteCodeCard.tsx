import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Spinner } from '@astryxdesign/core/Spinner'
import { useToast } from '@astryxdesign/core/Toast'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Share2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useAuth } from '@/features/auth'
import { getProfile } from '@/features/onboarding/api/profile'
import { createInviteCode, INVITE_CODE_TTL_MS } from '../api/couple'

// Renders the OG preview card (image/title) for the shared link -- the SPA
// itself can't serve per-request <meta> tags, see api/invite.ts.
const INVITE_SHARE_FUNCTION_URL = 'https://ourie.vercel.app/api/invite'

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function InviteCodeCard() {
  const { user } = useAuth()
  const showToast = useToast()
  const queryClient = useQueryClient()
  const [isCopied, setIsCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const invalidatedForExpiryRef = useRef<number | null>(null)

  const {
    data: invite,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['couple-invite', user?.id],
    queryFn: () => createInviteCode(user!.id),
    enabled: user != null,
  })

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: user != null,
  })

  const expiresAt = invite ? new Date(invite.created_at).getTime() + INVITE_CODE_TTL_MS : null

  // Ticks the countdown and, once the code ages past its 1-hour window,
  // invalidates the query so createInviteCode mints a fresh one.
  useEffect(() => {
    if (expiresAt == null) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  useEffect(() => {
    if (expiresAt != null && now >= expiresAt && invalidatedForExpiryRef.current !== expiresAt) {
      invalidatedForExpiryRef.current = expiresAt
      queryClient.invalidateQueries({ queryKey: ['couple-invite', user?.id] })
    }
  }, [now, expiresAt, queryClient, user?.id])

  async function handleCopy() {
    if (!invite) return
    await navigator.clipboard.writeText(invite.invite_code)
    setIsCopied(true)
    showToast({ body: '초대 코드를 복사했어요.' })
    setTimeout(() => setIsCopied(false), 2000)
  }

  async function handleShare() {
    if (!invite) return
    const params = new URLSearchParams({ code: invite.invite_code })
    if (profile?.nickname) params.set('title', profile.nickname)
    if (profile?.avatar_url) params.set('icon', profile.avatar_url)
    const shareUrl = `${INVITE_SHARE_FUNCTION_URL}?${params.toString()}`
    const shareTitle = profile?.nickname
      ? `${profile.nickname}이(가) Ourie 커플 연결을 초대했어요`
      : 'Ourie 커플 연결 초대'

    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, url: shareUrl })
      } catch {
        // user closed the share sheet without sharing
      }
    } else {
      await navigator.clipboard.writeText(shareUrl)
      showToast({ body: '초대 링크를 복사했어요.' })
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <Spinner label="초대 코드를 만드는 중..." />
      </div>
    )
  }

  if (isError || !invite) {
    return (
      <p className="text-center text-sm text-secondary">
        초대 코드를 불러오지 못했어요. 새로고침 후 다시 시도해주세요.
      </p>
    )
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-secondary">이 코드를 상대방에게 공유해주세요</p>
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-6 py-4">
          <span className="text-3xl font-semibold tracking-[0.3em]">
            {invite.invite_code}
          </span>
          <IconButton
            label="코드 복사"
            icon={isCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
            variant="ghost"
            onClick={handleCopy}
          />
        </div>
        {expiresAt != null && (
          <p className="text-xs text-secondary">
            {formatRemaining(expiresAt - now)} 후 새 코드로 바뀌어요
          </p>
        )}
      </div>

      <Button
        label="코드 공유하기"
        variant="primary"
        icon={<Share2 className="size-4" />}
        width="100%"
        onClick={handleShare}
      />

      <div className="flex items-center gap-2 text-sm text-secondary">
        <Spinner size="sm" />
        상대방이 연결하기를 기다리는 중...
      </div>
    </div>
  )
}
