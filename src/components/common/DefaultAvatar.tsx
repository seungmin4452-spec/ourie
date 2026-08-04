import { useState } from 'react'

import { pickRandomAvatarEmoji } from '@/lib/avatar-emojis'
import { cn } from '@/lib/utils'

export function DefaultAvatar({ className }: { className?: string }) {
  const [emoji] = useState(pickRandomAvatarEmoji)

  return (
    <div
      className={cn('flex items-center justify-center bg-accent-muted text-5xl', className)}
      aria-hidden="true"
    >
      {emoji}
    </div>
  )
}
