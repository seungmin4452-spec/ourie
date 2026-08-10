import { Heading } from '@astryxdesign/core/Heading'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'

import { PageShell } from '@/components/common/PageShell'
import { SignUpForm } from '../components/SignUpForm'

export function SignUpPage() {
  return (
    <PageShell gap={6} isCentered maxWidth={384}>
      <VStack gap={1}>
        <Heading level={1} justify="center">
          회원가입
        </Heading>
        <Text type="supporting" justify="center">
          둘만의 공간을 시작해보세요
        </Text>
      </VStack>

      <SignUpForm />

      <Text type="supporting" justify="center">
        이미 계정이 있으신가요?{' '}
        <Link href="/login" hasUnderline>
          로그인
        </Link>
      </Text>
    </PageShell>
  )
}
