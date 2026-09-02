/* ============================================================
   FERRAMENTAS DO ASSISTENTE DE IA — o que o ChatBot pode fazer
   além de só conversar: abrir telas e consultar dados reais do
   Prumo. As definições (FERRAMENTAS) vão pro Claude via a Edge
   Function prumo-chat; a execução (executarFerramenta) roda aqui
   no navegador, com os dados já carregados no DadosContext.
   ============================================================ */

import {
  normalizarParaCasar, hojeISO, diarioDaData, moduloPermitido,
  situacaoDiario, totalPresentes, progressoDiario,
  contarPendencias, filtrarPendencias, estaAtrasada,
  filtrarLembretes,
  saldoEstoqueImportado,
  statusTreinamento,
  pendentesDeRevisao,
} from './dominio'

export const FERRAMENTAS = [
  {
    name: 'abrir_tela',
    description: 'Abre uma tela do Prumo direto pro usuário ver. Use quando o pedido for pra "abrir", "ver" ou "ir para" um módulo específico, como o diário de hoje.',
    input_schema: {
      type: 'object',
      properties: {
        destino: {
          type: 'string',
          enum: [
            'diarioHoje', 'diarios', 'efetivo', 'pendencias', 'planejamento', 'galeria',
            'lembretes', 'equipamentos', 'suprimentos', 'contratos', 'producao', 'seguranca',
            'projetos', 'cadastros',
          ],
          description: '"diarioHoje" abre o diário de hoje da obra atual (mesmo que ainda não exista). Os demais valores abrem o módulo correspondente.',
        },
      },
      required: ['destino'],
    },
  },
  {
    name: 'consultar_rendimento',
    description: 'Consulta o ranking de rendimento (produtividade) dos colaboradores no módulo Produtividade, do maior pro menor, em quantidade produzida por dia trabalhado. Use pra perguntas tipo "qual colaborador de X mais produz" ou "quem tem o melhor rendimento em Y". Considera o histórico completo, todas as obras.',
    input_schema: {
      type: 'object',
      properties: {
        busca: {
          type: 'string',
          description: 'Termo pra filtrar por tipo de serviço ou nome do serviço, ex: "escavação", "concretagem". Vazio considera todos os serviços.',
        },
      },
      required: [],
    },
  },
  {
    name: 'consultar_diario',
    description: 'Consulta a situação do diário de obra de uma data: se foi lançado/finalizado, quantos colaboradores presentes, quantos faltaram, e o progresso das atividades. Use pra perguntas tipo "o diário de hoje já foi fechado?" ou "quantos faltaram ontem?".',
    input_schema: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'Data no formato YYYY-MM-DD. Se vazio, usa hoje.' },
      },
      required: [],
    },
  },
  {
    name: 'consultar_efetivo',
    description: 'Consulta um resumo do efetivo da obra atual: total de colaboradores ativos e quantos estão com cadastro pendente de revisão.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'consultar_pendencias',
    description: 'Consulta pendências da obra atual: contagem por status (abertas/atrasadas/resolvidas) e, se um termo de busca for dado, lista as que batem com o título ou descrição.',
    input_schema: {
      type: 'object',
      properties: {
        busca: { type: 'string', description: 'Termo pra filtrar por título/descrição. Vazio traz só a contagem geral.' },
      },
      required: [],
    },
  },
  {
    name: 'resolver_pendencia',
    description: 'Marca uma pendência como resolvida, pelo título ou parte dele. Se encontrar mais de uma pendência batendo com a busca, NÃO resolve nenhuma — devolve a lista pra você perguntar qual delas ao usuário.',
    input_schema: {
      type: 'object',
      properties: {
        busca: { type: 'string', description: 'Título ou parte do título da pendência a resolver.' },
      },
      required: ['busca'],
    },
  },
  {
    name: 'criar_lembrete',
    description: 'Cria um lembrete pro próprio usuário que está conversando (não dá pra criar lembrete pra outra pessoa por aqui).',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'O texto do lembrete.' },
        disparar_em: { type: 'string', description: 'Data e hora do lembrete, formato ISO 8601, ex: "2026-09-05T10:00:00".' },
        local: { type: 'string', description: 'Local opcional relacionado ao lembrete.' },
      },
      required: ['texto', 'disparar_em'],
    },
  },
  {
    name: 'consultar_lembretes',
    description: 'Consulta os lembretes do próprio usuário que está conversando, filtrando por situação.',
    input_schema: {
      type: 'object',
      properties: {
        filtro: {
          type: 'string',
          enum: ['pendentes', 'atrasados', 'concluidos', 'cancelados', 'todos'],
          description: 'Padrão é "pendentes" se não informado.',
        },
      },
      required: [],
    },
  },
  {
    name: 'consultar_estoque',
    description: 'Consulta o saldo atual de materiais no Almoxarifado da obra atual, opcionalmente filtrado por nome do material. Avisa quais estão abaixo do estoque mínimo cadastrado.',
    input_schema: {
      type: 'object',
      properties: {
        busca: { type: 'string', description: 'Nome ou parte do nome do material. Vazio traz todos.' },
      },
      required: [],
    },
  },
  {
    name: 'consultar_suprimentos',
    description: 'Consulta um resumo dos pedidos de compra (Suprimentos) da obra atual: total de pedidos, quantos ainda sem destino definido (Almoxarifado/EPI), e a distribuição por estágio do pedido.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'vincular_suprimentos_automaticamente',
    description: 'Tenta vincular sozinho os pedidos de compra sem vínculo às entradas de estoque/EPI já lançadas, e detectar o destino (Almoxarifado/EPI) de pedidos sem destino, batendo pelo nome do insumo. Só aplica quando a correspondência é única e sem ambiguidade — o resto continua pra conferência manual.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'consultar_seguranca',
    description: 'Consulta um resumo de Segurança da obra atual: quantos registros de treinamento (NR) estão vencidos ou a vencer, e quantas ocorrências de segurança foram registradas no mês atual.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
]

