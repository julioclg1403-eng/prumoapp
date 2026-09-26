// ============================================================
// TRANSCRIÇÃO DE ÁUDIO -- botão de microfone em qualquer campo de
// texto do app. Mesma técnica do canal WhatsApp (Whisper), só que
// chamada direto pelo app, por um usuário logado.
//
// Checa o JWT aqui dentro também (além do verify_jwt de plataforma):
// sem isso, se o verify_jwt for desligado por engano, o endpoint
// vira público e qualquer um gasta a cota paga da OpenAI.
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const TAMANHO_MAXIMO = 20 * 1024 * 1024 // 20 MB -- folga grande sobre qualquer nota de voz

// Diferente do webhook do WhatsApp (chamado pela Meta, servidor a
// servidor), esta função é chamada direto do navegador -- precisa
// de CORS, senão o navegador bloqueia antes mesmo de o pedido sair.
// Restrito ao domínio real do app, não '*'.
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

  const mimeType = req.headers.get('content-type') || 'audio/webm'
  const bytes = new Uint8Array(await req.arrayBuffer())

  if (bytes.byteLength === 0) return json({ erro: 'Áudio vazio.' }, 400, CORS)
  if (bytes.byteLength > TAMANHO_MAXIMO) return json({ erro: 'Áudio muito longo. Grave em partes menores.' }, 400, CORS)

  const extensao = mimeType.includes('webm') ? 'webm'
    : mimeType.includes('mp4') ? 'm4a'
    : mimeType.includes('wav') ? 'wav' : 'ogg'

  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mimeType }), `audio.${extensao}`)
  form.append('model', 'whisper-1')
  form.append('language', 'pt')

  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
    body: form,
  })

  if (!r.ok) {
    console.error('[transcrever-audio] falha na OpenAI:', await r.text())
    return json({ erro: 'Não consegui transcrever o áudio agora.' }, 502, CORS)
  }

  const { text } = await r.json()
  return json({ texto: text || '' }, 200, CORS)
})

function json(corpo: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...headers, 'Content-Type': 'application/json' } })
}
