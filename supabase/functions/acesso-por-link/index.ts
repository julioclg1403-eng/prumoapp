// ============================================================
// ACESSO POR LINK — quem recebeu um convite cria só a senha, e
// quem teve a troca de senha liberada cria a senha nova.
//
// A chave de serviço nunca sai daqui. Quem chama ainda não tem
// conta, então esta função NÃO exige login (publicar com
// "Verify JWT" desligado): a autorização é o código do convite,
// sorteado pelo banco, de uso único e com prazo. As regras estão
// em regras.js.
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { acessoPorLink } from './regras.js'

const ORIGENS_PERMITIDAS = new Set([
  'https://prumoapp-kohl.vercel.app',
  'http://localhost:5173',
])

function corsHeaders(origin: string | null) {
  const permitida = origin && ORIGENS_PERMITIDAS.has(origin) ? origin : 'https://prumoapp-kohl.vercel.app'
  return {
    'Access-Control-Allow-Origin': permitida,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

Deno.serve(async (req: Request) => {
  const CORS = corsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Método não aceito.' }, 405, CORS)

  let pedido: unknown
  try {
    pedido = await req.json()
  } catch {
    return json({ erro: 'Pedido inválido.' }, 400, CORS)
  }

  // nunca registrar o pedido: ele traz a senha e o código
  const r = await acessoPorLink(pedido, admin, (onde: string, erro: { message?: string }) =>
    console.error('[acesso-por-link]', onde, erro?.message))
  return json(r.corpo, r.status, CORS)
})

function json(corpo: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...headers, 'Content-Type': 'application/json' } })
}
