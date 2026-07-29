import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { cn } from '@/lib/utils'

interface BackButtonProps {
  to: string
  label?: string
  className?: string
}

export function BackButton({ to, label = '뒤로', className }: BackButtonProps) {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className={cn(
        'inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground',
        className,
      )}
    >
      <ChevronLeft className="size-4" />
      {label}
    </button>
  )
}
