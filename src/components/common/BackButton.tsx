import { Button } from '@astryxdesign/core/Button'
import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface BackButtonProps {
  to: string
  label?: string
}

export function BackButton({ to, label = '뒤로' }: BackButtonProps) {
  const navigate = useNavigate()

  return (
    <Button
      variant="ghost"
      size="sm"
      icon={<ChevronLeft className="size-4" />}
      label={label}
      onClick={() => {
        // navigate(to)로 밀어 넣으면 같은 '/'라도 새 히스토리 항목이 생겨서
        // ScrollRestoration이 홈을 처음 보는 화면처럼 취급해 맨 위로 되돌린다.
        // 실제로 이 앱 안에서 넘어온 것이면(history.state.idx > 0) 브라우저
        // 뒤로가기와 같은 navigate(-1)을 써서 원래 항목으로 되돌아가야
        // 스크롤 위치도 같이 복원된다. 주소를 직접 열어 들어온 경우처럼 되돌아갈
        // 항목이 없을 때만 to로 이동한다.
        const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
        if (idx > 0) {
          navigate(-1)
        } else {
          navigate(to, { replace: true })
        }
      }}
      /* Button은 자기 좌우에 --spacing-3 여백을 갖고 있어서, 그냥 두면 화살표가
         페이지 여백(--spacing-4)보다 12px 더 안쪽에서 시작한다. 아래 카드·제목의
         왼쪽 선과 눈에 띄게 어긋나 보였다. 그만큼 되돌려 글자 기둥에 맞춘다. */
      className="-ms-3 self-start"
    />
  )
}
