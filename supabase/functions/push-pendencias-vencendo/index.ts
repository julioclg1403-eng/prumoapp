// ============================================================
// PUSH-PENDENCIAS-VENCENDO — de segunda a sábado de manhã, avisa
// diretamente o RESPONSÁVEL de cada pendência (issues.responsavel_id)
// cujo prazo é hoje e que ainda não foi resolvida.
//
// Diferente do resto de Notificações (que roteia por uma lista fixa
// cadastrada por módulo/obra): aqui o destinatário é dinâmico, o
// campo Responsável que já existe na própria pendência — não passa
// por notification_rules.
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
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ erro: 'Método não aceito.' }, 405)

  const segredo = req.headers.get('x-cron-secret') || ''
  if (!segredo || segredo !== Deno.env.get('CRON_SECRET')) return json({ erro: 'Não autorizado.' }, 401)
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return json({ erro: 'VAPID não configurado.' }, 500)

  // Data de hoje em horário de Brasília (UTC-3), não a do servidor (UTC).
  const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const vencendo = await admin
    .from('issues').select('id, titulo, responsavel_id')
    .eq('prazo', hoje)
    .in('status', ['aberta', 'em_andamento'])
    .not('responsavel_id', 'is', null)

  if (vencendo.error) {
    console.error('[push-pendencias-vencendo]', vencendo.error)
    return json({ erro: 'Não consegui buscar as pendências.' }, 500)
  }

  // Agrupa por responsável -- uma pessoa com três pendências no
  // mesmo dia recebe uma notificação por pendência, não três pushes
  // idênticos disputando o mesmo instante.
  const porResponsavel = new Map<string, string[]>()
  for (const p of vencendo.data || []) {
    const lista = porResponsavel.get(p.responsavel_id) || []
    lista.push(p.titulo)
    porResponsavel.set(p.responsavel_id, lista)
  }

  if (porResponsavel.size === 0) return json({ pessoasAvisadas: 0, avisados: 0 }, 200)

  const subs = await admin
    .from('push_subscriptions').select('id, profile_id, endpoint, p256dh, auth')
    .eq('ativo', true)
    .in('profile_id', Array.from(porResponsavel.keys()))

  let avisados = 0
  for (const sub of subs.data || []) {
    const titulos = porResponsavel.get(sub.profile_id) || []
    if (!titulos.length) continue
    const corpo = titulos.length === 1
      ? `Vence hoje: ${titulos[0]}`
      : `${titulos.length} pendências vencem hoje: ${titulos.join(', ')}`
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: 'Pendência vencendo hoje', body: corpo, url: '/', tag: `pendencia-vencendo-${sub.profile_id}-${hoje}` }),
      )
      avisados++
    } catch (erro) {
      const status = (erro as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', sub.id)
      else console.error('[push-pendencias-vencendo] envio falhou:', status, (erro as Error)?.message)
    }
  }

  return json({ pessoasAvisadas: porResponsavel.size, avisados }, 200)
})

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
}
