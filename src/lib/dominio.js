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

export function deISO(iso) {
  const [a, m, d] = String(iso).split('-').map(Number)
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
