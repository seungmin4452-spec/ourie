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
import {
  ExerciseError,
  finishExercise,
  notifyExercise,
  setExerciseOwner,
  startExercise,
} from '../api/exercise'
import { useExerciseBoard } from '../hooks/useExerciseBoard'
import { EXERCISE_STREAK_GOAL } from '../message'
import { exercisePhase, type ExercisePhase } from '../types'

interface ExerciseWidgetProps {
  /** 홈이 이미 가져온 내 프로필. 같은 걸 또 조회하지 않으려고 받아 쓴다. */
  profile: Profile | null | undefined
  /** 절반 폭 타일일 때 true. 설명 줄을 빼고 진행도와 버튼만 남긴다. */
  isCompact?: boolean
}

/** 보는 쪽 화면의 첫 줄 — 운동하는 사람이 지금 어디쯤인지. */
function watcherHeadline(nameLabel: string, phase: ExercisePhase): string {
  if (phase === 'running') return `${nameLabel}이 지금 운동 중이에요`
  if (phase === 'done') return `${nameLabel}이 오늘 운동을 마쳤어요`
  return `${nameLabel}이 아직 운동 전이에요`
}

interface StreakMeterProps {
  title: string
  streak: number
  isDone: boolean
}

/** 연속 일수와 소원권까지 남은 거리. 운동하는 쪽과 보는 쪽이 같은 모양을 본다. */
function StreakMeter({ title, streak, isDone }: StreakMeterProps) {
  return (
    <VStack gap={1}>
      <HStack hAlign="between" vAlign="center" gap={2}>
        <Text weight="medium">{title}</Text>
        <Text type="supporting" hasTabularNumbers>
          {streak}/{EXERCISE_STREAK_GOAL}
        </Text>
      </HStack>
      <ProgressBar
        label={`소원권까지 ${EXERCISE_STREAK_GOAL}일 중 ${streak}일`}
        isLabelHidden
        value={streak}
        max={EXERCISE_STREAK_GOAL}
        variant={isDone ? 'success' : 'accent'}
      />
    </VStack>
  )
}

/**
 * 홈 위젯 "재활운동을 하자!"의 본문.
 *
 * 재활운동은 커플 중 **한 사람만** 한다 (couples.exercise_owner_id). 그래서
 * 같은 위젯이 사람에 따라 다르게 보인다.
 *
 * - **운동하는 사람**: 연속 일수와 버튼 하나. 버튼은 하루의 흐름을 따라간다
 *   — 시작 → 종료 → 오늘 완료. 누를 때마다 상대방에게 알림이 간다.
 * - **보는 사람**: 버튼 없이 "지금 운동 중이에요" 같은 상태와 연속 일수만.
 * - **아직 아무도 안 정했으면**: 누가 하는지 한 번 고른다. 정해진 뒤에는
 *   관리자 화면에서만 바꿀 수 있다.
 *
 * 시작과 종료를 둘 다 눌러야 하루가 1회로 센다. 30일을 하루도 빠짐없이
 * 채우면 소원권이 한 장 늘고 카운트는 0부터 다시 시작한다 (규칙의 실제
 * 정의는 supabase/schema.sql의 exercise_streak).
 *
 * 버튼이 위젯 안에 있어 카드 전체를 눌러 여는 동작은 없다 (HomePage.tsx의
 * OPENS_ON_TAP에 넣지 않는다).
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

  const exerciser = rows.find((row) => row.is_exerciser)
  const partnerName = partner?.name?.trim() || '상대방'
  // 문장 속에서 부를 때. 이름이 없으면 "상대방님"이 아니라 "상대방"이다.
  const partnerLabel = partner?.name?.trim() ? `${partner.name.trim()}님` : '상대방'

  async function chooseOwner(ownerId: string) {
    try {
      await setExerciseOwner(ownerId)
    } catch (error) {
      showToast({
        type: 'error',
        body: error instanceof ExerciseError ? error.message : '정하지 못했어요.',
      })
    } finally {
      await refresh()
    }
  }

  // 아직 아무도 안 골랐다 — 누가 하는지부터.
  if (!exerciser) {
    return (
      <VStack gap={3}>
        <VStack gap={0}>
          <Text weight="medium">누가 재활운동을 하나요?</Text>
          {!isCompact && (
            <Text type="supporting">
              고른 사람만 시작·종료를 누르고, 다른 한 사람은 진행 상황을 봐요.
            </Text>
          )}
        </VStack>
        {isCompact ? (
          <VStack gap={2}>
            <Button label="나" variant="secondary" width="100%" clickAction={() => chooseOwner(user.id)} />
            {partner && (
              <Button
                label={partnerName}
                variant="secondary"
                width="100%"
                clickAction={() => chooseOwner(partner.id)}
              />
            )}
          </VStack>
        ) : (
          <HStack gap={2}>
            <Button label="나" variant="secondary" width="100%" clickAction={() => chooseOwner(user.id)} />
            {partner && (
              <Button
                label={partnerName}
                variant="secondary"
                width="100%"
                clickAction={() => chooseOwner(partner.id)}
              />
            )}
          </HStack>
        )}
      </VStack>
    )
  }

  const phase = exercisePhase(exerciser)

  // 보는 사람 — 버튼 없이 상태만.
  if (exerciser.owner_id !== user.id) {
    return (
      <VStack gap={isCompact ? 2 : 3}>
        <StreakMeter
          title={watcherHeadline(partnerLabel, phase)}
          streak={exerciser.streak}
          isDone={phase === 'done'}
        />
        {!isCompact && (
          <Text type="supporting">
            연속 {exerciser.streak}일째 · 시작하고 끝내면 알림으로 알려드려요.
          </Text>
        )}
      </VStack>
    )
  }

  // 운동하는 사람.
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
        <StreakMeter
          title={`연속 ${exerciser.streak}일째`}
          streak={exerciser.streak}
          isDone={phase === 'done'}
        />
        {!isCompact && (
          <Text type="supporting">
            시작·종료를 누르면 {partnerLabel}에게 알림이 가요.
          </Text>
        )}
      </VStack>

      {button}
    </VStack>
  )
}
