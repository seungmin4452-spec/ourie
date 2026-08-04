import { useState } from 'react'

import { cn } from '@/lib/utils'

const DEFAULT_AVATAR_EMOJIS = [
  '💕', '💖', '💗', '💘', '💝', '🥰', '😍', '😻',
  '🐻', '🐰', '🦊', '🐼', '🦋', '🌸', '🍑', '⭐️',
]

function pickRandomEmoji() {
  return DEFAULT_AVATAR_EMOJIS[Math.floor(Math.random() * DEFAULT_AVATAR_EMOJIS.length)]
}

export function DefaultAvatar({ className }: { className?: string }) {
  const [emoji] = useState(pickRandomEmoji)

  return (
    <div
      className={cn('flex items-center justify-center bg-accent-muted text-5xl', className)}
      aria-hidden="true"
    >
      {emoji}
    </div>
  )
}
