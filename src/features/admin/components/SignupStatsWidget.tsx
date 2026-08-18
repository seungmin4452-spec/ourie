import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useQuery } from '@tanstack/react-query'
import { RotateCw } from 'lucide-react'

import { getSignupStats } from '../api/stats'
import { RECENT_SIGNUP_WINDOW_DAYS } from '../limits'

interface StatTileProps {
  label: string
  value: number
}

/** 숫자 하나 + 라벨 한 줄. 위젯 제목(h2) 아래라 값은 h3로 둔다 —
 * display-3 스타일로 크게 보이되 문서 구조는 건너뛰지 않는다. */
function StatTile({ label, value }: StatTileProps) {
  return (
    <VStack gap={0.5}>
      <Text type="supporting">{label}</Text>
      <Heading level={3} type="display-3">
        <Text type="inherit" hasTabularNumbers>
          {value.toLocaleString('ko-KR')}
        </Text>
      </Heading>
    </VStack>
  )
}

/**
 * 관리자 위젯 "가입자 현황" — 지금까지 가입한 사람 수와 최근 활동을
 * 한눈에 본다.
 *
 * 순수 조회라 다른 위젯들과 달리 useMutation이 아니라 useQuery를 쓴다.
 * queryClient의 기본 staleTime(60초, providers.tsx)이 있어 관리자 모드를
 * 들락날락해도 매번 다시 읽지 않는다 — 그래서 새로고침 버튼을 따로 뒀다.
 */
export function SignupStatsWidget() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-signup-stats'],
    queryFn: getSignupStats,
  })

  return (
    <VStack gap={3}>
      <HStack hAlign="end">
        <IconButton
          label="현황 새로고침"
          tooltip="새로고침"
          variant="ghost"
          size="sm"
          icon={<RotateCw className="size-4" />}
          isLoading={isFetching}
          onClick={() => refetch()}
        />
      </HStack>

      {isLoading && (
        <Text type="supporting" justify="center">
          현황을 세는 중이에요.
        </Text>
      )}

      {isError && (
        <Text type="supporting" justify="center">
          {error instanceof Error ? error.message : '현황을 불러오지 못했어요.'}
        </Text>
      )}

      {data && (
        <HStack gap={6} wrap="wrap">
          <StatTile label="전체 가입자" value={data.totalUsers} />
          <StatTile label="연결된 커플" value={data.connectedCouples} />
          <StatTile
            label={`최근 ${RECENT_SIGNUP_WINDOW_DAYS}일 신규 가입`}
            value={data.recentSignups}
          />
          <StatTile label="알림 구독 기기" value={data.pushSubscriptions} />
        </HStack>
      )}
    </VStack>
  )
}
