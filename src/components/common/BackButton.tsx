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
      onClick={() => navigate(to)}
      /* Button은 자기 좌우에 --spacing-3 여백을 갖고 있어서, 그냥 두면 화살표가
         페이지 여백(--spacing-4)보다 12px 더 안쪽에서 시작한다. 아래 카드·제목의
         왼쪽 선과 눈에 띄게 어긋나 보였다. 그만큼 되돌려 글자 기둥에 맞춘다. */
      className="-ms-3 self-start"
    />
  )
}
