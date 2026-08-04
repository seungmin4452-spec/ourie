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
    />
  )
}
