// ============================================================
// SEND-PUSH — notificação push de módulo, disparada na hora que
// a ação acontece (diário finalizado, refeição lançada, pendência
// aberta, planejamento atualizado), não por horário.
//
// Diferente de push-lembretes (que roda por cron com um secret de
// servidor), esta é chamada pelo próprio navegador de quem fez a
// ação, logo depois que salvarDiario/salvarRefeicao/salvarPendencia/
// salvarPlanejado... tiverem sucesso (ver notificarRegra em
// DadosContext.jsx). Por isso a autenticação aqui é o JWT normal
// do usuário (verify_jwt do projeto), igual push-subscribe -- e por
// segurança só entrega para profile_ids da MESMA organização de
// quem chamou, nunca confiando cegamente na lista que veio do corpo
// do pedido.
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:contato@prumoapp.com'

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ erro: 'Método não aceito.' }, 405)
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return json({ erro: 'VAPID não configurado.' }, 500)

  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  if (!jwt) return json({ erro: 'Não autenticado.' }, 401)
  const quemChama = await admin.auth.getUser(jwt)
  if (quemChama.error || !quemChama.data.user) return json({ erro: 'Não autenticado.' }, 401)

  const perfil = await admin.from('profiles').select('organization_id').eq('id', quemChama.data.user.id).maybeSingle()
  if (!perfil.data) return json({ erro: 'Perfil não encontrado.' }, 404)

  let corpo: { profile_ids?: string[]; title?: string; body?: string; url?: string; tag?: string }
  try {
    corpo = await req.json()
  } catch {
    return json({ erro: 'Pedido inválido.' }, 400)
  }
  const { profile_ids: profileIds, title, body: mensagem, url, tag } = corpo
  if (!Array.isArray(profileIds) || !profileIds.length || !title || !mensagem) {
    return json({ erro: 'Faltam dados.' }, 400)
  }

  const destinatariosValidos = await admin
    .from('profiles').select('id')
    .eq('organization_id', perfil.data.organization_id)
    .in('id', profileIds)
  if (destinatariosValidos.error || !destinatariosValidos.data?.length) {
    return json({ enviados: 0 }, 200)
  }

  const subs = await admin
    .from('push_subscriptions').select('id, endpoint, p256dh, auth')
    .eq('ativo', true)
    .in('profile_id', destinatariosValidos.data.map((p) => p.id))

  let enviados = 0
  for (const sub of subs.data || []) {
    const payload = JSON.stringify({ title, body: mensagem, url: url || '/', tag })
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
      enviados++
    } catch (erro) {
      const status = erro?.statusCode
      if (status === 404 || status === 410) {
        await admin.from('push_subscriptions').delete().eq('id', sub.id)
      } else {
        console.error('[send-push] envio falhou:', status, erro?.message)
      }
    }
  }

  return json({ enviados }, 200)
})

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
}
