import { Link } from '@astryxdesign/core/Link'

import { LoginForm } from '../components/LoginForm'

export function LoginPage() {
  return (
    <section className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">로그인</h1>
        <p className="mt-1 text-sm text-secondary">
          Ourie에서 우리의 추억을 이어가요
        </p>
      </div>
      <LoginForm />
      <p className="text-center text-sm text-secondary">
        아직 계정이 없으신가요?{' '}
        <Link href="/signup" hasUnderline>
          회원가입
        </Link>
      </p>
    </section>
  )
}
