// ============================================================
// PUSH-DIARIO-PENDENTE — cobrança automática: de segunda a
// sábado, por volta das 14h (horário de Brasília), avisa quem
// está cadastrado em Notificações (evento "diario_pendente") se
// o diário do dia AINDA não foi finalizado naquela obra.
//
// Chamada por um cron do banco (pg_cron + pg_net), igual
// push-lembretes -- mesmo esquema de autenticação por segredo
// compartilhado (x-cron-secret), porque não existe um usuário
// nesta chamada.
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

async function enviarPara(profileIds: string[], titulo: string, corpo: string, tag: string) {
  if (!profileIds.length) return 0
  const subs = await admin
    .from('push_subscriptions').select('id, endpoint, p256dh, auth')
    .eq('ativo', true)
    .in('profile_id', profileIds)

  let enviados = 0
  for (const sub of subs.data || []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: titulo, body: corpo, url: '/', tag }),
      )
      enviados++
    } catch (erro) {
      const status = erro?.statusCode
      if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', sub.id)
      else console.error('[push-diario-pendente] envio falhou:', status, erro?.message)
    }
  }
  return enviados
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ erro: 'Método não aceito.' }, 405)

  const segredo = req.headers.get('x-cron-secret') || ''
  if (!segredo || segredo !== Deno.env.get('CRON_SECRET')) return json({ erro: 'Não autorizado.' }, 401)
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return json({ erro: 'VAPID não configurado.' }, 500)

  // Data de hoje em horário de Brasília (UTC-3), não a do servidor (UTC).
  const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const obras = await admin.from('worksites').select('id, nome').eq('ativo', true)
  if (obras.error) {
    console.error('[push-diario-pendente]', obras.error)
    return json({ erro: 'Não consegui buscar as obras.' }, 500)
  }

  let avisados = 0
  let obrasComPendencia = 0

  for (const obra of obras.data || []) {
    const feito = await admin
      .from('daily_reports').select('id')
      .eq('worksite_id', obra.id).eq('data', hoje).eq('status', 'finalizado')
      .maybeSingle()
    if (feito.data) continue

    const regra = await admin
      .from('notification_rules').select('destinatarios_ids')
      .eq('worksite_id', obra.id).eq('modulo', 'diario_pendente')
      .maybeSingle()
    const destinatarios = regra.data?.destinatarios_ids || []
    if (!destinatarios.length) continue

    obrasComPendencia++
    avisados += await enviarPara(
      destinatarios,
      'Diário pendente',
      `O diário de hoje (${obra.nome}) ainda não foi finalizado.`,
      `diario-pendente-${obra.id}-${hoje}`,
    )
  }

  return json({ obrasComPendencia, avisados }, 200)
})

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
}
