import { Divider } from '@astryxdesign/core/Divider'
import { Heading } from '@astryxdesign/core/Heading'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'

import { PageShell } from '@/components/common/PageShell'
import { LoginForm } from '../components/LoginForm'
import { SocialAuthButtons } from '../components/SocialAuthButtons'

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

      {/* 회원가입 화면과 같은 버튼, 같은 순서다. 소셜로 가입한 사람이 다시
          올 곳이 여기이고, 그때 버튼이 같은 자리에 있어야 찾는다. */}
      <SocialAuthButtons />

      <Divider label="또는" />

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
