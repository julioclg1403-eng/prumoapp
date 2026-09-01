// ============================================================
// PUSH-LEMBRETES — envia a notificação push de verdade quando um
// lembrete vence.
//
// Não é chamada pelo navegador: um cron do próprio banco (pg_cron
// + pg_net, agendado a cada minuto) chama esta função. Por isso a
// autenticação aqui não é o JWT do usuário (não existe um usuário
// nesta chamada) e sim um segredo compartilhado (x-cron-secret)
// conferido contra o secret CRON_SECRET desta função -- e por
// isso ela é publicada com verify_jwt desligado.
//
// Para cada lembrete pendente cujo horário (disparar_em) já
// passou e que ainda não foi notificado, manda push para o
// destinatário e todos os responsáveis que tiverem inscrição
// ativa, depois marca notificado_em (não tenta de novo no próximo
// minuto, esteja ou não inscrito ninguém).
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

  const segredo = req.headers.get('x-cron-secret') || ''
  if (!segredo || segredo !== Deno.env.get('CRON_SECRET')) {
    return json({ erro: 'Não autorizado.' }, 401)
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return json({ erro: 'VAPID não configurado.' }, 500)
  }

  const vencidos = await admin
    .from('reminders')
    .select('id, texto, local, destinatario_id, responsaveis_ids')
    .eq('status', 'pendente')
    .is('notificado_em', null)
    .lte('disparar_em', new Date().toISOString())
    .limit(200)

  if (vencidos.error) {
    console.error('[push-lembretes]', vencidos.error)
    return json({ erro: 'Não consegui buscar os lembretes.' }, 500)
  }

  let enviados = 0
  let processados = 0

  for (const lembrete of vencidos.data || []) {
    const idsAlvo = new Set<string>()
    if (lembrete.destinatario_id) idsAlvo.add(lembrete.destinatario_id)
    for (const id of lembrete.responsaveis_ids || []) idsAlvo.add(id)

    if (idsAlvo.size > 0) {
      const subs = await admin
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('ativo', true)
        .in('profile_id', Array.from(idsAlvo))

      for (const sub of subs.data || []) {
        const payload = JSON.stringify({
          title: 'Lembrete Prumo',
          body: lembrete.local ? `${lembrete.texto} — ${lembrete.local}` : lembrete.texto,
          url: '/',
          tag: `lembrete-${lembrete.id}`,
        })
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          )
          enviados++
        } catch (erro) {
          const status = erro?.statusCode
          if (status === 404 || status === 410) {
            await admin.from('push_subscriptions').delete().eq('id', sub.id)
          } else {
            console.error('[push-lembretes] envio falhou:', status, erro?.message)
          }
        }
      }
    }

    await admin.from('reminders').update({ notificado_em: new Date().toISOString() }).eq('id', lembrete.id)
    processados++
  }

  return json({ processados, enviados }, 200)
})

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
}
