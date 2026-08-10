import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useQuery } from '@tanstack/react-query'

import { BackButton } from '@/components/common/BackButton'
import { PageShell } from '@/components/common/PageShell'
import { useAuth } from '@/features/auth'
import { getProfile } from '../api/profile'
import { CustomizeForm } from '../components/CustomizeForm'

export function CustomizePage() {
  const { user } = useAuth()
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: user != null,
  })

  // This is now the first onboarding step, so during the initial run there is
  // nowhere to go back to -- "/" would just bounce right back here. The button
  // only makes sense once the couple is paired and the home screen exists.
  const canGoBack = profile?.couple_id != null

  return (
    <PageShell gap={6} isCentered maxWidth={384}>
      {canGoBack && <BackButton to="/" />}

      <VStack gap={1}>
        <Heading level={1} justify="center">
          우리 앱 꾸미기
        </Heading>
        <Text type="supporting" justify="center">
          우리만의 이름과 사진을 설정해보세요
        </Text>
      </VStack>

      <CustomizeForm />
    </PageShell>
  )
}