export async function executarFerramenta(nome, input, contexto) {
  if (nome === 'abrir_tela') return abrirTela(input?.destino, contexto)
  if (nome === 'consultar_rendimento') return consultarRendimento(contexto, input?.busca || '')
  if (nome === 'consultar_diario') return consultarDiario(contexto, input?.data || '')
  if (nome === 'consultar_efetivo') return consultarEfetivo(contexto)
  if (nome === 'consultar_pendencias') return consultarPendencias(contexto, input?.busca || '')
  if (nome === 'resolver_pendencia') return resolverPendencia(contexto, input?.busca || '')
  if (nome === 'criar_lembrete') return criarLembrete(contexto, input || {})
  if (nome === 'consultar_lembretes') return consultarLembretes(contexto, input?.filtro || 'pendentes')
  if (nome === 'consultar_estoque') return consultarEstoque(contexto, input?.busca || '')
  if (nome === 'consultar_suprimentos') return consultarSuprimentos(contexto)
  if (nome === 'vincular_suprimentos_automaticamente') return vincularSuprimentos(contexto)
  if (nome === 'consultar_seguranca') return consultarSeguranca(contexto)
  return { erro: 'Ferramenta desconhecida.' }
}

function precisaModulo(perfil, chave) {
  return perfil && !moduloPermitido(perfil, chave)
}

function abrirTela(destino, { dados, navegar }) {
  if (!destino || !navegar) return { erro: 'Não consegui abrir essa tela.' }
  if (destino === 'diarioHoje') {
    const hoje = hojeISO()
    const diario = diarioDaData(dados.diarios, hoje, dados.obra.id)
    navegar('diario', { data: hoje, id: diario?.id })
  } else {
    navegar(destino, {})
  }
  return { ok: true }
}

