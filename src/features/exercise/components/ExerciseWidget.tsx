import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/HStack'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Text } from '@astryxdesign/core/Text'
import { useToast } from '@astryxdesign/core/Toast'
import { VStack } from '@astryxdesign/core/VStack'

import { useAuth } from '@/features/auth'
// 배럴이 아니라 훅 파일을 직접 가리킨다 — 배럴에는 홈 화면이 들어 있고, 그
// 홈이 다시 이 위젯을 가져오므로 순환 import가 된다 (WishWidget.tsx와 같은
// 이유).
import { usePartner } from '@/features/couple/hooks/usePartner'
import type { Profile } from '@/features/onboarding/api/profile'
import { ExerciseError, finishExercise, notifyExercise, startExercise } from '../api/exercise'
import { useExerciseBoard } from '../hooks/useExerciseBoard'
import { EXERCISE_STREAK_GOAL } from '../message'
import { exercisePhase, type ExercisePhase } from '../types'

interface ExerciseWidgetProps {
  /** 홈이 이미 가져온 내 프로필. 같은 걸 또 조회하지 않으려고 받아 쓴다. */
  profile: Profile | null | undefined
  /** 절반 폭 타일일 때 true. 상대방 줄을 빼고 내 진행도와 버튼만 남긴다. */
  isCompact?: boolean
}

const PHASE_LABEL: Record<ExercisePhase, string> = {
  idle: '아직 안 했어요',
  running: '운동 중',
  done: '오늘 완료',
}

/**
 * 홈 위젯 "재활운동을 하자!"의 본문.
 *
 * 버튼 하나가 하루의 흐름을 그대로 따라간다 — 시작 → 종료 → 오늘 완료.
 * 시작과 종료를 둘 다 눌러야 하루가 1회로 센다. 30일을 하루도 빠짐없이
 * 채우면 소원권이 한 장 늘고 카운트는 0부터 다시 시작한다. 하루라도 빠지면
 * 처음부터다 (규칙의 실제 정의는 supabase/schema.sql의 exercise_streak).
 *
 * 콕 찌르기처럼 버튼이 위젯 안에 있어 카드 전체를 눌러 여는 동작은 없다
 * (HomePage.tsx의 OPENS_ON_TAP에 넣지 않는다).
 */
export function ExerciseWidget({ profile, isCompact }: ExerciseWidgetProps) {
  const { user } = useAuth()
  const showToast = useToast()

  const coupleId = profile?.couple_id
  const { data: partner } = usePartner(profile)
  const { rows, isLoading, refresh } = useExerciseBoard(coupleId)

  if (coupleId == null || user == null) {
    return (
      <Text type="supporting" justify="center">
        커플이 연결되면 운동 기록을 함께 볼 수 있어요.
      </Text>
    )
  }

  if (isLoading) {
    return (
      <Text type="supporting" justify="center">
        운동 기록을 불러오는 중이에요.
      </Text>
    )
  }

  const mine = rows.find((row) => row.owner_id === user.id)
  const partnerRow = partner ? rows.find((row) => row.owner_id === partner.id) : undefined
  const phase = exercisePhase(mine)
  const streak = mine?.streak ?? 0
  const partnerName = partner?.name?.trim() || '상대방'

  async function handleStart() {
    try {
      await startExercise()
      await refresh()
      const { delivered } = await notifyExercise('start')
      showToast({
        type: 'info',
        body: delivered > 0 ? '운동 시작! 상대방에게 알렸어요.' : '운동 시작! 화이팅이에요.',
      })
    } catch (error) {
      await refresh()
      showToast({
        type: 'error',
        body: error instanceof ExerciseError ? error.message : '운동을 시작하지 못했어요.',
      })
    }
  }

  async function handleFinish() {
    try {
      const { rewarded } = await finishExercise()
      await refresh()
      const { delivered } = await notifyExercise('finish')
      const told = delivered > 0 ? ' 상대방에게 알렸어요.' : ''
      showToast({
        type: 'info',
        body:
          rewarded > 0
            ? `${EXERCISE_STREAK_GOAL}일 연속 달성! 소원권이 한 장 늘었어요.${told}`
            : `오늘 운동 완료!${told}`,
      })
    } catch (error) {
      await refresh()
      showToast({
        type: 'error',
        body: error instanceof ExerciseError ? error.message : '운동을 끝내지 못했어요.',
      })
    }
  }

  const button =
    phase === 'running' ? (
      <Button label="운동 종료" variant="primary" width="100%" clickAction={handleFinish} />
    ) : phase === 'done' ? (
      <Button label="오늘 운동 완료" variant="secondary" width="100%" isDisabled />
    ) : (
      <Button label="운동 시작" variant="primary" width="100%" clickAction={handleStart} />
    )

  return (
    <VStack gap={isCompact ? 3 : 4}>
      <VStack gap={1}>
        <HStack hAlign="between" vAlign="center">
          <Text weight="medium">연속 {streak}일째</Text>
          <Text type="supporting" hasTabularNumbers>
            {streak}/{EXERCISE_STREAK_GOAL}
          </Text>
        </HStack>
        <ProgressBar
          label={`소원권까지 ${EXERCISE_STREAK_GOAL}일 중 ${streak}일`}
          isLabelHidden
          value={streak}
          max={EXERCISE_STREAK_GOAL}
          variant={phase === 'done' ? 'success' : 'accent'}
        />
        {!isCompact && (
          <Text type="supporting">
            나 · {PHASE_LABEL[phase]} · {partnerName} · {PHASE_LABEL[exercisePhase(partnerRow)]}
          </Text>
        )}
      </VStack>

      {button}
    </VStack>
  )
}
