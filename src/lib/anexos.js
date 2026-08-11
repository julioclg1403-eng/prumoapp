/* ============================================================
   ANEXOS — arquivo genérico (PDF ou imagem), sem compressão.

   Diferente de fotos.js: aqui o arquivo é uma prova documental
   (uma prancha, uma nota técnica), não um registro visual do
   canteiro. Comprimir destruiria o que faz o PDF útil. Por isso
   vai para o bucket `anexos`, não `fotos` — limite maior (20 MB),
   e aceita application/pdf além de imagem.
   ============================================================ */

import { supabase } from './supabase'

export const TAMANHO_MAXIMO_BYTES = 20 * 1024 * 1024
const TIPOS_ACEITOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

function extensaoDe(arquivo) {
  const doNome = arquivo.name?.split('.').pop()?.toLowerCase()
  if (doNome && doNome.length <= 5) return doNome
  if (arquivo.type === 'application/pdf') return 'pdf'
  if (arquivo.type === 'image/png') return 'png'
  if (arquivo.type === 'image/webp') return 'webp'
  return 'jpg'
}

export async function enviarAnexoApontamento({ arquivo, organizationId, obraId, noteId, autorId = null }) {
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
    return { erro: 'Este arquivo passa de 20 MB.' }
  }
  if (!TIPOS_ACEITOS.includes(arquivo.type)) {
    return { erro: 'Envie um PDF ou uma imagem (JPEG, PNG ou WEBP).' }
  }

  const id = globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random())
  const caminho = `${obraId}/projetos/${noteId}/${id}.${extensaoDe(arquivo)}`

  const envio = await supabase.storage
    .from('anexos')
    .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false })
  if (envio.error) {
    return { erro: `Não consegui enviar o anexo. ${envio.error.message}` }
  }

  const registro = await supabase
    .from('project_note_attachments')
    .insert({
      organization_id: organizationId,
      worksite_id: obraId,
      note_id: noteId,
      caminho,
      nome_arquivo: arquivo.name,
      tipo_mime: arquivo.type,
      tamanho_bytes: arquivo.size,
      autor_id: autorId,
    })
    .select('*')
    .single()

  if (registro.error) {
    await supabase.storage.from('anexos').remove([caminho])
    return { erro: `Não consegui registrar o anexo. ${registro.error.message}` }
  }

  return { anexo: registro.data }
}

export async function apagarAnexoApontamento(anexo) {
  const doBanco = await supabase.from('project_note_attachments').delete().eq('id', anexo.id)
  if (doBanco.error) return { erro: `Não consegui apagar o anexo. ${doBanco.error.message}` }
  await supabase.storage.from('anexos').remove([anexo.caminho])
  return {}
}

/* Anexo único de comentário: mesmo bucket, mas o caminho/nome vão
   direto nas colunas do comentário — não existe uma linha de
   metadado separada, porque é sempre um arquivo só. */
export async function enviarAnexoComentario({ arquivo, obraId, noteId }) {
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
    return { erro: 'Este arquivo passa de 20 MB.' }
  }
  if (!TIPOS_ACEITOS.includes(arquivo.type)) {
    return { erro: 'Envie um PDF ou uma imagem (JPEG, PNG ou WEBP).' }
  }

  const id = globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random())
  const caminho = `${obraId}/projetos/${noteId}/comentarios/${id}.${extensaoDe(arquivo)}`

  const envio = await supabase.storage
    .from('anexos')
    .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false })
  if (envio.error) return { erro: `Não consegui enviar o anexo. ${envio.error.message}` }

  return { caminho, nome: arquivo.name }
}

export async function linksTemporariosAnexos(caminhos, segundos = 3600) {
  if (!caminhos || caminhos.length === 0) return {}
  const { data, error } = await supabase.storage
    .from('anexos')
    .createSignedUrls(caminhos, segundos)
  if (error) {
    console.error('[Prumo] gerar links dos anexos:', error)
    return {}
  }
  const mapa = {}
  data.forEach((item) => {
    if (item.signedUrl && !item.error) mapa[item.path] = item.signedUrl
  })
  return mapa
}

export function formatarTamanho(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
