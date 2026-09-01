/* ============================================================
   Service worker customizado — precache do "esqueleto" do app
   (JS/CSS/ícones, via Workbox) + notificações push.

   Trocado de generateSW (vite.config.js) para injectManifest só
   por causa disto: generateSW não permite código próprio dentro
   do service worker gerado, e os listeners de push abaixo
   precisam rodar ali.
   ============================================================ */

import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

self.skipWaiting()
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

/* Mesmo motivo do generateSW antigo (ver vite.config.js): dado ao
   vivo (obra, diário do dia) não pode cair em cache velho sem
   avisar, então só o esqueleto do app fica offline-ready — e o
   fallback de navegação (SPA) não vale para /functions/, senão
   intercepta a chamada de uma Edge Function. */
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/functions\//],
  }),
)

self.addEventListener('push', (event) => {
  let dados = {}
  try {
    dados = event.data ? event.data.json() : {}
  } catch {
    dados = { title: 'Prumo', body: event.data ? event.data.text() : '' }
  }
  const titulo = dados.title || 'Prumo'
  const opcoes = {
    body: dados.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: dados.tag || undefined,
    data: { url: dados.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(titulo, opcoes))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      const aberta = lista.find((c) => 'focus' in c && c.url.startsWith(self.location.origin))
      if (aberta) return aberta.focus()
      return self.clients.openWindow(url)
    }),
  )
})
