import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
      // App de dado ao vivo (obra, diário do dia) -- cachear a resposta da
      // API do Supabase renderia a tela com dado velho sem avisar. Só o
      // "esqueleto" do app (JS/CSS/ícones) fica offline-ready; os dados
      // sempre pedem rede.
      workbox: {
        navigateFallbackDenylist: [/^\/functions\//],
      },
    }),
  ],
})