function consultarRendimento({ dados, perfil }, busca) {
  if (perfil && !moduloPermitido(perfil, 'producao')) {
    return { erro: 'Este usuário não tem acesso ao módulo de Produtividade.' }
  }

  const alvo = normalizarParaCasar(busca)

  const tiposCorrespondentes = new Set(
    (dados.tiposServico || [])
      .filter((t) => alvo && normalizarParaCasar(t.nome).includes(alvo))
      .map((t) => t.id),
  )
  const servicosCorrespondentes = new Set(
    (dados.servicosProducaoTodasObras || [])
      .filter((s) => !alvo || tiposCorrespondentes.has(s.service_type_id) || normalizarParaCasar(s.nome).includes(alvo))
      .map((s) => s.id),
  )

  if (alvo && servicosCorrespondentes.size === 0) {
    return { encontrado: false, mensagem: `Nenhum serviço de produtividade encontrado com "${busca}".` }
  }

  const planIds = new Set(
    (dados.plantasProducaoTodasObras || [])
      .filter((p) => servicosCorrespondentes.has(p.service_id))
      .map((p) => p.id),
  )
  const markerIds = new Set(
    (dados.marcadoresProducaoTodasObras || [])
      .filter((m) => planIds.has(m.plan_id) && m.ativo !== false)
      .map((m) => m.id),
  )
  const eventos = (dados.eventosProducaoTodasObras || []).filter((e) => markerIds.has(e.marker_id))

  const mapa = new Map()
  for (const ev of eventos) {
    if (!ev.worker_id) continue
    const atual = mapa.get(ev.worker_id) || { quantidade: 0, dias: new Set() }
    atual.quantidade += Number(ev.quantidade) || 0
    atual.dias.add(ev.data_execucao)
    mapa.set(ev.worker_id, atual)
  }

  const ranking = [...mapa.entries()]
    .map(([workerId, info]) => {
      const colaborador = dados.colaboradorPorId(workerId)
      if (!colaborador) return null
      return {
        nome: colaborador.nome,
        quantidade: Math.round(info.quantidade * 100) / 100,
        dias_trabalhados: info.dias.size,
        rendimento_por_dia: info.dias.size > 0 ? Math.round((info.quantidade / info.dias.size) * 100) / 100 : 0,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.rendimento_por_dia - a.rendimento_por_dia)
    .slice(0, 10)

  if (ranking.length === 0) {
    return { encontrado: false, mensagem: 'Nenhum evento de produtividade com colaborador vinculado encontrado nesse filtro.' }
  }
  return { encontrado: true, ranking }
}

function consultarDiario({ dados }, dataInput) {
  const data = dataInput || hojeISO()
  const diario = diarioDaData(dados.diarios, data, dados.obra.id)
  const situacao = situacaoDiario(diario)
  if (!diario) {
    return { data, situacao: situacao.rotulo, mensagem: 'Ainda não existe diário lançado nessa data.' }
  }
  const presentesIds = new Set((diario.presencas || []).filter((p) => p.presente).map((p) => p.worker_id))
  const faltantes = (dados.colaboradores || [])
    .filter((c) => c.ativo !== false && !presentesIds.has(c.id))
    .map((c) => c.nome)
  const progresso = progressoDiario(diario)
  return {
    data,
    situacao: situacao.rotulo,
    presentes: totalPresentes(diario),
    faltantes,
    atividades: progresso,
  }
}

function consultarEfetivo({ dados }) {
  const ativos = (dados.colaboradores || []).filter((c) => c.ativo !== false)
  const pendentesRevisao = pendentesDeRevisao(dados.colaboradores || [])
  return {
    total_ativos: ativos.length,
    pendentes_de_revisao: pendentesRevisao.length,
    nomes_pendentes_de_revisao: pendentesRevisao.map((c) => c.nome),
  }
}

function consultarPendencias({ dados, perfil }, busca) {
  if (precisaModulo(perfil, 'pendencias')) return { erro: 'Este usuário não tem acesso ao módulo de Pendências.' }
  const lista = dados.pendencias || []
  const contagem = contarPendencias(lista)
  if (!busca.trim()) return { contagem }
  const alvo = normalizarParaCasar(busca)
  const encontradas = lista
    .filter((p) => normalizarParaCasar(p.titulo).includes(alvo) || normalizarParaCasar(p.descricao || '').includes(alvo))
    .map((p) => ({ titulo: p.titulo, status: p.status, atrasada: estaAtrasada(p), prazo: p.prazo }))
  return { contagem, encontradas }
}

async function resolverPendencia({ dados, perfil }, busca) {
  if (precisaModulo(perfil, 'pendencias')) return { erro: 'Este usuário não tem acesso ao módulo de Pendências.' }
  if (!busca.trim()) return { erro: 'Informe o título ou parte do título da pendência.' }
  const alvo = normalizarParaCasar(busca)
  const candidatas = (dados.pendencias || []).filter((p) => (
    p.status !== 'resolvida' && normalizarParaCasar(p.titulo).includes(alvo)
  ))
  if (candidatas.length === 0) return { encontrado: false, mensagem: `Nenhuma pendência aberta encontrada com "${busca}".` }
  if (candidatas.length > 1) {
    return { encontrado: false, ambiguo: true, opcoes: candidatas.map((p) => p.titulo) }
  }
  await dados.mudarStatusPendencia(candidatas[0].id, 'resolvida')
  return { ok: true, titulo: candidatas[0].titulo }
}

async function criarLembrete({ dados }, { texto, disparar_em, local }) {
  if (!texto?.trim() || !disparar_em) return { erro: 'Faltou texto ou data/hora do lembrete.' }
  let iso
  try {
    iso = new Date(disparar_em).toISOString()
  } catch {
    return { erro: 'Data/hora do lembrete inválida.' }
  }
  const salvo = await dados.salvarLembrete({ texto: texto.trim(), disparar_em: iso, local: local || '' })
  if (!salvo) return { erro: 'Não consegui salvar o lembrete.' }
  return { ok: true, texto: salvo.texto, disparar_em: salvo.disparar_em }
}

function consultarLembretes({ dados, perfil }, filtro) {
  const meus = (dados.lembretes || []).filter((l) => l.destinatario_id === perfil?.id)
  const filtrados = filtro === 'todos' ? meus : filtrarLembretes(meus, filtro)
  return {
    total: filtrados.length,
    lembretes: filtrados.map((l) => ({ texto: l.texto, disparar_em: l.disparar_em, local: l.local })),
  }
}

function consultarEstoque({ dados, perfil }, busca) {
  if (precisaModulo(perfil, 'equipamentos')) return { erro: 'Este usuário não tem acesso ao módulo de Almoxarifado.' }
  const saldos = saldoEstoqueImportado(dados.materiaisEstoque, dados.movimentosEstoque)
  const alvo = normalizarParaCasar(busca)
  const filtrados = alvo ? saldos.filter((s) => normalizarParaCasar(s.material.nome).includes(alvo)) : saldos
  if (filtrados.length === 0) return { encontrado: false, mensagem: `Nenhum material encontrado com "${busca}".` }
  return {
    encontrado: true,
    materiais: filtrados.slice(0, 20).map((s) => ({
      nome: s.material.nome,
      saldo: s.saldo,
      unidade: s.material.unidade || '',
      abaixo_do_minimo: s.abaixoDoMinimo,
    })),
  }
}

function consultarSuprimentos({ dados, perfil }) {
  if (precisaModulo(perfil, 'suprimentos')) return { erro: 'Este usuário não tem acesso ao módulo de Suprimentos.' }
  const pedidos = dados.suprimentos || []
  const semDestino = pedidos.filter((p) => !p.destino).length
  const porEstagio = {}
  for (const p of pedidos) {
    const chave = p.estagio || 'sem estágio'
    porEstagio[chave] = (porEstagio[chave] || 0) + 1
  }
  return { total_pedidos: pedidos.length, sem_destino: semDestino, por_estagio: porEstagio }
}

async function vincularSuprimentos({ dados, perfil }) {
  if (precisaModulo(perfil, 'suprimentos')) return { erro: 'Este usuário não tem acesso ao módulo de Suprimentos.' }
  const resultado = await dados.vincularSuprimentoAutomaticamente()
  return { ok: true, ...resultado }
}

function consultarSeguranca({ dados, perfil }) {
  if (precisaModulo(perfil, 'seguranca')) return { erro: 'Este usuário não tem acesso ao módulo de Segurança.' }
  const maisRecentePorPar = new Map()
  for (const t of (dados.treinamentosColaboradores || [])) {
    const chave = `${t.worker_id}_${t.training_type_id}`
    const atual = maisRecentePorPar.get(chave)
    if (!atual || t.data_realizacao > atual.data_realizacao) maisRecentePorPar.set(chave, t)
  }
  let vencidos = 0
  let aVencer = 0
  for (const t of maisRecentePorPar.values()) {
    const status = statusTreinamento(t.data_vencimento)
    if (status === 'vencido') vencidos += 1
    else if (status === 'a_vencer') aVencer += 1
  }
  const mesAtual = hojeISO().slice(0, 7)
  const ocorrenciasNoMes = (dados.ocorrenciasSeguranca || []).filter((o) => (o.data || '').slice(0, 7) === mesAtual).length
  return { treinamentos_vencidos: vencidos, treinamentos_a_vencer: aVencer, ocorrencias_no_mes_atual: ocorrenciasNoMes }
}
