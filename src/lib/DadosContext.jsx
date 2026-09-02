/* ============================================================
   ESTADO GLOBAL — agora falando com o Supabase.

   Continua valendo a regra que sustenta o app: NENHUMA tela grava
   sozinha. Tudo passa por aqui. É isso que garante que o contador
   do menu, o painel e a tela de detalhe mostrem sempre o mesmo
   número, e é o motivo de a troca do mock para o banco ter sido
   um arquivo só em vez de dez.

   Duas coisas importantes sobre o Supabase:
   1. Ele NÃO estoura erro. Devolve { data, error }. Um try/catch
      sem olhar o `error` não pega nada — o app segue achando que
      salvou. Por isso todo acesso aqui passa por checar().
   2. Uma gravação barrada pela permissão do banco não dá erro:
      ela simplesmente afeta ZERO linhas, em silêncio. Onde isso
      pode acontecer (cadastros, para o perfil de campo), a tela
      esconde o botão em vez de deixar o usuário clicar no nada.
   ============================================================ */

import { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import {
  hojeISO, servicoCorrespondeEtapa, nomeBaseDaEtapa, normalizarParaCasar,
  cronogramaGlobalCorrespondeEtapa, agruparPlanejamento, etapaCorrespondenteAoGrupo,
  descreverEdicaoApontamento, ROTULO_STATUS_APONTAMENTO, calcularVencimentoTreinamento,
  insumoCorrespondeMaterial, diarioDaData,
} from './dominio'
import {
  enviarFoto, apagarFoto, enviarFotoPendencia, apagarFotoPendencia,
  enviarFotoOcorrencia, apagarFotoOcorrencia, enviarFotoAdvertencia, apagarFotoAdvertencia,
  enviarFotoEquipamento, apagarFotoEquipamento,
} from './fotos'
import { enviarAnexoApontamento, apagarAnexoApontamento, enviarAnexoPendencia, apagarAnexoPendencia } from './anexos'
import { enviarPlantaProducao } from './plantasProducao'

const Ctx = createContext(null)

/* Nome do cadastro na tela -> nome da tabela no banco */
const TABELA = {
  empresas: 'companies',
  colaboradores: 'workers',
  locais: 'locations',
  servicos: 'services',
  tiposOcorrencia: 'occurrence_types',
  equipamentos: 'equipment',
  materiaisEstoque: 'stock_materials',
  materiaisEpi: 'epi_materials',
  disciplinasProjeto: 'project_disciplines',
  categoriasProjeto: 'project_categories',
  etapasProjeto: 'project_stages',
  statusDisciplinaProjeto: 'project_discipline_statuses',
  tiposTreinamento: 'training_types',
  estruturaPlanejada: 'workforce_plan',
  estruturaCustos: 'structure_items',
}

/* ATENÇÃO: isto é a lista de campos que o Supabase entende, não
   código JavaScript. NÃO escreva comentário aqui dentro — ele vai
   junto para o banco e invalida a consulta inteira, em silêncio.

   Sobre `report_id` nas fotos: parece redundante, já que a foto vem
   DENTRO do diário. Mas quem recebe a foto solta (a galeria, o visor)
   precisa saber a qual diário devolvê-la. Sem esse campo, apagar
   funcionava no banco e não acontecia na tela. */
const SELECT_DIARIO = `
  id, worksite_id, data, status, clima, observacao, autor_id, atualizado_em,
  presencas:daily_attendance ( worker_id, company_id, presente ),
  atividades:daily_activities (
    id, planned_id, status, observacao, atualizado_via, atualizado_por, atualizado_em,
    equipe:daily_activity_workers ( worker_id )
  ),
  ocorrencias:daily_occurrences ( id, tipo_id, descricao, activity_id ),
  fotos:daily_photos ( id, report_id, activity_id, caminho, legenda, largura, altura,
                       tamanho_bytes, principal, autor_id, created_at )
`

/* O banco devolve a equipe como lista de objetos; as telas esperam
   uma lista de ids. Normaliza aqui, num lugar só. */
function normalizarDiario(d) {
  return {
    ...d,
    presencas: d.presencas || [],
    ocorrencias: d.ocorrencias || [],
    fotos: d.fotos || [],
    atividades: (d.atividades || []).map((a) => ({
      ...a,
      worker_ids: (a.equipe || []).map((e) => e.worker_id),
    })),
  }
}

const OBRA_LEMBRADA = 'prumo:obra-escolhida'

/* Mesma regra do SELECT_DIARIO: sem comentário aqui dentro. */
const SELECT_APONTAMENTO = `
  id, organization_id, worksite_id, numero, titulo, descricao, status, prioridade, visibilidade,
  stage_id, category_ids, location_ids, etiquetas, autor_id, created_at, atualizado_em,
  disciplinas:project_note_disciplines ( id, discipline_id, status_id, prazo, concluido_em ),
  comentarios:project_note_comments (
    id, autor_id, texto, anexo_caminho, anexo_nome, created_at,
    anexos:project_note_comment_attachments ( id, caminho, nome_arquivo, tipo_mime, tamanho_bytes, autor_id, created_at )
  ),
  anexos:project_note_attachments ( id, caminho, nome_arquivo, tipo_mime, tamanho_bytes, autor_id, created_at ),
  historico:project_note_history ( id, autor_id, tipo, descricao, de_status, para_status, created_at )
`

/* O Supabase corta a resposta em ~1000 linhas por padrão, em
   silêncio — sem erro, só devolve menos linha do que existe. Foi o
   que aconteceu com o catálogo de material do Almoxarifado ao passar
   de 1500 registros: material sumindo do app sem explicação, não
   aparecia pra escolher em lugar nenhum, e lançamento antigo que
   apontava pra ele mostrava "removido". Por isso TODA busca de lista
   da carga inicial passa por aqui agora, não só a que já estourou —
   assim nenhuma tabela nova cria o mesmo problema silenciosamente
   quando crescer. `criarQuery` tem que devolver uma query NOVA a cada
   chamada (não dá pra reusar depois de um `.range()`), por isso
   recebe uma função, não a query pronta. */
async function buscarPaginado(criarQuery, tamanhoPagina = 1000) {
  let tudo = []
  let pagina = 0
  for (;;) {
    const r = await criarQuery().range(pagina * tamanhoPagina, pagina * tamanhoPagina + tamanhoPagina - 1)
    if (r.error) return r
    const lote = r.data || []
    tudo = tudo.concat(lote)
    if (lote.length < tamanhoPagina) break
    pagina++
  }
  return { data: tudo, error: null }
}

function normalizarApontamento(n) {
  return {
    ...n,
    disciplinas: n.disciplinas || [],
    comentarios: [...(n.comentarios || [])]
      .map((c) => ({ ...c, anexos: c.anexos || [] }))
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
    anexos: n.anexos || [],
    historico: [...(n.historico || [])].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
  }
}

export function DadosProvider({ perfil, children }) {
  const [tudo, setTudo] = useState(null)
  const [obraId, setObraId] = useState(() => {
    try { return localStorage.getItem(OBRA_LEMBRADA) } catch { return null }
  })
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  /* Marca se o componente ainda está na tela, para não tentar
     atualizar o estado de algo que já saiu.
     ATENÇÃO: religar no corpo do efeito é obrigatório. O React
     monta, desmonta e remonta cada componente em desenvolvimento
     justamente para achar descuido aqui — sem a linha de cima,
     o desmonte falso apagava o marcador para sempre e TODA carga
     de dados era descartada em silêncio. */
  const vivo = useRef(true)

  useEffect(() => {
    vivo.current = true
    return () => { vivo.current = false }
  }, [])

  const avisarErro = useCallback((mensagem) => {
    setErro(mensagem)
    setTimeout(() => vivo.current && setErro(''), 6000)
  }, [])

  /* Todo acesso ao banco passa por aqui. Sem isto, um erro de
     permissão ou de rede vira silêncio. */
  const checar = useCallback((resposta, oQue) => {
    if (resposta.error) {
      console.error(`[Prumo] ${oQue}:`, resposta.error)
      avisarErro(`Não consegui ${oQue}. ${resposta.error.message}`)
      return null
    }
    return resposta.data
  }, [avisarErro])

  // ── Carga inicial ─────────────────────────────────────────
  const recarregar = useCallback(async () => {
    const [
      org, obra, perfis, empresas, colaboradores, locais, servicos,
      tiposOcorrencia, planejamento, diarios, pendencias, materiais, cronograma, lembretes,
      contatosWhatsapp, equipamentos, ocorrenciasSeguranca, advertencias,
      disciplinasProjeto, categoriasProjeto, etapasProjeto, statusDisciplinaProjeto, apontamentos,
      servicosCronograma, materiaisEstoque, entradasEstoque, saidasEstoque, refeicoes,
      planejamentoOverrides, cronogramaGlobal, semanasTaticas,
      materiaisEpi, entradasEpi, saidasEpi,
      tiposTreinamento, treinamentosColaboradores,
      suprimentos, entregasEquipamento, contratos, previsionProjectLinks, motivosNaoExecutado, metasMensais,
      estruturaPlanejada, estruturaCustos, movimentosEstoque, isencoesTreinamento, regrasNotificacao,
      tiposServico, servicosProducao, plantasProducao, marcadoresProducao, eventosProducao,
    ] = await Promise.all([
      supabase.from('organizations').select('*').limit(1).maybeSingle(),
      buscarPaginado(() => supabase.from('worksites').select('*').order('nome')),
      buscarPaginado(() => supabase.from('profiles').select('*').order('nome')),
      buscarPaginado(() => supabase.from('companies').select('*').order('nome')),
      buscarPaginado(() => supabase.from('workers').select('*').order('nome')),
      buscarPaginado(() => supabase.from('locations').select('*').order('ordem')),
      buscarPaginado(() => supabase.from('services').select('*').order('nome')),
      buscarPaginado(() => supabase.from('occurrence_types').select('*').order('ordem')),
      buscarPaginado(() => supabase.from('planned_activities').select('*').order('data', { ascending: false })),
      buscarPaginado(() => supabase.from('daily_reports').select(SELECT_DIARIO).order('data', { ascending: false })),
      buscarPaginado(() => supabase.from('issues').select('*, fotos:issue_photos(*), anexos:issue_attachments(*)').order('prazo', { nullsFirst: false })),
      buscarPaginado(() => supabase.from('materials').select('*').order('usos', { ascending: false })),
      buscarPaginado(() => supabase.from('schedule_items').select('*').order('data_inicio')),
      buscarPaginado(() => supabase.from('reminders').select('*').order('disparar_em')),
      buscarPaginado(() => supabase.from('whatsapp_contacts').select('*').order('created_at', { ascending: false })),
      buscarPaginado(() => supabase.from('equipment').select('*, fotos:equipment_photos(*)').order('nome')),
      buscarPaginado(() => supabase.from('safety_occurrences').select('*, fotos:safety_occurrence_photos(*)').order('data', { ascending: false })),
      buscarPaginado(() => supabase.from('warnings').select('*, fotos:warning_photos(*)').order('data', { ascending: false })),
      buscarPaginado(() => supabase.from('project_disciplines').select('*').order('ordem')),
      buscarPaginado(() => supabase.from('project_categories').select('*').order('ordem')),
      buscarPaginado(() => supabase.from('project_stages').select('*').order('ordem')),
      buscarPaginado(() => supabase.from('project_discipline_statuses').select('*').order('ordem')),
      buscarPaginado(() => supabase.from('project_notes').select(SELECT_APONTAMENTO).order('created_at', { ascending: false })),
      buscarPaginado(() => supabase.from('schedule_item_services').select('*')),
      buscarPaginado(() => supabase.from('stock_materials').select('*').order('nome')),
      buscarPaginado(() => supabase.from('stock_entries').select('*').order('data', { ascending: false })),
      buscarPaginado(() => supabase.from('stock_exits').select('*').order('data', { ascending: false })),
      buscarPaginado(() => supabase.from('meal_records').select('*').order('data', { ascending: false })),
      buscarPaginado(() => supabase.from('planned_group_overrides').select('*')),
      buscarPaginado(() => supabase.from('schedule_global_items').select('*').order('data_inicio')),
      buscarPaginado(() => supabase.from('issue_semanas_taticas').select('*')),
      buscarPaginado(() => supabase.from('epi_materials').select('*').order('nome')),
      buscarPaginado(() => supabase.from('epi_entries').select('*').order('data', { ascending: false })),
      buscarPaginado(() => supabase.from('epi_exits').select('*').order('data', { ascending: false })),
      buscarPaginado(() => supabase.from('training_types').select('*').order('nome')),
      buscarPaginado(() => supabase.from('worker_trainings').select('*').order('data_realizacao', { ascending: false })),
      buscarPaginado(() => supabase.from('supply_orders').select('*').order('pedido', { ascending: false })),
      buscarPaginado(() => supabase.from('equipment_deliveries').select('*').order('data', { ascending: false })),
      buscarPaginado(() => supabase.from('contract_items').select('*').order('cod_contrato')),
      buscarPaginado(() => supabase.from('prevision_project_links').select('*')),
      buscarPaginado(() => supabase.from('planned_activity_delay_reasons').select('*')),
      buscarPaginado(() => supabase.from('prevision_metas_mensais').select('*')),
      buscarPaginado(() => supabase.from('workforce_plan').select('*').order('nome')),
      buscarPaginado(() => supabase.from('structure_items').select('*').order('nome')),
      buscarPaginado(() => supabase.from('stock_movements').select('*').order('periodo_fim', { ascending: false })),
      buscarPaginado(() => supabase.from('worker_training_exemptions').select('*')),
      buscarPaginado(() => supabase.from('notification_rules').select('*')),
      buscarPaginado(() => supabase.from('service_types').select('*').order('nome')),
      buscarPaginado(() => supabase.from('production_services').select('*').order('created_at', { ascending: false })),
      buscarPaginado(() => supabase.from('production_plans').select('*').order('created_at', { ascending: false })),
      buscarPaginado(() => supabase.from('production_markers').select('*')),
      buscarPaginado(() => supabase.from('production_marker_events').select('*').order('data_execucao', { ascending: false })),
    ])

    const falhou = [org, obra, perfis, empresas, colaboradores, locais, servicos,
      tiposOcorrencia, planejamento, diarios, pendencias, materiais, cronograma, lembretes,
      contatosWhatsapp, equipamentos, ocorrenciasSeguranca, advertencias,
      disciplinasProjeto, categoriasProjeto, etapasProjeto, statusDisciplinaProjeto, apontamentos,
      servicosCronograma, materiaisEstoque, entradasEstoque, saidasEstoque, refeicoes,
      planejamentoOverrides, cronogramaGlobal, semanasTaticas,
      materiaisEpi, entradasEpi, saidasEpi,
      tiposTreinamento, treinamentosColaboradores, suprimentos, entregasEquipamento, contratos,
      previsionProjectLinks, motivosNaoExecutado, metasMensais, estruturaPlanejada, estruturaCustos,
      movimentosEstoque, isencoesTreinamento, regrasNotificacao,
      tiposServico, servicosProducao, plantasProducao, marcadoresProducao, eventosProducao].find((r) => r.error)
    if (falhou) {
      console.error('[Prumo] carregar dados:', falhou.error)
      avisarErro(`Não consegui carregar os dados. ${falhou.error.message}`)
    }

    if (!vivo.current) return

    const obras = (obra.data || []).filter((o) => o.ativo !== false)

    /* Escolhe a obra: a última que a pessoa usou, senão a do
       cadastro dela, senão a primeira — sempre dentro do que foi
       liberado pra ela. Sem este recorte aqui, uma obra guardada no
       localStorage de antes de ser restringida ficaria presa (nem
       aparece na lista pra trocar, nem desmarca sozinha). */
    const permitidas = (perfil.role === 'admin' || !perfil.obras_permitidas)
      ? obras
      : obras.filter((o) => perfil.obras_permitidas.includes(o.id))
    setObraId((atual) => {
      if (atual && permitidas.some((o) => o.id === atual)) return atual
      return permitidas.find((o) => o.id === perfil.worksite_id)?.id || permitidas[0]?.id || null
    })

    setTudo({
      org: org.data || { id: null, nome: '' },
      obras,
      perfis: perfis.data || [],
      empresas: empresas.data || [],
      colaboradores: (colaboradores.data || []).map((c) => ({ ...c, criado_em: c.created_at })),
      locais: locais.data || [],
      servicos: servicos.data || [],
      tiposOcorrencia: tiposOcorrencia.data || [],
      planejamento: planejamento.data || [],
      diarios: (diarios.data || []).map(normalizarDiario),
      pendencias: (pendencias.data || []).map((p) => ({ ...p, fotos: p.fotos || [], anexos: p.anexos || [] })),
      /* O catálogo de materiais é da organização, não da obra —
         por isso não passa pelo filtro de obra mais abaixo. */
      materiais: materiais.data || [],
      cronograma: cronograma.data || [],
      lembretes: lembretes.data || [],
      contatosWhatsapp: contatosWhatsapp.data || [],
      equipamentos: (equipamentos.data || []).map((e) => ({ ...e, fotos: e.fotos || [] })),
      ocorrenciasSeguranca: (ocorrenciasSeguranca.data || []).map((o) => ({ ...o, fotos: o.fotos || [] })),
      advertencias: (advertencias.data || []).map((a) => ({ ...a, fotos: a.fotos || [] })),
      disciplinasProjeto: disciplinasProjeto.data || [],
      categoriasProjeto: categoriasProjeto.data || [],
      etapasProjeto: etapasProjeto.data || [],
      statusDisciplinaProjeto: statusDisciplinaProjeto.data || [],
      apontamentos: (apontamentos.data || []).map(normalizarApontamento),
      servicosCronograma: servicosCronograma.data || [],
      materiaisEstoque: materiaisEstoque.data || [],
      entradasEstoque: entradasEstoque.data || [],
      saidasEstoque: saidasEstoque.data || [],
      refeicoes: refeicoes.data || [],
      planejamentoOverrides: planejamentoOverrides.data || [],
      cronogramaGlobal: cronogramaGlobal.data || [],
      semanasTaticas: semanasTaticas.data || [],
      materiaisEpi: materiaisEpi.data || [],
      entradasEpi: entradasEpi.data || [],
      saidasEpi: saidasEpi.data || [],
      tiposTreinamento: tiposTreinamento.data || [],
      treinamentosColaboradores: treinamentosColaboradores.data || [],
      suprimentos: suprimentos.data || [],
      entregasEquipamento: entregasEquipamento.data || [],
      contratos: contratos.data || [],
      previsionProjectLinks: previsionProjectLinks.data || [],
      motivosNaoExecutado: motivosNaoExecutado.data || [],
      metasMensais: metasMensais.data || [],
      estruturaPlanejada: estruturaPlanejada.data || [],
      estruturaCustos: estruturaCustos.data || [],
      movimentosEstoque: movimentosEstoque.data || [],
      isencoesTreinamento: isencoesTreinamento.data || [],
      regrasNotificacao: regrasNotificacao.data || [],
      /* Catálogo de tipos de serviço (Produtividade e Medição) é da
         organização, mesmo motivo do catálogo de materiais acima —
         reutilizável entre obras, não passa pelo filtro de obra. */
      tiposServico: tiposServico.data || [],
      servicosProducao: servicosProducao.data || [],
      plantasProducao: plantasProducao.data || [],
      marcadoresProducao: marcadoresProducao.data || [],
      eventosProducao: eventosProducao.data || [],
    })
  }, [perfil.worksite_id, perfil.role, perfil.obras_permitidas, avisarErro])

  useEffect(() => { recarregar() }, [recarregar])

  // ── Consultas de apoio ────────────────────────────────────
  const nomeDe = useCallback((lista, id, vazio = '—') => {
    const item = (lista || []).find((x) => x.id === id)
    return item ? item.nome : vazio
  }, [])

  const rotuloAtividade = useCallback(
    (plannedId) => {
      if (!tudo) return { servico: '…', local: '…', empresa: '…', planejada: null }
      const pl = tudo.planejamento.find((p) => p.id === plannedId)
      if (!pl) return { servico: 'Atividade removida', local: '—', empresa: '—', planejada: null }
      return {
        servico: nomeDe(tudo.servicos, pl.service_id),
        local: nomeDe(tudo.locais, pl.location_id),
        empresa: nomeDe(tudo.empresas, pl.company_id),
        planejada: pl,
      }
    },
    [tudo, nomeDe],
  )

  const colaboradorPorId = useCallback(
    (id) => (tudo ? tudo.colaboradores.find((c) => c.id === id) || null : null), [tudo],
  )
  const perfilPorId = useCallback(
    (id) => (tudo ? tudo.perfis.find((p) => p.id === id) || null : null), [tudo],
  )

  /* Busca um material do estoque em QUALQUER obra, não só na atual —
     é o que permite o link do QR Code (useAbrirQrMaterial) achar o
     material antes mesmo de saber se precisa trocar de obra. */
  const materialEstoquePorId = useCallback(
    (id) => (tudo ? tudo.materiaisEstoque.find((m) => m.id === id) || null : null), [tudo],
  )

  /* Mesma ideia, pro estoque de EPI (useAbrirQrMaterial também lê
     etiqueta de EPI, então precisa achar em qualquer obra). */
  const materialEpiPorId = useCallback(
    (id) => (tudo ? tudo.materiaisEpi.find((m) => m.id === id) || null : null), [tudo],
  )

  const escopo = useCallback(
    () => ({ organization_id: perfil.organization_id, worksite_id: obraId }),
    [perfil.organization_id, obraId],
  )

  /* Notificação push por módulo (Notificações, em Cadastros) — bem
     diferente da de Lembretes (que é por horário, via cron): esta
     dispara na hora que a ação acontece, para quem foi cadastrado
     como destinatário daquele módulo naquela obra. Silenciosa em
     erro de propósito — notificar é um "a mais" que nunca pode
     travar o salvamento em si. */
  const notificarRegra = useCallback((modulo, { titulo, corpo }) => {
    const regra = tudo?.regrasNotificacao?.find((r) => r.worksite_id === obraId && r.modulo === modulo)
    const alvos = (regra?.destinatarios_ids || []).filter((id) => id !== perfil.id)
    if (!alvos.length) return
    supabase.functions.invoke('send-push', {
      body: { profile_ids: alvos, title: titulo, body: corpo, url: '/' },
    }).catch(() => {})
  }, [tudo, obraId, perfil.id])

  /* ── A obra escolhida filtra TUDO ────────────────────────────
     O recorte acontece aqui, num lugar só, e não em cada tela.
     Se cada tela filtrasse por conta própria, bastaria uma
     esquecer para o efetivo da YACHT aparecer somado ao da SEDE —
     e ninguém perceberia, porque o número continuaria plausível.
     O banco também separa por obra; isto é a camada de cima. */
  const daObra = useMemo(() => {
    if (!tudo) return null
    const filtrar = (lista) => lista.filter((x) => x.worksite_id === obraId)
    return {
      obra: tudo.obras.find((o) => o.id === obraId) || { id: null, nome: 'Sem obra' },
      empresas: filtrar(tudo.empresas),
      colaboradores: filtrar(tudo.colaboradores),
      locais: filtrar(tudo.locais),
      servicos: filtrar(tudo.servicos),
      tiposOcorrencia: filtrar(tudo.tiposOcorrencia),
      planejamento: filtrar(tudo.planejamento),
      diarios: filtrar(tudo.diarios),
      pendencias: filtrar(tudo.pendencias),
      cronograma: filtrar(tudo.cronograma),
      lembretes: filtrar(tudo.lembretes),
      equipamentos: filtrar(tudo.equipamentos),
      ocorrenciasSeguranca: filtrar(tudo.ocorrenciasSeguranca),
      advertencias: filtrar(tudo.advertencias),
      disciplinasProjeto: filtrar(tudo.disciplinasProjeto),
      categoriasProjeto: filtrar(tudo.categoriasProjeto),
      etapasProjeto: filtrar(tudo.etapasProjeto),
      statusDisciplinaProjeto: filtrar(tudo.statusDisciplinaProjeto),
      apontamentos: filtrar(tudo.apontamentos),
      servicosCronograma: filtrar(tudo.servicosCronograma),
      materiaisEstoque: filtrar(tudo.materiaisEstoque),
      entradasEstoque: filtrar(tudo.entradasEstoque),
      saidasEstoque: filtrar(tudo.saidasEstoque),
      refeicoes: filtrar(tudo.refeicoes),
      planejamentoOverrides: filtrar(tudo.planejamentoOverrides),
      cronogramaGlobal: filtrar(tudo.cronogramaGlobal),
      semanasTaticas: filtrar(tudo.semanasTaticas),
      materiaisEpi: filtrar(tudo.materiaisEpi),
      entradasEpi: filtrar(tudo.entradasEpi),
      saidasEpi: filtrar(tudo.saidasEpi),
      tiposTreinamento: filtrar(tudo.tiposTreinamento),
      treinamentosColaboradores: filtrar(tudo.treinamentosColaboradores),
      suprimentos: filtrar(tudo.suprimentos),
      entregasEquipamento: filtrar(tudo.entregasEquipamento),
      contratos: filtrar(tudo.contratos),
      previsionProjectLinks: filtrar(tudo.previsionProjectLinks),
      motivosNaoExecutado: filtrar(tudo.motivosNaoExecutado),
      metasMensais: filtrar(tudo.metasMensais),
      estruturaPlanejada: filtrar(tudo.estruturaPlanejada),
      estruturaCustos: filtrar(tudo.estruturaCustos),
      movimentosEstoque: filtrar(tudo.movimentosEstoque),
      isencoesTreinamento: filtrar(tudo.isencoesTreinamento),
      regrasNotificacao: filtrar(tudo.regrasNotificacao),
      servicosProducao: filtrar(tudo.servicosProducao),
      plantasProducao: filtrar(tudo.plantasProducao),
      marcadoresProducao: filtrar(tudo.marcadoresProducao),
      eventosProducao: filtrar(tudo.eventosProducao),
    }
  }, [tudo, obraId])

  const trocarObra = useCallback((id) => {
    setObraId(id)
    try { localStorage.setItem(OBRA_LEMBRADA, id) } catch { /* navegador sem storage */ }
  }, [])

  /* A lista que o seletor de obra oferece. Admin e quem não tem
     restrição veem todas; o resto só o que foi liberado em Usuários. */
  const obrasPermitidas = useMemo(() => {
    if (!tudo) return []
    if (perfil.role === 'admin' || !perfil.obras_permitidas) return tudo.obras
    return tudo.obras.filter((o) => perfil.obras_permitidas.includes(o.id))
  }, [tudo, perfil.role, perfil.obras_permitidas])

  // ── Diário ────────────────────────────────────────────────
  /* Salva o diário inteiro: cabeçalho, presenças, frentes, quem
     trabalhou em cada frente e ocorrências.

     O detalhe que exige cuidado: enquanto o diário é rascunho na
     tela, as frentes ainda não têm identificador do banco. Elas
     são identificadas pela atividade planejada. Por isso o passo 3
     grava por (diário + atividade planejada) e devolve os
     identificadores reais, que o passo 5 usa para amarrar cada
     ocorrência à frente certa. */
  const salvarDiario = useCallback(
    async (diario) => {
      setSalvando(true)
      try {
        const { organization_id, worksite_id } = escopo()
        const agora = new Date().toISOString()

        // 1. Cabeçalho. onConflict na obra+data é a garantia de que
        //    nunca nascem dois diários para o mesmo dia.
        const cabecalho = {
          organization_id, worksite_id,
          data: diario.data,
          status: diario.status || 'rascunho',
          clima: diario.clima || null,
          observacao: diario.observacao || null,
          autor_id: diario.autor_id || perfil.id,
          atualizado_por: perfil.id,
          atualizado_em: agora,
        }
        if (diario.id) cabecalho.id = diario.id

        const salvo = checar(
          await supabase.from('daily_reports')
            .upsert(cabecalho, { onConflict: 'worksite_id,data' })
            .select('id').single(),
          'salvar o diário',
        )
        if (!salvo) return null
        const reportId = salvo.id

        // 2. Presenças: troca a lista inteira. São poucas linhas e
        //    reconciliar item a item traria mais risco que ganho.
        const apagou = await supabase.from('daily_attendance').delete().eq('report_id', reportId)
        if (apagou.error) { checar(apagou, 'atualizar as presenças'); return null }

        const presencas = (diario.presencas || []).filter((p) => p.presente)
        if (presencas.length) {
          const r = await supabase.from('daily_attendance').insert(
            presencas.map((p) => ({
              report_id: reportId, worker_id: p.worker_id,
              company_id: p.company_id, presente: true,
            })),
          )
          if (r.error) { checar(r, 'salvar as presenças'); return null }
        }

        // 3. Frentes de serviço
        let frentesSalvas = []
        if ((diario.atividades || []).length) {
          const dados = checar(
            await supabase.from('daily_activities').upsert(
              diario.atividades.map((a) => ({
                report_id: reportId,
                planned_id: a.planned_id,
                status: a.status,
                observacao: a.observacao || null,
                atualizado_por: perfil.id,
                atualizado_em: agora,
                atualizado_via: 'app',
              })),
              { onConflict: 'report_id,planned_id' },
            ).select('id, planned_id'),
            'salvar as frentes de serviço',
          )
          if (!dados) return null
          frentesSalvas = dados
        }

        // Da identificação provisória da tela para a do banco
        const idReal = {}
        diario.atividades.forEach((a) => {
          const real = frentesSalvas.find((f) => f.planned_id === a.planned_id)
          if (real) idReal[a.id] = real.id
        })

        // 4. Quem trabalhou em cada frente
        if (frentesSalvas.length) {
          const r = await supabase.from('daily_activity_workers')
            .delete().in('activity_id', frentesSalvas.map((f) => f.id))
          if (r.error) { checar(r, 'atualizar a equipe das frentes'); return null }
        }
        const equipe = (diario.atividades || []).flatMap((a) =>
          (a.worker_ids || []).map((w) => ({ activity_id: idReal[a.id], worker_id: w })),
        ).filter((e) => e.activity_id)
        if (equipe.length) {
          const r = await supabase.from('daily_activity_workers').insert(equipe)
          if (r.error) { checar(r, 'salvar a equipe das frentes'); return null }
        }

        // 5. Ocorrências
        const r = await supabase.from('daily_occurrences').delete().eq('report_id', reportId)
        if (r.error) { checar(r, 'atualizar as ocorrências'); return null }
        const ocorrencias = (diario.ocorrencias || []).filter((o) => o.tipo_id)
        if (ocorrencias.length) {
          const ins = await supabase.from('daily_occurrences').insert(
            ocorrencias.map((o) => ({
              report_id: reportId,
              tipo_id: o.tipo_id,
              descricao: o.descricao || null,
              activity_id: idReal[o.activity_id] || (o.activity_id || null),
            })),
          )
          if (ins.error) { checar(ins, 'salvar as ocorrências'); return null }
        }

        // 6. Relê do banco: o que a tela mostra a seguir é o que
        //    ficou gravado, não o que ela achava que gravou.
        const fresco = checar(
          await supabase.from('daily_reports').select(SELECT_DIARIO).eq('id', reportId).single(),
          'reler o diário',
        )
        if (!fresco) return null
        const normalizado = normalizarDiario(fresco)

        // 7. Frente concluída agora: um gatilho no banco já apagou os
        //    dias futuros da mesma combinação (serviço+local+empresa)
        //    que ainda não tinham nada lançado — aqui só confere quais
        //    ids sumiram, pra tela acompanhar sem esperar um recarregar.
        const idsConcluidos = normalizado.atividades
          .filter((a) => a.status === 'concluida' && a.planned_id)
          .map((a) => a.planned_id)
        const grupos = []
        if (idsConcluidos.length) {
          const concluidas = checar(
            await supabase.from('planned_activities')
              .select('id, data, service_id, location_id, company_id')
              .in('id', idsConcluidos),
            'localizar as frentes concluídas',
          ) || []
          for (const p of concluidas) {
            let q = supabase.from('planned_activities').select('id')
              .eq('worksite_id', worksite_id)
              .eq('service_id', p.service_id).eq('location_id', p.location_id)
              .gt('data', p.data)
            q = p.company_id ? q.eq('company_id', p.company_id) : q.is('company_id', null)
            const restantes = checar(await q, 'conferir os dias futuros do mesmo serviço') || []
            grupos.push({ ...p, restantesSet: new Set(restantes.map((r) => r.id)) })
          }
        }

        setTudo((t) => t && ({
          ...t,
          diarios: [
            normalizado,
            ...t.diarios.filter((d) => d.id !== reportId),
          ].sort((a, b) => (a.data < b.data ? 1 : -1)),
          planejamento: grupos.length
            ? t.planejamento.filter((item) => {
                const g = grupos.find((x) =>
                  item.service_id === x.service_id && item.location_id === x.location_id
                  && (item.company_id || null) === (x.company_id || null) && item.data > x.data)
                return !g || g.restantesSet.has(item.id)
              })
            : t.planejamento,
        }))
        const diaFormatado = diario.data.split('-').reverse().join('/')
        if (normalizado.status === 'finalizado') {
          notificarRegra('diario_finalizado', {
            titulo: 'Diário finalizado',
            corpo: `${perfil.nome} finalizou o diário do dia ${diaFormatado}`,
          })
        } else if (normalizado.status === 'rascunho') {
          notificarRegra('diario_rascunho', {
            titulo: 'Rascunho do diário salvo',
            corpo: `${perfil.nome} salvou um rascunho do diário do dia ${diaFormatado}`,
          })
        }
        return normalizado
      } finally {
        if (vivo.current) setSalvando(false)
      }
    },
    [perfil.id, perfil.nome, escopo, checar, notificarRegra],
  )

  const reabrirDiario = useCallback(
    async (id) => {
      const r = await supabase.from('daily_reports')
        .update({ status: 'rascunho', atualizado_por: perfil.id, atualizado_em: new Date().toISOString() })
        .eq('id', id)
      if (r.error) { checar(r, 'reabrir o diário'); return }
      setTudo((t) => t && ({
        ...t,
        diarios: t.diarios.map((d) => (d.id === id ? { ...d, status: 'rascunho' } : d)),
      }))
    },
    [perfil.id, checar],
  )

  // ── Fotos ─────────────────────────────────────────────────
  /* O arquivo sobe para o Storage e só o endereço dele volta para
     cá. Repare que salvarDiario NÃO mexe em fotos: ele apaga e
     regrava presenças e ocorrências, mas foto sobrevive a qualquer
     regravação do diário — perder foto por ter salvado de novo
     seria imperdoável. */
  const adicionarFoto = useCallback(
    async (parametros) => {
      const { foto, erro } = await enviarFoto({
        ...parametros,
        organizationId: perfil.organization_id,
        obraId: obraId,
        autorId: perfil.id,
      })
      if (erro) { avisarErro(erro); return null }

      setTudo((t) => t && ({
        ...t,
        diarios: t.diarios.map((d) =>
          d.id === foto.report_id ? { ...d, fotos: [...(d.fotos || []), foto] } : d),
      }))
      return foto
    },
    [perfil, obraId, avisarErro],
  )

  const removerFoto = useCallback(
    async (foto) => {
      const { erro } = await apagarFoto(foto)
      if (erro) { avisarErro(erro); return false }
      setTudo((t) => t && ({
        ...t,
        diarios: t.diarios.map((d) =>
          d.id === foto.report_id
            ? { ...d, fotos: (d.fotos || []).filter((f) => f.id !== foto.id) }
            : d),
      }))
      return true
    },
    [avisarErro],
  )

  /* Todas as fotos da obra, achatadas, para a galeria. Cada uma já
     vem com a data do diário e a frente de serviço a que pertence —
     é o que a galeria filtra. */
  const fotosDaObra = useMemo(() => {
    if (!daObra) return []
    return daObra.diarios.flatMap((d) =>
      (d.fotos || []).map((f) => ({ ...f, data: d.data, report: d })),
    ).sort((a, b) => (a.data === b.data
      ? (a.created_at < b.created_at ? 1 : -1)
      : (a.data < b.data ? 1 : -1)))
  }, [daObra]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Colaboradores ─────────────────────────────────────────
  const criarColaboradorRapido = useCallback(
    async ({ nome, funcao, company_id }) => {
      const { organization_id, worksite_id } = escopo()
      const novo = checar(
        await supabase.from('workers').insert({
          organization_id, worksite_id, company_id,
          nome: nome.trim(), funcao: (funcao || '').trim() || null,
          provisorio: true, revisado: false, criado_por: perfil.id,
        }).select('*').single(),
        'cadastrar o colaborador',
      )
      if (!novo) return null
      const comData = { ...novo, criado_em: novo.created_at }
      setTudo((t) => t && ({ ...t, colaboradores: [...t.colaboradores, comData] }))
      return comData
    },
    [perfil.id, escopo, checar],
  )

  const revisarColaborador = useCallback(
    async (id, dados) => {
      const atualizado = checar(
        await supabase.from('workers')
          .update({ ...dados, revisado: true, provisorio: false })
          .eq('id', id).select('*').single(),
        'aprovar o colaborador',
      )
      if (!atualizado) return
      setTudo((t) => t && ({
        ...t,
        colaboradores: t.colaboradores.map((c) =>
          c.id === id ? { ...atualizado, criado_em: atualizado.created_at } : c),
      }))
    },
    [checar],
  )

  /* Marca um colaborador como "administrativo" — não aparece no
     Diário (ele só registra presença de campo), então em Refeições
     precisa de um jeito de ficar sempre visível pra vincular, sem
     buscar o nome de novo todo dia. Só mexe nesse campo, nada de
     revisão/provisório — sem relação com aquele fluxo. */
  const definirAdministrativoColaborador = useCallback(
    async (id, administrativo) => {
      const atualizado = checar(
        await supabase.from('workers').update({ administrativo }).eq('id', id).select('*').single(),
        'atualizar o colaborador',
      )
      if (!atualizado) return
      setTudo((t) => t && ({
        ...t,
        colaboradores: t.colaboradores.map((c) =>
          c.id === id ? { ...atualizado, criado_em: atualizado.created_at } : c),
      }))
    },
    [checar],
  )

  /* Mexe em três tabelas — vai inteira para o banco, numa função
     que roda em transação. Ou faz tudo, ou não faz nada. */
  const mesclarColaborador = useCallback(
    async (idDuplicado, idMantido) => {
      const r = await supabase.rpc('mesclar_colaborador', {
        duplicado: idDuplicado, mantido: idMantido,
      })
      if (r.error) { checar(r, 'mesclar os cadastros'); return }
      await recarregar()
    },
    [checar, recarregar],
  )

  // ── Pendências ────────────────────────────────────────────
  const salvarPendencia = useCallback(
    async (p) => {
      const { organization_id, worksite_id } = escopo()
      const linha = {
        organization_id, worksite_id,
        titulo: p.titulo,
        descricao: p.descricao || null,
        responsavel_id: p.responsavel_id || null,
        prioridade: p.prioridade || 'media',
        prazo: p.prazo || null,
        status: p.status || 'aberta',
        resolucao: p.resolucao || null,
        origem: p.origem || 'manual',
        origem_id: p.origem_id || null,
        autor_id: p.autor_id || perfil.id,
      }
      if (p.id) linha.id = p.id

      const salva = checar(
        await supabase.from('issues').upsert(linha).select('*').single(),
        'salvar a pendência',
      )
      if (!salva) return null
      /* upsert não devolve as fotos (não foram tocadas aqui) --
         preserva as que já estavam carregadas, senão a lista local
         perde as miniaturas que já apareciam na tela. */
      const comFotos = { ...salva, fotos: tudo?.pendencias.find((x) => x.id === salva.id)?.fotos || [] }
      setTudo((t) => t && ({
        ...t,
        pendencias: t.pendencias.some((x) => x.id === comFotos.id)
          ? t.pendencias.map((x) => (x.id === comFotos.id ? comFotos : x))
          : [...t.pendencias, comFotos],
      }))
      if (!p.id) {
        notificarRegra('pendencias', { titulo: 'Nova pendência', corpo: `${perfil.nome}: ${linha.titulo}` })
      }
      return comFotos
    },
    [perfil.id, perfil.nome, escopo, checar, tudo, notificarRegra],
  )

  /* ── Fotos de pendência ──────────────────────────────────── */
  const adicionarFotoPendencia = useCallback(
    async (issueId, arquivo) => {
      const { foto, erro } = await enviarFotoPendencia({
        arquivo,
        organizationId: perfil.organization_id,
        obraId: obraId,
        issueId,
        autorId: perfil.id,
      })
      if (erro) { avisarErro(erro); return null }
      setTudo((t) => t && ({
        ...t,
        pendencias: t.pendencias.map((p) =>
          p.id === issueId ? { ...p, fotos: [...(p.fotos || []), foto] } : p),
      }))
      return foto
    },
    [perfil, obraId, avisarErro],
  )

  const removerFotoPendencia = useCallback(
    async (foto) => {
      const { erro } = await apagarFotoPendencia(foto)
      if (erro) { avisarErro(erro); return false }
      setTudo((t) => t && ({
        ...t,
        pendencias: t.pendencias.map((p) =>
          p.id === foto.issue_id
            ? { ...p, fotos: (p.fotos || []).filter((f) => f.id !== foto.id) }
            : p),
      }))
      return true
    },
    [avisarErro],
  )

  /* ── Anexos de pendência (PDF ou imagem, sem compressão) ─────
     Mesmo bucket/mecanismo dos anexos de Projetos, só que preso à
     pendência em vez de ao apontamento — é a "resposta" documental
     (laudo, ficha técnica) que uma foto de canteiro não substitui. */
  const adicionarAnexoPendencia = useCallback(
    async (issueId, arquivo) => {
      const { anexo, erro } = await enviarAnexoPendencia({
        arquivo,
        organizationId: perfil.organization_id,
        obraId,
        issueId,
        autorId: perfil.id,
      })
      if (erro) { avisarErro(erro); return null }
      setTudo((t) => t && ({
        ...t,
        pendencias: t.pendencias.map((p) =>
          p.id === issueId ? { ...p, anexos: [...(p.anexos || []), anexo] } : p),
      }))
      return anexo
    },
    [perfil, obraId, avisarErro],
  )

  const removerAnexoPendencia = useCallback(
    async (anexo) => {
      const { erro } = await apagarAnexoPendencia(anexo)
      if (erro) { avisarErro(erro); return false }
      setTudo((t) => t && ({
        ...t,
        pendencias: t.pendencias.map((p) =>
          p.id === anexo.issue_id
            ? { ...p, anexos: (p.anexos || []).filter((a) => a.id !== anexo.id) }
            : p),
      }))
      return true
    },
    [avisarErro],
  )

  /* Importação do PDF da estrutura (planejamento): a hierarquia
     inteira chega pronta, com `id` e `parent_id` já calculados pela
     leitura do PDF (lib/pdfEstrutura.js) — cada filho referencia o
     pai que acabou de "nascer" na mesma leitura, então precisa ir
     tudo numa gravação só. Se fosse linha a linha, um filho só
     teria o pai salvo se a chamada anterior já tivesse voltado do
     banco, e uma falha no meio deixaria a árvore pela metade sem
     ninguém perceber qual metade. */
  const salvarEstruturaCustosEmLote = useCallback(
    async (itens) => {
      if (!itens.length) return []
      const { organization_id, worksite_id } = escopo()
      const salvos = checar(
        await supabase.from('structure_items')
          .insert(itens.map((i) => ({
            id: i.id,
            organization_id, worksite_id,
            nivel: i.nivel,
            codigo: i.codigo || null,
            nome: i.nome,
            parent_id: i.parent_id || null,
          })))
          .select('*'),
        'importar a estrutura de custos',
      )
      if (!salvos) return null
      setTudo((t) => t && ({ ...t, estruturaCustos: [...t.estruturaCustos, ...salvos] }))
      return salvos
    },
    [escopo, checar],
  )

  const salvarPendenciasEmLote = useCallback(
    async (itens) => {
      if (!itens.length) return []
      const { organization_id, worksite_id } = escopo()
      const salvas = checar(
        await supabase.from('issues')
          .insert(itens.map((i) => ({
            organization_id, worksite_id,
            titulo: i.titulo,
            descricao: i.descricao || null,
            responsavel_id: i.responsavel_id || null,
            prioridade: i.prioridade || 'media',
            prazo: i.prazo || null,
            status: 'aberta',
            origem: i.origem || 'manual',
            autor_id: perfil.id,
          })))
          .select('*'),
        'importar as pendências',
      )
      if (!salvas) return null
      setTudo((t) => t && ({ ...t, pendencias: [...t.pendencias, ...salvas] }))
      return salvas
    },
    [perfil.id, escopo, checar],
  )

  /* Marca cada pendência tática como confirmada pra ESTA semana —
     chamada toda vez que a planilha tática é (re)importada, tanto
     pro item novo quanto pro que já existia (mesmo título) e só
     está sendo reconfirmado. onConflict deixa reimportar a mesma
     semana de novo sem duplicar nem dar erro. */
  const confirmarPendenciasTaticasDaSemana = useCallback(
    async (issueIds, semanaInicio) => {
      if (!issueIds?.length) return true
      const { organization_id, worksite_id } = escopo()
      const r = await supabase.from('issue_semanas_taticas')
        .upsert(
          issueIds.map((issue_id) => ({ organization_id, worksite_id, issue_id, semana_inicio: semanaInicio })),
          { onConflict: 'issue_id,semana_inicio' },
        )
        .select('*')
      if (r.error) { checar(r, 'confirmar as pendências táticas da semana'); return false }
      setTudo((t) => t && ({
        ...t,
        semanasTaticas: [
          ...t.semanasTaticas.filter((c) => !(c.semana_inicio === semanaInicio && issueIds.includes(c.issue_id))),
          ...r.data,
        ],
      }))
      return true
    },
    [escopo, checar],
  )

  const alternarPendencia = useCallback(
    async (id) => {
      const atual = tudo?.pendencias.find((p) => p.id === id)
      if (!atual) return
      const virando = atual.status === 'resolvida'
        ? { status: 'aberta', resolvido_em: null }
        : { status: 'resolvida', resolvido_em: hojeISO() }

      // Muda na tela na hora; se o banco recusar, volta atrás.
      setTudo((t) => t && ({
        ...t,
        pendencias: t.pendencias.map((p) => (p.id === id ? { ...p, ...virando } : p)),
      }))

      const r = await supabase.from('issues').update(virando).eq('id', id)
      if (r.error) {
        checar(r, 'atualizar a pendência')
        setTudo((t) => t && ({
          ...t, pendencias: t.pendencias.map((p) => (p.id === id ? atual : p)),
        }))
      }
    },
    [tudo, checar],
  )

  /* O quadro do Dia a dia move o cartão pra qualquer das 3 colunas
     (alternarPendencia só sabe virar entre aberta/resolvida) —
     mesmo padrão otimista: muda na tela na hora, desfaz se o banco
     recusar. */
  const mudarStatusPendencia = useCallback(
    async (id, status) => {
      const atual = tudo?.pendencias.find((p) => p.id === id)
      if (!atual) return
      const mudanca = { status, resolvido_em: status === 'resolvida' ? hojeISO() : null }

      setTudo((t) => t && ({
        ...t,
        pendencias: t.pendencias.map((p) => (p.id === id ? { ...p, ...mudanca } : p)),
      }))

      const r = await supabase.from('issues').update(mudanca).eq('id', id)
      if (r.error) {
        checar(r, 'mover a pendência')
        setTudo((t) => t && ({
          ...t, pendencias: t.pendencias.map((p) => (p.id === id ? atual : p)),
        }))
      }
    },
    [tudo, checar],
  )

  const excluirPendencia = useCallback(
    async (id) => {
      const r = await supabase.from('issues').delete().eq('id', id).select('id')
      if (r.error) { checar(r, 'excluir a pendência'); return false }
      if (!r.data || r.data.length === 0) {
        avisarErro('Seu perfil não pode excluir pendências. Isso é da gestão.')
        return false
      }
      setTudo((t) => t && ({ ...t, pendencias: t.pendencias.filter((p) => p.id !== id) }))
      return true
    },
    [checar, avisarErro],
  )

  // ── Segurança ──────────────────────────────────────────────
  const salvarOcorrenciaSeguranca = useCallback(
    async (o) => {
      const { organization_id, worksite_id } = escopo()
      const linha = {
        organization_id, worksite_id,
        data: o.data, titulo: o.titulo,
        tipo: o.tipo || 'quase_acidente',
        gravidade: o.gravidade || 'leve',
        location_id: o.location_id || null,
        worker_id: o.worker_id || null,
        descricao: o.descricao || null,
        acao_tomada: o.acao_tomada || null,
        autor_id: o.autor_id || perfil.id,
      }
      if (o.id) linha.id = o.id

      const salva = checar(
        await supabase.from('safety_occurrences').upsert(linha).select('*').single(),
        'salvar a ocorrência',
      )
      if (!salva) return null
      const comFotos = { ...salva, fotos: tudo?.ocorrenciasSeguranca.find((x) => x.id === salva.id)?.fotos || [] }
      setTudo((t) => t && ({
        ...t,
        ocorrenciasSeguranca: t.ocorrenciasSeguranca.some((x) => x.id === comFotos.id)
          ? t.ocorrenciasSeguranca.map((x) => (x.id === comFotos.id ? comFotos : x))
          : [...t.ocorrenciasSeguranca, comFotos],
      }))
      return comFotos
    },
    [perfil.id, escopo, checar, tudo],
  )

  const adicionarFotoOcorrencia = useCallback(
    async (occurrenceId, arquivo) => {
      const { foto, erro } = await enviarFotoOcorrencia({
        arquivo, organizationId: perfil.organization_id, obraId: obraId, occurrenceId, autorId: perfil.id,
      })
      if (erro) { avisarErro(erro); return null }
      setTudo((t) => t && ({
        ...t,
        ocorrenciasSeguranca: t.ocorrenciasSeguranca.map((o) =>
          o.id === occurrenceId ? { ...o, fotos: [...(o.fotos || []), foto] } : o),
      }))
      return foto
    },
    [perfil, obraId, avisarErro],
  )

  const removerFotoOcorrencia = useCallback(
    async (foto) => {
      const { erro } = await apagarFotoOcorrencia(foto)
      if (erro) { avisarErro(erro); return false }
      setTudo((t) => t && ({
        ...t,
        ocorrenciasSeguranca: t.ocorrenciasSeguranca.map((o) =>
          o.id === foto.occurrence_id ? { ...o, fotos: (o.fotos || []).filter((f) => f.id !== foto.id) } : o),
      }))
      return true
    },
    [avisarErro],
  )

  const excluirOcorrenciaSeguranca = useCallback(
    async (id) => {
      const r = await supabase.from('safety_occurrences').delete().eq('id', id).select('id')
      if (r.error) { checar(r, 'excluir a ocorrência'); return false }
      if (!r.data || r.data.length === 0) {
        avisarErro('Seu perfil não tem permissão para excluir. Peça à gestão.')
        return false
      }
      setTudo((t) => t && ({ ...t, ocorrenciasSeguranca: t.ocorrenciasSeguranca.filter((x) => x.id !== id) }))
      return true
    },
    [checar, avisarErro],
  )

  const salvarAdvertencia = useCallback(
    async (a) => {
      const { organization_id, worksite_id } = escopo()
      const linha = {
        organization_id, worksite_id,
        worker_id: a.worker_id,
        data: a.data, tipo: a.tipo || 'verbal',
        motivo: a.motivo, descricao: a.descricao || null,
        aplicada_por: a.aplicada_por || perfil.id,
        occurrence_id: a.occurrence_id || null,
        autor_id: a.autor_id || perfil.id,
      }
      if (a.id) linha.id = a.id

      const salva = checar(
        await supabase.from('warnings').upsert(linha).select('*').single(),
        'salvar a advertência',
      )
      if (!salva) return null
      const comFotos = { ...salva, fotos: tudo?.advertencias.find((x) => x.id === salva.id)?.fotos || [] }
      setTudo((t) => t && ({
        ...t,
        advertencias: t.advertencias.some((x) => x.id === comFotos.id)
          ? t.advertencias.map((x) => (x.id === comFotos.id ? comFotos : x))
          : [...t.advertencias, comFotos],
      }))
      return comFotos
    },
    [perfil.id, escopo, checar, tudo],
  )

  const adicionarFotoAdvertencia = useCallback(
    async (warningId, arquivo) => {
      const { foto, erro } = await enviarFotoAdvertencia({
        arquivo, organizationId: perfil.organization_id, obraId: obraId, warningId, autorId: perfil.id,
      })
      if (erro) { avisarErro(erro); return null }
      setTudo((t) => t && ({
        ...t,
        advertencias: t.advertencias.map((a) =>
          a.id === warningId ? { ...a, fotos: [...(a.fotos || []), foto] } : a),
      }))
      return foto
    },
    [perfil, obraId, avisarErro],
  )

  const removerFotoAdvertencia = useCallback(
    async (foto) => {
      const { erro } = await apagarFotoAdvertencia(foto)
      if (erro) { avisarErro(erro); return false }
      setTudo((t) => t && ({
        ...t,
        advertencias: t.advertencias.map((a) =>
          a.id === foto.warning_id ? { ...a, fotos: (a.fotos || []).filter((f) => f.id !== foto.id) } : a),
      }))
      return true
    },
    [avisarErro],
  )

  const adicionarFotoEquipamento = useCallback(
    async (equipmentId, arquivo) => {
      const { foto, erro } = await enviarFotoEquipamento({
        arquivo, organizationId: perfil.organization_id, obraId: obraId, equipmentId, autorId: perfil.id,
      })
      if (erro) { avisarErro(erro); return null }
      setTudo((t) => t && ({
        ...t,
        equipamentos: t.equipamentos.map((e) =>
          e.id === equipmentId ? { ...e, fotos: [...(e.fotos || []), foto] } : e),
      }))
      return foto
    },
    [perfil, obraId, avisarErro],
  )

  const removerFotoEquipamento = useCallback(
    async (foto) => {
      const { erro } = await apagarFotoEquipamento(foto)
      if (erro) { avisarErro(erro); return false }
      setTudo((t) => t && ({
        ...t,
        equipamentos: t.equipamentos.map((e) =>
          e.id === foto.equipment_id ? { ...e, fotos: (e.fotos || []).filter((f) => f.id !== foto.id) } : e),
      }))
      return true
    },
    [avisarErro],
  )

  /* Entrega de equipamento a um colaborador — histórico completo,
     igual ao EPI: cada entrega vira uma linha própria (não sobrescreve
     a anterior), pra dar pra ver depois quem usou o quê e quando.

     Cuidado: `equipment.responsavel_id` referencia `profiles` (quem
     da gestão/engenharia é o responsável pelo equipamento) — é um
     campo diferente, não mexe aqui. Colaborador (workers) é outra
     coisa: quem está com o equipamento na mão agora, mostrado na
     lista a partir da entrega mais recente, não de uma coluna própria.
     Só o status muda pra "em_uso" — o resto do estado atual vem do
     histórico de entregas mesmo. */
  const salvarEntregaEquipamento = useCallback(
    async (item) => {
      const { organization_id, worksite_id } = escopo()
      const linha = {
        organization_id, worksite_id,
        equipment_id: item.equipment_id,
        worker_id: item.worker_id,
        data: item.data,
        observacao: item.observacao || null,
        autor_id: perfil.id,
      }
      const salvo = checar(
        await supabase.from('equipment_deliveries').insert(linha).select('*').single(),
        'registrar a entrega do equipamento',
      )
      if (!salvo) return null

      const equipamentoAtualizado = checar(
        await supabase.from('equipment')
          .update({ status: 'em_uso' })
          .eq('id', item.equipment_id).select('*').single(),
        'atualizar o status do equipamento',
      )

      setTudo((t) => t && ({
        ...t,
        entregasEquipamento: [salvo, ...t.entregasEquipamento],
        equipamentos: equipamentoAtualizado
          ? t.equipamentos.map((e) => (e.id === equipamentoAtualizado.id ? { ...equipamentoAtualizado, fotos: e.fotos || [] } : e))
          : t.equipamentos,
      }))
      return salvo
    },
    [perfil.id, escopo, checar],
  )

  const excluirEntregaEquipamento = useCallback(
    async (id) => {
      const r = await supabase.from('equipment_deliveries').delete().eq('id', id).select('id')
      if (r.error) { checar(r, 'excluir a entrega do equipamento'); return false }
      if (!r.data || r.data.length === 0) {
        avisarErro('Seu perfil não tem permissão para excluir. Isso é da gestão.')
        return false
      }
      setTudo((t) => t && ({ ...t, entregasEquipamento: t.entregasEquipamento.filter((e) => e.id !== id) }))
      return true
    },
    [checar, avisarErro],
  )

  const excluirAdvertencia = useCallback(
    async (id) => {
      const r = await supabase.from('warnings').delete().eq('id', id).select('id')
      if (r.error) { checar(r, 'excluir a advertência'); return false }
      if (!r.data || r.data.length === 0) {
        avisarErro('Seu perfil não tem permissão para excluir. Peça à gestão.')
        return false
      }
      setTudo((t) => t && ({ ...t, advertencias: t.advertencias.filter((x) => x.id !== id) }))
      return true
    },
    [checar, avisarErro],
  )

  // ── Projetos (apontamentos multi-disciplina) ──────────────
  /* O apontamento tem quatro coleções penduradas nele (disciplinas,
     comentários, anexos, histórico). Em vez de tentar remendar cada
     uma na mão a cada gravação — como as fotos fazem em um relacionamento
     só —, toda função aqui termina relendo o apontamento inteiro do
     banco. É uma consulta a mais por ação, mas garante que a tela
     sempre mostra exatamente o que ficou gravado. */
  const relerApontamento = useCallback(
    async (id) => {
      const r = await supabase.from('project_notes').select(SELECT_APONTAMENTO).eq('id', id).single()
      if (r.error) { checar(r, 'atualizar o apontamento'); return null }
      return normalizarApontamento(r.data)
    },
    [checar],
  )

  const atualizarApontamentoLocal = useCallback((fresco) => {
    if (!fresco) return
    setTudo((t) => t && ({
      ...t,
      apontamentos: t.apontamentos.some((x) => x.id === fresco.id)
        ? t.apontamentos.map((x) => (x.id === fresco.id ? fresco : x))
        : [...t.apontamentos, fresco],
    }))
  }, [])

  /* Uma linha de histórico por chamada — todo mutador do apontamento
     passa por aqui, pra não repetir o insert (e o log de erro) em
     cada um. Falha aqui NUNCA aborta a operação principal: o dado de
     verdade já foi salvo antes de chegar nesta função, então um erro
     no histórico só deixa o rastro incompleto — mostrar um erro pro
     usuário sobre algo que na prática deu certo seria pior. */
  const registrarHistoricoApontamento = useCallback(
    async (noteId, { tipo, descricao, de_status = null, para_status = null }) => {
      const { organization_id, worksite_id } = escopo()
      const h = await supabase.from('project_note_history').insert({
        organization_id, worksite_id, note_id: noteId, autor_id: perfil.id,
        tipo, descricao, de_status, para_status,
      })
      if (h.error) console.error('[Prumo] histórico do apontamento:', h.error)
    },
    [escopo, perfil.id],
  )

  const salvarApontamento = useCallback(
    async (item) => {
      const { organization_id, worksite_id } = escopo()
      const ehNovo = !item.id
      const antes = !ehNovo ? tudo?.apontamentos?.find((x) => x.id === item.id) : null
      const linha = {
        organization_id, worksite_id,
        titulo: item.titulo,
        descricao: item.descricao || null,
        prioridade: item.prioridade || 'media',
        visibilidade: item.visibilidade || 'rascunho',
        stage_id: item.stage_id || null,
        category_ids: item.category_ids || [],
        location_ids: item.location_ids || [],
        etiquetas: item.etiquetas || [],
        autor_id: item.autor_id || perfil.id,
      }
      if (item.id) linha.id = item.id

      const salvo = checar(
        await supabase.from('project_notes').upsert(linha).select('id').single(),
        'salvar o apontamento',
      )
      if (!salvo) return null

      if (ehNovo) {
        await registrarHistoricoApontamento(salvo.id, {
          tipo: 'criacao', descricao: 'criou o apontamento', para_status: 'ativo',
        })
      } else {
        const descricao = descreverEdicaoApontamento(antes, linha)
        if (descricao) await registrarHistoricoApontamento(salvo.id, { tipo: 'edicao', descricao })
      }

      const fresco = await relerApontamento(salvo.id)
      atualizarApontamentoLocal(fresco)
      if (ehNovo && linha.visibilidade === 'publicado') {
        notificarRegra('projetos', { titulo: 'Novo apontamento', corpo: `${perfil.nome}: ${linha.titulo}` })
      }
      return fresco
    },
    [tudo, escopo, checar, perfil.id, perfil.nome, relerApontamento, atualizarApontamentoLocal, registrarHistoricoApontamento, notificarRegra],
  )

  /* Ativo → Resolvido/Reprovado, ou reaberto de volta a Ativo. Cada
     troca vira uma linha de histórico — é o "aviso" pedido para o
     ❌✅ do detalhe. */
  /* Passa pela RPC (mudar_status_apontamento), não por um update
     direto — mudar só o status é liberado pra qualquer um com o
     módulo, mesmo apontamento já publicado (diferente de editar
     título/descrição/disciplinas, que continua travado pra quem
     não é admin). A RPC nunca mexe em mais nenhuma outra coluna. */
  const mudarStatusApontamento = useCallback(
    async (id, novoStatus) => {
      const atual = tudo?.apontamentos?.find((x) => x.id === id)
      if (!atual) return null

      const r = await supabase.rpc('mudar_status_apontamento', { p_id: id, p_status: novoStatus })
      if (r.error) { checar(r, 'mudar o status do apontamento'); return null }
      if (!r.data || r.data.length === 0) {
        avisarErro('Seu perfil não tem permissão para isso. Peça à gestão.')
        return null
      }

      await registrarHistoricoApontamento(id, {
        tipo: 'status', de_status: atual.status, para_status: novoStatus,
        descricao: `mudou o status para ${ROTULO_STATUS_APONTAMENTO[novoStatus] || novoStatus}`,
      })

      const fresco = await relerApontamento(id)
      atualizarApontamentoLocal(fresco)
      return fresco
    },
    [tudo, checar, avisarErro, relerApontamento, atualizarApontamentoLocal, registrarHistoricoApontamento],
  )

  /* Rascunho → Publicado: "abrir" o apontamento pra valer. Dali pra
     frente só admin edita ou exclui (RLS de project_notes já barra),
     então zero linhas afetadas aqui quase sempre quer dizer "alguém
     tentou reabrir sem ser admin", não um erro de rede. */
  const abrirApontamento = useCallback(
    async (id) => {
      const r = await supabase.from('project_notes')
        .update({ visibilidade: 'publicado', atualizado_em: new Date().toISOString() })
        .eq('id', id).select('id')
      if (r.error) { checar(r, 'abrir o apontamento'); return null }
      if (!r.data || r.data.length === 0) {
        avisarErro('Seu perfil não tem permissão para isso. Peça à gestão.')
        return null
      }
      await registrarHistoricoApontamento(id, { tipo: 'abertura', descricao: 'abriu o apontamento (publicou)' })
      const fresco = await relerApontamento(id)
      atualizarApontamentoLocal(fresco)
      notificarRegra('projetos', { titulo: 'Novo apontamento', corpo: `${perfil.nome}: ${fresco.titulo}` })
      return fresco
    },
    [checar, avisarErro, relerApontamento, atualizarApontamentoLocal, registrarHistoricoApontamento, notificarRegra, perfil.nome],
  )

  const salvarDisciplinaApontamento = useCallback(
    async (noteId, linha) => {
      const { organization_id, worksite_id } = escopo()
      const ehNova = !linha.id
      const registro = {
        organization_id, worksite_id, note_id: noteId,
        discipline_id: linha.discipline_id,
        status_id: linha.status_id || null,
        prazo: linha.prazo || null,
        concluido_em: linha.concluido_em || null,
      }
      if (linha.id) registro.id = linha.id
      const salvo = checar(
        await supabase.from('project_note_disciplines').upsert(registro).select('id').single(),
        'salvar a disciplina do apontamento',
      )
      if (!salvo) return null
      const nome = tudo?.disciplinasProjeto?.find((d) => d.id === registro.discipline_id)?.nome || 'uma disciplina'
      await registrarHistoricoApontamento(noteId, {
        tipo: 'disciplina', descricao: ehNova ? `adicionou a disciplina ${nome}` : `atualizou a disciplina ${nome}`,
      })
      const fresco = await relerApontamento(noteId)
      atualizarApontamentoLocal(fresco)
      return fresco
    },
    [tudo, escopo, checar, relerApontamento, atualizarApontamentoLocal, registrarHistoricoApontamento],
  )

  const removerDisciplinaApontamento = useCallback(
    async (noteId, disciplinaLinhaId) => {
      const linha = tudo?.apontamentos
        ?.find((n) => n.id === noteId)?.disciplinas
        ?.find((d) => d.id === disciplinaLinhaId)
      const nome = tudo?.disciplinasProjeto?.find((d) => d.id === linha?.discipline_id)?.nome || 'uma disciplina'

      const r = await supabase.from('project_note_disciplines').delete().eq('id', disciplinaLinhaId).select('id')
      if (r.error) { checar(r, 'remover a disciplina do apontamento'); return null }
      await registrarHistoricoApontamento(noteId, { tipo: 'disciplina', descricao: `removeu a disciplina ${nome}` })
      const fresco = await relerApontamento(noteId)
      atualizarApontamentoLocal(fresco)
      return fresco
    },
    [tudo, checar, relerApontamento, atualizarApontamentoLocal, registrarHistoricoApontamento],
  )

  /* `anexos` é a lista de arquivos já enviados ao storage (ver
     enviarAnexoComentario, chamada em loop pela tela) — aqui só grava
     o comentário e, se houver, as linhas de metadado de cada anexo,
     todas apontando pro mesmo comment_id. */
  const salvarComentarioApontamento = useCallback(
    async (noteId, texto, anexos = []) => {
      const { organization_id, worksite_id } = escopo()
      const linha = { organization_id, worksite_id, note_id: noteId, autor_id: perfil.id, texto }
      const salvo = checar(
        await supabase.from('project_note_comments').insert(linha).select('id').single(),
        'salvar o comentário',
      )
      if (!salvo) return null

      if (anexos.length) {
        const r = await supabase.from('project_note_comment_attachments').insert(
          anexos.map((a) => ({
            organization_id, worksite_id, comment_id: salvo.id,
            caminho: a.caminho, nome_arquivo: a.nome, tipo_mime: a.tipo,
            tamanho_bytes: a.tamanho, autor_id: perfil.id,
          })),
        )
        if (r.error) console.error('[Prumo] anexos do comentário:', r.error)
      }

      await registrarHistoricoApontamento(noteId, {
        tipo: 'comentario',
        descricao: anexos.length ? `comentou (${anexos.length} anexo${anexos.length > 1 ? 's' : ''})` : 'comentou',
      })

      const fresco = await relerApontamento(noteId)
      atualizarApontamentoLocal(fresco)
      return fresco
    },
    [escopo, perfil.id, checar, relerApontamento, atualizarApontamentoLocal, registrarHistoricoApontamento],
  )

  const apagarComentarioApontamento = useCallback(
    async (noteId, comentarioId) => {
      /* Os metadados dos anexos somem sozinhos (ON DELETE CASCADE em
         comment_id), mas o arquivo em si no Storage não — sem isto,
         cada comentário apagado deixava fotos/PDFs órfãos pra trás. */
      const comentario = tudo?.apontamentos
        ?.find((n) => n.id === noteId)?.comentarios
        ?.find((c) => c.id === comentarioId)
      const caminhos = (comentario?.anexos || []).map((a) => a.caminho)
      const trecho = (comentario?.texto || '').slice(0, 60)

      const r = await supabase.from('project_note_comments').delete().eq('id', comentarioId).select('id')
      if (r.error) { checar(r, 'apagar o comentário'); return null }
      if (caminhos.length) await supabase.storage.from('anexos').remove(caminhos)

      await registrarHistoricoApontamento(noteId, {
        tipo: 'comentario',
        descricao: trecho
          ? `apagou um comentário: "${trecho}${comentario.texto.length > 60 ? '…' : ''}"`
          : 'apagou um comentário',
      })

      const fresco = await relerApontamento(noteId)
      atualizarApontamentoLocal(fresco)
      return fresco
    },
    [tudo, checar, relerApontamento, atualizarApontamentoLocal, registrarHistoricoApontamento],
  )

  const adicionarAnexoApontamento = useCallback(
    async (noteId, arquivo) => {
      const { anexo, erro } = await enviarAnexoApontamento({
        arquivo, organizationId: perfil.organization_id, obraId, noteId, autorId: perfil.id,
      })
      if (erro) { avisarErro(erro); return null }
      await registrarHistoricoApontamento(noteId, {
        tipo: 'anexo', descricao: `anexou "${anexo?.nome_arquivo || arquivo.name}"`,
      })
      const fresco = await relerApontamento(noteId)
      atualizarApontamentoLocal(fresco)
      return fresco
    },
    [perfil, obraId, avisarErro, relerApontamento, atualizarApontamentoLocal, registrarHistoricoApontamento],
  )

  const removerAnexoApontamento = useCallback(
    async (noteId, anexo) => {
      const { erro } = await apagarAnexoApontamento(anexo)
      if (erro) { avisarErro(erro); return null }
      await registrarHistoricoApontamento(noteId, {
        tipo: 'anexo', descricao: `removeu o anexo "${anexo.nome_arquivo || 'sem nome'}"`,
      })
      const fresco = await relerApontamento(noteId)
      atualizarApontamentoLocal(fresco)
      return fresco
    },
    [avisarErro, relerApontamento, atualizarApontamentoLocal, registrarHistoricoApontamento],
  )

  /* Apagar de verdade, ao contrário do resto do app — diferente de
     pendência/ocorrência, apontamento de projeto não tem histórico
     de terceiros (projetista) pendurado nele que precise sobreviver
     ao registro em si. */
  const excluirApontamento = useCallback(
    async (id) => {
      const r = await supabase.from('project_notes').delete().eq('id', id).select('id')
      if (r.error) { checar(r, 'excluir o apontamento'); return false }
      if (!r.data || r.data.length === 0) {
        avisarErro('Seu perfil não tem permissão para excluir. Peça a um admin.')
        return false
      }
      setTudo((t) => t && ({ ...t, apontamentos: t.apontamentos.filter((x) => x.id !== id) }))
      return true
    },
    [checar, avisarErro],
  )

  // ── Cadastros auxiliares ──────────────────────────────────
  /* `tudo` já carrega o cadastro de TODAS as obras da organização —
     `daObra` só filtra pela obra atual na hora de expor pra tela. Pra
     importar de outra obra não precisa buscar nada novo no banco, só
     olhar o que já está na memória filtrado por outro worksite_id. */
  const cadastroDeOutraObra = useCallback(
    (tipo, worksiteId) => (tudo?.[tipo] || []).filter((x) => x.worksite_id === worksiteId && x.ativo !== false),
    [tudo],
  )

  const salvarCadastro = useCallback(
    async (tipo, item) => {
      const tabela = TABELA[tipo]
      if (!tabela) return null
      const { organization_id, worksite_id } = escopo()
      /* `fotos` (só existe em equipamentos, embutida na consulta
         inicial) não é coluna da tabela — mandar ela no upsert
         quebraria a gravação. */
      const { criado_em, created_at, fotos, ...limpo } = item // eslint-disable-line no-unused-vars
      const linha = { ...limpo, organization_id, worksite_id }

      const salvo = checar(
        await supabase.from(tabela).upsert(linha).select('*').single(),
        `salvar o cadastro`,
      )
      if (!salvo) return null
      /* upsert também não devolve `fotos` (é de outra tabela) —
         preserva o que já estava carregado, senão a tela perde as
         miniaturas que já apareciam. */
      const comData = tipo === 'colaboradores'
        ? { ...salvo, criado_em: salvo.created_at }
        : fotos !== undefined ? { ...salvo, fotos } : salvo
      setTudo((t) => t && ({
        ...t,
        [tipo]: t[tipo].some((x) => x.id === comData.id)
          ? t[tipo].map((x) => (x.id === comData.id ? comData : x))
          : [...t[tipo], comData],
      }))
      return comData
    },
    [escopo, checar],
  )

  /* Arquivar, nunca apagar: o registro já pode estar num diário
     de três meses atrás. Só inverte o campo `ativo`. */
  const arquivarCadastro = useCallback(
    async (tipo, id) => {
      const tabela = TABELA[tipo]
      if (!tabela) return
      const atual = tudo?.[tipo]?.find((x) => x.id === id)
      if (!atual) return
      const novoValor = !(atual.ativo !== false)

      const r = await supabase.from(tabela).update({ ativo: novoValor }).eq('id', id).select('id')
      if (r.error) { checar(r, 'arquivar o cadastro'); return }
      if (!r.data || r.data.length === 0) {
        avisarErro('Seu perfil não tem permissão para arquivar cadastros. Peça à gestão.')
        return
      }

      /* Empresa e colaboradores dela andam juntos — arquivar inativa
         todo mundo (sem isso, o time de uma empreiteira que saiu da
         obra continuava aparecendo pra escolher no Diário mesmo com
         a empresa já arquivada); reativar traz todo mundo de volta.
         Quem não deve voltar (foi desligado por outro motivo enquanto
         a empresa estava inativa) é o um-a-um manual depois, na mão —
         decisão do Julio: mais fácil tirar quem não devia do que ficar
         recadastrando quem devia. */
      const daEmpresa = tipo === 'empresas'
        ? (tudo.colaboradores || []).filter((c) => c.company_id === id && (c.ativo !== false) !== novoValor)
        : []
      let colaboradoresMexidos = []
      if (daEmpresa.length) {
        const idsColaboradores = daEmpresa.map((c) => c.id)
        const rc = await supabase.from('workers').update({ ativo: novoValor }).in('id', idsColaboradores).select('id')
        if (rc.error) checar(rc, `${novoValor ? 'reativar' : 'inativar'} os colaboradores desta empresa`)
        else colaboradoresMexidos = idsColaboradores
      }

      setTudo((t) => t && ({
        ...t,
        [tipo]: t[tipo].map((x) => (x.id === id ? { ...x, ativo: novoValor } : x)),
        colaboradores: colaboradoresMexidos.length
          ? t.colaboradores.map((c) => (colaboradoresMexidos.includes(c.id) ? { ...c, ativo: novoValor } : c))
          : t.colaboradores,
      }))
    },
    [tudo, checar, avisarErro],
  )

  // ── Controle de estoque (Almoxarifado) ─────────────────────
  /* Material em si é um cadastro comum — reaproveita salvarCadastro/
     arquivarCadastro (tipo 'materiaisEstoque') como qualquer outro.
     Só entrada e saída, que são lançamento (não cadastro com
     ativo/inativo), ganham função própria aqui. */
  const salvarEntradaEstoque = useCallback(
    async (item) => {
      const { organization_id, worksite_id } = escopo()
      const linha = {
        organization_id, worksite_id,
        material_id: item.material_id,
        data: item.data,
        fornecedor: item.fornecedor || null,
        nota_fiscal: item.nota_fiscal || null,
        data_nota: item.data_nota || null,
        quantidade: Number(item.quantidade),
        valor_total: item.valor_total === '' || item.valor_total == null ? null : Number(item.valor_total),
        recebido_por: item.recebido_por || null,
        autor_id: perfil.id,
      }
      if (item.id) linha.id = item.id
      const salvo = checar(
        await supabase.from('stock_entries').upsert(linha).select('*').single(),
        'salvar a entrada de estoque',
      )
      if (!salvo) return null
      setTudo((t) => t && ({
        ...t,
        entradasEstoque: t.entradasEstoque.some((e) => e.id === salvo.id)
          ? t.entradasEstoque.map((e) => (e.id === salvo.id ? salvo : e))
          : [salvo, ...t.entradasEstoque],
      }))
      return salvo
    },
    [perfil.id, escopo, checar],
  )

  const excluirEntradaEstoque = useCallback(
    async (id) => {
      const r = await supabase.from('stock_entries').delete().eq('id', id).select('id')
      if (r.error) { checar(r, 'excluir a entrada de estoque'); return false }
      if (!r.data || r.data.length === 0) {
        avisarErro('Seu perfil não tem permissão para excluir. Isso é da gestão.')
        return false
      }
      setTudo((t) => t && ({ ...t, entradasEstoque: t.entradasEstoque.filter((e) => e.id !== id) }))
      return true
    },
    [checar, avisarErro],
  )

  const salvarSaidaEstoque = useCallback(
    async (item) => {
      const { organization_id, worksite_id } = escopo()
      const linha = {
        organization_id, worksite_id,
        material_id: item.material_id,
        data: item.data,
        quantidade: Number(item.quantidade),
        destino: item.destino || null,
        worker_id: item.worker_id || null,
        autor_id: perfil.id,
      }
      if (item.id) linha.id = item.id
      const salvo = checar(
        await supabase.from('stock_exits').upsert(linha).select('*').single(),
        'salvar a saída de estoque',
      )
      if (!salvo) return null
      setTudo((t) => t && ({
        ...t,
        saidasEstoque: t.saidasEstoque.some((s) => s.id === salvo.id)
          ? t.saidasEstoque.map((s) => (s.id === salvo.id ? salvo : s))
          : [salvo, ...t.saidasEstoque],
      }))
      return salvo
    },
    [perfil.id, escopo, checar],
  )

  const excluirSaidaEstoque = useCallback(
    async (id) => {
      const r = await supabase.from('stock_exits').delete().eq('id', id).select('id')
      if (r.error) { checar(r, 'excluir a saída de estoque'); return false }
      if (!r.data || r.data.length === 0) {
        avisarErro('Seu perfil não tem permissão para excluir. Isso é da gestão.')
        return false
      }
      setTudo((t) => t && ({ ...t, saidasEstoque: t.saidasEstoque.filter((s) => s.id !== id) }))
      return true
    },
    [checar, avisarErro],
  )

  /* Importação do "Relatório de Estoque" da UAU (lib/planilhaMovimentoEstoque.js)
     — cada item já vem consolidado por código (um só por material,
     lotes somados). Dois passos: (1) acha o material existente pelo
     código, ou cadastra um novo — nome/unidade vêm da própria
     planilha, então cadastrar não depende de ninguém abrir Cadastros
     antes; (2) grava o movimento do período. Chave (worksite_id,
     material_id, periodo_fim): reimportar o MESMO período atualiza,
     um período novo vira uma linha nova, preservando o histórico de
     cada importação — é dali que "Estoque atual" lê (o período mais
     recente de cada material), sem descartar os anteriores. */
  const importarMovimentoEstoque = useCallback(
    async (itens, { periodoInicio, periodoFim }) => {
      if (!itens.length) return null
      const { organization_id, worksite_id } = escopo()

      const existentesR = await supabase.from('stock_materials')
        .select('id, codigo').eq('worksite_id', worksite_id).not('codigo', 'is', null)
      if (existentesR.error) { checar(existentesR, 'importar o movimento de estoque'); return null }
      const materialIdPorCodigo = new Map((existentesR.data || []).map((m) => [m.codigo, m.id]))

      const paraCriar = itens.filter((i) => !materialIdPorCodigo.has(i.codigo))
      if (paraCriar.length) {
        const criados = checar(
          await supabase.from('stock_materials')
            .insert(paraCriar.map((i) => ({
              organization_id, worksite_id, codigo: i.codigo, nome: i.nome, unidade: i.unidade,
            })))
            .select('id, codigo'),
          'cadastrar os materiais novos desta importação',
        )
        if (!criados) return null
        criados.forEach((m) => materialIdPorCodigo.set(m.codigo, m.id))
      }

      const linhas = itens.map((i) => ({
        organization_id, worksite_id, material_id: materialIdPorCodigo.get(i.codigo),
        periodo_inicio: periodoInicio, periodo_fim: periodoFim,
        qtde_entrada: i.qtde_entrada, qtde_baixa: i.qtde_baixa, saldo: i.saldo,
        preco_medio: i.preco_medio, valor_total: i.valor_total,
        importado_em: new Date().toISOString(), importado_por: perfil.id,
      }))
      const salvos = checar(
        await supabase.from('stock_movements')
          .upsert(linhas, { onConflict: 'worksite_id,material_id,periodo_fim' })
          .select('*'),
        'importar o movimento de estoque',
      )
      if (!salvos) return null

      await recarregar()
      return { materiaisNovos: paraCriar.length, movimentos: salvos.length }
    },
    [escopo, perfil.id, checar, recarregar],
  )

  // ── Controle de estoque de EPI (Segurança) ─────────────────
  /* Mesmo desenho do estoque do Almoxarifado, tabelas e chaves de
     estado à parte (epi_materials/epi_entries/epi_exits) — EPI é um
     estoque próprio, não mistura com material de obra. */
  const salvarEntradaEpi = useCallback(
    async (item) => {
      const { organization_id, worksite_id } = escopo()
      const linha = {
        organization_id, worksite_id,
        material_id: item.material_id,
        data: item.data,
        fornecedor: item.fornecedor || null,
        nota_fiscal: item.nota_fiscal || null,
        data_nota: item.data_nota || null,
        quantidade: Number(item.quantidade),
        valor_total: item.valor_total === '' || item.valor_total == null ? null : Number(item.valor_total),
        recebido_por: item.recebido_por || null,
        autor_id: perfil.id,
      }
      if (item.id) linha.id = item.id
      const salvo = checar(
        await supabase.from('epi_entries').upsert(linha).select('*').single(),
        'salvar a entrada de EPI',
      )
      if (!salvo) return null
      setTudo((t) => t && ({
        ...t,
        entradasEpi: t.entradasEpi.some((e) => e.id === salvo.id)
          ? t.entradasEpi.map((e) => (e.id === salvo.id ? salvo : e))
          : [salvo, ...t.entradasEpi],
      }))
      return salvo
    },
    [perfil.id, escopo, checar],
  )

  const excluirEntradaEpi = useCallback(
    async (id) => {
      const r = await supabase.from('epi_entries').delete().eq('id', id).select('id')
      if (r.error) { checar(r, 'excluir a entrada de EPI'); return false }
      if (!r.data || r.data.length === 0) {
        avisarErro('Seu perfil não tem permissão para excluir. Isso é da gestão.')
        return false
      }
      setTudo((t) => t && ({ ...t, entradasEpi: t.entradasEpi.filter((e) => e.id !== id) }))
      return true
    },
    [checar, avisarErro],
  )

  const salvarSaidaEpi = useCallback(
    async (item) => {
      const { organization_id, worksite_id } = escopo()
      const linha = {
        organization_id, worksite_id,
        material_id: item.material_id,
        data: item.data,
        quantidade: Number(item.quantidade),
        destino: item.destino || null,
        worker_id: item.worker_id || null,
        autor_id: perfil.id,
      }
      if (item.id) linha.id = item.id
      const salvo = checar(
        await supabase.from('epi_exits').upsert(linha).select('*').single(),
        'salvar a saída de EPI',
      )
      if (!salvo) return null
      setTudo((t) => t && ({
        ...t,
        saidasEpi: t.saidasEpi.some((s) => s.id === salvo.id)
          ? t.saidasEpi.map((s) => (s.id === salvo.id ? salvo : s))
          : [salvo, ...t.saidasEpi],
      }))
      return salvo
    },
    [perfil.id, escopo, checar],
  )

  const excluirSaidaEpi = useCallback(
    async (id) => {
      const r = await supabase.from('epi_exits').delete().eq('id', id).select('id')
      if (r.error) { checar(r, 'excluir a saída de EPI'); return false }
      if (!r.data || r.data.length === 0) {
        avisarErro('Seu perfil não tem permissão para excluir. Isso é da gestão.')
        return false
      }
      setTudo((t) => t && ({ ...t, saidasEpi: t.saidasEpi.filter((s) => s.id !== id) }))
      return true
    },
    [checar, avisarErro],
  )

  // ── Treinamentos NR por colaborador (Segurança) ────────────
  /* O vencimento é calculado aqui (não no banco) a partir da
     validade do tipo escolhido, e gravado junto — ver comentário
     em dominio.js sobre por que não é recalculado toda leitura. */
  const salvarTreinamentoColaborador = useCallback(
    async (item) => {
      const { organization_id, worksite_id } = escopo()
      const tipo = tudo?.tiposTreinamento?.find((t) => t.id === item.training_type_id)
      const linha = {
        organization_id, worksite_id,
        worker_id: item.worker_id,
        training_type_id: item.training_type_id,
        data_realizacao: item.data_realizacao,
        data_vencimento: calcularVencimentoTreinamento(item.data_realizacao, tipo?.validade_meses),
        observacao: item.observacao || null,
        autor_id: perfil.id,
      }
      if (item.id) linha.id = item.id
      const salvo = checar(
        await supabase.from('worker_trainings').upsert(linha).select('*').single(),
        'salvar o treinamento',
      )
      if (!salvo) return null
      setTudo((t) => t && ({
        ...t,
        treinamentosColaboradores: t.treinamentosColaboradores.some((x) => x.id === salvo.id)
          ? t.treinamentosColaboradores.map((x) => (x.id === salvo.id ? salvo : x))
          : [salvo, ...t.treinamentosColaboradores],
      }))
      return salvo
    },
    [tudo, perfil.id, escopo, checar],
  )

  const excluirTreinamentoColaborador = useCallback(
    async (id) => {
      const r = await supabase.from('worker_trainings').delete().eq('id', id).select('id')
      if (r.error) { checar(r, 'excluir o treinamento'); return false }
      if (!r.data || r.data.length === 0) {
        avisarErro('Seu perfil não tem permissão para excluir. Isso é da gestão.')
        return false
      }
      setTudo((t) => t && ({ ...t, treinamentosColaboradores: t.treinamentosColaboradores.filter((x) => x.id !== id) }))
      return true
    },
    [checar, avisarErro],
  )

  /* Isenção de treinamento: nem todo colaborador precisa de todo
     tipo de NR (ex.: quem nunca sobe em andaime não precisa de
     Trabalho em Altura) — sem isso, o par (colaborador, tipo) sem
     nenhum registro sempre contava como "Pendente", mesmo quando o
     treinamento simplesmente não se aplica a ele. Marcar isenção é
     livre pra qualquer perfil (mesma regra de registrar/renovar);
     desmarcar (a tela chama de "Reativar") é só da gestão, pra um
     campo não conseguir esconder sozinho uma pendência de verdade. */
  const definirIsencaoTreinamento = useCallback(
    async (workerId, trainingTypeId, isento, motivo = null) => {
      if (isento) {
        const { organization_id, worksite_id } = escopo()
        const salvo = checar(
          await supabase.from('worker_training_exemptions')
            .upsert(
              { organization_id, worksite_id, worker_id: workerId, training_type_id: trainingTypeId, motivo, autor_id: perfil.id },
              { onConflict: 'worker_id,training_type_id' },
            )
            .select('*').single(),
          'marcar o treinamento como não aplicável',
        )
        if (!salvo) return false
        setTudo((t) => t && ({
          ...t,
          isencoesTreinamento: t.isencoesTreinamento.some((x) => x.id === salvo.id)
            ? t.isencoesTreinamento.map((x) => (x.id === salvo.id ? salvo : x))
            : [...t.isencoesTreinamento, salvo],
        }))
        return true
      }
      const existente = tudo?.isencoesTreinamento?.find((x) => x.worker_id === workerId && x.training_type_id === trainingTypeId)
      if (!existente) return true
      const r = await supabase.from('worker_training_exemptions').delete().eq('id', existente.id).select('id')
      if (r.error) { checar(r, 'reativar o treinamento'); return false }
      if (!r.data || r.data.length === 0) {
        avisarErro('Seu perfil não tem permissão para reativar. Isso é da gestão.')
        return false
      }
      setTudo((t) => t && ({ ...t, isencoesTreinamento: t.isencoesTreinamento.filter((x) => x.id !== existente.id) }))
      return true
    },
    [tudo, perfil.id, escopo, checar, avisarErro],
  )

  // ── Suprimentos (pedidos de compra importados do sistema) ──
  /* Reimportar a mesma planilha (ou uma mais nova) atualiza a linha
     que já existe em vez de duplicar — a chave é (worksite, Pedido,
     Cód. Insumo), que bate com o unique do banco. */
  const importarSuprimentos = useCallback(
    async (itens) => {
      const { organization_id, worksite_id } = escopo()
      const agora = new Date().toISOString()

      /* Pedido recorrente não muda o nome do insumo no sistema deles —
         então o Destino (Almoxarifado/EPI) marcado manualmente uma vez
         pra um nome já vale pra sempre: toda reimportação herda sozinha
         o destino de qualquer pedido anterior com o mesmo nome, sem
         perguntar de novo. */
      const destinosR = await supabase.from('supply_orders')
        .select('insumo, destino').eq('worksite_id', worksite_id).not('destino', 'is', null)
      const destinoPorInsumo = new Map((destinosR.data || []).map((d) => [d.insumo, d.destino]))

      /* Previsão de entrega: o setor de Suprimentos digita ISSO na
         planilha deles ANTES de entregar — e assim que entrega, o
         próprio sistema deles limpa essa coluna (confirmado numa
         planilha real: pedido já entregue veio com "Data Prevista de
         Entrega" em branco). Se a gente reimportasse isso direto,
         perderia pra sempre a data que foi prevista, exatamente o
         dado que o Julio quer guardar pra saber se entregou no prazo.
         Por isso herda do banco quando a planilha nova vier vazia —
         só troca quando vem um valor novo de verdade. */
      const previsoesR = await supabase.from('supply_orders')
        .select('pedido, codigo_insumo, previsao_entrega')
        .eq('worksite_id', worksite_id).not('previsao_entrega', 'is', null)
      const previsaoPorChave = new Map(
        (previsoesR.data || []).map((p) => [`${p.pedido}|${p.codigo_insumo}`, p.previsao_entrega]),
      )

      const linhas = itens.map((i) => ({
        organization_id, worksite_id, autor_id: perfil.id,
        pedido: i.pedido, cotacao: i.cotacao, codigo_insumo: i.codigo_insumo, insumo: i.insumo,
        data_pedido: i.data_pedido, aprov_pedido: i.aprov_pedido, aprov_simulacao: i.aprov_simulacao,
        confirm_cotacao: i.confirm_cotacao, fechamento_compra: i.fechamento_compra, data_entrega: i.data_entrega,
        previsao_entrega: i.previsao_entrega || previsaoPorChave.get(`${i.pedido}|${i.codigo_insumo}`) || null,
        excluido: i.excluido, quantidade: i.quantidade, preco: i.preco,
        dias_pedido_compra: i.dias_pedido_compra, dias_compra_entrega: i.dias_compra_entrega, estagio: i.estagio,
        destino: destinoPorInsumo.get(i.insumo) || null,
        atualizado_em: agora,
      }))
      /* Em lotes — 400+ linhas de uma vez o Postgres aguenta numa boa,
         mas separa pra não arriscar estourar o tamanho do pedido HTTP
         numa planilha bem maior no futuro. */
      const TAMANHO_LOTE = 500
      let total = 0
      let aindaExcluidos = 0
      for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
        const lote = linhas.slice(i, i + TAMANHO_LOTE)
        const r = await supabase.from('supply_orders')
          .upsert(lote, { onConflict: 'worksite_id,pedido,codigo_insumo' })
          /* excluido_pelo_app não está no payload do upsert (de propósito —
             ver excluirPedidoSuprimento), então o valor devolvido aqui é o
             que já estava gravado antes desta importação: dá pra avisar
             quantos continuam marcados sem precisar de uma consulta à parte. */
          .select('id, excluido_pelo_app')
        if (r.error) { checar(r, 'importar os pedidos de suprimentos'); return null }
        total += (r.data || []).length
        aindaExcluidos += (r.data || []).filter((x) => x.excluido_pelo_app).length
      }

      /* Limpeza: pedido que estava em aberto (sem entrega) no banco e
         sumiu desta planilha nova foi cancelado ou excluído do lado
         de lá — a planilha não manda "isto foi excluído", só para de
         mandar a linha, então sumir É o sinal. Só mexe no que esta
         importação realmente cobre: até a data do pedido em aberto
         mais recente QUE VEIO nela — pedido mais novo que isso pode
         só não ter chegado ainda nesta exportação, não dá pra
         concluir que sumiu de verdade. Sem pedido em aberto nenhum
         na planilha (corte nulo), não mexe em nada — não tem como
         saber até onde ela cobre. Nunca remove pedido já vinculado a
         uma entrada real de estoque (entrada_id), mesmo que por
         algum motivo estivesse sem data de entrega. */
      const chavesDaPlanilha = new Set(itens.map((i) => `${i.pedido}|${i.codigo_insumo}`))
      const dataCorte = itens.reduce(
        (max, i) => (!i.data_entrega && i.data_pedido && (!max || i.data_pedido > max) ? i.data_pedido : max),
        null,
      )
      let removidos = 0
      if (dataCorte) {
        const abertos = await supabase.from('supply_orders')
          .select('id, pedido, codigo_insumo')
          .eq('worksite_id', worksite_id).is('data_entrega', null).is('entrada_id', null)
          .lte('data_pedido', dataCorte)
        if (!abertos.error) {
          const idsParaRemover = (abertos.data || [])
            .filter((p) => !chavesDaPlanilha.has(`${p.pedido}|${p.codigo_insumo}`))
            .map((p) => p.id)
          if (idsParaRemover.length) {
            const r = await supabase.from('supply_orders').delete().in('id', idsParaRemover)
            if (!r.error) removidos = idsParaRemover.length
          }
        }
      }

      await recarregar()
      return { importados: total, removidos, aindaExcluidos }
    },
    [escopo, perfil.id, checar, recarregar],
  )

  /* Tenta linkar (por nome parecido) toda entrada — de estoque
     (material de obra) e de EPI — que ainda não tenha pedido de
     Suprimentos vinculado. Mesmo mecanismo do Planejamento Global:
     só linka quando a candidata é única e ainda não foi usada por
     outra entrada nesta mesma passada; ambíguo (0 ou 2+) fica pra
     revisão manual, sem arriscar escolher errado. Busca direto no
     banco (não do estado local) pelo mesmo motivo de lá: evitar
     corrida logo após um import recém-feito.

     Além disso, tenta detectar sozinho o Destino (Almoxarifado/EPI)
     de todo pedido ainda sem Destino: bate o nome do insumo contra
     os dois catálogos (mesmo insumoCorrespondeMaterial de sempre) —
     só aplica quando bate em UM catálogo só; bate nos dois, ou não
     bate em nenhum, fica pendente pra marcar na mão no detalhe do
     pedido (mesma regra de nunca arriscar escolher errado). */
  const vincularSuprimentoAutomaticamente = useCallback(
    async () => {
      const worksite_id = escopo().worksite_id
      const [pedidosR, materiaisR, epiR, equipR, entradasR, entradasEpiR, semDestinoR] = await Promise.all([
        supabase.from('supply_orders').select('id, insumo').eq('worksite_id', worksite_id).is('entrada_id', null),
        supabase.from('stock_materials').select('id, nome').eq('worksite_id', worksite_id),
        supabase.from('epi_materials').select('id, nome').eq('worksite_id', worksite_id),
        supabase.from('equipment').select('id, nome').eq('worksite_id', worksite_id),
        supabase.from('stock_entries').select('id, material_id').eq('worksite_id', worksite_id).is('supply_order_id', null),
        supabase.from('epi_entries').select('id, material_id').eq('worksite_id', worksite_id).is('supply_order_id', null),
        supabase.from('supply_orders').select('insumo').eq('worksite_id', worksite_id).is('destino', null),
      ])
      if (pedidosR.error || materiaisR.error || epiR.error || equipR.error || entradasR.error || entradasEpiR.error || semDestinoR.error) {
        return { vinculados: 0, destinosDetectados: 0 }
      }

      const nomeMaterial = new Map((materiaisR.data || []).map((m) => [m.id, m.nome]))
      const nomeEpi = new Map((epiR.data || []).map((m) => [m.id, m.nome]))
      const pedidos = pedidosR.data || []
      const usados = new Set()
      const atualizacoes = []

      const tentar = (entradas, tabela, nomes) => {
        for (const e of entradas) {
          const nome = nomes.get(e.material_id)
          if (!nome) continue
          const candidatas = pedidos.filter((p) => !usados.has(p.id) && insumoCorrespondeMaterial(p.insumo, nome))
          if (candidatas.length === 1) {
            atualizacoes.push({
              tabela, id: e.id, supply_order_id: candidatas[0].id,
              material_id: e.material_id, insumo: candidatas[0].insumo,
            })
            usados.add(candidatas[0].id)
          }
        }
      }
      tentar(entradasR.data || [], 'stock_entries', nomeMaterial)
      tentar(entradasEpiR.data || [], 'epi_entries', nomeEpi)

      /* Padroniza o nome do material/EPI pelo nome oficial do insumo
         no Suprimentos assim que vincula sozinho — o material costuma
         ter sido criado com um nome informal na hora do lançamento
         manual; a planilha do sistema tem o nome de verdade. */
      const tabelaDoMaterial = { stock_entries: 'stock_materials', epi_entries: 'epi_materials' }
      for (const a of atualizacoes) {
        await supabase.from(a.tabela).update({ supply_order_id: a.supply_order_id }).eq('id', a.id)
        if (a.insumo && a.material_id) {
          await supabase.from(tabelaDoMaterial[a.tabela]).update({ nome: a.insumo }).eq('id', a.material_id)
        }
      }

      const nomesMateriais = [...nomeMaterial.values()]
      const nomesEpi = [...nomeEpi.values()]
      const nomesEquipamentos = (equipR.data || []).map((e) => e.nome)
      const insumosSemDestino = [...new Set((semDestinoR.data || []).map((p) => p.insumo))]
      const destinoPorInsumo = new Map()
      for (const insumo of insumosSemDestino) {
        const bateAlmoxarifado = nomesMateriais.some((n) => insumoCorrespondeMaterial(insumo, n))
        const bateEpi = nomesEpi.some((n) => insumoCorrespondeMaterial(insumo, n))
        const bateEquipamento = nomesEquipamentos.some((n) => insumoCorrespondeMaterial(insumo, n))
        const bateram = [bateAlmoxarifado, bateEpi, bateEquipamento].filter(Boolean).length
        if (bateram !== 1) continue
        if (bateAlmoxarifado) destinoPorInsumo.set(insumo, 'almoxarifado')
        else if (bateEpi) destinoPorInsumo.set(insumo, 'epi')
        else destinoPorInsumo.set(insumo, 'equipamentos')
      }
      let destinosDetectados = 0
      for (const [insumo, destino] of destinoPorInsumo) {
        const r = await supabase.from('supply_orders')
          .update({ destino }).eq('worksite_id', worksite_id).eq('insumo', insumo).is('destino', null)
          .select('id')
        if (!r.error) destinosDetectados += (r.data || []).length
      }

      if (atualizacoes.length || destinosDetectados) await recarregar()
      return { vinculados: atualizacoes.length, destinosDetectados }
    },
    [escopo, recarregar],
  )

  /* Vínculo manual — quando o nome não bate parecido o bastante pro
     automático achar sozinho, ou bate em mais de um pedido (dois
     pedidos separados do mesmo material que chegaram juntos: nesse
     caso a pessoa marca os dois e a quantidade soma). `tabela` é
     'estoque' ou 'epi', pra saber se mexe em stock_entries ou
     epi_entries. `supplyOrderIds` aceita um id só, um array, ou
     vazio/null pra desvincular tudo.

     Só existe UMA coluna de FK (stock_entries.supply_order_id /
     epi_entries.supply_order_id) — o primeiro id vira o vínculo
     "principal" ali. Os demais (quando a pessoa marca mais de um)
     ficam em supply_orders.entrada_id/entrada_tabela, apontando de
     volta pra essa mesma entrada — não são um segundo FK de verdade,
     só o suficiente pra sair da fila de "sem pedido" e a soma bater
     na hora de olhar os dois juntos.

     Vincular também padroniza o nome do material/EPI pelo nome
     oficial do insumo no pedido principal — mesma ideia do vínculo
     automático: o material nasceu com o nome informal do lançamento
     manual, a planilha do sistema tem o nome de verdade. */
  const vincularEntradaSuprimento = useCallback(
    async (tabela, entradaId, supplyOrderIds) => {
      const nomeTabela = tabela === 'epi' ? 'epi_entries' : 'stock_entries'
      const nomeTabelaMaterial = tabela === 'epi' ? 'epi_materials' : 'stock_materials'
      const ids = (Array.isArray(supplyOrderIds) ? supplyOrderIds : [supplyOrderIds]).filter(Boolean)
      const [principal, ...extras] = ids

      const limpezaR = await supabase.from('supply_orders')
        .update({ entrada_id: null, entrada_tabela: null })
        .eq('entrada_id', entradaId).eq('entrada_tabela', tabela)
      if (limpezaR.error) { checar(limpezaR, 'vincular ao pedido de suprimentos'); return false }

      const r = await supabase.from(nomeTabela).update({ supply_order_id: principal || null }).eq('id', entradaId).select('id, material_id')
      if (r.error) { checar(r, 'vincular ao pedido de suprimentos'); return false }
      if (!r.data || r.data.length === 0) {
        avisarErro('Seu perfil não pode vincular isso.')
        return false
      }

      if (extras.length) {
        const r2 = await supabase.from('supply_orders')
          .update({ entrada_id: entradaId, entrada_tabela: tabela })
          .in('id', extras)
        if (r2.error) { checar(r2, 'vincular os pedidos extras'); return false }
      }

      if (principal) {
        const materialId = r.data[0].material_id
        const pedidoR = await supabase.from('supply_orders').select('insumo').eq('id', principal).maybeSingle()
        if (!pedidoR.error && pedidoR.data?.insumo && materialId) {
          await supabase.from(nomeTabelaMaterial).update({ nome: pedidoR.data.insumo }).eq('id', materialId)
        }
      }

      await recarregar()
      return true
    },
    [checar, avisarErro, recarregar],
  )

  /* Marca o Destino (Almoxarifado/EPI) de um insumo — sempre pelo
     NOME, não só do pedido clicado: aplica em todo pedido (passado
     e futuro, via importarSuprimentos) com esse mesmo nome no
     sistema deles, porque pedido recorrente não muda o nome.
     destino null limpa a marcação. */
  const definirDestinoSuprimento = useCallback(
    async (supplyOrderId, destino) => {
      const worksite_id = escopo().worksite_id
      const alvo = await supabase.from('supply_orders').select('insumo').eq('id', supplyOrderId).maybeSingle()
      if (alvo.error || !alvo.data) { checar(alvo, 'definir o destino deste pedido'); return false }
      const r = await supabase.from('supply_orders')
        .update({ destino })
        .eq('worksite_id', worksite_id).eq('insumo', alvo.data.insumo)
        .select('id')
      if (r.error) { checar(r, 'definir o destino deste pedido'); return false }
      await recarregar()
      return { atualizados: (r.data || []).length }
    },
    [escopo, checar, recarregar],
  )

  /* Excluir pedido "pelo app": o sistema (UAU) às vezes mantém um
     pedido que na prática foi cancelado e nunca vai chegar — sem
     isso, ele empacava pra sempre no ranking de "mais antigo em
     aberto" e nos indicadores de tempo médio. Não é um DELETE de
     verdade (arquivar, não apagar, mesma regra de sempre): marca
     `excluido_pelo_app`, com motivo opcional. Como o upsert de
     `importarSuprimentos` só grava as colunas que ele conhece, essa
     marca sobrevive a qualquer reimportação — reativar é a única
     forma de tirar. */
  const excluirPedidoSuprimento = useCallback(
    async (id, motivo) => {
      const r = await supabase.from('supply_orders')
        .update({
          excluido_pelo_app: true,
          motivo_exclusao_app: motivo?.trim() || null,
          excluido_em: new Date().toISOString(),
          excluido_por: perfil.id,
        })
        .eq('id', id).select('*').single()
      if (r.error) { checar(r, 'excluir o pedido'); return null }
      setTudo((t) => t && ({ ...t, suprimentos: t.suprimentos.map((p) => (p.id === id ? r.data : p)) }))
      return r.data
    },
    [perfil.id, checar],
  )

  const reativarPedidoSuprimento = useCallback(
    async (id) => {
      const r = await supabase.from('supply_orders')
        .update({ excluido_pelo_app: false, motivo_exclusao_app: null, excluido_em: null, excluido_por: null })
        .eq('id', id).select('*').single()
      if (r.error) { checar(r, 'reativar o pedido'); return null }
      setTudo((t) => t && ({ ...t, suprimentos: t.suprimentos.map((p) => (p.id === id ? r.data : p)) }))
      return r.data
    },
    [checar],
  )

  // ── Contratos (itens de contrato importados do sistema) ────
  /* Mesmo padrão do Suprimentos: reimportar a mesma planilha (ou uma
     mais nova, com as medições atualizadas) atualiza a linha que já
     existe em vez de duplicar — a chave é (worksite, CHAVECONTRATO),
     que já vem única de fábrica lá do sistema deles. */
  const importarContratos = useCallback(
    async (itens) => {
      const { organization_id, worksite_id } = escopo()
      const agora = new Date().toISOString()

      const linhas = itens.map((i) => ({
        organization_id, worksite_id, autor_id: perfil.id,
        chave: i.chave, cod_contrato: i.cod_contrato, objeto_contrato: i.objeto_contrato,
        fornecedor: i.fornecedor, cod_fornecedor: i.cod_fornecedor,
        status_contrato: i.status_contrato, situacao_contrato: i.situacao_contrato,
        total_contrato: i.total_contrato, saldo_contrato: i.saldo_contrato,
        valor_medido_contrato: i.valor_medido_contrato, retido: i.retido, a_pagar: i.a_pagar,
        item_num: i.item_num, codigo_servico: i.codigo_servico, descricao_item: i.descricao_item,
        unidade: i.unidade, qtde_item: i.qtde_item, preco_item: i.preco_item, subtotal_item: i.subtotal_item,
        qtde_medida: i.qtde_medida, valor_medido_item: i.valor_medido_item,
        qtde_a_medir: i.qtde_a_medir, valor_a_medir: i.valor_a_medir,
        atualizado_em: agora,
      }))
      const TAMANHO_LOTE = 500
      let total = 0
      for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
        const lote = linhas.slice(i, i + TAMANHO_LOTE)
        const r = await supabase.from('contract_items')
          .upsert(lote, { onConflict: 'worksite_id,chave' })
          .select('id')
        if (r.error) { checar(r, 'importar os contratos'); return null }
        total += (r.data || []).length
      }
      await recarregar()
      return { importados: total }
    },
    [escopo, perfil.id, checar, recarregar],
  )

  /* Marca o Destino (Obra/Projetos/Outros) de um contrato inteiro —
     sempre por cod_contrato, porque destino é do CONTRATO, não do
     item clicado (mesma ideia do definirDestinoSuprimento: aplica em
     tudo que pertence a ele). destino null limpa a marcação. Nunca é
     tocado pelo reimportarContratos, então sobrevive a um reimporte. */
  const definirDestinoContrato = useCallback(
    async (codContrato, destino) => {
      const worksite_id = escopo().worksite_id
      const r = await supabase.from('contract_items')
        .update({ destino })
        .eq('worksite_id', worksite_id).eq('cod_contrato', codContrato)
        .select('id')
      if (r.error) { checar(r, 'definir o destino deste contrato'); return false }
      await recarregar()
      return { atualizados: (r.data || []).length }
    },
    [escopo, checar, recarregar],
  )

  /* Mesma ideia do destino acima: vincula a empresa cadastrada
     (Cadastros → Empresas) ao contrato inteiro, por cod_contrato — é
     o que deixa Contratos, Efetivo (workers.company_id) e
     Produtividade linkados pela mesma empresa, em vez de só um nome
     de fornecedor solto vindo da planilha. companyId null desvincula.
     Também nunca é tocado por reimportarContratos. */
  const definirEmpresaContrato = useCallback(
    async (codContrato, companyId) => {
      const worksite_id = escopo().worksite_id
      const r = await supabase.from('contract_items')
        .update({ company_id: companyId })
        .eq('worksite_id', worksite_id).eq('cod_contrato', codContrato)
        .select('id')
      if (r.error) { checar(r, 'vincular a empresa deste contrato'); return false }
      await recarregar()
      return { atualizados: (r.data || []).length }
    },
    [escopo, checar, recarregar],
  )

  // ── Controle de refeições (Almoxarifado) ───────────────────
  const salvarRefeicao = useCallback(
    async (item) => {
      const { organization_id, worksite_id } = escopo()
      const linha = {
        organization_id, worksite_id,
        company_id: item.company_id || null,
        data: item.data,
        quantidade: Number(item.quantidade),
        fornecedor: item.fornecedor || null,
        worker_ids: item.worker_ids || [],
        servicos_manuais: item.servicos_manuais || {},
        autor_id: perfil.id,
      }
      if (item.id) linha.id = item.id
      const salvo = checar(
        await supabase.from('meal_records').upsert(linha).select('*').single(),
        'salvar o lançamento de refeição',
      )
      if (!salvo) return null
      setTudo((t) => t && ({
        ...t,
        refeicoes: t.refeicoes.some((r) => r.id === salvo.id)
          ? t.refeicoes.map((r) => (r.id === salvo.id ? salvo : r))
          : [salvo, ...t.refeicoes],
      }))
      if (!item.id) {
        notificarRegra('refeicoes', {
          titulo: 'Refeição lançada',
          corpo: `${perfil.nome} lançou ${linha.quantidade} refeições em ${linha.data.split('-').reverse().join('/')}`,
        })
      }
      return salvo
    },
    [perfil.id, perfil.nome, escopo, checar, notificarRegra],
  )

  const excluirRefeicao = useCallback(
    async (id) => {
      const r = await supabase.from('meal_records').delete().eq('id', id).select('id')
      if (r.error) { checar(r, 'excluir o lançamento de refeição'); return false }
      if (!r.data || r.data.length === 0) {
        avisarErro('Seu perfil não tem permissão para excluir. Isso é da gestão.')
        return false
      }
      setTudo((t) => t && ({ ...t, refeicoes: t.refeicoes.filter((r) => r.id !== id) }))
      return true
    },
    [checar, avisarErro],
  )

  // ── Planejamento ──────────────────────────────────────────
  const salvarPlanejado = useCallback(
    async (item) => {
      const { organization_id, worksite_id } = escopo()
      const salvo = checar(
        await supabase.from('planned_activities')
          .upsert({ ...item, organization_id, worksite_id })
          .select('*').single(),
        'salvar a frente de serviço',
      )
      if (!salvo) return null
      setTudo((t) => t && ({
        ...t,
        planejamento: t.planejamento.some((p) => p.id === salvo.id)
          ? t.planejamento.map((p) => (p.id === salvo.id ? salvo : p))
          : [...t.planejamento, salvo],
      }))
      notificarRegra('planejamento', { titulo: 'Planejamento atualizado', corpo: `${perfil.nome} atualizou o planejamento` })
      return salvo
    },
    [escopo, checar, notificarRegra, perfil.nome],
  )

  /* Planejar a semana inteira de uma vez. Vai numa chamada só, e
     não num laço de vinte: no laço, uma falha no meio deixaria
     metade da semana planejada e ninguém saberia qual metade. */
  const salvarPlanejadosEmLote = useCallback(
    async (itens) => {
      if (!itens.length) return []
      const { organization_id, worksite_id } = escopo()
      const salvos = checar(
        await supabase.from('planned_activities')
          .insert(itens.map((i) => ({ ...i, organization_id, worksite_id })))
          .select('*'),
        'planejar as atividades',
      )
      if (!salvos) return null
      setTudo((t) => t && ({ ...t, planejamento: [...t.planejamento, ...salvos] }))
      notificarRegra('planejamento', {
        titulo: 'Planejamento atualizado',
        corpo: `${perfil.nome} planejou ${salvos.length} ${salvos.length === 1 ? 'atividade' : 'atividades'}`,
      })
      return salvos
    },
    [escopo, checar, notificarRegra, perfil.nome],
  )

  /* Reimportar a mesma planilha de uma semana que já tinha dias
     planejados à mão (ou de uma importação anterior) não cria linha
     nova pra esses dias — mas eles agora estão confirmados pela
     planilha, e fecharSemana só considera "planejada" quem tem essa
     marca. Sem isso, reimportar do jeito que o Julio faz toda
     semana nunca marcaria nada como planejado de verdade. */
  const marcarDaPlanilha = useCallback(
    async (ids) => {
      if (!ids?.length) return true
      const r = await supabase.from('planned_activities').update({ da_planilha: true }).in('id', ids).select('id')
      if (r.error) { checar(r, 'confirmar os dias já planejados pela planilha'); return false }
      setTudo((t) => t && ({
        ...t,
        planejamento: t.planejamento.map((p) => (ids.includes(p.id) ? { ...p, da_planilha: true } : p)),
      }))
      return true
    },
    [checar],
  )

  /* Preenche a empresa de dias já planejados que estavam sem
     (company_id nulo) quando a planilha semanal reconhece o
     responsável daquele pacote — nunca troca uma empresa que já
     estava preenchida (pode ter sido digitada à mão de propósito). */
  const preencherEmpresaPlanejada = useCallback(
    async (ids, companyId) => {
      if (!ids?.length) return true
      const r = await supabase.from('planned_activities')
        .update({ company_id: companyId }).in('id', ids).is('company_id', null).select('id')
      if (r.error) { checar(r, 'preencher a empresa do planejamento'); return false }
      setTudo((t) => t && ({
        ...t,
        planejamento: t.planejamento.map((p) => (ids.includes(p.id) ? { ...p, company_id: companyId } : p)),
      }))
      return true
    },
    [checar],
  )

  const removerPlanejado = useCallback(
    async (id) => {
      const r = await supabase.from('planned_activities').delete().eq('id', id).select('id')
      if (r.error) { checar(r, 'remover do planejamento'); return false }
      /* Zero linhas afetadas = a permissão barrou em silêncio.
         Sem este aviso, o item sumiria da tela e voltaria no próximo
         carregamento, sem explicação nenhuma. */
      if (!r.data || r.data.length === 0) {
        avisarErro('Seu perfil não pode remover itens do planejamento. Isso é da gestão.')
        return false
      }
      setTudo((t) => t && ({ ...t, planejamento: t.planejamento.filter((p) => p.id !== id) }))
      return true
    },
    [checar, avisarErro],
  )

  /* Início/fim real digitado à mão pro grupo (serviço+local+empresa)
     do Planejamento Semanal — pro dia que o cálculo automático pelo
     diário errar ou faltar. `chave` é gerada pelo banco a partir
     desses três campos, então nunca é enviada daqui; o onConflict usa
     ela pra decidir entre criar e atualizar. */
  const salvarOverridePlanejamento = useCallback(
    async ({ service_id, location_id, company_id, inicio_real, fim_real }) => {
      const { organization_id, worksite_id } = escopo()
      const salvo = checar(
        await supabase.from('planned_group_overrides')
          .upsert({
            organization_id, worksite_id, service_id, location_id,
            company_id: company_id || null,
            inicio_real: inicio_real || null,
            fim_real: fim_real || null,
            atualizado_em: new Date().toISOString(),
            atualizado_por: perfil.id,
          }, { onConflict: 'worksite_id,chave' })
          .select('*').single(),
        'salvar o início/fim real',
      )
      if (!salvo) return null
      setTudo((t) => t && ({
        ...t,
        planejamentoOverrides: t.planejamentoOverrides.some((o) => o.id === salvo.id)
          ? t.planejamentoOverrides.map((o) => (o.id === salvo.id ? salvo : o))
          : [...t.planejamentoOverrides, salvo],
      }))
      return salvo
    },
    [escopo, checar, perfil.id],
  )

  /* Motivo de não cumprimento (causa da não execução) — um por grupo
     planejado (serviço+local+empresa) e por semana, pro Pareto de
     causas do fechamento. Sem chave gerada no banco (o índice único
     usa coalesce, que o upsert do PostgREST não referencia direito),
     então faz na mão: procura se já existe, atualiza ou cria. */
  const salvarMotivoNaoExecutado = useCallback(
    async (grupo, semanaInicio, motivo) => {
      const { organization_id, worksite_id } = escopo()
      let consulta = supabase.from('planned_activity_delay_reasons')
        .select('id')
        .eq('worksite_id', worksite_id).eq('service_id', grupo.service_id)
        .eq('location_id', grupo.location_id).eq('semana_inicio', semanaInicio)
      consulta = grupo.company_id ? consulta.eq('company_id', grupo.company_id) : consulta.is('company_id', null)
      const existente = await consulta.maybeSingle()
      if (existente.error) { checar(existente, 'salvar o motivo'); return null }

      const linha = {
        organization_id, worksite_id,
        service_id: grupo.service_id, location_id: grupo.location_id, company_id: grupo.company_id || null,
        semana_inicio: semanaInicio, motivo, autor_id: perfil.id, atualizado_em: new Date().toISOString(),
      }
      const salvo = checar(
        existente.data
          ? await supabase.from('planned_activity_delay_reasons').update(linha).eq('id', existente.data.id).select('*').single()
          : await supabase.from('planned_activity_delay_reasons').insert(linha).select('*').single(),
        'salvar o motivo de não execução',
      )
      if (!salvo) return null
      setTudo((t) => t && ({
        ...t,
        motivosNaoExecutado: t.motivosNaoExecutado.some((m) => m.id === salvo.id)
          ? t.motivosNaoExecutado.map((m) => (m.id === salvo.id ? salvo : m))
          : [...t.motivosNaoExecutado, salvo],
      }))
      return salvo
    },
    [escopo, checar, perfil.id],
  )

  /* Meta mensal da Prevision — a API deles não expõe esse percentual
     (é calculado só no front deles a partir de um arquivo interno,
     ver conversa), então aqui é digitado à mão uma vez por mês,
     olhando a tela da Prevision. Um valor por obra+mês, sobrescreve
     se já existir (upsert direto — o índice único aqui não usa
     coalesce, diferente do motivo de não execução). */
  const salvarMetaMensal = useCallback(
    async (mes, percentual) => {
      const { organization_id, worksite_id } = escopo()
      const linha = {
        organization_id, worksite_id, mes, percentual: Number(percentual),
        autor_id: perfil.id, atualizado_em: new Date().toISOString(),
      }
      const salvo = checar(
        await supabase.from('prevision_metas_mensais').upsert(linha, { onConflict: 'worksite_id,mes' }).select('*').single(),
        'salvar a meta do mês',
      )
      if (!salvo) return null
      setTudo((t) => t && ({
        ...t,
        metasMensais: t.metasMensais.some((m) => m.id === salvo.id)
          ? t.metasMensais.map((m) => (m.id === salvo.id ? salvo : m))
          : [...t.metasMensais, salvo],
      }))
      return salvo
    },
    [escopo, checar, perfil.id],
  )

  // ── Cronograma físico ─────────────────────────────────────
  const salvarItemCronograma = useCallback(
    async (item) => {
      const { organization_id, worksite_id } = escopo()
      const linha = {
        organization_id, worksite_id,
        descricao: item.descricao.trim(),
        data_inicio: item.data_inicio,
        data_fim: item.data_fim,
        peso: Number(item.peso),
        ordem: item.ordem ?? 0,
        inicio_real: item.inicio_real || null,
        fim_real: item.fim_real || null,
      }
      if (item.id) linha.id = item.id

      const salvo = checar(
        await supabase.from('schedule_items').upsert(linha).select('*').single(),
        'salvar o item do cronograma',
      )
      if (!salvo) return null
      setTudo((t) => t && ({
        ...t,
        cronograma: t.cronograma.some((i) => i.id === salvo.id)
          ? t.cronograma.map((i) => (i.id === salvo.id ? salvo : i))
          : [...t.cronograma, salvo],
      }))
      return salvo
    },
    [escopo, checar],
  )

  /* A importação inteira numa chamada só, pelo mesmo motivo do
     planejamento em lote: uma falha no meio de vinte linhas não pode
     deixar metade do cronograma importada sem ninguém saber qual
     metade. */
  const importarCronograma = useCallback(
    async (itens) => {
      if (!itens.length) return []
      const { organization_id, worksite_id } = escopo()
      const salvos = checar(
        await supabase.from('schedule_items')
          .insert(itens.map((i, idx) => ({
            organization_id, worksite_id,
            descricao: i.descricao.trim(),
            data_inicio: i.data_inicio,
            data_fim: i.data_fim,
            peso: Number(i.peso),
            ordem: idx,
          })))
          .select('*'),
        'importar o cronograma',
      )
      if (!salvos) return null
      setTudo((t) => t && ({ ...t, cronograma: [...t.cronograma, ...salvos] }))
      return salvos
    },
    [escopo, checar],
  )

  /* A medição: só o percentual muda. Separada de salvarItemCronograma
     porque é a ação do dia a dia (gestão mede o avanço toda semana) —
     não precisa reabrir descrição, datas e peso para isso. */
  const medirCronograma = useCallback(
    async (id, percentual) => {
      const salvo = checar(
        await supabase.from('schedule_items')
          .update({ percentual: Number(percentual), atualizado_em: new Date().toISOString() })
          .eq('id', id).select('*').single(),
        'registrar a medição',
      )
      if (!salvo) return null
      setTudo((t) => t && ({
        ...t, cronograma: t.cronograma.map((i) => (i.id === id ? salvo : i)),
      }))
      return salvo
    },
    [checar],
  )

  /* O elo que faltava entre Semanal e Mensal: quando um grupo do
     Semanal (agruparPlanejamento) fecha como concluído, a etapa
     correspondente em Mensal (achada por serviço vinculado + local,
     dominio.etapaCorrespondenteAoGrupo) ganha 100% e as datas reais
     sozinha — sem exigir que alguém vá medir manualmente algo que o
     diário já mostrou pronto. Quando não acha etapa (serviço nunca
     vinculado, sem etapa nesse local, ou ambíguo), não força nada —
     a tela do Semanal é quem avisa em vermelho qual grupo ficou sem
     sincronizar e por quê. */
  const sincronizarMensalComSemanal = useCallback(
    async () => {
      const grupos = agruparPlanejamento(
        daObra.planejamento, daObra.planejamento, daObra.diarios, daObra.planejamentoOverrides, hojeISO(),
      )
      const atualizacoes = []
      for (const g of grupos) {
        if (g.situacao.chave !== 'concluida' || !g.fimReal) continue
        const { etapa } = etapaCorrespondenteAoGrupo(g, daObra.cronograma, daObra.servicosCronograma, daObra.locais)
        if (!etapa) continue
        if (Number(etapa.percentual) >= 100 && etapa.inicio_real === g.inicioReal && etapa.fim_real === g.fimReal) continue
        atualizacoes.push({ id: etapa.id, inicio_real: g.inicioReal, fim_real: g.fimReal })
      }
      if (atualizacoes.length === 0) return { atualizados: 0 }
      for (const a of atualizacoes) {
        await supabase.from('schedule_items')
          .update({ percentual: 100, inicio_real: a.inicio_real, fim_real: a.fim_real, atualizado_em: new Date().toISOString() })
          .eq('id', a.id)
      }
      await recarregar()
      return { atualizados: atualizacoes.length }
    },
    [daObra, recarregar],
  )

  /* Importação recorrente do PDF operacional: casada por descrição
     no próprio banco, para o item já existente ter a data e o
     responsável atualizados SEM perder o percentual que a gestão
     já mediu. É por isso que isto é uma função do banco
     (importar_cronograma_pdf) e não um upsert client-side comum. */
  const importarCronogramaPDF = useCallback(
    async (itens) => {
      const r = await supabase.rpc('importar_cronograma_pdf', {
        p_itens: itens.map((i) => ({
          descricao: i.descricao, data_inicio: i.data_inicio,
          data_fim: i.data_fim, responsavel: i.responsavel || null,
        })),
        p_worksite_id: escopo().worksite_id,
      })
      if (r.error) { avisarErro(r.error.message); return null }
      await recarregar()
      return r.data?.[0] || { criados: 0, atualizados: 0 }
    },
    [escopo, avisarErro, recarregar],
  )

  /* Planejamento Global: casa por codigo_externo (o ID da planilha
     do setor de planejamento, não o texto da descrição) — reimportar
     uma versão nova da mesma planilha atualiza as datas em vez de
     duplicar. Nunca cria nem altera etapa do Mensal (schedule_items)
     — só tenta achar uma etapa já existente com o mesmo nome pra
     linkar; Mensal só muda pelo import de PDF dele mesmo. */
  const importarCronogramaGlobal = useCallback(
    async (itens) => {
      const r = await supabase.rpc('importar_cronograma_global', {
        p_itens: itens.map((i) => ({
          codigo_externo: i.codigo_externo, descricao: i.descricao, lote: i.lote || null,
          caminho_critico: Boolean(i.caminho_critico),
          data_inicio: i.data_inicio, data_fim: i.data_fim, duracao: i.duracao ?? null,
          inicio_real: i.inicio_real || null, fim_real: i.fim_real || null, duracao_real: i.duracao_real ?? null,
        })),
        p_worksite_id: escopo().worksite_id,
      })
      if (r.error) { avisarErro(r.error.message); return null }
      await recarregar()
      return r.data?.[0] || { criados: 0, atualizados: 0 }
    },
    [escopo, avisarErro, recarregar],
  )

  /* Tenta linkar (por nome parecido, não exato) toda tarefa do Global
     que ainda esteja sem etapa contra as etapas do Mensal — chamada
     de novo a qualquer momento (não só no import), pra pegar etapa
     que foi cadastrada em Mensal depois. Busca direto no banco (não
     do estado local) pelo mesmo motivo do vincularServicosAutomaticamente:
     evitar corrida logo após um import/cadastro recém-feito. Só linka
     quando a etapa candidata é única e ainda não foi usada por outra
     linha do Global nesta mesma passada — ambíguo fica sem linkar. */
  const vincularCronogramaGlobalAutomaticamente = useCallback(
    async () => {
      const worksite_id = escopo().worksite_id
      const [pendentesR, etapasR, usadasR] = await Promise.all([
        supabase.from('schedule_global_items').select('id, descricao')
          .eq('worksite_id', worksite_id).is('schedule_item_id', null),
        supabase.from('schedule_items').select('id, descricao').eq('worksite_id', worksite_id),
        supabase.from('schedule_global_items').select('schedule_item_id')
          .eq('worksite_id', worksite_id).not('schedule_item_id', 'is', null),
      ])
      if (pendentesR.error || etapasR.error) return { vinculados: 0 }

      const usadas = new Set((usadasR.data || []).map((g) => g.schedule_item_id))
      const atualizacoes = []
      for (const item of pendentesR.data || []) {
        const candidatas = (etapasR.data || []).filter(
          (e) => !usadas.has(e.id) && cronogramaGlobalCorrespondeEtapa(item.descricao, e.descricao),
        )
        if (candidatas.length === 1) {
          atualizacoes.push({ id: item.id, schedule_item_id: candidatas[0].id })
          usadas.add(candidatas[0].id)
        }
      }
      for (const a of atualizacoes) {
        await supabase.from('schedule_global_items').update({ schedule_item_id: a.schedule_item_id }).eq('id', a.id)
      }
      if (atualizacoes.length) await recarregar()
      return { vinculados: atualizacoes.length }
    },
    [escopo, recarregar],
  )

  /* Vínculo manual: quando o nome não bate parecido o bastante pro
     automático achar, a pessoa escolhe a etapa certa na tela. Passar
     etapaId null desvincula (pra desfazer um vínculo automático errado). */
  const vincularEtapaGlobal = useCallback(
    async (globalItemId, etapaId) => {
      const r = await supabase.from('schedule_global_items')
        .update({ schedule_item_id: etapaId }).eq('id', globalItemId).select('id')
      if (r.error) { checar(r, 'vincular a etapa'); return false }
      if (!r.data || r.data.length === 0) {
        avisarErro('Seu perfil não pode vincular isso. Isso é da gestão.')
        return false
      }
      await recarregar()
      return true
    },
    [checar, avisarErro, recarregar],
  )

  const removerItemCronograma = useCallback(
    async (id) => {
      const r = await supabase.from('schedule_items').delete().eq('id', id).select('id')
      if (r.error) { checar(r, 'remover o item do cronograma'); return false }
      if (!r.data || r.data.length === 0) {
        avisarErro('Seu perfil não pode remover itens do cronograma. Isso é da gestão.')
        return false
      }
      setTudo((t) => t && ({ ...t, cronograma: t.cronograma.filter((i) => i.id !== id) }))
      return true
    },
    [checar, avisarErro],
  )

  /* Liga uma etapa do cronograma aos serviços do Planejamento que a
     compõem — é dali que os "dias realizados" (dominio.diasRealizadosEtapa)
     saem, sem duplicar nada do diário. Troca o conjunto inteiro (apaga
     e reinsere), igual às presenças do diário: mais simples e seguro
     que reconciliar item a item numa lista pequena. */
  const definirServicosDaEtapa = useCallback(
    async (etapaId, servicoIds) => {
      const { organization_id, worksite_id } = escopo()
      const apagou = await supabase.from('schedule_item_services').delete().eq('schedule_item_id', etapaId)
      if (apagou.error) { checar(apagou, 'atualizar os serviços da etapa'); return null }

      let inseridos = []
      if (servicoIds.length) {
        inseridos = checar(
          await supabase.from('schedule_item_services').insert(
            servicoIds.map((service_id) => ({ organization_id, worksite_id, schedule_item_id: etapaId, service_id })),
          ).select('*'),
          'salvar os serviços da etapa',
        ) || []
      }

      setTudo((t) => t && ({
        ...t,
        servicosCronograma: [
          ...t.servicosCronograma.filter((v) => v.schedule_item_id !== etapaId),
          ...inseridos,
        ],
      }))
      return inseridos
    },
    [escopo, checar],
  )

  /* Mesmo vínculo de cima, mas editado do lado do serviço: liga ou
     desliga UMA etapa por vez, em vez de trocar o conjunto inteiro —
     faz sentido aqui porque quem edita o serviço enxerga uma etapa de
     cada vez (um Selecionavel/ChipToggle por linha do cronograma), não
     um conjunto pra salvar de uma vez como do lado da etapa. */
  const alternarVinculoServicoEtapa = useCallback(
    async (servicoId, etapaId) => {
      const existente = tudo?.servicosCronograma.find(
        (v) => v.service_id === servicoId && v.schedule_item_id === etapaId,
      )
      if (existente) {
        const r = await supabase.from('schedule_item_services').delete().eq('id', existente.id)
        if (r.error) { checar(r, 'desligar a etapa do serviço'); return }
        setTudo((t) => t && ({
          ...t, servicosCronograma: t.servicosCronograma.filter((v) => v.id !== existente.id),
        }))
        return
      }
      const { organization_id, worksite_id } = escopo()
      const inserido = checar(
        await supabase.from('schedule_item_services')
          .insert({ organization_id, worksite_id, schedule_item_id: etapaId, service_id: servicoId })
          .select('*').single(),
        'ligar a etapa ao serviço',
      )
      if (!inserido) return
      setTudo((t) => t && ({ ...t, servicosCronograma: [...t.servicosCronograma, inserido] }))
    },
    [tudo, escopo, checar],
  )

  /* Liga em lote, casando pelo nome (dominio.servicoCorrespondeEtapa)
     — pra não obrigar o Julio a clicar par a par nas dezenas de
     etapas que o PDF do cronograma já importa de uma vez. Roda tanto
     sob pedido (botão em Cronograma) quanto sozinha, logo depois de
     um import de PDF (cronograma ou planejamento), pra ficar
     sincronizado sem passo manual nenhum daí pra frente. Só CRIA
     vínculo que falta; nunca desfaz o que já existe.

     Etapa que não casa com NENHUM serviço já cadastrado (comum: PDF do
     cronograma tem trades — SPDA, CFTV, irrigação etc. — que o
     Planejamento nunca cadastrou) ganha um serviço novo, criado a
     partir do nome-base da própria etapa (dominio.nomeBaseDaEtapa),
     pra toda etapa do cronograma virar opção selecionável no
     Planejamento sem passo manual nenhum. */
  const vincularServicosAutomaticamente = useCallback(
    async () => {
      /* Busca direto no banco, não do estado local (`tudo`) — chamada
         logo depois de um import, o React ainda não re-renderizou com
         as etapas/serviços que acabaram de entrar. Ler do banco de
         novo é a forma simples de nunca correr atrás de dado velho. */
      const { organization_id, worksite_id } = escopo()
      const [etapasR, servicosR, vinculosR] = await Promise.all([
        supabase.from('schedule_items').select('id, descricao').eq('worksite_id', worksite_id),
        supabase.from('services').select('id, nome').eq('worksite_id', worksite_id).neq('ativo', false),
        supabase.from('schedule_item_services').select('schedule_item_id, service_id').eq('worksite_id', worksite_id),
      ])
      const falhou = [etapasR, servicosR, vinculosR].find((r) => r.error)
      if (falhou) { checar(falhou, 'vincular serviços automaticamente'); return { vinculos: [], servicosCriados: 0 } }

      const etapas = etapasR.data || []
      const servicos = servicosR.data || []
      const existentes = new Set(
        (vinculosR.data || []).map((v) => `${v.schedule_item_id}:${v.service_id}`),
      )
      const novosVinculos = []
      const etapasLigadas = new Set((vinculosR.data || []).map((v) => v.schedule_item_id))

      etapas.forEach((etapa) => {
        const achou = servicos.find((servico) => servicoCorrespondeEtapa(servico.nome, etapa.descricao))
        if (!achou) return
        const chave = `${etapa.id}:${achou.id}`
        if (existentes.has(chave)) return
        existentes.add(chave)
        etapasLigadas.add(etapa.id)
        novosVinculos.push({ organization_id, worksite_id, schedule_item_id: etapa.id, service_id: achou.id })
      })

      // Agrupa quem sobrou sem serviço pelo nome-base, pra não criar um serviço repetido por local (ex.: "IRRIGAÇÃO" em dois pátios vira um serviço só)
      const grupos = new Map()
      etapas.forEach((etapa) => {
        if (etapasLigadas.has(etapa.id)) return
        const nomeBase = nomeBaseDaEtapa(etapa.descricao)
        if (!nomeBase) return
        const chaveGrupo = normalizarParaCasar(nomeBase)
        if (!grupos.has(chaveGrupo)) grupos.set(chaveGrupo, { nome: nomeBase, etapas: [] })
        grupos.get(chaveGrupo).etapas.push(etapa)
      })

      let servicosCriados = []
      if (grupos.size) {
        servicosCriados = checar(
          await supabase.from('services').insert(
            Array.from(grupos.values()).map((g) => ({ organization_id, worksite_id, nome: g.nome })),
          ).select('*'),
          'criar serviços a partir do cronograma',
        ) || []
        const servicoPorNome = new Map(servicosCriados.map((s) => [s.nome, s]))
        grupos.forEach((grupo) => {
          const servicoCriado = servicoPorNome.get(grupo.nome)
          if (!servicoCriado) return
          grupo.etapas.forEach((etapa) => {
            novosVinculos.push({ organization_id, worksite_id, schedule_item_id: etapa.id, service_id: servicoCriado.id })
          })
        })
      }

      if (!novosVinculos.length) return { vinculos: [], servicosCriados: servicosCriados.length }
      const inseridos = checar(
        await supabase.from('schedule_item_services').insert(novosVinculos).select('*'),
        'vincular serviços automaticamente',
      )
      if (!inseridos) return { vinculos: [], servicosCriados: servicosCriados.length }
      setTudo((t) => t && ({
        ...t,
        servicos: servicosCriados.length ? [...t.servicos, ...servicosCriados] : t.servicos,
        servicosCronograma: [...t.servicosCronograma, ...inseridos],
      }))
      return { vinculos: inseridos, servicosCriados: servicosCriados.length }
    },
    [escopo, checar],
  )

  // ── Lembretes ──────────────────────────────────────────────
  /* Sempre para quem cria (BRIEFING seção 6: "sem recorrência na v1",
     e aqui sem terceiro também — o mesmo recorte que a Edge Function
     do WhatsApp usa). Quem de fato dispara o aviso na hora certa é o
     agendador do WhatsApp; esta tela só guarda a intenção. */
  const salvarLembrete = useCallback(
    async (l) => {
      const { organization_id, worksite_id } = escopo()
      const linha = {
        organization_id, worksite_id,
        texto: l.texto.trim(),
        disparar_em: l.disparar_em,
        local: (l.local || '').trim() || null,
        observacoes: (l.observacoes || '').trim() || null,
        responsaveis_ids: l.responsaveis_ids || [],
        criado_por: perfil.id,
        destinatario_id: perfil.id,
        origem: 'app',
      }
      if (l.id) linha.id = l.id

      const salvo = checar(
        await supabase.from('reminders').upsert(linha).select('*').single(),
        'salvar o lembrete',
      )
      if (!salvo) return null
      setTudo((t) => t && ({
        ...t,
        lembretes: t.lembretes.some((x) => x.id === salvo.id)
          ? t.lembretes.map((x) => (x.id === salvo.id ? salvo : x))
          : [...t.lembretes, salvo],
      }))
      return salvo
    },
    [perfil.id, escopo, checar],
  )

  const mudarStatusLembrete = useCallback(
    async (id, novoStatus) => {
      const atual = tudo?.lembretes.find((l) => l.id === id)
      if (!atual) return

      setTudo((t) => t && ({
        ...t, lembretes: t.lembretes.map((l) => (l.id === id ? { ...l, status: novoStatus } : l)),
      }))
      const r = await supabase.from('reminders').update({ status: novoStatus }).eq('id', id)
      if (r.error) {
        checar(r, 'atualizar o lembrete')
        setTudo((t) => t && ({ ...t, lembretes: t.lembretes.map((l) => (l.id === id ? atual : l)) }))
      }
    },
    [tudo, checar],
  )

  const removerLembrete = useCallback(
    async (id) => {
      const r = await supabase.from('reminders').delete().eq('id', id).select('id')
      if (r.error) { checar(r, 'remover o lembrete'); return false }
      setTudo((t) => t && ({ ...t, lembretes: t.lembretes.filter((l) => l.id !== id) }))
      return true
    },
    [checar],
  )

  /* Notificações por módulo (tela Notificações): quem recebe push
     quando alguém lança diário, refeição, pendência ou atualiza o
     planejamento, nesta obra. Uma linha por (obra, módulo) — salvar
     de novo substitui a lista inteira de destinatários. */
  const salvarRegraNotificacao = useCallback(
    async (modulo, destinatariosIds) => {
      const { organization_id, worksite_id } = escopo()
      const salvo = checar(
        await supabase.from('notification_rules')
          .upsert({
            organization_id, worksite_id, modulo,
            destinatarios_ids: destinatariosIds || [],
            atualizado_em: new Date().toISOString(),
          }, { onConflict: 'worksite_id,modulo' })
          .select('*').single(),
        'salvar quem é notificado',
      )
      if (!salvo) return false
      setTudo((t) => t && ({
        ...t,
        regrasNotificacao: t.regrasNotificacao.some((r) => r.id === salvo.id)
          ? t.regrasNotificacao.map((r) => (r.id === salvo.id ? salvo : r))
          : [...t.regrasNotificacao, salvo],
      }))
      return true
    },
    [escopo, checar],
  )

  // ── Catálogo de materiais ─────────────────────────────────
  const salvarMaterial = useCallback(
    async ({ nome, unidade_padrao }) => {
      const limpo = (nome || '').trim()
      if (!limpo) return null
      const existente = tudo?.materiais.find(
        (m) => m.nome.toLowerCase() === limpo.toLowerCase(),
      )
      if (existente) return existente

      const novo = checar(
        await supabase.from('materials')
          .insert({ organization_id: perfil.organization_id, nome: limpo,
                    unidade_padrao: (unidade_padrao || '').trim() || null })
          .select('*').single(),
        'cadastrar o material',
      )
      if (!novo) return null
      setTudo((t) => t && ({ ...t, materiais: [...t.materiais, novo] }))
      return novo
    },
    [tudo, perfil.organization_id, checar],
  )

  // ── Catálogo de tipos de serviço (Produtividade e Medição) ──
  /* Mesmo princípio do catálogo de materiais acima: nível
     organização, reutilizável entre obras — por isso não recebe
     worksite_id. */
  const salvarTipoServico = useCallback(
    async (item) => {
      const linha = {
        organization_id: perfil.organization_id,
        nome: item.nome,
        unidade_resultado: item.unidade_resultado,
        campos_dimensao: item.campos_dimensao || [],
        formula: item.formula,
        etapas: item.etapas || [],
      }
      if (item.id) linha.id = item.id
      const salvo = checar(
        await supabase.from('service_types').upsert(linha).select('*').single(),
        'salvar o tipo de serviço',
      )
      if (!salvo) return null
      setTudo((t) => t && ({
        ...t,
        tiposServico: t.tiposServico.some((x) => x.id === salvo.id)
          ? t.tiposServico.map((x) => (x.id === salvo.id ? salvo : x))
          : [...t.tiposServico, salvo],
      }))
      return salvo
    },
    [perfil.organization_id, checar],
  )

  const arquivarTipoServico = useCallback(
    async (id) => {
      const atual = tudo?.tiposServico.find((x) => x.id === id)
      if (!atual) return
      const novoValor = atual.ativo === false ? true : false
      const r = await supabase.from('service_types').update({ ativo: novoValor }).eq('id', id)
      if (r.error) { checar(r, `${novoValor ? 'reativar' : 'arquivar'} o tipo de serviço`); return }
      setTudo((t) => t && ({
        ...t,
        tiposServico: t.tiposServico.map((x) => (x.id === id ? { ...x, ativo: novoValor } : x)),
      }))
    },
    [tudo, checar],
  )

  /* Serviço: registro por obra que fixa tipo (do catálogo), empresa,
     contrato e o time de funcionários ANTES de importar qualquer
     planta — cada combinação empresa+contrato é o seu próprio
     Serviço (o Julio faz esse vínculo manualmente, o app não tenta
     ligar etapas entre serviços diferentes sozinho). */
  const salvarServico = useCallback(
    async (item) => {
      const linha = {
        organization_id: perfil.organization_id, worksite_id: obraId,
        nome: item.nome, service_type_id: item.service_type_id,
        company_id: item.company_id || null, cod_contrato: item.cod_contrato || null,
        funcionarios_ids: item.funcionarios_ids || [],
      }
      if (item.id) linha.id = item.id
      else linha.criado_por = perfil.id
      const salvo = checar(
        await supabase.from('production_services').upsert(linha).select('*').single(),
        'salvar o serviço',
      )
      if (!salvo) return null
      setTudo((t) => t && ({
        ...t,
        servicosProducao: t.servicosProducao.some((x) => x.id === salvo.id)
          ? t.servicosProducao.map((x) => (x.id === salvo.id ? salvo : x))
          : [salvo, ...t.servicosProducao],
      }))
      return salvo
    },
    [perfil.organization_id, perfil.id, obraId, checar],
  )

  const arquivarServico = useCallback(
    async (id) => {
      const atual = tudo?.servicosProducao.find((x) => x.id === id)
      if (!atual) return
      const novoValor = atual.ativo === false ? true : false
      const r = await supabase.from('production_services').update({ ativo: novoValor }).eq('id', id)
      if (r.error) { checar(r, `${novoValor ? 'reativar' : 'arquivar'} o serviço`); return }
      setTudo((t) => t && ({
        ...t,
        servicosProducao: t.servicosProducao.map((x) => (x.id === id ? { ...x, ativo: novoValor } : x)),
      }))
    },
    [tudo, checar],
  )

  // ── Plantas, marcadores e eventos (Produtividade e Medição) ─
  const enviarPlanta = useCallback(
    async ({ arquivo, nome, serviceId }) => {
      const { erro, planta } = await enviarPlantaProducao({
        arquivo, organizationId: perfil.organization_id, obraId, nome, autorId: perfil.id, serviceId,
      })
      if (erro) { avisarErro(erro); return null }
      setTudo((t) => t && ({ ...t, plantasProducao: [planta, ...t.plantasProducao] }))
      return planta
    },
    [perfil.organization_id, perfil.id, obraId, avisarErro],
  )

  const arquivarPlanta = useCallback(
    async (id) => {
      const r = await supabase.from('production_plans').update({ ativo: false }).eq('id', id)
      if (r.error) { checar(r, 'arquivar a planta'); return }
      setTudo((t) => t && ({
        ...t,
        plantasProducao: t.plantasProducao.map((p) => (p.id === id ? { ...p, ativo: false } : p)),
      }))
    },
    [checar],
  )

  /* Marca um elemento na planta pela primeira vez: nasce o pino
     (production_markers) E o primeiro evento (production_marker_events)
     juntos, numa tacada só — o formulário de marcação já pede tudo
     isso de uma vez (ver produtividade-medicao.md, seção 4). */
  const salvarMarcador = useCallback(
    async ({ plan_id, service_type_id, elemento, forma, x, y, x2, y2, pagina, dimensoes, quantidade_calculada, evento }) => {
      const { organization_id, worksite_id } = escopo()
      const marcador = checar(
        await supabase.from('production_markers').insert({
          organization_id, worksite_id, plan_id, service_type_id, elemento,
          forma: forma || 'ponto', x, y, x2: x2 ?? null, y2: y2 ?? null,
          pagina: pagina || 1, dimensoes: dimensoes || {}, quantidade_calculada,
          etapa_atual: evento.etapa, criado_por: perfil.id,
        }).select('*').single(),
        'salvar a marcação',
      )
      if (!marcador) return null

      /* "A posteriori": ou não existe diário nenhum ainda pra essa
         data, ou o diário já estava finalizado quando o evento foi
         registrado — nos dois casos, o lançamento chegou depois do
         fechamento normal do dia. */
      const diario = evento.data_execucao ? diarioDaData(tudo?.diarios || [], evento.data_execucao, worksite_id) : null
      const aPosteriori = !diario || diario.status === 'finalizado'

      const eventoSalvo = checar(
        await supabase.from('production_marker_events').insert({
          organization_id, worksite_id, marker_id: marcador.id,
          etapa: evento.etapa, worker_id: evento.worker_id || null,
          data_execucao: evento.data_execucao, diario_id: diario?.id || null,
          a_posteriori: aPosteriori, contract_item_id: evento.contract_item_id || null,
          quantidade: evento.quantidade ?? quantidade_calculada, observacao: evento.observacao || null,
          autor_id: perfil.id,
        }).select('*').single(),
        'salvar o evento da marcação',
      )
      if (!eventoSalvo) {
        // Sem evento, o pino não deveria existir sozinho — desfaz.
        await supabase.from('production_markers').delete().eq('id', marcador.id)
        return null
      }

      setTudo((t) => t && ({
        ...t,
        marcadoresProducao: [...t.marcadoresProducao, marcador],
        eventosProducao: [eventoSalvo, ...t.eventosProducao],
      }))
      return marcador
    },
    [escopo, checar, perfil.id, tudo],
  )

  /* Muda o estágio de um pino já existente: acrescenta um evento
     novo (mantendo o histórico do que já passou) e atualiza só o
     `etapa_atual` do marcador, que é o que define a cor na planta. */
  const registrarEventoMarcador = useCallback(
    async (markerId, evento) => {
      const { organization_id, worksite_id } = escopo()
      const marcadorAtual = tudo?.marcadoresProducao.find((m) => m.id === markerId)
      if (!marcadorAtual) return null

      const diario = evento.data_execucao ? diarioDaData(tudo?.diarios || [], evento.data_execucao, worksite_id) : null
      const aPosteriori = !diario || diario.status === 'finalizado'

      const eventoSalvo = checar(
        await supabase.from('production_marker_events').insert({
          organization_id, worksite_id, marker_id: markerId,
          etapa: evento.etapa, worker_id: evento.worker_id || null,
          data_execucao: evento.data_execucao, diario_id: diario?.id || null,
          a_posteriori: aPosteriori, contract_item_id: evento.contract_item_id || null,
          quantidade: evento.quantidade ?? marcadorAtual.quantidade_calculada, observacao: evento.observacao || null,
          autor_id: perfil.id,
        }).select('*').single(),
        'registrar o novo estágio',
      )
      if (!eventoSalvo) return null

      const marcadorAtualizado = checar(
        await supabase.from('production_markers').update({ etapa_atual: evento.etapa }).eq('id', markerId).select('*').single(),
        'atualizar o estágio da marcação',
      )

      setTudo((t) => t && ({
        ...t,
        eventosProducao: [eventoSalvo, ...t.eventosProducao],
        marcadoresProducao: marcadorAtualizado
          ? t.marcadoresProducao.map((m) => (m.id === markerId ? marcadorAtualizado : m))
          : t.marcadoresProducao,
      }))
      return eventoSalvo
    },
    [escopo, checar, perfil.id, tudo],
  )

  const arquivarMarcador = useCallback(
    async (id) => {
      const r = await supabase.from('production_markers').update({ ativo: false }).eq('id', id)
      if (r.error) { checar(r, 'arquivar a marcação'); return }
      setTudo((t) => t && ({
        ...t,
        marcadoresProducao: t.marcadoresProducao.map((m) => (m.id === id ? { ...m, ativo: false } : m)),
      }))
    },
    [checar],
  )

  /* Corrige um evento do histórico já lançado (etapa/colaborador/
     data/contrato/quantidade/observação errados) — não cria evento
     novo, edita o que já existe. Se for o evento mais recente do
     marcador, o etapa_atual e o a_posteriori/diário são recalculados
     igual a um evento novo, pra não ficar desalinhado. */
  const editarEventoMarcador = useCallback(
    async (eventoId, campos) => {
      const { worksite_id } = escopo()
      const diario = campos.data_execucao ? diarioDaData(tudo?.diarios || [], campos.data_execucao, worksite_id) : null
      const aPosteriori = !diario || diario.status === 'finalizado'

      const eventoSalvo = checar(
        await supabase.from('production_marker_events').update({
          etapa: campos.etapa, worker_id: campos.worker_id || null,
          data_execucao: campos.data_execucao, diario_id: diario?.id || null,
          a_posteriori: aPosteriori, contract_item_id: campos.contract_item_id || null,
          quantidade: campos.quantidade, observacao: campos.observacao || null,
        }).eq('id', eventoId).select('*').single(),
        'editar o evento',
      )
      if (!eventoSalvo) return false

      const eventosDoMarcador = (tudo?.eventosProducao || [])
        .map((e) => (e.id === eventoId ? eventoSalvo : e))
        .filter((e) => e.marker_id === eventoSalvo.marker_id)
      const maisRecente = eventosDoMarcador.reduce(
        (a, b) => (!a || b.data_execucao > a.data_execucao ? b : a), null,
      )
      const marcadorAtualizado = maisRecente?.etapa
        ? checar(
          await supabase.from('production_markers').update({ etapa_atual: maisRecente.etapa }).eq('id', eventoSalvo.marker_id).select('*').single(),
          'atualizar o estágio da marcação',
        )
        : null

      setTudo((t) => t && ({
        ...t,
        eventosProducao: t.eventosProducao.map((e) => (e.id === eventoId ? eventoSalvo : e)),
        marcadoresProducao: marcadorAtualizado
          ? t.marcadoresProducao.map((m) => (m.id === eventoSalvo.marker_id ? marcadorAtualizado : m))
          : t.marcadoresProducao,
      }))
      return true
    },
    [escopo, checar, tudo],
  )

  /* Corrige o pino já marcado (nome, dimensões) — diferente de um
     "novo evento", que muda o estágio. Liberado pro campo também: quem
     marcou errado em obra é quem melhor sabe corrigir. */
  const editarMarcador = useCallback(
    async (id, { elemento, dimensoes, quantidade_calculada }) => {
      const marcador = checar(
        await supabase.from('production_markers')
          .update({ elemento, dimensoes, quantidade_calculada })
          .eq('id', id).select('*').single(),
        'editar a marcação',
      )
      if (!marcador) return false
      setTudo((t) => t && ({
        ...t,
        marcadoresProducao: t.marcadoresProducao.map((m) => (m.id === id ? marcador : m)),
      }))
      return true
    },
    [checar],
  )

  // ── Usuários (só o admin chega aqui) ──────────────────────
  const definirPapel = useCallback(
    async (usuarioId, papel) => {
      const alvo = tudo?.perfis.find((p) => p.id === usuarioId)
      const mudanca = { role: papel }
      /* Quem se cadastrou sozinho ainda não tem organização nem
         obra. Liberar o acesso é justamente colocá-lo nelas. */
      if (alvo && !alvo.organization_id) {
        mudanca.organization_id = perfil.organization_id
        mudanca.worksite_id = obraId || perfil.worksite_id
      }
      const atualizado = checar(
        await supabase.from('profiles').update(mudanca).eq('id', usuarioId).select('*').single(),
        'alterar o perfil de acesso',
      )
      if (!atualizado) return
      setTudo((t) => t && ({
        ...t, perfis: t.perfis.map((p) => (p.id === usuarioId ? atualizado : p)),
      }))
    },
    [tudo, perfil, obraId, checar],
  )

  /* `lista === null` = sem restrição, vê todos os módulos. Um array
     (mesmo vazio) trava o menu a só esses. */
  const definirModulosPermitidos = useCallback(
    async (usuarioId, lista) => {
      const atualizado = checar(
        await supabase.from('profiles').update({ modulos_permitidos: lista }).eq('id', usuarioId).select('*').single(),
        'alterar os módulos liberados',
      )
      if (!atualizado) return
      setTudo((t) => t && ({
        ...t, perfis: t.perfis.map((p) => (p.id === usuarioId ? atualizado : p)),
      }))
    },
    [checar],
  )

  /* Liga um número que já escreveu pro bot a um perfil existente --
     sem isso a Edge Function nunca acha o "dono" da mensagem e o
     número fica preso respondendo "peça pro administrador te
     cadastrar" pra sempre. profileId null desfaz o vínculo. */
  const vincularContatoWhatsapp = useCallback(
    async (contatoId, profileId) => {
      const atualizado = checar(
        await supabase.from('whatsapp_contacts')
          .update({ profile_id: profileId }).eq('id', contatoId).select('*').single(),
        'vincular o número de WhatsApp',
      )
      if (!atualizado) return
      setTudo((t) => t && ({
        ...t, contatosWhatsapp: t.contatosWhatsapp.map((c) => (c.id === contatoId ? atualizado : c)),
      }))
    },
    [checar],
  )

  /* `lista === null` = sem restrição, vê todas as obras. */
  const definirObrasPermitidas = useCallback(
    async (usuarioId, lista) => {
      const atualizado = checar(
        await supabase.from('profiles').update({ obras_permitidas: lista }).eq('id', usuarioId).select('*').single(),
        'alterar as obras liberadas',
      )
      if (!atualizado) return
      setTudo((t) => t && ({
        ...t, perfis: t.perfis.map((p) => (p.id === usuarioId ? atualizado : p)),
      }))
    },
    [checar],
  )

  /* Só admin chama (a Edge Function confere de novo, não confia só
     na tela escondendo o botão — ver comentário lá). Não passa pela
     tabela profiles direto: senha é auth.users, só a service role
     mexe nisso, e essa chave nunca pode chegar no navegador. */
  const redefinirSenhaUsuario = useCallback(
    async (usuarioId, novaSenha) => {
      const r = await supabase.functions.invoke('redefinir-senha', { body: { userId: usuarioId, novaSenha } })
      if (r.error || r.data?.erro) {
        avisarErro(r.data?.erro || 'Não consegui redefinir a senha. Tenta de novo.')
        return false
      }
      return true
    },
    [avisarErro],
  )

  const valor = useMemo(
    () => tudo && daObra && ({
      fonte: 'supabase',
      org: tudo.org,
      obras: obrasPermitidas,
      perfis: tudo.perfis,
      materiais: tudo.materiais,
      contatosWhatsapp: tudo.contatosWhatsapp,
      tiposServico: tudo.tiposServico,
      /* Rendimento (Produtividade) cruza obras — o catálogo de
         serviços é da organização, então "colaborador X vs. média do
         serviço" precisa olhar eventos de TODAS as obras, não só a
         atual (ver `...daObra` logo abaixo, que sobrescreveria com a
         versão filtrada se viesse depois). */
      eventosProducaoTodasObras: tudo.eventosProducao,
      marcadoresProducaoTodasObras: tudo.marcadoresProducao,
      plantasProducaoTodasObras: tudo.plantasProducao,
      servicosProducaoTodasObras: tudo.servicosProducao,
      ...daObra,
      salvarMaterial,
      trocarObra,
      perfil, erro, salvando, avisarErro, recarregar,
      nomeDe, rotuloAtividade, colaboradorPorId, perfilPorId, materialEstoquePorId, materialEpiPorId,
      salvarDiario, reabrirDiario,
      adicionarFoto, removerFoto, fotosDaObra,
      criarColaboradorRapido, revisarColaborador, definirAdministrativoColaborador, mesclarColaborador,
      salvarPendencia, salvarPendenciasEmLote, salvarEstruturaCustosEmLote, confirmarPendenciasTaticasDaSemana, alternarPendencia, mudarStatusPendencia, excluirPendencia,
      adicionarFotoPendencia, removerFotoPendencia, adicionarAnexoPendencia, removerAnexoPendencia,
      salvarOcorrenciaSeguranca, excluirOcorrenciaSeguranca,
      adicionarFotoOcorrencia, removerFotoOcorrencia,
      salvarAdvertencia, excluirAdvertencia,
      adicionarFotoAdvertencia, removerFotoAdvertencia, adicionarFotoEquipamento, removerFotoEquipamento,
      salvarEntregaEquipamento, excluirEntregaEquipamento,
      salvarApontamento, mudarStatusApontamento, abrirApontamento, excluirApontamento,
      salvarDisciplinaApontamento, removerDisciplinaApontamento,
      salvarComentarioApontamento, apagarComentarioApontamento,
      adicionarAnexoApontamento, removerAnexoApontamento,
      salvarCadastro, arquivarCadastro, cadastroDeOutraObra,
      salvarEntradaEstoque, excluirEntradaEstoque, salvarSaidaEstoque, excluirSaidaEstoque, importarMovimentoEstoque,
      salvarEntradaEpi, excluirEntradaEpi, salvarSaidaEpi, excluirSaidaEpi,
      salvarTreinamentoColaborador, excluirTreinamentoColaborador, definirIsencaoTreinamento,
      importarSuprimentos, vincularSuprimentoAutomaticamente, vincularEntradaSuprimento, definirDestinoSuprimento,
      excluirPedidoSuprimento, reativarPedidoSuprimento,
      importarContratos, definirDestinoContrato, definirEmpresaContrato,
      salvarRefeicao, excluirRefeicao,
      salvarPlanejado, salvarPlanejadosEmLote, marcarDaPlanilha, preencherEmpresaPlanejada, removerPlanejado, salvarOverridePlanejamento,
      salvarMotivoNaoExecutado, salvarMetaMensal,
      definirPapel, definirModulosPermitidos, definirObrasPermitidas, vincularContatoWhatsapp,
      redefinirSenhaUsuario,
      salvarItemCronograma, importarCronograma, importarCronogramaPDF, importarCronogramaGlobal,
      vincularCronogramaGlobalAutomaticamente, vincularEtapaGlobal, sincronizarMensalComSemanal,
      medirCronograma, removerItemCronograma, definirServicosDaEtapa, alternarVinculoServicoEtapa,
      vincularServicosAutomaticamente,
      salvarLembrete, mudarStatusLembrete, removerLembrete,
      salvarRegraNotificacao,
      salvarTipoServico, arquivarTipoServico,
      salvarServico, arquivarServico,
      enviarPlanta, arquivarPlanta, salvarMarcador, registrarEventoMarcador, arquivarMarcador, editarMarcador, editarEventoMarcador,
    }),
    [
      tudo, daObra, obrasPermitidas, trocarObra, perfil, erro, salvando, avisarErro, recarregar,
      nomeDe, rotuloAtividade, colaboradorPorId, perfilPorId, materialEstoquePorId, materialEpiPorId,
      salvarDiario, reabrirDiario, adicionarFoto, removerFoto, fotosDaObra,
      criarColaboradorRapido, revisarColaborador, definirAdministrativoColaborador,
      mesclarColaborador, salvarPendencia, salvarPendenciasEmLote, salvarEstruturaCustosEmLote, confirmarPendenciasTaticasDaSemana, alternarPendencia, mudarStatusPendencia, excluirPendencia,
      adicionarFotoPendencia, removerFotoPendencia, adicionarAnexoPendencia, removerAnexoPendencia,
      salvarOcorrenciaSeguranca, excluirOcorrenciaSeguranca,
      adicionarFotoOcorrencia, removerFotoOcorrencia,
      salvarAdvertencia, excluirAdvertencia,
      adicionarFotoAdvertencia, removerFotoAdvertencia, adicionarFotoEquipamento, removerFotoEquipamento,
      salvarEntregaEquipamento, excluirEntregaEquipamento,
      salvarApontamento, mudarStatusApontamento, abrirApontamento, excluirApontamento,
      salvarDisciplinaApontamento, removerDisciplinaApontamento,
      salvarComentarioApontamento, apagarComentarioApontamento,
      adicionarAnexoApontamento, removerAnexoApontamento,
      salvarCadastro, arquivarCadastro, cadastroDeOutraObra,
      salvarEntradaEstoque, excluirEntradaEstoque, salvarSaidaEstoque, excluirSaidaEstoque, importarMovimentoEstoque,
      salvarEntradaEpi, excluirEntradaEpi, salvarSaidaEpi, excluirSaidaEpi,
      salvarTreinamentoColaborador, excluirTreinamentoColaborador, definirIsencaoTreinamento,
      importarSuprimentos, vincularSuprimentoAutomaticamente, vincularEntradaSuprimento, definirDestinoSuprimento,
      excluirPedidoSuprimento, reativarPedidoSuprimento,
      importarContratos, definirDestinoContrato, definirEmpresaContrato,
      salvarRefeicao, excluirRefeicao,
      salvarPlanejado, salvarPlanejadosEmLote, marcarDaPlanilha, preencherEmpresaPlanejada, removerPlanejado, salvarOverridePlanejamento,
      salvarMotivoNaoExecutado, salvarMetaMensal, definirPapel,
      definirModulosPermitidos, definirObrasPermitidas, vincularContatoWhatsapp,
      redefinirSenhaUsuario,
      salvarMaterial,
      salvarItemCronograma, importarCronograma, importarCronogramaPDF, importarCronogramaGlobal,
      vincularCronogramaGlobalAutomaticamente, vincularEtapaGlobal, sincronizarMensalComSemanal,
      medirCronograma, removerItemCronograma, definirServicosDaEtapa, alternarVinculoServicoEtapa,
      vincularServicosAutomaticamente,
      salvarLembrete, mudarStatusLembrete, removerLembrete,
      salvarRegraNotificacao,
      salvarTipoServico, arquivarTipoServico,
      salvarServico, arquivarServico,
      enviarPlanta, arquivarPlanta, salvarMarcador, registrarEventoMarcador, arquivarMarcador, editarMarcador, editarEventoMarcador,
    ],
  )

  if (!valor) {
    return (
      <div className="app">
        <div className="empty" style={{ paddingTop: 120 }}>
          Carregando os dados da obra…
          {erro && <div className="alert danger" style={{ marginTop: 20, textAlign: 'left' }}>{erro}</div>}
        </div>
      </div>
    )
  }

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useDados() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useDados precisa estar dentro de <DadosProvider>')
  return ctx
}
