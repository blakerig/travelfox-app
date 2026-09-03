import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // maplibre-gl bundles a separate worker file (maplibre-gl-worker.mjs) that
  // Vite 8's dependency pre-bundler (2026-09-03: this project is on
  // ^8.2.2) doesn't handle correctly - the optimizer records it as a
  // dependency but never actually emits it into node_modules/.vite/deps,
  // so the dev server throws "The file does not exist at
  // .../maplibre-gl-worker.mjs which is in the optimize deps directory"
  // as soon as Neighbourhoods.jsx imports maplibre-gl. Clearing the
  // node_modules/.vite cache did not fix this - it's not a stale-cache
  // problem, it's Vite's optimizer genuinely not knowing what to do with
  // this package's worker file. Excluding maplibre-gl from pre-bundling
  // entirely (Vite's own suggested fix, in the error message itself)
  // works around it: the browser loads it as plain ESM straight from
  // node_modules instead, which maplibre-gl v6's build already supports.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true,
      },
      manifest: {
        name: 'TravelFox',
        short_name: 'TravelFox',
        description: 'Discover restaurants and activities in cities.',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'pwa-icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})