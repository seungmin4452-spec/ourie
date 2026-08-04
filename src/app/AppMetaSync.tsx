import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { useAuth } from '@/features/auth'
import { getProfile } from '@/features/onboarding/api/profile'
import { pickRandomAvatarEmoji } from '@/lib/avatar-emojis'
import { renderEmojiIconDataUrl } from '@/lib/renderEmojiIcon'
import { cacheAppMeta } from './appMeta'

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

// Keeps apple-mobile-web-app-title / apple-touch-icon in sync with the
// logged-in couple's own nickname and photo, wherever in the app they open
// the share sheet from. document.title is deliberately left as the static
// "Ourie" from index.html: it drives the browser tab title and the Share
// Sheet's page-preview row, which should stay branded, whereas
// apple-mobile-web-app-title is the tag iOS documents specifically for the
// home-screen icon label -- that's the one the couple's nickname belongs on.
// Also caches the resolved values (see cacheAppMeta) so the *next* visit's
// index.html can apply them synchronously before this effect even runs --
// iOS Safari appears to read the title from the document's early state
// rather than tracking later DOM updates the way it does for the icon.
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
    setMetaContent('apple-mobile-web-app-title', title)

    const icon = profile?.avatar_url || renderEmojiIconDataUrl(fallbackEmoji)
    if (icon) {
      setAppleTouchIcon(icon)
      cacheAppMeta(title, icon)
    }
  }, [user, profile, fallbackEmoji])

  return null
}
