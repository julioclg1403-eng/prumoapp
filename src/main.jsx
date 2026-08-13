import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/* Sem isto, o service worker só confere se tem versão nova quando o
   navegador decide sozinho (padrão: a cada ~24h) — na prática, o
   Julio abria o app de novo minutos depois de um deploy e continuava
   vendo a versão de cache antiga, mesmo com o deploy já certo na
   Vercel. `registerType: 'autoUpdate'` (vite.config.js) já aplica a
   versão nova sem perguntar; só faltava mandar checar com mais
   frequência — toda vez que o app volta pra frente (reabre o
   celular) e a cada 5 minutos enquanto fica aberto. */
registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    if (!registration) return
    const conferir = () => registration.update()
    setInterval(conferir, 5 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') conferir()
    })
  },
})
