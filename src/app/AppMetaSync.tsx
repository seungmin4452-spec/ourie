import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { useAuth } from '@/features/auth'
import { getProfile } from '@/features/onboarding/api/profile'
import { pickRandomAvatarEmoji } from '@/lib/avatar-emojis'
import { renderEmojiIconDataUrl } from '@/lib/renderEmojiIcon'

function setMetaContent(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setAppleTouchIcon(href: string) {
  let el = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'apple-touch-icon')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

// Safari's "Add to Home Screen" reads the current document title and
// apple-touch-icon at the moment the user taps it, not a static value from
// first load. Keeping these synced to the logged-in couple's own nickname
// and photo means the home screen icon reflects what they set in customize,
// wherever in the app they happen to trigger the share sheet from.
export function AppMetaSync() {
  const { user } = useAuth()
  const [fallbackEmoji] = useState(pickRandomAvatarEmoji)
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: user != null,
  })

  useEffect(() => {
    // Logged out: leave the static defaults from index.html alone.
    if (!user) return

    const title = profile?.nickname?.trim() || 'Ourie'
    document.title = title
    setMetaContent('apple-mobile-web-app-title', title)

    if (profile?.avatar_url) {
      setAppleTouchIcon(profile.avatar_url)
    } else {
      const dataUrl = renderEmojiIconDataUrl(fallbackEmoji)
      if (dataUrl) setAppleTouchIcon(dataUrl)
    }
  }, [user, profile, fallbackEmoji])

  return null
}
