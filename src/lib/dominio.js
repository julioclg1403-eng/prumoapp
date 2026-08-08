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
