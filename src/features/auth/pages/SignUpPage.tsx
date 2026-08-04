import { Link } from '@astryxdesign/core/Link'

import { SignUpForm } from '../components/SignUpForm'

export function SignUpPage() {
  return (
    <section className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">회원가입</h1>
        <p className="mt-1 text-sm text-secondary">
          둘만의 공간을 시작해보세요
        </p>
      </div>
      <SignUpForm />
      <p className="text-center text-sm text-secondary">
        이미 계정이 있으신가요?{' '}
        <Link href="/login" hasUnderline>
          로그인
        </Link>
      </p>
    </section>
  )
}
