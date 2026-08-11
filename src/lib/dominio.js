/* ============================================================
   REGRAS DE NEGÓCIO — fonte única de cálculo.
   Regra do BRIEFING (seção 8, item 6): todo cálculo derivado
   — atraso, situação, total, média — mora AQUI. Tela, contador
   do menu, PDF e planilha importam destas funções. Nunca copie
   a lógica para dentro de uma tela: as duas versões divergem.
   ============================================================ */

/* ── Datas ───────────────────────────────────────────────────
   Nunca usar toISOString() para data de calendário: ele converte
   para UTC e no fuso do Brasil o diário do dia 5 vira dia 4.     */

export function paraISO(data) {
  const d = data instanceof Date ? data : new Date(data)
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

export function hojeISO() {
  return paraISO(new Date())
}

/* Dois tipos de data chegam aqui, e tratá-los igual dá erro:

   · DATA DE CALENDÁRIO ("2026-08-07") — o dia do diário, o prazo
     da pendência. Não tem hora nem fuso. Precisa ser montada
     campo a campo; jogar no `new Date()` faria o navegador ler
     como meia-noite UTC e, no Brasil, mostrar o dia anterior.

   · INSTANTE ("2026-08-05T02:30:00+00:00") — quando o registro
     foi criado. Aí o fuso EXISTE e importa: 02h30 em UTC é 23h30
     do dia anterior no Brasil. Esse o navegador converte certo
     sozinho. */
export function deISO(iso) {
  const texto = String(iso)
  if (texto.includes('T')) return new Date(texto)
  const [a, m, d] = texto.split('-').map(Number)
  return new Date(a, m - 1, d)
}

export function somarDias(iso, n) {
  const d = deISO(iso)
  d.setDate(d.getDate() + n)
  return paraISO(d)
}

export function diffDias(isoA, isoB) {
  const ms = deISO(isoA).getTime() - deISO(isoB).getTime()
  return Math.round(ms / 86400000)
}

export function formatarData(iso) {
  if (!iso) return '—'
  return deISO(iso).toLocaleDateString('pt-BR')
}

export function formatarDataCurta(iso) {
  if (!iso) return '—'
  return deISO(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/* Só a primeira letra sobe. O CSS `text-transform: capitalize`
   capitalizaria cada palavra e produziria "Sexta-Feira, 07 De
   Agosto", que está errado em português. */
export function formatarDataLonga(iso) {
  if (!iso) return '—'
  const texto = deISO(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function nomeDiaSemana(iso) {
  return deISO(iso).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
}

/* Diferente de formatarData: aqui a HORA importa (é um instante,
   não um dia de calendário -- ver o comentário grande acima sobre
   deISO). Usada em lembrete, onde "amanhã" sem hora não diz nada. */
export function formatarDataHora(iso) {
  if (!iso) return '—'
  return deISO(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/* ── Vocabulário de status ───────────────────────────────────
   Estes valores precisam ser IDÊNTICOS aos do CHECK no banco
   (Etapa 7). Se divergirem, o salvamento falha em silêncio e a
   pessoa acha que salvou.                                       */

export const STATUS_ATIVIDADE = ['nao_iniciada', 'em_andamento', 'concluida']

export const ROTULO_ATIVIDADE = {
  nao_iniciada: 'Não iniciada',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
}

export const TOM_ATIVIDADE = {
  nao_iniciada: '',
  em_andamento: 'info',
  concluida: 'success',
}

export const STATUS_DIARIO = ['rascunho', 'finalizado']

export const PRIORIDADES = ['baixa', 'media', 'alta']

export const ROTULO_PRIORIDADE = { baixa: 'Baixa', media: 'Média', alta: 'Alta' }

export const STATUS_PENDENCIA = ['aberta', 'resolvida']

export const STATUS_EQUIPAMENTO = ['disponivel', 'em_uso', 'manutencao']

export const ROTULO_STATUS_EQUIPAMENTO = {
  disponivel: 'Disponível',
  em_uso: 'Em uso',
  manutencao: 'Manutenção',
}

export const TOM_STATUS_EQUIPAMENTO = {
  disponivel: 'success',
  em_uso: 'info',
  manutencao: 'danger',
}

export const TIPOS_OCORRENCIA_SEGURANCA = ['quase_acidente', 'acidente']

export const ROTULO_OCORRENCIA_SEGURANCA = { quase_acidente: 'Quase acidente', acidente: 'Acidente' }

export const GRAVIDADES = ['leve', 'moderada', 'grave']

export const ROTULO_GRAVIDADE = { leve: 'Leve', moderada: 'Moderada', grave: 'Grave' }

export const TOM_GRAVIDADE = { leve: '', moderada: 'info', grave: 'danger' }

export const TIPOS_ADVERTENCIA = ['verbal', 'escrita']

export const ROTULO_ADVERTENCIA = { verbal: 'Verbal', escrita: 'Escrita' }

/* ── Pendências ──────────────────────────────────────────────
   "Em aberto" INCLUI as atrasadas. Esta mesma função alimenta a
   tela, o contador do menu e o resumo do início — é isso que
   impede o menu dizer 3 e a tela mostrar 5.                     */

export function situacaoPendencia(p, hoje = hojeISO()) {
  if (p.status === 'resolvida') {
    return { chave: 'resolvida', rotulo: 'Resolvida', tom: 'success' }
  }
  if (!p.prazo) {
    return { chave: 'sem_prazo', rotulo: 'Sem prazo', tom: '' }
  }
  const dias = diffDias(hoje, p.prazo)
  if (dias > 0) {
    return { chave: 'atrasada', rotulo: `Atrasada ${dias}d`, tom: 'danger', dias }
  }
  if (dias === 0) {
    return { chave: 'vence_hoje', rotulo: 'Vence hoje', tom: 'info' }
  }
  return { chave: 'aberta', rotulo: `Faltam ${-dias}d`, tom: '' }
}

export function estaAtrasada(p, hoje = hojeISO()) {
  return situacaoPendencia(p, hoje).chave === 'atrasada'
}

export function filtrarPendencias(lista, filtro, hoje = hojeISO()) {
  if (filtro === 'resolvidas') return lista.filter((p) => p.status === 'resolvida')
  if (filtro === 'atrasadas') return lista.filter((p) => estaAtrasada(p, hoje))
  if (filtro === 'abertas') return lista.filter((p) => p.status !== 'resolvida')
  return lista
}

export function contarPendencias(lista, hoje = hojeISO()) {
  return {
    abertas: filtrarPendencias(lista, 'abertas', hoje).length,
    atrasadas: filtrarPendencias(lista, 'atrasadas', hoje).length,
    resolvidas: filtrarPendencias(lista, 'resolvidas', hoje).length,
    total: lista.length,
  }
}

/* As pendências do PDF tático (restrições da obra, revisadas semana
   a semana) são uma categoria à parte das pendências do dia a dia
   (manuais ou vindas do diário) — ritmo e urgência diferentes. O
   contador do menu e o Início só devem alertar sobre o dia a dia;
   o tático tem sua própria aba, dentro da tela de Pendências. */
export const ORIGEM_TATICO = 'tatico_pdf'

export function pendenciasGerais(lista) {
  return lista.filter((p) => p.origem !== ORIGEM_TATICO)
}

export function pendenciasTaticas(lista) {
  return lista.filter((p) => p.origem === ORIGEM_TATICO)
}

/* ── Lembretes ────────────────────────────────────────────────
   Só GUARDA a data marcada aqui: quem de fato manda o aviso na hora
   certa é o disparador do WhatsApp (fora do escopo desta tela). Sem
   ele configurado, um lembrete "pendente" não avisa ninguém sozinho
   -- é só uma lista, não uma notificação. */

export const STATUS_LEMBRETE = ['pendente', 'enviado', 'cancelado']

export function situacaoLembrete(l, agora = new Date()) {
  if (l.status === 'cancelado') return { chave: 'cancelado', rotulo: 'Cancelado', tom: '' }
  if (l.status === 'enviado') return { chave: 'enviado', rotulo: 'Enviado', tom: 'success' }
  const disparo = new Date(l.disparar_em)
  if (disparo < agora) return { chave: 'atrasado', rotulo: 'Atrasado', tom: 'danger' }
  return { chave: 'pendente', rotulo: 'Pendente', tom: 'info' }
}

export function filtrarLembretes(lista, filtro, agora = new Date()) {
  if (filtro === 'pendentes') {
    return lista.filter((l) => l.status === 'pendente')
  }
  if (filtro === 'atrasados') {
    return lista.filter((l) => situacaoLembrete(l, agora).chave === 'atrasado')
  }
  if (filtro === 'cancelados') return lista.filter((l) => l.status === 'cancelado')
  return lista
}

/* ── Diário ───────────────────────────────────────────────── */

export function diarioDaData(diarios, data, obraId) {
  return diarios.find((d) => d.data === data && d.worksite_id === obraId) || null
}

export function totalPresentes(diario) {
  if (!diario) return 0
  return (diario.presencas || []).filter((p) => p.presente).length
}

export function progressoDiario(diario) {
  const ativs = (diario && diario.atividades) || []
  const concluidas = ativs.filter((a) => a.status === 'concluida').length
  const andamento = ativs.filter((a) => a.status === 'em_andamento').length
  return {
    total: ativs.length,
    concluidas,
    andamento,
    naoIniciadas: ativs.length - concluidas - andamento,
    percentual: ativs.length ? Math.round((concluidas / ativs.length) * 100) : 0,
  }
}

export function situacaoDiario(diario) {
  if (!diario) return { chave: 'nao_lancado', rotulo: 'Não lançado', tom: 'danger' }
  if (diario.status === 'finalizado') return { chave: 'finalizado', rotulo: 'Finalizado', tom: 'success' }
  return { chave: 'rascunho', rotulo: 'Rascunho', tom: 'info' }
}

/* ── Semana ──────────────────────────────────────────────────
   A semana da obra começa na SEGUNDA, não no domingo. É como o
   planejamento é falado no canteiro ("essa semana a gente fecha o
   15º"), e é como o fechamento faz sentido. O padrão do JavaScript
   é domingo, por isso a conta abaixo.                            */

export function inicioDaSemana(iso) {
  const d = deISO(iso)
  const diaDaSemana = d.getDay()
  d.setDate(d.getDate() - (diaDaSemana === 0 ? 6 : diaDaSemana - 1))
  return paraISO(d)
}

export function diasDaSemana(inicioISO) {
  return Array.from({ length: 7 }, (_, i) => somarDias(inicioISO, i))
}

export function rotuloDaSemana(inicioISO) {
  const fim = somarDias(inicioISO, 6)
  const mesmoMes = deISO(inicioISO).getMonth() === deISO(fim).getMonth()
  return mesmoMes
    ? `${formatarDataCurta(inicioISO).slice(0, 2)} a ${formatarData(fim)}`
    : `${formatarDataCurta(inicioISO)} a ${formatarData(fim)}`
}

/* ── Execução do planejado ───────────────────────────────────
   O que foi planejado virou o quê? A resposta NÃO é digitada em
   lugar nenhum: ela é lida do diário, pela atividade que aponta
   para o planejamento. Uma fonte só (BRIEFING, seção 8, item 6).

   Separo "não executada" de "sem lançamento" de propósito. As
   duas dão zero de avanço, mas significam coisas opostas: a
   primeira é um fato registrado pelo mestre; a segunda é a falta
   do registro. Somá-las esconderia diário não lançado dentro de
   um número de produtividade — e é justamente esse buraco que a
   gestão precisa enxergar.                                       */

export const SITUACAO_EXECUCAO = {
  concluida:      { rotulo: 'Concluída',      tom: 'success' },
  iniciada:       { rotulo: 'Iniciada',       tom: 'info' },
  nao_executada:  { rotulo: 'Não executada',  tom: 'danger' },
  sem_lancamento: { rotulo: 'Sem lançamento', tom: '' },
}

export function situacaoExecucao(planejada, diarios) {
  const diario = diarios.find(
    (d) => d.data === planejada.data && d.worksite_id === planejada.worksite_id,
  )
  if (!diario) return { chave: 'sem_lancamento', ...SITUACAO_EXECUCAO.sem_lancamento }

  const executada = (diario.atividades || []).find((a) => a.planned_id === planejada.id)
  if (!executada) return { chave: 'nao_executada', ...SITUACAO_EXECUCAO.nao_executada, diario }

  if (executada.status === 'concluida') {
    return { chave: 'concluida', ...SITUACAO_EXECUCAO.concluida, diario, executada }
  }
  if (executada.status === 'em_andamento') {
    return { chave: 'iniciada', ...SITUACAO_EXECUCAO.iniciada, diario, executada }
  }
  return { chave: 'nao_executada', ...SITUACAO_EXECUCAO.nao_executada, diario, executada }
}

/* O fechamento da semana. Esta função alimenta a tela, o resumo e
   a exportação — se alguém recalcular em qualquer um desses
   lugares, os três passam a discordar. */
export function fecharSemana(planejamento, diarios, de, ate) {
  const itens = planejamento
    .filter((p) => p.data >= de && p.data <= ate)
    .map((p) => ({ planejada: p, situacao: situacaoExecucao(p, diarios) }))
    .sort((a, b) => (a.planejada.data < b.planejada.data ? -1 : 1))

  const conta = (chave) => itens.filter((i) => i.situacao.chave === chave).length
  const concluidas = conta('concluida')

  return {
    itens,
    total: itens.length,
    concluidas,
    iniciadas: conta('iniciada'),
    naoExecutadas: conta('nao_executada'),
    semLancamento: conta('sem_lancamento'),
    /* Percentual sobre o total planejado, incluindo o que não foi
       lançado. Tirar o não lançado da conta inflaria o número
       justamente nas semanas em que o campo deixou de registrar. */
    percentual: itens.length ? Math.round((concluidas / itens.length) * 100) : 0,
  }
}

/* ── Efetivo ─────────────────────────────────────────────────
   O efetivo não é digitado: ele é a consolidação das presenças
   lançadas nos diários. Uma fonte só.                           */

export function consolidarEfetivo(diarios, { de, ate, empresaId } = {}) {
  const dias = diarios
    .filter((d) => (!de || d.data >= de) && (!ate || d.data <= ate))
    .map((d) => {
      const presentes = (d.presencas || []).filter(
        (p) => p.presente && (!empresaId || p.company_id === empresaId),
      )
      return { data: d.data, diarioId: d.id, status: d.status, total: presentes.length, presentes }
    })
    .sort((a, b) => (a.data < b.data ? 1 : -1))

  const comLancamento = dias.filter((d) => d.total > 0)
  const total = dias.reduce((s, d) => s + d.total, 0)
  const pico = dias.reduce((m, d) => Math.max(m, d.total), 0)

  return {
    dias,
    total,
    pico,
    media: comLancamento.length ? Math.round((total / comLancamento.length) * 10) / 10 : 0,
    diasComLancamento: comLancamento.length,
  }
}

export function efetivoPorEmpresa(diarios, empresas, { de, ate } = {}) {
  return empresas
    .map((e) => {
      const r = consolidarEfetivo(diarios, { de, ate, empresaId: e.id })
      return { empresa: e, total: r.total, media: r.media }
    })
    .filter((l) => l.total > 0)
    .sort((a, b) => b.total - a.total)
}

/* ── Requisições e pedidos de material ───────────────────────
   O saldo NÃO é guardado em lugar nenhum: é a diferença entre o
   que foi pedido e a soma do que já chegou, calculada aqui. Um
   saldo salvo como número seria uma segunda verdade, e bastaria
   uma entrega mal gravada para ele divergir do histórico para
   sempre — sem ninguém perceber, porque continuaria plausível.  */

export const STATUS_REQUISICAO = [
  'rascunho', 'enviada', 'em_cotacao', 'comprada', 'em_transito', 'recebida', 'cancelada',
]

export const ROTULO_REQUISICAO = {
  rascunho:    'Rascunho',
  enviada:     'Enviada',
  em_cotacao:  'Em cotação',
  comprada:    'Comprada',
  em_transito: 'Em trânsito',
  recebida:    'Recebida',
  cancelada:   'Cancelada',
}

export const TOM_REQUISICAO = {
  rascunho: '', enviada: 'info', em_cotacao: 'info', comprada: 'info',
  em_transito: 'info', recebida: 'success', cancelada: '',
}

/* A ordem do fluxo, usada para saber o que vem depois e para
   ordenar a lista por estágio. */
export const ETAPAS_REQUISICAO = ['rascunho', 'enviada', 'em_cotacao', 'comprada', 'em_transito', 'recebida']

export function saldosDaRequisicao(req) {
  const recebidoPorItem = {}
  ;(req.entregas || []).forEach((e) => {
    ;(e.itens || []).forEach((i) => {
      recebidoPorItem[i.item_id] = (recebidoPorItem[i.item_id] || 0) + Number(i.quantidade || 0)
    })
  })

  const itens = (req.itens || []).map((i) => {
    const pedido = Number(i.quantidade || 0)
    const recebido = recebidoPorItem[i.id] || 0
    return {
      ...i,
      pedido,
      recebido,
      saldo: Math.max(0, pedido - recebido),
      percentual: pedido ? Math.min(100, Math.round((recebido / pedido) * 100)) : 0,
      completo: recebido >= pedido && pedido > 0,
    }
  })

  const comSaldo = itens.filter((i) => !i.completo)
  const algumRecebido = itens.some((i) => i.recebido > 0)

  return {
    itens,
    totalItens: itens.length,
    itensCompletos: itens.length - comSaldo.length,
    temSaldo: comSaldo.length > 0,
    /* Três situações de entrega, e a do meio é a que mais importa:
       "parcial" significa que ainda falta material na obra, mesmo
       o pedido já tendo sido tocado. */
    entrega: !algumRecebido ? 'nada' : comSaldo.length === 0 ? 'completa' : 'parcial',
    percentual: itens.length
      ? Math.round(itens.reduce((s, i) => s + i.percentual, 0) / itens.length)
      : 0,
  }
}

export function situacaoRequisicao(req, hoje = hojeISO()) {
  const base = {
    chave: req.status,
    rotulo: ROTULO_REQUISICAO[req.status] || req.status,
    tom: TOM_REQUISICAO[req.status] || '',
  }

  /* Atraso é derivado da previsão, nunca marcado à mão. Só faz
     sentido depois de comprada: antes disso não existe promessa. */
  if (['comprada', 'em_transito'].includes(req.status) && req.previsao_entrega) {
    const dias = diffDias(hoje, req.previsao_entrega)
    if (dias > 0) {
      return { ...base, rotulo: `Atrasada ${dias}d`, tom: 'danger', atrasada: true, dias }
    }
  }
  return base
}

export function filtrarRequisicoes(lista, filtro, perfilId) {
  if (filtro === 'minhas') return lista.filter((r) => r.autor_id === perfilId)
  if (filtro === 'rascunhos') return lista.filter((r) => r.status === 'rascunho')
  if (filtro === 'abertas') {
    return lista.filter((r) => !['recebida', 'cancelada'].includes(r.status))
  }
  if (filtro === 'aguardando') {
    return lista.filter((r) => ['enviada', 'em_cotacao'].includes(r.status))
  }
  if (filtro === 'transito') {
    return lista.filter((r) => ['comprada', 'em_transito'].includes(r.status))
  }
  if (filtro === 'recebidas') return lista.filter((r) => r.status === 'recebida')
  return lista
}

export function contarRequisicoes(lista, perfilId, hoje = hojeISO()) {
  return {
    total: lista.length,
    rascunhos: filtrarRequisicoes(lista, 'rascunhos', perfilId).length,
    aguardando: filtrarRequisicoes(lista, 'aguardando', perfilId).length,
    transito: filtrarRequisicoes(lista, 'transito', perfilId).length,
    abertas: filtrarRequisicoes(lista, 'abertas', perfilId).length,
    recebidas: filtrarRequisicoes(lista, 'recebidas', perfilId).length,
    atrasadas: lista.filter((r) => situacaoRequisicao(r, hoje).atrasada).length,
    parciais: lista.filter(
      (r) => r.status === 'em_transito' && saldosDaRequisicao(r).entrega === 'parcial',
    ).length,
  }
}

/* Quem pode fazer o quê, em cada etapa. Uma função só, para a
   tela e o banco não discordarem sobre quem manda em cada momento
   — o banco continua sendo a trava; isto aqui só evita mostrar
   botão que vai falhar. */
export function acoesDaRequisicao(req, perfil) {
  const gestao = perfil.role !== 'campo'
  const autor = req.autor_id === perfil.id
  return {
    podeEditarItens: (req.status === 'rascunho' && autor) || (gestao && req.status !== 'recebida'),
    podeEnviar: req.status === 'rascunho' && autor,
    podeAssumir: gestao && req.status === 'enviada',
    podeComprar: gestao && ['enviada', 'em_cotacao'].includes(req.status),
    podeDespachar: gestao && req.status === 'comprada',
    podeReceber: ['comprada', 'em_transito'].includes(req.status),
    podeCancelar: (req.status === 'rascunho' && autor) || (gestao && req.status !== 'recebida'),
    podeExcluir: req.status === 'rascunho' && autor,
  }
}

export function formatarQuantidade(n) {
  const numero = Number(n || 0)
  /* Sem casas decimais quando é número redondo: "12 sc" lê melhor
     que "12,000 sc" numa lista de vinte itens. */
  return Number.isInteger(numero)
    ? String(numero)
    : numero.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}

export function formatarDinheiro(v) {
  if (v === null || v === undefined || v === '') return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/* ── Cronograma físico ────────────────────────────────────────
   O peso e a data vêm de fora (a EAP que a engenharia já mantém em
   planilha ou MS Project) e o percentual é medido por ela também —
   diferente de pendência e requisição, aqui NÃO existe um diário
   granular o bastante para derivar o avanço sozinho: uma etapa de
   "Alvenaria 5º pavimento" dura semanas e cruza dezenas de lançamentos
   de diário. Forçar essa derivação seria uma automação frágil demais
   para confiar. Então o percentual é dado primário, como valor_total
   na requisição — e o que O APP deriva é a COMPARAÇÃO entre o
   percentual medido e o que era esperado na data de hoje.          */

/* Quanto do prazo do item já passou, em percentual, 0 antes de
   começar e 100 depois do fim — a régua contra a qual o percentual
   medido é comparado. */
export function progressoEsperado(item, hoje = hojeISO()) {
  if (hoje <= item.data_inicio) return 0
  if (hoje >= item.data_fim) return 100
  const total = diffDias(item.data_fim, item.data_inicio) || 1
  const decorrido = diffDias(hoje, item.data_inicio)
  return Math.round((decorrido / total) * 100)
}

export function situacaoCronograma(item, hoje = hojeISO()) {
  const real = Number(item.percentual || 0)
  if (real >= 100) return { chave: 'concluida', rotulo: 'Concluída', tom: 'success', esperado: 100 }
  if (hoje < item.data_inicio) {
    return { chave: 'nao_iniciada', rotulo: 'Não iniciada', tom: '', esperado: 0 }
  }
  const esperado = progressoEsperado(item, hoje)
  const diferenca = real - esperado
  /* Tolerância de 5 pontos: sem ela, todo item em andamento nasceria
     "atrasado" no primeiro dia, por um arredondamento de nada. */
  if (diferenca < -5) {
    return { chave: 'atrasada', rotulo: 'Atrasada', tom: 'danger', esperado, diferenca }
  }
  return { chave: 'em_dia', rotulo: 'Em dia', tom: 'info', esperado, diferenca }
}

export function ordenarCronograma(itens) {
  return [...itens].sort((a, b) => (a.data_inicio < b.data_inicio ? -1 : 1))
}

/* A curva física: percentual real e previsto, ponderados pelo peso
   de cada item — mesma conta usada no resumo e na exportação, para
   as duas nunca discordarem sobre o avanço da obra. */
export function curvaFisica(itens, hoje = hojeISO()) {
  const pesoTotal = itens.reduce((s, i) => s + Number(i.peso || 0), 0)
  if (!pesoTotal) {
    return { percentualReal: 0, percentualPrevisto: 0, pesoTotal: 0, atrasados: 0, total: itens.length }
  }
  const real = itens.reduce((s, i) => s + Number(i.peso || 0) * Number(i.percentual || 0), 0) / pesoTotal
  const previsto = itens.reduce(
    (s, i) => s + Number(i.peso || 0) * progressoEsperado(i, hoje), 0,
  ) / pesoTotal
  return {
    percentualReal: Math.round(real * 10) / 10,
    percentualPrevisto: Math.round(previsto * 10) / 10,
    pesoTotal,
    atrasados: itens.filter((i) => situacaoCronograma(i, hoje).chave === 'atrasada').length,
    total: itens.length,
  }
}

/* A curva S: a linha do PREVISTO dá pra calcular pra qualquer data,
   passada ou futura — vem só de data_início/data_fim/peso de cada
   etapa, sem depender de histórico nenhum. Já o REALIZADO não tem
   história: o banco guarda a medição atual de cada etapa, não uma
   cada vez que ela mudou. Por isso esta função devolve a linha
   prevista inteira (do início ao fim de todas as etapas) e só UM
   ponto de realizado — hoje —, em vez de fingir uma curva de
   realizado que os dados não sustentam. */
export function pontosDaCurvaS(itens, hoje = hojeISO(), maxPontos = 24) {
  const comData = itens.filter((i) => i.data_inicio && i.data_fim)
  if (comData.length === 0) return { pontos: [], hoje: null }

  const inicio = comData.reduce((m, i) => (i.data_inicio < m ? i.data_inicio : m), comData[0].data_inicio)
  const fimPrevisto = comData.reduce((m, i) => (i.data_fim > m ? i.data_fim : m), comData[0].data_fim)
  // A janela vai até o fim previsto OU até hoje, o que for mais tarde —
  // senão uma obra atrasada corta a linha antes do ponto de hoje.
  const fim = fimPrevisto > hoje ? fimPrevisto : hoje

  const totalDias = Math.max(1, diffDias(fim, inicio))
  const passo = Math.max(1, Math.ceil(totalDias / maxPontos))

  const pontos = []
  for (let d = 0; d <= totalDias; d += passo) {
    const data = somarDias(inicio, d)
    pontos.push({ data, previsto: curvaFisica(comData, data).percentualPrevisto })
  }
  // Garante que a última data da janela sempre entra, mesmo que o
  // passo não bata exato nela — senão a linha para antes do fim.
  if (pontos[pontos.length - 1].data !== fim) {
    pontos.push({ data: fim, previsto: curvaFisica(comData, fim).percentualPrevisto })
  }

  return { pontos, hoje: curvaFisica(comData, hoje).percentualReal, inicio, fim }
}

/* Aceita tanto "31/12/2026" (o formato que sai do Excel em
   português) quanto "2026-12-31". Devolve null se não entender —
   quem chama decide o que fazer com uma linha ruim, não esta função. */
export function paraISOdeTextoBR(texto) {
  const limpo = String(texto || '').trim()
  if (!limpo) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpo)) return limpo
  const m = limpo.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (!m) return null
  const [, d, mes, a] = m
  const data = `${a}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`
  // Confere que a data existe de verdade (não aceita 31/02).
  const teste = deISO(data)
  if (teste.getFullYear() !== Number(a) || teste.getMonth() !== Number(mes) - 1 || teste.getDate() !== Number(d)) {
    return null
  }
  return data
}

/* Aceita "12,5" (o que sai do Excel em português) e "12.5". Só trata o
   ponto como separador de milhar quando HÁ vírgula na mesma string —
   senão "12.5" digitado direto (sem vírgula) virava 125, por sumir
   com o ponto que era o decimal. */
export function paraNumeroBR(texto) {
  if (texto === null || texto === undefined || texto === '') return null
  const limpo = String(texto).trim()
  const n = limpo.includes(',')
    ? Number(limpo.replace(/\./g, '').replace(',', '.'))
    : Number(limpo)
  return Number.isFinite(n) ? n : null
}

/* ── Fila de revisão de colaborador ──────────────────────────
   Quem foi cadastrado às pressas dentro do diário entra como
   provisório e precisa de conferência da gestão.                */

export function pendentesDeRevisao(colaboradores) {
  return colaboradores.filter((c) => c.provisorio && !c.revisado && c.ativo !== false)
}

/* ── Utilidades ──────────────────────────────────────────── */

export function iniciais(nome) {
  return String(nome || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

export function plural(n, singular, pluralForma) {
  return `${n} ${n === 1 ? singular : pluralForma}`
}
