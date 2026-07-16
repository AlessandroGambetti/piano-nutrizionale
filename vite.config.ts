/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// base: './' finché il nome del repository GitHub Pages non è deciso;
// andrà fissata a '/<nome-repo>/' insieme a scope/start_url del manifest.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      // 'prompt' + banner in-app: mai autoUpdate cieco su PWA iOS installata (§1).
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Piano Nutrizionale',
        short_name: 'Piano',
        lang: 'it',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2f6b4f',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
  },
})
