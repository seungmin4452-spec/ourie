import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/HStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { List, ListItem } from '@astryxdesign/core/List'
import { Selector } from '@astryxdesign/core/Selector'
import { Text } from '@astryxdesign/core/Text'
import { useToast } from '@astryxdesign/core/Toast'
import { Token } from '@astryxdesign/core/Token'
import { VStack } from '@astryxdesign/core/VStack'
import { useQuery } from '@tanstack/react-query'
import { RotateCw } from 'lucide-react'
import { useState } from 'react'

import { EXERCISE_STREAK_GOAL } from '@/features/exercise/message'
import { confirmExercise, getExerciseOverview, type AdminExerciseLog } from '../api/exercise'

type DayStatus = 'done' | 'admin' | 'unfinished' | 'none'

const STATUS_TOKEN: Record<DayStatus, { label: string; color: 'green' | 'blue' | 'orange' | 'gray' }> = {
  done: { label: '완료', color: 'green' },
  admin: { label: '관리자 인정', color: 'blue' },
  unfinished: { label: '종료 안 누름', color: 'orange' },
  none: { label: '기록 없음', color: 'gray' },
}

function dayStatus(log: AdminExerciseLog | undefined): DayStatus {
  if (!log) return 'none'
  if (log.admin_confirmed_at) return 'admin'
  if (log.started_at && log.ended_at) return 'done'
  if (log.started_at) return 'unfinished'
  return 'none'
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** "2026-10-25" → "10월 25일 (일)". 날짜 문자열만으로 계산해 기기 시간대와 무관하다. */
function dayLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
  return `${month}월 ${day}일 (${weekday})`
}

/**
 * 관리자 위젯 "재활운동 기록" — 운동은 했는데 시작/종료를 깜빡 안 누른 날을
 * "했다"고 인정해 준다. 인정한 날은 시작·종료를 다 누른 날과 똑같이 센다
 * (supabase/schema.sql의 exercise_day_done).
 *
 * 이미 시작·종료를 다 누른 날은 고칠 게 없어서 버튼을 두지 않는다. 인정을
 * 취소해도 그 사이 이미 준 소원권은 되돌리지 않는다 (admin_confirm_exercise).
 */
export function ExerciseAdminWidget() {
  const showToast = useToast()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-exercise-overview'],
    queryFn: getExerciseOverview,
  })

  // 처음엔 최근 기록이 있는 사람을 먼저 고른다 — 보통 운동하는 사람은 한 명이다.
  const people = data?.people ?? []
  const fallback = people.find((person) => person.logs.length > 0) ?? people[0]
  const person = people.find((candidate) => candidate.id === selectedId) ?? fallback

  async function toggle(date: string, confirm: boolean) {
    if (!person) return
    try {
      const { rewarded } = await confirmExercise({ ownerId: person.id, date, confirm })
      await refetch()
      showToast({
        type: 'info',
        body:
          rewarded > 0
            ? `인정했어요. ${EXERCISE_STREAK_GOAL}일을 채워 소원권이 ${rewarded}장 늘었어요.`
            : confirm
              ? '운동한 날로 인정했어요.'
              : '인정을 취소했어요.',
      })
    } catch (caught) {
      showToast({
        type: 'error',
        body: caught instanceof Error ? caught.message : '처리하지 못했어요.',
      })
    }
  }

  return (
    <VStack gap={3}>
      <HStack gap={2} vAlign="end">
        <Selector
          label="사람"
          placeholder="운동 기록을 볼 사람"
          width="100%"
          options={people.map((candidate) => ({
            value: candidate.id,
            label: candidate.name?.trim() || '이름 없음',
          }))}
          value={person?.id}
          onChange={setSelectedId}
          isDisabled={people.length === 0}
        />
        <IconButton
          label="기록 새로고침"
          tooltip="새로고침"
          variant="ghost"
          icon={<RotateCw className="size-4" />}
          isLoading={isFetching}
          onClick={() => refetch()}
        />
      </HStack>

      {isLoading && (
        <Text type="supporting" justify="center">
          기록을 불러오는 중이에요.
        </Text>
      )}

      {isError && (
        <Text type="supporting" justify="center">
          {error instanceof Error ? error.message : '기록을 불러오지 못했어요.'}
        </Text>
      )}

      {data && person && (
        <>
          <Text type="supporting">
            연속 {person.streak}/{EXERCISE_STREAK_GOAL}일 · 지금까지 받은 소원권 {person.rewards}장
          </Text>

          <List hasDividers density="compact">
            {data.days.map((date) => {
              const status = dayStatus(person.logs.find((log) => log.exercise_date === date))
              const token = STATUS_TOKEN[status]
              return (
                <ListItem
                  key={date}
                  label={dayLabel(date)}
                  description={<Token label={token.label} color={token.color} size="sm" />}
                  endContent={
                    status === 'admin' ? (
                      <Button
                        label="인정 취소"
                        variant="ghost"
                        size="sm"
                        clickAction={() => toggle(date, false)}
                      />
                    ) : status === 'done' ? undefined : (
                      <Button
                        label="했어요로 인정"
                        variant="secondary"
                        size="sm"
                        clickAction={() => toggle(date, true)}
                      />
                    )
                  }
                />
              )
            })}
          </List>
        </>
      )}

      {data && !person && (
        <Text type="supporting" justify="center">
          커플이 연결된 사람이 아직 없어요.
        </Text>
      )}
    </VStack>
  )
}
