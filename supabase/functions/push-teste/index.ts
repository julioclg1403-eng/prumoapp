// ============================================================
// PUSH-TESTE — envia um push avulso pra um profile_id específico,
// pra confirmar que a entrega funciona de ponta a ponta num
// aparelho (foi assim que verificamos a inscrição do iPhone do
// Julio). Não é chamada pelo app -- só uso manual, protegida pelo
// mesmo segredo (x-cron-secret) das funções agendadas.
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

  let corpo: { profile_id?: string; mensagem?: string }
  try { corpo = await req.json() } catch { return json({ erro: 'Pedido inválido.' }, 400) }
  if (!corpo.profile_id) return json({ erro: 'Falta profile_id.' }, 400)

  const subs = await admin
    .from('push_subscriptions').select('id, endpoint, p256dh, auth')
    .eq('ativo', true).eq('profile_id', corpo.profile_id)

  let enviados = 0
  const erros: string[] = []
  for (const sub of subs.data || []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: 'Prumo — teste', body: corpo.mensagem || 'Notificação de teste.', url: '/', tag: 'push-teste' }),
      )
      enviados++
    } catch (erro) {
      const status = (erro as { statusCode?: number })?.statusCode
      erros.push(`${status}: ${(erro as Error)?.message}`)
      if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', sub.id)
    }
  }

  return json({ inscricoes: subs.data?.length || 0, enviados, erros }, 200)
})

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
}
