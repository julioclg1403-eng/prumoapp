// ============================================================
// PUSH-SUBSCRIBE — lado do navegador do Web Push.
//
// GET    -> devolve a chave pública VAPID (usada pelo hook para
//           assinar o PushManager no navegador).
// POST   -> salva/atualiza a inscrição (endpoint + chaves) do
//           perfil autenticado.
// DELETE -> remove a inscrição (usuário desativou no app, ou o
//           navegador cancelou a assinatura).
//
// verify_jwt (padrão do projeto) já garante que só chega aqui
// quem está autenticado no Prumo -- por isso a chave pública,
// que é pública por natureza do VAPID, também exige login: não
// tem motivo pra expor isto a quem não está logado no app.
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const ORIGENS_PERMITIDAS = new Set([
  'https://prumoapp-kohl.vercel.app',
  'http://localhost:5173',
])

function corsHeaders(origin: string | null) {
  const permitida = origin && ORIGENS_PERMITIDAS.has(origin) ? origin : 'https://prumoapp-kohl.vercel.app'
  return {
    'Access-Control-Allow-Origin': permitida,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Vary': 'Origin',
  }
}

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req: Request) => {
  const CORS = corsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  if (!jwt) return json({ erro: 'Não autenticado.' }, 401, CORS)

  const quemChama = await admin.auth.getUser(jwt)
  if (quemChama.error || !quemChama.data.user) return json({ erro: 'Não autenticado.' }, 401, CORS)
  const profileId = quemChama.data.user.id

  if (req.method === 'GET') {
    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    if (!publicKey) return json({ erro: 'Notificações push ainda não configuradas.' }, 500, CORS)
    return json({ publicKey }, 200, CORS)
  }

  const perfil = await admin.from('profiles').select('organization_id').eq('id', profileId).maybeSingle()
  if (!perfil.data) return json({ erro: 'Perfil não encontrado.' }, 404, CORS)

  if (req.method === 'POST') {
    let corpo: { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } }
    try {
      corpo = await req.json()
    } catch {
      return json({ erro: 'Pedido inválido.' }, 400, CORS)
    }
    const sub = corpo?.subscription
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return json({ erro: 'Inscrição inválida.' }, 400, CORS)
    }

    const r = await admin.from('push_subscriptions').upsert(
      {
        organization_id: perfil.data.organization_id,
        profile_id: profileId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: req.headers.get('User-Agent') || null,
        ativo: true,
      },
      { onConflict: 'endpoint' },
    )
    if (r.error) {
      console.error('[push-subscribe]', r.error)
      return json({ erro: 'Não consegui salvar a inscrição.' }, 500, CORS)
    }
    return json({ ok: true }, 200, CORS)
  }

  if (req.method === 'DELETE') {
    let corpo: { endpoint?: string }
    try {
      corpo = await req.json()
    } catch {
      corpo = {}
    }
    if (!corpo?.endpoint) return json({ erro: 'Falta o endpoint.' }, 400, CORS)

    const r = await admin.from('push_subscriptions').delete().eq('endpoint', corpo.endpoint).eq('profile_id', profileId)
    if (r.error) return json({ erro: 'Não consegui remover a inscrição.' }, 500, CORS)
    return json({ ok: true }, 200, CORS)
  }

  return json({ erro: 'Método não aceito.' }, 405, CORS)
})

function json(corpo: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...headers, 'Content-Type': 'application/json' } })
}
