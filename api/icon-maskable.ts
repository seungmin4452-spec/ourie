// Serves the couple's photo composited into an Android-safe-zone SVG, as a
// real image response at its own URL -- not inlined as a data: URI inside
// manifest.json. See _shared.ts's maskableIconSvg comment for why: an inline
// data URI here made the manifest large enough that Android's WebAPK signing
// step silently gave up and fell back to a favicon shortcut instead of a real
// installed app.
//
// api/manifest.ts points its 'maskable' icon entry at this endpoint.

import {
  fetchImageAsDataUrl,
  maskableIconSvg,
  requestOrigin,
  sanitizeIconUrl,
} from './_shared.js'

export const config = { runtime: 'edge' }

const BACKGROUND_COLOR = '#F1F4F7'

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const icon = sanitizeIconUrl(url.searchParams.get('icon'), requestOrigin(request))

  const photoDataUrl = await fetchImageAsDataUrl(icon)
  // Whoever is fetching this icon (the WebAPK signing server, or Chrome
  // itself) falls back to the manifest's 'any' icon -- the plain photo URL --
  // when this one 404s, so failing loudly here is safe.
  if (!photoDataUrl) return new Response('Not found', { status: 404 })

  return new Response(maskableIconSvg(photoDataUrl, BACKGROUND_COLOR), {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // Personalized per couple -- must never be shared by a CDN edge.
      'Cache-Control': 'private, no-store',
    },
  })
}
