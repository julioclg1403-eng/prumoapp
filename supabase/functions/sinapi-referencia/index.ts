// ============================================================
// REFERÊNCIA SINAPI -- Painel SINAPI (Produtividade > Dashboard).
// Pede pra IA achar a composição SINAPI de um serviço, com busca na
// web, e devolver só um JSON (sem prosa) pra virar gráfico. Passou a
// usar a OpenAI (Responses API, tool web_search nativa do gpt-4o-mini)
// em vez do prumo-chat (Anthropic) -- mesma ideia do melhorar-texto:
// não precisa do modelo mais caro pra essa tarefa, e libera saldo da
// Anthropic pro assistente de chat, que é mais crítico.
//
// Checa o JWT aqui dentro também (além do verify_jwt de plataforma):
// sem isso, se o verify_jwt for desligado por engano, o endpoint
// vira público e qualquer um gasta a cota paga da OpenAI.
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
  if (req.method !== 'POST') return json({ erro: 'Método não aceito.' }, 405, CORS)

  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  if (!jwt) return json({ erro: 'Não autenticado.' }, 401, CORS)
  const quemChama = await admin.auth.getUser(jwt)
  if (quemChama.error || !quemChama.data.user) return json({ erro: 'Não autenticado.' }, 401, CORS)

  const { prompt } = await req.json().catch(() => ({ prompt: '' }))
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return json({ erro: 'Prompt vazio.' }, 400, CORS)
  }

  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      tools: [{ type: 'web_search' }],
      instructions: 'Você busca referências técnicas de construção civil (SINAPI) na web. '
        + 'Responda SEMPRE e SOMENTE com um JSON válido, sem nenhum texto antes ou depois, '
        + 'sem bloco de código markdown (sem ```).',
      input: prompt,
    }),
  })

  if (!r.ok) {
    console.error('[sinapi-referencia] falha na OpenAI:', await r.text())
    return json({ erro: 'Não consegui buscar a referência do SINAPI agora.' }, 502, CORS)
  }

  const data = await r.json()
  const mensagem = (data?.output || []).find((item: { type: string }) => item.type === 'message')
  const texto = mensagem?.content?.[0]?.text || ''
  if (!texto) return json({ erro: 'Não consegui buscar a referência do SINAPI agora.' }, 502, CORS)

  return json({ texto }, 200, CORS)
})

function json(corpo: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...headers, 'Content-Type': 'application/json' } })
}
