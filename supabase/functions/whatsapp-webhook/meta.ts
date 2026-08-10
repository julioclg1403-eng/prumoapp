// ============================================================
// Fala com a WhatsApp Cloud API (Meta) direto -- sem Zapster, sem
// n8n. É a decisão de arquitetura do BRIEFING (seção 6): o outro
// projeto da casa (Comunicação PRO OBRA) usa Zapster e sofre com
// desconexão -- a instância cai sozinha e pede reconectar por QR
// code. A API oficial não tem esse problema.
// ============================================================

const VERSAO = 'v20.0'
const TOKEN = () => Deno.env.get('WHATSAPP_ACCESS_TOKEN')!
const PHONE_ID = () => Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!

export async function enviarTexto(para: string, corpo: string) {
  const r = await fetch(`https://graph.facebook.com/${VERSAO}/${PHONE_ID()}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: para, type: 'text',
      text: { body: corpo, preview_url: false },
    }),
  })
  if (!r.ok) console.error('[whatsapp] falha ao enviar texto:', await r.text())
}

// Duas chamadas: a primeira pega a URL temporária e assinada da
// mídia; a segunda baixa o arquivo. A URL sozinha não abre no
// navegador -- precisa do MESMO token nos dois passos.
export async function baixarMidia(mediaId: string): Promise<{ bytes: Uint8Array, mimeType: string } | null> {
  const meta = await fetch(`https://graph.facebook.com/${VERSAO}/${mediaId}`, {
    headers: { Authorization: `Bearer ${TOKEN()}` },
  })
  if (!meta.ok) { console.error('[whatsapp] falha ao obter metadado da mídia:', await meta.text()); return null }
  const { url, mime_type } = await meta.json()

  const arquivo = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN()}` } })
  if (!arquivo.ok) { console.error('[whatsapp] falha ao baixar mídia:', arquivo.status); return null }
  return { bytes: new Uint8Array(await arquivo.arrayBuffer()), mimeType: mime_type }
}

// Confere a assinatura do Meta (HMAC-SHA256 do corpo cru, com o
// segredo do app). Sem isto, qualquer um que descubra a URL do
// webhook consegue forjar uma "mensagem do WhatsApp" e gravar
// pendência/atualizar diário em nome de outra pessoa.
//
// Se o segredo ainda não foi configurado (fase de montagem, antes
// do app da Meta estar pronto), a checagem é pulada -- com aviso
// bem visível no log -- em vez de derrubar a função inteira.
export async function assinaturaValida(corpoCru: string, header: string | null): Promise<boolean> {
  const segredo = Deno.env.get('WHATSAPP_APP_SECRET')
  if (!segredo) {
    console.warn('[whatsapp] WHATSAPP_APP_SECRET não configurado -- pulei a checagem de assinatura.')
    return true
  }
  if (!header?.startsWith('sha256=')) return false

  const chave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const assinatura = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpoCru))
  const hex = [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `sha256=${hex}` === header
}
