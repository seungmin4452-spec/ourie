import { HStack } from '@astryxdesign/core/HStack'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'

import type { WishStatus } from '../types'

interface WishMeterProps {
  status: WishStatus
}

/**
 * 얼마나 썼는지에 따라 막대 색을 고른다 — 30% 미만은 초록, 30~70%는 주황,
 * 70% 이상은 빨강.
 *
 * 막대 길이는 **남은** 장수라서 쓸수록 짧아지는데, 길이만으로는 "짧다"가
 * 눈에 안 들어온다. 색이 함께 넘어가야 "이제 얼마 안 남았으니 아껴 쓰거나
 * 새로 정하자"가 보인다.
 *
 * 총 장수가 0장인 사람은 쓸 것도 남을 것도 없으니 다 쓴 것과 같이 본다
 * (0으로 나누는 것도 피한다).
 */
function meterVariant(status: WishStatus) {
  const usedRatio = status.total > 0 ? status.used / status.total : 1

  if (usedRatio >= 0.7) return 'error'
  if (usedRatio >= 0.3) return 'warning'
  return 'success'
}

/**
 * 한 사람의 소원권 현황 한 줄 — 이름, 남은 장수, 그리고 막대 하나.
 *
 * 위젯과 다이얼로그가 같은 것을 쓴다. 위젯이 작아서 한 사람당 두 줄(글자 +
 * 막대)이 한계인데, 그 두 줄이 다이얼로그에서도 똑같이 읽혀야 "위젯에서 본
 * 그 숫자"라는 감각이 유지된다.
 *
 * 막대가 **남은** 장수를 그린다. 쓴 만큼 차오르게 할 수도 있지만, 이 위젯이
 * 답하는 질문은 "몇 장 더 부탁할 수 있나"이지 "몇 장 썼나"가 아니다. 그래서
 * 가득 찬 막대가 아직 하나도 안 쓴 상태이고, 쓸수록 줄어든다.
 */
export function WishMeter({ status }: WishMeterProps) {
  const isEmpty = status.remaining === 0

  return (
    <VStack gap={1}>
      <HStack gap={2} hAlign="between" vAlign="center">
        <Text weight="medium" maxLines={1}>
          {status.name}
        </Text>
        {/* 두 사람의 숫자가 위아래로 놓이므로 자릿수가 흔들리지 않게 한다. */}
        <Text type="supporting" hasTabularNumbers>
          {isEmpty ? `다 썼어요 · ${status.total}장` : `${status.remaining} / ${status.total}장`}
        </Text>
      </HStack>

      <ProgressBar
        // 막대에는 글자를 넣지 않는다 (ProgressBar의 지침). 위에 이미 적혀
        // 있으므로 라벨은 화면에서 감추고 스크린리더에만 남긴다.
        label={`${status.name}의 남은 소원권 ${status.remaining}장, 전체 ${status.total}장`}
        isLabelHidden
        value={status.remaining}
        // 0장으로 정해둔 사람이 있을 수 있다. max가 0이면 채움 비율이
        // 0으로 나누기가 되므로 최소 1로 둔다 (value도 0이라 빈 막대다).
        max={Math.max(1, status.total)}
        variant={meterVariant(status)}
      />
    </VStack>
  )
}
