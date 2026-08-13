import { Button } from '@astryxdesign/core/Button'
import { Dialog } from '@astryxdesign/core/Dialog'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { motion } from 'framer-motion'

import type { EarnedBadge } from '../hooks/useRegionBadges'
import { RegionBadge } from './RegionBadge'

interface BadgeEarnedOverlayProps {
  /** 방금 딴 뱃지. null이면 닫혀 있다. */
  earned: EarnedBadge | null
  onClose: () => void
  /** 사진 등급이면 모자이크에 쓴다. */
  photos?: ReadonlyMap<string, string>
}

/**
 * 뱃지를 딴 순간의 연출.
 *
 * **마지막 칸을 채우는 순간이 이 기능의 유일한 클라이맥스다** — 그 외에는
 * 뱃지가 진열장에 조용히 놓여 있을 뿐이다. 그래서 여기에만 애니메이션을 쓴다
 * (docs/REGION_BADGE.md §2 "받는 순간에 투자한다").
 *
 * 뱃지가 작게 튀어나오며 자리를 잡는다. framer-motion은 이미 위젯 정렬에서
 * 쓰고 있어 새로 들이는 의존성이 아니다.
 *
 * 자동으로 닫지 않는다. 성취를 몇 초 뒤에 치워버리면 사진을 찍을 새도 없고,
 * 무엇보다 무엇을 땄는지 읽기 전에 사라질 수 있다.
 */
export function BadgeEarnedOverlay({ earned, onClose, photos }: BadgeEarnedOverlayProps) {
  return (
    <Dialog
      isOpen={earned != null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
      width={320}
    >
      {earned && (
        <VStack gap={4} padding={6} vAlign="center">
          {/* 뱃지가 커졌다가 제자리를 찾는다. 회전을 살짝 섞으면 "찍힌다"는
              감각이 난다 — 도장처럼. */}
          <motion.div
            initial={{ scale: 0.3, rotate: -12, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 14 }}
          >
            <RegionBadge
              progress={earned.progress}
              photos={photos}
              // 연출에서는 크기 덩어리를 무시하고 크게 띄운다. 세종을 땄다고
              // 60px짜리가 뜨면 성취처럼 보이지 않는다.
              size={144}
            />
          </motion.div>

          <VStack gap={1} vAlign="center">
            <Heading level={2} justify="center">
              {earned.tier === 'photo'
                ? `${earned.progress.region.shortName}을 사진으로 채웠어요`
                : `${earned.progress.region.shortName}을 다 다녀왔어요`}
            </Heading>
            <Text type="supporting" justify="center">
              {earned.tier === 'photo'
                ? '뱃지가 우리 사진으로 바뀌었어요.'
                : `${earned.progress.total}곳을 모두 채웠어요. 뱃지를 하나 얻었어요.`}
            </Text>
          </VStack>

          <Button label="좋아요" variant="primary" width="100%" onClick={onClose} />
        </VStack>
      )}
    </Dialog>
  )
}
