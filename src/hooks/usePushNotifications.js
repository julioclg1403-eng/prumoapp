/* ============================================================
   Notificações push do navegador (Web Push + VAPID), sem
   Firebase. Gerencia permissão + inscrição no PushManager e
   salva/remove a inscrição na Edge Function push-subscribe.

   Quem realmente dispara o envio é a Edge Function push-lembretes,
   chamada a cada minuto por um cron do banco — este hook só cuida
   do lado do navegador (pedir permissão, assinar, cancelar).
   ============================================================ */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

function suportado() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

function base64ParaUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const base64Seguro = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const bruto = window.atob(base64Seguro)
  const saida = new Uint8Array(bruto.length)
  for (let i = 0; i < bruto.length; i++) saida[i] = bruto.charCodeAt(i)
  return saida
}

export function usePushNotifications() {
  const [permissao, setPermissao] = useState(() => (suportado() ? Notification.permission : 'unsupported'))
  const [inscrito, setInscrito] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!suportado()) return
    navigator.serviceWorker.ready
      .then((registro) => registro.pushManager.getSubscription())
      .then((sub) => setInscrito(Boolean(sub)))
      .catch(() => {})
  }, [])

  const ativar = useCallback(async () => {
    if (!suportado()) {
      setErro('Este navegador não aceita notificações push.')
      return false
    }
    setCarregando(true)
    setErro('')
    try {
      const permissaoPedida = await Notification.requestPermission()
      setPermissao(permissaoPedida)
      if (permissaoPedida !== 'granted') {
        setErro('Notificações bloqueadas. Ative nas permissões do navegador para este site.')
        return false
      }

      const { data: chave, error: erroChave } = await supabase.functions.invoke('push-subscribe', { method: 'GET' })
      if (erroChave || !chave?.publicKey) {
        setErro('Não consegui configurar as notificações agora.')
        return false
      }

      const registro = await navigator.serviceWorker.ready
      let sub = await registro.pushManager.getSubscription()
      if (!sub) {
        sub = await registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ParaUint8Array(chave.publicKey),
        })
      }

      const { error: erroSalvar } = await supabase.functions.invoke('push-subscribe', {
        method: 'POST',
        body: { subscription: sub.toJSON() },
      })
      if (erroSalvar) {
        setErro('Não consegui salvar a inscrição agora.')
        return false
      }

      setInscrito(true)
      return true
    } catch {
      setErro('Não consegui ativar as notificações agora.')
      return false
    } finally {
      setCarregando(false)
    }
  }, [])

  const desativar = useCallback(async () => {
    if (!suportado()) return
    setCarregando(true)
    setErro('')
    try {
      const registro = await navigator.serviceWorker.ready
      const sub = await registro.pushManager.getSubscription()
      if (sub) {
        await supabase.functions.invoke('push-subscribe', { method: 'DELETE', body: { endpoint: sub.endpoint } })
        await sub.unsubscribe()
      }
      setInscrito(false)
    } catch {
      setErro('Não consegui desativar as notificações agora.')
    } finally {
      setCarregando(false)
    }
  }, [])

  return { suportado: suportado(), permissao, inscrito, carregando, erro, ativar, desativar }
}
