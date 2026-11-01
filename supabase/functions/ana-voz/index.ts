// ============================================================
// VOZ DA ANA -- transforma o texto da resposta em áudio (voz de
// mulher, português do Brasil) pra Ana falar no app.
//
// Mesma defesa das outras funções chamadas do navegador: confere o
// JWT aqui dentro além do verify_jwt da plataforma, e restringe a
// origem ao domínio do app -- sem isso o endpoint viraria um
// gerador de áudio gratuito pago pela cota da OpenAI.
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const MAX_CARACTERES = 1500 // respostas de voz são curtas; corta o resto

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
)

const JEITO_DE_FALAR = 'Fale em português do Brasil, com voz de mulher, tom simpático, calmo e claro, '
  + 'em ritmo natural de conversa, como uma colega de obra que explica as coisas com objetividade. '
  + 'Pronuncie siglas e unidades como se fala no Brasil (m² = metros quadrados, R$ = reais).'

Deno.serve(async (req: Request) => {
  const CORS = corsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Método não aceito.' }, 405, CORS)

  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  if (!jwt) return json({ erro: 'Não autenticado.' }, 401, CORS)
  const quemChama = await admin.auth.getUser(jwt)
  if (quemChama.error || !quemChama.data.user) return json({ erro: 'Não autenticado.' }, 401, CORS)

  let texto = ''
  try {
    const corpo = await req.json()
    texto = String(corpo?.texto || '').trim()
  } catch {
    return json({ erro: 'Pedido inválido.' }, 400, CORS)
  }
  if (!texto) return json({ erro: 'Sem texto pra falar.' }, 400, CORS)
  if (texto.length > MAX_CARACTERES) texto = `${texto.slice(0, MAX_CARACTERES)}…`

  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: 'nova',
      input: texto,
      instructions: JEITO_DE_FALAR,
      response_format: 'mp3',
    }),
  })

  if (!r.ok) {
    console.error('[ana-voz] falha na OpenAI:', await r.text())
    return json({ erro: 'Não consegui gerar a voz agora.' }, 502, CORS)
  }

  return new Response(r.body, { headers: { ...CORS, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } })
})

function json(corpo: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...headers, 'Content-Type': 'application/json' } })
}
