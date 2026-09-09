// ============================================================
// MELHORAR TEXTO -- botão "Melhorar texto com IA" (Descrição e
// Comentários de Projetos, por enquanto). Reescreve num tom mais
// técnico, mantendo os dados originais. Passou a usar a OpenAI (em
// vez do prumo-chat, que é Anthropic) pra não gastar do saldo da
// Anthropic com uma tarefa simples de reescrever texto -- mesma
// chave OPENAI_API_KEY já usada em transcrever-audio.
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

const TAMANHO_MAXIMO_CARACTERES = 8000

Deno.serve(async (req: Request) => {
  const CORS = corsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Método não aceito.' }, 405, CORS)

  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  if (!jwt) return json({ erro: 'Não autenticado.' }, 401, CORS)
  const quemChama = await admin.auth.getUser(jwt)
  if (quemChama.error || !quemChama.data.user) return json({ erro: 'Não autenticado.' }, 401, CORS)

  const { texto } = await req.json().catch(() => ({ texto: '' }))
  if (!texto || typeof texto !== 'string' || !texto.trim()) {
    return json({ erro: 'Texto vazio.' }, 400, CORS)
  }
  if (texto.length > TAMANHO_MAXIMO_CARACTERES) {
    return json({ erro: 'Texto longo demais pra melhorar de uma vez.' }, 400, CORS)
  }

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: 'Você reescreve textos de apontamentos de obra em português, em tom mais técnico e '
            + 'profissional, apropriado para um relatório de engenharia/construção civil. Mantenha TODAS '
            + 'as informações (números, datas, códigos, nomes) exatamente como estão, sem inventar nada e '
            + 'sem remover nada. Responda só com o texto reescrito, sem aspas, sem comentário nenhum antes '
            + 'ou depois.',
        },
        { role: 'user', content: texto },
      ],
    }),
  })

  if (!r.ok) {
    console.error('[melhorar-texto] falha na OpenAI:', await r.text())
    return json({ erro: 'Não consegui melhorar o texto agora.' }, 502, CORS)
  }

  const data = await r.json()
  const melhorado = data?.choices?.[0]?.message?.content?.trim() || ''
  if (!melhorado) return json({ erro: 'Não consegui melhorar o texto agora.' }, 502, CORS)

  return json({ texto: melhorado }, 200, CORS)
})

function json(corpo: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...headers, 'Content-Type': 'application/json' } })
}
