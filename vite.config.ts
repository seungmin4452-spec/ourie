import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// The app and its api/ functions are served from a single Vercel origin, so
// the PWA scope covers both. Keep this at the root: an out-of-scope
// navigation drops iOS out of standalone into an in-app browser, and there is
// no way back into the installed app from there.
const base = '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Ourie',
        short_name: 'Ourie',
        description: '둘만 사용하는 커플 전용 추억 관리 PWA',
        theme_color: '#F1F4F7',
        background_color: '#F1F4F7',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          {
            src: `${base}pwa-192x192.png`,
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: `${base}pwa-512x512.png`,
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
