// A Web App Manifest carrying the couple's own name, served per request.
//
// The static /manifest.webmanifest can't do this -- it says "Ourie" for
// everyone -- but a manifest is what makes iOS treat the home-screen app as a
// real web app with a declared scope. Without one, iOS infers the scope from
// the URL that was added, and it infers it narrowly: the app launched, the
// install page's redirect to "/" fell outside it, and iOS dropped the whole
// thing into an in-app browser (bottom bar with back/share/"Open in Safari")
// before the app ever painted.
//
// Declaring scope "/" puts the entire app inside it, and start_url "/" means
// the icon launches straight into the app with no redirect hop at all.
//
// Name resolution works out on both iOS generations: 16.4+ prefers this
// manifest's name, older versions ignore the manifest and fall back to the
// apple-mobile-web-app-title that pwa-install.ts writes. Both are the
// couple's name. Same for icons vs. apple-touch-icon.

import { DEFAULT_TITLE, defaultIconUrl, requestOrigin, sanitizeIconUrl } from './_shared'

export const config = { runtime: 'edge' }

interface ManifestIcon {
  src: string
  sizes: string
  type?: string
}

export default function handler(request: Request): Response {
  const url = new URL(request.url)
  const origin = requestOrigin(request)
  const title = url.searchParams.get('title')?.trim() || DEFAULT_TITLE
  const icon = sanitizeIconUrl(url.searchParams.get('icon'), origin)

  const icons: ManifestIcon[] = [
    { src: `${origin}/pwa-192x192.png`, sizes: '192x192', type: 'image/png' },
    { src: `${origin}/pwa-512x512.png`, sizes: '512x512', type: 'image/png' },
  ]

  // Only describe the couple's photo when there actually is one. It comes out
  // of ImageCropDialog as a 512px square JPEG, so these values are accurate
  // rather than hopeful -- but the fallback is a PNG of another size, and
  // mislabelling that would be worse than leaving it to the defaults above.
  if (icon !== defaultIconUrl(origin)) {
    icons.unshift({ src: icon, sizes: '512x512', type: 'image/jpeg' })
  }

  const manifest = {
    id: '/',
    name: title,
    short_name: title,
    description: '둘만 사용하는 커플 전용 추억 관리 PWA',
    display: 'standalone',
    scope: '/',
    start_url: '/',
    theme_color: '#F1F4F7',
    background_color: '#F1F4F7',
    icons,
  }

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      // Personalized per couple -- must never be shared by a CDN edge.
      'Cache-Control': 'private, no-store',
    },
  })
}
