import { Divider } from '@astryxdesign/core/Divider'
import { Heading } from '@astryxdesign/core/Heading'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'

import { PageShell } from '@/components/common/PageShell'
import { SignUpForm } from '../components/SignUpForm'
import { SocialAuthButtons } from '../components/SocialAuthButtons'

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

      {/* 소셜을 위에 둔다. 클릭 두 번이면 끝나는 길이고, 이름·비밀번호를 다
          채운 뒤에야 더 쉬운 길이 있었다는 걸 알게 되면 헛수고가 된다. */}
      <SocialAuthButtons />

      <Divider label="또는" />

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
