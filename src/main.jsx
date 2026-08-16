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

/* Duas partes pro app nunca ficar preso numa versão velha:

   1. Conferir com mais frequência que o padrão do navegador (~24h)
      se tem service worker novo — a cada 5 minutos e toda vez que o
      app volta pra frente (reabre o celular).
   2. Quando acha um novo (onNeedRefresh), forçar a troca e recarregar
      a página sozinho — sem isto, `registerType: 'autoUpdate'`
      baixa e ativa o service worker novo em segundo plano, mas a
      aba já aberta continua rodando o JavaScript velho, já carregado
      na memória, até alguém recarregar na mão. Foi exatamente isso
      que aconteceu: o deploy chegou certo na Vercel, mas quem já
      tinha o app aberto continuou vendo a tela antiga mesmo depois
      de fechar e reabrir, porque o "fechar" (minimizar) não é
      necessariamente um reload de verdade. */
const atualizarSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    atualizarSW(true)
  },
  onRegisteredSW(swUrl, registration) {
    if (!registration) return
    /* No canteiro o sinal cai — falha de rede aqui não pode virar
       erro não tratado no console à toa; só tenta de novo no
       próximo ciclo. */
    const conferir = () => registration.update().catch(() => {})
    setInterval(conferir, 5 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') conferir()
    })
  },
})
