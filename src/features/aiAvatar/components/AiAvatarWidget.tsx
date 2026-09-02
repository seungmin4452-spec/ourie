import { Button } from '@astryxdesign/core/Button'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useState } from 'react'

import { useAuth } from '@/features/auth'
import type { Profile } from '@/features/onboarding/api/profile'
import { useAiAvatarGenerations } from '../hooks/useAiAvatarGenerations'
import { AiAvatarDialog } from './AiAvatarDialog'

interface AiAvatarWidgetProps {
  /** 홈이 이미 가져온 내 프로필. 같은 걸 또 조회하지 않으려고 받아 쓴다. */
  profile: Profile | null | undefined
  /** 절반 폭 타일일 때 true. WishWidget과 같은 판단 — 버튼을 넣을 자리가
   * 없는 대신, 타일 전체를 누르면 그 버튼과 같은 다이얼로그가 열린다. */
  isCompact?: boolean
}

/**
 * 홈 위젯 "AI 아바타"의 본문.
 *
 * 주제 선택·생성·갤러리는 전부 다이얼로그로 밀어둔다 — 타일에는 가장 최근에
 * 만든 아바타 미리보기 한 장과 버튼 하나만 둔다 (WishWidget과 같은 판단).
 */
export function AiAvatarWidget({ profile, isCompact }: AiAvatarWidgetProps) {
  const { user } = useAuth()
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const coupleId = profile?.couple_id
  const { generations, isLoading } = useAiAvatarGenerations(coupleId)

  if (coupleId == null || user == null) {
    return (
      <Text type="supporting" justify="center">
        커플이 연결되면 함께 AI 아바타를 만들 수 있어요.
      </Text>
    )
  }

  if (isLoading) {
    return (
      <Text type="supporting" justify="center">
        불러오는 중이에요.
      </Text>
    )
  }

  const latest = generations[0]

  const preview = latest?.url ? (
    <img
      src={latest.url}
      alt=""
      className="aspect-square w-full rounded-lg border border-border object-cover"
    />
  ) : (
    <Text type="supporting" justify="center">
      아직 만든 아바타가 없어요.
    </Text>
  )

  return (
    <VStack gap={isCompact ? 3 : 4}>
      {isCompact ? (
        <button
          type="button"
          className="w-full cursor-pointer border-0 bg-transparent p-0 text-start"
          onClick={() => setIsDialogOpen(true)}
        >
          {preview}
        </button>
      ) : (
        <>
          {preview}
          <Button
            label="AI 아바타 만들기"
            variant="primary"
            width="100%"
            onClick={() => setIsDialogOpen(true)}
          />
        </>
      )}

      <AiAvatarDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        coupleId={coupleId}
        userId={user.id}
      />
    </VStack>
  )
}
