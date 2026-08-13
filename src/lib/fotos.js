/* ============================================================
   FOTOS — comprimir no celular antes de subir.

   Por que comprimir no aparelho, e não no servidor: a foto sai da
   câmera com 4 a 12 MB. Subir isso pela internet do canteiro, com
   sinal ruim, é o caminho mais curto para o mestre desistir de
   fotografar. Reduzida, ela vai com uns 250 KB — some a espera, e
   o custo de armazenamento cai junto.

   O arquivo vai para o Storage. No banco fica só o endereço dele.
   ============================================================ */

import { supabase } from './supabase'
import { formatarData } from './dominio'

/* 1600px, não 1200.
   A convenção do projeto sugeria 1200, mas foto de obra existe para
   provar coisa pequena: uma trinca, uma tubulação errada, um número
   de série. A 1200 esse detalhe some, e a foto deixa de servir para
   o que foi tirada. 1600 a 82% ainda cabe em ~250 KB. */
const LADO_MAXIMO = 1600
const QUALIDADE = 0.82

export const TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024

/* ── Compressão ─────────────────────────────────────────────── */

export async function comprimirImagem(arquivo) {
  let bitmap
  try {
    /* imageOrientation: 'from-image' é o que impede a foto tirada
       em pé de aparecer deitada. A câmera não gira os pixels — ela
       grava a rotação num campo à parte, e sem esta linha o navegador
       ignora esse campo ao desenhar. */
    bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(
      'Não consegui ler esta imagem. Se ela veio de um iPhone em formato HEIC, ' +
      'mude a câmera para "Mais compatível" nos ajustes e tente de novo.',
    )
  }

  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height))
  const largura = Math.round(bitmap.width * escala)
  const altura = Math.round(bitmap.height * escala)

  const tela = document.createElement('canvas')
  tela.width = largura
  tela.height = altura
  const ctx = tela.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, largura, altura)
  bitmap.close?.()

  const blob = await new Promise((resolve, reject) => {
    tela.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Falha ao comprimir a imagem.'))),
      'image/jpeg',
      QUALIDADE,
    )
  })

  return { blob, largura, altura }
}

/* ── Legenda automática ─────────────────────────────────────── */

/* Foto sem contexto vira foto inútil três meses depois. A legenda
   nasce pronta com serviço, local e data; a pessoa só complementa. */
export function legendaAutomatica({ servico, local, data }) {
  return [servico, local, data ? formatarData(data) : null].filter(Boolean).join(' · ')
}

/* ── Envio ──────────────────────────────────────────────────── */

/* O caminho SEMPRE começa pelo id da obra. Não é organização: é o
   que a política do Storage lê para decidir se você pode ver o
   arquivo. Mudar essa ordem quebra a permissão em silêncio. */
function montarCaminho(obraId, reportId) {
  const id = globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random())
  return `${obraId}/${reportId}/${id}.jpg`
}

export async function enviarFoto({
  arquivo, organizationId, obraId, reportId, activityId = null,
  legenda = null, autorId = null, principal = false,
}) {
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
    return { erro: 'Esta imagem passa de 10 MB. Tente tirar a foto de novo.' }
  }

  let comprimida
  try {
    comprimida = await comprimirImagem(arquivo)
  } catch (e) {
    return { erro: e.message }
  }

  const caminho = montarCaminho(obraId, reportId)

  const envio = await supabase.storage
    .from('fotos')
    .upload(caminho, comprimida.blob, { contentType: 'image/jpeg', upsert: false })

  if (envio.error) {
    return { erro: `Não consegui enviar a foto. ${envio.error.message}` }
  }

  /* Metadado só DEPOIS que o arquivo subiu. Na ordem inversa, uma
     falha de rede deixaria no banco a linha de uma foto que não
     existe — e a galeria mostraria um buraco. */
  const registro = await supabase
    .from('daily_photos')
    .insert({
      organization_id: organizationId,
      worksite_id: obraId,
      report_id: reportId,
      activity_id: activityId,
      caminho,
      legenda,
      largura: comprimida.largura,
      altura: comprimida.altura,
      tamanho_bytes: comprimida.blob.size,
      principal,
      autor_id: autorId,
    })
    .select('*')
    .single()

  if (registro.error) {
    /* Não deu para registrar: tira o arquivo órfão do armazenamento
       em vez de deixar lixo pago acumulando. */
    await supabase.storage.from('fotos').remove([caminho])
    return { erro: `Não consegui registrar a foto. ${registro.error.message}` }
  }

  return { foto: registro.data }
}

export async function apagarFoto(foto) {
  const doBanco = await supabase.from('daily_photos').delete().eq('id', foto.id)
  if (doBanco.error) return { erro: `Não consegui apagar a foto. ${doBanco.error.message}` }
  await supabase.storage.from('fotos').remove([foto.caminho])
  return {}
}

/* ── Fotos de pendência ───────────────────────────────────────
   Mesmo mecanismo das fotos do diário (comprime, sobe, só depois
   grava o metadado), só que penduradas em issue_photos em vez de
   daily_photos -- uma pendência não pertence a um diário. */
function montarCaminhoPendencia(obraId, issueId) {
  const id = globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random())
  return `${obraId}/pendencias/${issueId}/${id}.jpg`
}

