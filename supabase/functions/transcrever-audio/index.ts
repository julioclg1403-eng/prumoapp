// ============================================================
// TRANSCRIÇÃO DE ÁUDIO -- botão de microfone em qualquer campo de
// texto do app. Mesma técnica do canal WhatsApp (Whisper), só que
// chamada direto pelo app, por um usuário logado (verify_jwt cuida
// disso -- só entra aqui quem já está autenticado no Prumo).
// ============================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const TAMANHO_MAXIMO = 20 * 1024 * 1024 // 20 MB -- folga grande sobre qualquer nota de voz

// Diferente do webhook do WhatsApp (chamado pela Meta, servidor a
// servidor), esta função é chamada direto do navegador -- precisa
// de CORS, senão o navegador bloqueia antes mesmo de o pedido sair.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Método não aceito.' }, 405)

  const mimeType = req.headers.get('content-type') || 'audio/webm'
  const bytes = new Uint8Array(await req.arrayBuffer())

  if (bytes.byteLength === 0) return json({ erro: 'Áudio vazio.' }, 400)
  if (bytes.byteLength > TAMANHO_MAXIMO) return json({ erro: 'Áudio muito longo. Grave em partes menores.' }, 400)

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
    return json({ erro: 'Não consegui transcrever o áudio agora.' }, 502)
  }

  const { text } = await r.json()
  return json({ texto: text || '' })
})

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
