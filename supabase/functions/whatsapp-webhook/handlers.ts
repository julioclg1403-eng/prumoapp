// ============================================================
// Um gravador por tipo de registro. Cada um escreve nas MESMAS
// tabelas que o app usa -- é o que o BRIEFING (seção 4) exige: o
// WhatsApp é um canal a mais, não um sistema paralelo.
// ============================================================

import { supabase } from './db.ts'
import type { Classificacao } from './ia.ts'

type Perfil = { id: string; organization_id: string; worksite_id: string }

export async function gravarPendencia(perfil: Perfil, dados: NonNullable<Classificacao['pendencia']>) {
  const { data, error } = await supabase.from('issues').insert({
    organization_id: perfil.organization_id,
    worksite_id: perfil.worksite_id,
    titulo: dados.titulo,
    descricao: dados.descricao,
    autor_id: perfil.id,
    origem: 'whatsapp',
  }).select('id').single()
  if (error) console.error('[handlers] gravar pendência:', error)
  return { tabela: 'issues', id: data?.id, erro: error?.message }
}

export async function gravarLembrete(perfil: Perfil, dados: NonNullable<Classificacao['lembrete']>) {
  const { data, error } = await supabase.from('reminders').insert({
    organization_id: perfil.organization_id,
    worksite_id: perfil.worksite_id,
    texto: dados.texto,
    criado_por: perfil.id,
    destinatario_id: perfil.id,
    disparar_em: dados.disparar_em,
    origem: 'whatsapp',
  }).select('id').single()
  if (error) console.error('[handlers] gravar lembrete:', error)
  return { tabela: 'reminders', id: data?.id, erro: error?.message }
}

/* Garante o diário do dia (rascunho), criando se ainda não existir --
   mesmo comportamento do app quando alguém tira a primeira foto do
   dia antes de ter salvo nada (DadosContext.jsx, garantirSalvo). */
async function diarioDeHoje(perfil: Perfil) {
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) // AAAA-MM-DD
  const existente = await supabase.from('daily_reports')
    .select('id').eq('worksite_id', perfil.worksite_id).eq('data', hoje).maybeSingle()
  if (existente.data) return existente.data.id

  const criado = await supabase.from('daily_reports').insert({
    organization_id: perfil.organization_id, worksite_id: perfil.worksite_id,
    data: hoje, status: 'rascunho', autor_id: perfil.id, atualizado_por: perfil.id,
  }).select('id').single()
  if (criado.error) { console.error('[handlers] criar diário do dia:', criado.error); return null }
  return criado.data.id
}

export async function gravarAndamentoServico(
  perfil: Perfil,
  dados: NonNullable<Classificacao['andamento']>,
  locais: { id: string; nome: string }[],
  servicos: { id: string; nome: string }[],
) {
  const local = locais.find((l) => l.nome === dados.local)
  const servico = servicos.find((s) => s.nome === dados.servico)
  if (!local || !servico) {
    return { tabela: 'daily_activities', id: undefined, erro: 'não reconheci o serviço ou o local' }
  }

  const reportId = await diarioDeHoje(perfil)
  if (!reportId) return { tabela: 'daily_activities', id: undefined, erro: 'não consegui abrir o diário do dia' }

  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

  // A frente PRECISA existir no planejamento -- é o mesmo registro que
  // o diário lê (BRIEFING, seção 4). Se ainda não tinha sido planejada
  // pra hoje, nasce agora, do mesmo jeito que "Nova frente" no app.
  let planejada = await supabase.from('planned_activities')
    .select('id').eq('worksite_id', perfil.worksite_id).eq('data', hoje)
    .eq('service_id', servico.id).eq('location_id', local.id).maybeSingle()
  if (!planejada.data) {
    const criada = await supabase.from('planned_activities').insert({
      organization_id: perfil.organization_id, worksite_id: perfil.worksite_id,
      data: hoje, service_id: servico.id, location_id: local.id,
    }).select('id').single()
    if (criada.error) { console.error('[handlers] criar frente planejada:', criada.error); return { tabela: 'daily_activities', id: undefined, erro: criada.error.message } }
    planejada = { data: criada.data } as typeof planejada
  }

  const atividade = await supabase.from('daily_activities').upsert({
    report_id: reportId, planned_id: planejada.data!.id, status: dados.status,
    atualizado_via: 'whatsapp', atualizado_por: perfil.id, atualizado_em: new Date().toISOString(),
  }, { onConflict: 'report_id,planned_id' }).select('id').single()
  if (atividade.error) console.error('[handlers] gravar andamento:', atividade.error)
  return { tabela: 'daily_activities', id: atividade.data?.id, erro: atividade.error?.message }
}

export async function gravarFotoDoDia(perfil: Perfil, bytes: Uint8Array, legenda: string | null) {
  const reportId = await diarioDeHoje(perfil)
  if (!reportId) return { tabela: 'daily_photos', id: undefined, erro: 'não consegui abrir o diário do dia' }

  const caminho = `${perfil.worksite_id}/${reportId}/${crypto.randomUUID()}.jpg`
  const subiu = await supabase.storage.from('fotos').upload(caminho, bytes, { contentType: 'image/jpeg' })
  if (subiu.error) { console.error('[handlers] subir foto:', subiu.error); return { tabela: 'daily_photos', id: undefined, erro: subiu.error.message } }

  const registro = await supabase.from('daily_photos').insert({
    organization_id: perfil.organization_id, worksite_id: perfil.worksite_id,
    report_id: reportId, caminho, legenda, tamanho_bytes: bytes.byteLength, autor_id: perfil.id,
  }).select('id').single()
  if (registro.error) {
    await supabase.storage.from('fotos').remove([caminho])
    console.error('[handlers] gravar foto:', registro.error)
    return { tabela: 'daily_photos', id: undefined, erro: registro.error.message }
  }
  return { tabela: 'daily_photos', id: registro.data.id, erro: undefined }
}
