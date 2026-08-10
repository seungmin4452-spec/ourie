import { Heading } from '@astryxdesign/core/Heading'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'

import { PageShell } from '@/components/common/PageShell'
import { LoginForm } from '../components/LoginForm'

export function LoginPage() {
  return (
    <PageShell gap={6} isCentered maxWidth={384}>
      <VStack gap={1}>
        <Heading level={1} justify="center">
          로그인
        </Heading>
        <Text type="supporting" justify="center">
          Ourie에서 우리의 추억을 이어가요
        </Text>
      </VStack>

      <LoginForm />

      <Text type="supporting" justify="center">
        아직 계정이 없으신가요?{' '}
        <Link href="/signup" hasUnderline>
          회원가입
        </Link>
      </Text>
    </PageShell>
  )
}
