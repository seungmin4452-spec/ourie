import { BackButton } from '@/components/common/BackButton'
import { CustomizeForm } from '../components/CustomizeForm'

export function CustomizePage() {
  return (
    <section className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-6 px-4">
      <BackButton to="/" />
      <div className="text-center">
        <h1 className="text-2xl font-semibold">우리 앱 꾸미기</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          우리만의 이름과 사진을 설정해보세요
        </p>
      </div>
      <CustomizeForm />
    </section>
  )
}
