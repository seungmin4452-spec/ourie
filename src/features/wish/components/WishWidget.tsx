import { Button } from '@astryxdesign/core/Button'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { Ticket } from 'lucide-react'
import { useState } from 'react'

import { useAuth } from '@/features/auth'
// 배럴(@/features/couple)이 아니라 훅 파일을 직접 가리킨다 — 배럴에는 홈
// 화면이 들어 있고, 그 홈이 다시 이 위젯을 가져오므로 순환 import가 된다.
import { usePartner } from '@/features/couple/hooks/usePartner'
import type { Profile } from '@/features/onboarding/api/profile'
import { wishStatus } from '../board'
import { useWishBoard } from '../hooks/useWishBoard'
import { WishDialog } from './WishDialog'
import { WishMeter } from './WishMeter'

interface WishWidgetProps {
  /** 홈이 이미 가져온 내 프로필. 같은 걸 또 조회하지 않으려고 받아 쓴다. */
  profile: Profile | null | undefined
}

/**
 * 홈 위젯 "소원권"의 본문.
 *
 * 위젯이 답하는 것은 하나다 — **지금 각자 몇 장이 남았나.** 그래서 본문은 두
 * 사람의 막대 두 개와 버튼 하나가 전부다. 무엇을 부탁했는지, 장수를 몇 장으로
 * 할지는 전부 다이얼로그로 밀어냈다. 홈에 올라가는 카드가 스크롤을 먹기
 * 시작하면 그건 이미 위젯이 아니라 화면이다.
 *
 * 다만 마지막으로 쓴 소원 한 줄만 남겨두었다. 숫자만 있는 현황판은 "3장
 * 남았다"까지만 말하고 "무엇에 썼는지"는 열어봐야 알 수 있는데, 그 한 줄이
 * 있으면 열지 않고도 기억이 이어진다.
 */
export function WishWidget({ profile }: WishWidgetProps) {
  const { user } = useAuth()
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const coupleId = profile?.couple_id
  const { data: partner } = usePartner(profile)
  const { wishes, quotas, isLoading, refresh } = useWishBoard(coupleId)

  // 소원권은 둘 사이의 약속이라 혼자서는 성립하지 않는다. 커플이 없으면
  // RLS도 쓰기를 막으므로, 빈 현황판을 보여주는 대신 이유를 적는다.
  if (coupleId == null || user == null) {
    return (
      <Text type="supporting" justify="center">
        커플이 연결되면 소원권을 나눠 가질 수 있어요.
      </Text>
    )
  }

  if (isLoading) {
    return (
      <Text type="supporting" justify="center">
        소원권을 세는 중이에요.
      </Text>
    )
  }

  const mine = wishStatus(user.id, '나', wishes, quotas)
  const theirs = partner
    ? wishStatus(partner.id, partner.name?.trim() || '상대방', wishes, quotas)
    : null

  // 목록은 최신순이라 첫 줄이 가장 최근이다 (api/wish.ts의 listWishes).
  const latest = wishes[0]
  const canWrite = mine.remaining > 0

  return (
    <VStack gap={4}>
      <VStack gap={3}>
        <WishMeter status={mine} />
        {theirs && <WishMeter status={theirs} />}
      </VStack>

      {latest && (
        <Text type="supporting" maxLines={1}>
          최근 · {latest.content}
        </Text>
      )}

      {/* 남은 장수가 없어도 버튼을 잠그지 않는다. 다 쓴 사람에게 가장 필요한
          것이 "무엇에 썼는지 보고 하나 지우는 일"인데, 그 문이 이 버튼뿐이다. */}
      <Button
        label={canWrite ? '소원권 쓰기' : '쓴 소원권 보기'}
        variant={canWrite ? 'primary' : 'secondary'}
        width="100%"
        icon={<Ticket className="size-4" />}
        onClick={() => setIsDialogOpen(true)}
      />

      <WishDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        coupleId={coupleId}
        userId={user.id}
        partner={partner ?? null}
        wishes={wishes}
        mine={mine}
        theirs={theirs}
        onChanged={refresh}
      />
    </VStack>
  )
}