export async function enviarFotoPendencia({
  arquivo, organizationId, obraId, issueId, legenda = null, autorId = null,
}) {
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
    return { erro: 'Esta imagem passa de 10 MB. Tente tirar a foto de novo.' }
  }

  let comprimida
  try {
    comprimida = await comprimirImagem(arquivo)
  } catch (e) {
    return { erro: e.message }
  }

  const caminho = montarCaminhoPendencia(obraId, issueId)

  const envio = await supabase.storage
    .from('fotos')
    .upload(caminho, comprimida.blob, { contentType: 'image/jpeg', upsert: false })
  if (envio.error) {
    return { erro: `Não consegui enviar a foto. ${envio.error.message}` }
  }

  const registro = await supabase
    .from('issue_photos')
    .insert({
      organization_id: organizationId,
      worksite_id: obraId,
      issue_id: issueId,
      caminho,
      legenda,
      largura: comprimida.largura,
      altura: comprimida.altura,
      tamanho_bytes: comprimida.blob.size,
      autor_id: autorId,
    })
    .select('*')
    .single()

  if (registro.error) {
    await supabase.storage.from('fotos').remove([caminho])
    return { erro: `Não consegui registrar a foto. ${registro.error.message}` }
  }

  return { foto: registro.data }
}

export async function apagarFotoPendencia(foto) {
  const doBanco = await supabase.from('issue_photos').delete().eq('id', foto.id)
  if (doBanco.error) return { erro: `Não consegui apagar a foto. ${doBanco.error.message}` }
  await supabase.storage.from('fotos').remove([foto.caminho])
  return {}
}

/* ── Fotos de segurança (ocorrência e advertência) ────────────
   Mesmo mecanismo de novo, generalizado desta vez -- é a terceira
   variação do mesmo padrão (a quarta, contando as duas aqui), então
   compensa um helper único em vez de mais um par de funções coladas. */
async function enviarFotoGenerica({
  arquivo, organizationId, obraId, tabela, colunaId, idValor, pasta, legenda = null, autorId = null,
}) {
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
    return { erro: 'Esta imagem passa de 10 MB. Tente tirar a foto de novo.' }
  }

  let comprimida
  try {
    comprimida = await comprimirImagem(arquivo)
  } catch (e) {
    return { erro: e.message }
  }

  const id = globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random())
  const caminho = `${obraId}/${pasta}/${idValor}/${id}.jpg`

  const envio = await supabase.storage
    .from('fotos')
    .upload(caminho, comprimida.blob, { contentType: 'image/jpeg', upsert: false })
  if (envio.error) {
    return { erro: `Não consegui enviar a foto. ${envio.error.message}` }
  }

  const registro = await supabase
    .from(tabela)
    .insert({
      organization_id: organizationId,
      worksite_id: obraId,
      [colunaId]: idValor,
      caminho,
      legenda,
      largura: comprimida.largura,
      altura: comprimida.altura,
      tamanho_bytes: comprimida.blob.size,
      autor_id: autorId,
    })
    .select('*')
    .single()

  if (registro.error) {
    await supabase.storage.from('fotos').remove([caminho])
    return { erro: `Não consegui registrar a foto. ${registro.error.message}` }
  }

  return { foto: registro.data }
}

async function apagarFotoGenerica(tabela, foto) {
  const doBanco = await supabase.from(tabela).delete().eq('id', foto.id)
  if (doBanco.error) return { erro: `Não consegui apagar a foto. ${doBanco.error.message}` }
  await supabase.storage.from('fotos').remove([foto.caminho])
  return {}
}

export const enviarFotoOcorrencia = (p) => enviarFotoGenerica({
  ...p, tabela: 'safety_occurrence_photos', colunaId: 'occurrence_id', idValor: p.occurrenceId, pasta: 'seguranca/ocorrencias',
})
export const apagarFotoOcorrencia = (foto) => apagarFotoGenerica('safety_occurrence_photos', foto)

export const enviarFotoAdvertencia = (p) => enviarFotoGenerica({
  ...p, tabela: 'warning_photos', colunaId: 'warning_id', idValor: p.warningId, pasta: 'seguranca/advertencias',
})
export const apagarFotoAdvertencia = (foto) => apagarFotoGenerica('warning_photos', foto)

export const enviarFotoEquipamento = (p) => enviarFotoGenerica({
  ...p, tabela: 'equipment_photos', colunaId: 'equipment_id', idValor: p.equipmentId, pasta: 'equipamentos',
})
export const apagarFotoEquipamento = (foto) => apagarFotoGenerica('equipment_photos', foto)

/* ── Exibição ───────────────────────────────────────────────── */

/* O balde é privado, então não existe endereço fixo para a imagem:
   é preciso pedir um link temporário. Pedimos em lote, porque uma
   galeria com 40 fotos faria 40 viagens de ida e volta. */
export async function linksTemporarios(caminhos, segundos = 3600) {
  if (!caminhos || caminhos.length === 0) return {}
  const { data, error } = await supabase.storage
    .from('fotos')
    .createSignedUrls(caminhos, segundos)
  if (error) {
    console.error('[Prumo] gerar links das fotos:', error)
    return {}
  }
  const mapa = {}
  data.forEach((item) => {
    if (item.signedUrl && !item.error) mapa[item.path] = item.signedUrl
  })
  return mapa
}

export async function baixarFoto(foto) {
  const { data, error } = await supabase.storage.from('fotos').download(foto.caminho)
  if (error) return { erro: `Não consegui baixar a foto. ${error.message}` }

  const url = URL.createObjectURL(data)
  const link = document.createElement('a')
  link.href = url
  link.download = `${(foto.legenda || 'foto').replace(/[^\w\s-]/g, '').trim() || 'foto'}.jpg`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return {}
}

export function formatarTamanho(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
