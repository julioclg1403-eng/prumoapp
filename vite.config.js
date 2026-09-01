import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // injectManifest (não generateSW): o service worker próprio em
      // src/sw.js precisa de código customizado (listeners de push e
      // notificationclick para as notificações do módulo Lembretes),
      // que o generateSW não permite dentro do SW gerado.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      },
      includeAssets: ['favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Prumo',
        short_name: 'Prumo',
        description: 'Gestão de obra: diário, efetivo, pendências, cronograma e requisições.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#18181B',
        theme_color: '#18181B',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
