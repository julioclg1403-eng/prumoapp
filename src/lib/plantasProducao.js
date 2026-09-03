/* ============================================================
   PLANTAS (Produtividade e Medição) — PDF da planta que recebe as
   marcações. Mesmo bucket `anexos` de anexos.js (20 MB, o bastante
   pra uma planta digitalizada), só que aceita exclusivamente PDF —
   diferente de anexo de pendência/apontamento, aqui não faz sentido
   uma "planta" ser uma foto solta.
   ============================================================ */

import { supabase } from './supabase'

export const TAMANHO_MAXIMO_BYTES = 20 * 1024 * 1024

export async function enviarPlantaProducao({ arquivo, organizationId, obraId, nome, autorId = null, serviceId, localId = null }) {
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
    return { erro: 'Este arquivo passa de 20 MB.' }
  }
  if (arquivo.type !== 'application/pdf') {
    return { erro: 'Envie um PDF.' }
  }

  const id = globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random())
  const caminho = `${obraId}/plantas/${id}.pdf`

  const envio = await supabase.storage
    .from('anexos')
    .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false })
  if (envio.error) {
    return { erro: `Não consegui enviar a planta. ${envio.error.message}` }
  }

  const registro = await supabase
    .from('production_plans')
    .insert({
      organization_id: organizationId,
      worksite_id: obraId,
      service_id: serviceId,
      nome: (nome || arquivo.name).trim(),
      caminho,
      enviado_por: autorId,
      local_id: localId || null,
    })
    .select('*')
    .single()

  if (registro.error) {
    await supabase.storage.from('anexos').remove([caminho])
    return { erro: `Não consegui registrar a planta. ${registro.error.message}` }
  }

  return { planta: registro.data }
}

export async function linkTemporarioPlanta(caminho, segundos = 3600) {
  const { data, error } = await supabase.storage.from('anexos').createSignedUrl(caminho, segundos)
  if (error) {
    console.error('[Prumo] gerar link da planta:', error)
    return null
  }
  return data?.signedUrl || null
}
