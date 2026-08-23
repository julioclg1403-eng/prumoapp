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

/* Diferente de somarMeses (que trabalha em granularidade "AAAA-MM",
   pro calendário de mês) — esta soma meses numa data completa com
   dia, preservando o dia quando dá. */
export function somarMesesData(iso, n) {
  const d = deISO(iso)
  d.setMonth(d.getMonth() + n)
  return paraISO(d)
}

export function diffDias(isoA, isoB) {
  const ms = deISO(isoA).getTime() - deISO(isoB).getTime()
  return Math.round(ms / 86400000)
}

/* Filtro de período genérico — mesmo recorte "Tudo/Dia/Mês/Período"
   usado em várias telas (Por Colaborador do EPI/Material/Equipamentos),
   só que reutilizável em vez de reescrever a cada lugar novo.
   `obterData(item)` devolve a data ISO do item (ou null/undefined, que
   aí nunca entra em Dia/Mês/Período — só aparece em "Tudo"). "Período"
   aceita início depois do fim (a pessoa pode digitar fora de ordem sem
   querer); normaliza sozinho. */
export function filtrarPorPeriodo(itens, modo, datas, obterData) {
  if (modo === 'dia') return itens.filter((i) => obterData(i) === datas.dia)
  if (modo === 'mes') return itens.filter((i) => (obterData(i) || '').slice(0, 7) === datas.mes)
  if (modo === 'periodo') {
    const ini = datas.inicio <= datas.fim ? datas.inicio : datas.fim
    const fim = datas.inicio <= datas.fim ? datas.fim : datas.inicio
    return itens.filter((i) => {
      const d = obterData(i)
      return d && d >= ini && d <= fim
    })
  }
  return itens
}

/* Resumo curto do filtro de período, pro chip fechado do
   SecaoRecolhivel mostrar o que está escolhido sem precisar abrir
   ("Tudo", "20/08", "ago. de 2026", "20/08–25/08"). */
export function rotuloPeriodo(modo, { dia, mes, inicio, fim } = {}) {
  if (modo === 'dia') return formatarDataCurta(dia)
  if (modo === 'mes' && mes) {
    const [ano, m] = mes.split('-').map(Number)
    return new Date(ano, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
  }
  if (modo === 'periodo') return `${formatarDataCurta(inicio)}–${formatarDataCurta(fim)}`
  return 'Tudo'
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

/* ── Calendário de mês ───────────────────────────────────────
   Usado por qualquer tela que precise de uma grade tipo calendário
   (Diários, e o "dias realizados" do Cronograma). `mesISO` é só
   "AAAA-MM", sem dia — o mês corrente escolhido na tela. */

/* Sempre 6 semanas (42 dias), começando no domingo da semana do
   dia 1 — o que faz o grid ficar retangular e previsível mês a mês. */
export function gradeDoMes(mesISO) {
  const [ano, mes] = mesISO.split('-').map(Number)
  const primeiro = new Date(ano, mes - 1, 1)
  const inicio = new Date(ano, mes - 1, 1 - primeiro.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicio)
    d.setDate(inicio.getDate() + i)
    return { iso: paraISO(d), dia: d.getDate(), doMes: d.getMonth() === mes - 1 }
  })
}

export function somarMeses(mesISO, n) {
  const [ano, mes] = mesISO.split('-').map(Number)
  const d = new Date(ano, mes - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function rotuloMes(mesISO) {
  const [ano, m] = mesISO.split('-').map(Number)
  const texto = new Date(ano, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
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

/* ── Treinamentos NR por colaborador ────────────────────────
   Vencimento é calculado na hora de salvar (data de realização +
   validade em meses do tipo) e gravado, não recalculado toda hora —
   assim o histórico mostra o vencimento válido na época, mesmo se a
   validade padrão do tipo mudar depois. Sem validade cadastrada no
   tipo (ex.: NR-18, integração), o treinamento nunca vence. */
export const DIAS_ALERTA_VENCIMENTO_TREINAMENTO = 30

export function calcularVencimentoTreinamento(dataRealizacao, validadeMeses) {
  if (!dataRealizacao || !validadeMeses) return null
  return somarMesesData(dataRealizacao, Number(validadeMeses))
}

export function statusTreinamento(dataVencimento) {
  if (!dataVencimento) return 'valido'
  const hoje = hojeISO()
  if (dataVencimento < hoje) return 'vencido'
  if (dataVencimento <= somarDias(hoje, DIAS_ALERTA_VENCIMENTO_TREINAMENTO)) return 'a_vencer'
  return 'valido'
}

export const ROTULO_STATUS_TREINAMENTO = {
  valido: 'Válido', a_vencer: 'A vencer', vencido: 'Vencido', pendente: 'Pendente',
}
export const TOM_STATUS_TREINAMENTO = { valido: 'success', a_vencer: 'info', vencido: 'danger', pendente: '' }

export const STATUS_APONTAMENTO = ['ativo', 'em_andamento', 'resolvido', 'reprovado']

export const ROTULO_STATUS_APONTAMENTO = {
  ativo: 'A Responder', em_andamento: 'Em Andamento', resolvido: 'Resolvido', reprovado: 'Reprovado',
}

export const TOM_STATUS_APONTAMENTO = { ativo: 'danger', em_andamento: 'info', resolvido: 'success', reprovado: '' }

/* O quadro (visão Trello) de Projetos é uma esteira linear de 3 —
   A Responder → Em Andamento → Resolvido, com seta ‹ › igual o
   quadro de Pendências — diferente do fluxo do Sheet (que também
   tem Reprovar, um desvio, não um próximo passo da esteira).
   Reprovado fica de fora do quadro por isso; continua existindo e
   acessível pela Lista e pelo Sheet. */
export const COLUNAS_QUADRO_APONTAMENTO = [
  { status: 'ativo', rotulo: 'A Responder' },
  { status: 'em_andamento', rotulo: 'Em Andamento' },
  { status: 'resolvido', rotulo: 'Resolvido' },
]

/* "Novo comentário" no cartão do quadro (só interessa na coluna Em
   Andamento) não é "não lido" — o app não rastreia isso por pessoa.
   É "chegou depois de alguém pegar pra trabalhar": qualquer
   comentário mais recente do que a última vez que o apontamento
   entrou em "em_andamento" (project_note_history). Sem essa
   entrada no histórico (apontamento antigo, de antes desse status
   existir), não dá pra saber — não assume nada. */
export function temComentarioNovoEmAndamento(apontamento) {
  const entrada = (apontamento.historico || []).filter((h) => h.para_status === 'em_andamento').slice(-1)[0]
  if (!entrada) return false
  return (apontamento.comentarios || []).some((c) => c.created_at > entrada.created_at)
}

export const VISIBILIDADE_APONTAMENTO = ['rascunho', 'publicado']

export const ROTULO_VISIBILIDADE_APONTAMENTO = { rascunho: 'Rascunho', publicado: 'Publicado' }

/* "Abrir" o apontamento é a mesma coisa que publicá-lo — rascunho vira
   publicado. Antes disso, é só um esboço: qualquer um com o módulo
   liberado edita à vontade. Depois de aberto, o banco (RLS de
   project_notes) só deixa admin editar ou excluir — isto aqui é só o
   espelho no front pra esconder os campos e não deixar a pessoa
   apanhar um erro de permissão sem explicação. Comentário e disciplina
   NÃO travam: comentário nunca teve edição, e disciplina é o
   acompanhamento do andamento, que continua rolando depois de aberto. */
export function apontamentoTravado(apontamento, perfil) {
  return apontamento?.visibilidade === 'publicado' && perfil?.role !== 'admin'
}

/* O que falta pra poder abrir — título e descrição preenchidos, e
   pelo menos uma disciplina vinculada (sem isso não tem o que
   acompanhar). Categoria, local, etapa e etiquetas continuam
   opcionais. */
export function pendenciasParaAbrirApontamento(apontamento) {
  const faltando = []
  if (!apontamento?.titulo?.trim()) faltando.push('título')
  if (!apontamento?.descricao?.trim()) faltando.push('descrição')
  if (!(apontamento?.disciplinas || []).length) faltando.push('ao menos uma disciplina')
  return faltando
}

/* ── Histórico do apontamento — vira um log de tudo, não só status ──
   Cada mutação (DadosContext.jsx) grava sua própria linha com uma
   descrição pronta. Esta função só cuida da parte que precisa
   COMPARAR duas versões pra saber o que mudou: os campos digitados na
   aba Detalhes. As outras (comentário, anexo, disciplina, status,
   abrir) já sabem sozinhas o que aconteceu no momento em que
   acontecem — não precisam de diff. */
export const ROTULO_TIPO_HISTORICO = {
  criacao: 'Criação', edicao: 'Edição', status: 'Status', abertura: 'Abertura',
  comentario: 'Comentário', anexo: 'Anexo', disciplina: 'Disciplina',
}

const ROTULO_CAMPO_APONTAMENTO = {
  titulo: 'título', descricao: 'descrição', prioridade: 'prioridade',
  stage_id: 'etapa de criação', category_ids: 'categorias', location_ids: 'locais', etiquetas: 'etiquetas',
}

function diferente(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = [...(a || [])].sort(); const y = [...(b || [])].sort()
    return JSON.stringify(x) !== JSON.stringify(y)
  }
  return (a || null) !== (b || null)
}

/* null se nada relevante mudou (upsert idêntico, ex.: reabrir o Sheet
   e apertar Salvar sem editar nada) — quem chama não grava histórico
   nesse caso. */
export function descreverEdicaoApontamento(antes, depois) {
  if (!antes) return null
  const mudou = Object.keys(ROTULO_CAMPO_APONTAMENTO).filter((campo) => diferente(antes[campo], depois[campo]))
  if (!mudou.length) return null
  return `editou ${mudou.map((c) => ROTULO_CAMPO_APONTAMENTO[c]).join(', ')}`
}

/* Módulos que dá pra restringir por usuário (tela Usuários). "Início"
   fica de fora de propósito — sem ele não sobra pra onde a pessoa
   cair ao entrar. "Usuários" também fica de fora: é admin-only por
   papel, não por essa lista. */
export const MODULOS_RESTRINGIVEIS = [
  { chave: 'diarios', rotulo: 'Diários' },
  { chave: 'planejamento', rotulo: 'Planejamento' },
  { chave: 'efetivo', rotulo: 'Efetivo' },
  { chave: 'pendencias', rotulo: 'Pendências' },
  { chave: 'galeria', rotulo: 'Galeria' },
  { chave: 'lembretes', rotulo: 'Lembretes' },
  { chave: 'equipamentos', rotulo: 'Almoxarifado' },
  { chave: 'seguranca', rotulo: 'Segurança' },
  { chave: 'projetos', rotulo: 'Projetos' },
  { chave: 'suprimentos', rotulo: 'Suprimentos' },
  { chave: 'contratos', rotulo: 'Contratos' },
  { chave: 'cadastros', rotulo: 'Cadastros' },
]

/* Mesma regra em todo lugar que decide se um módulo aparece: admin
   sempre vê; sem `modulos_permitidos` definido, sem restrição
   nenhuma; senão, só quem tem a chave na lista liberada. Projetos já
   foi admin-only "de verdade" (papel, não módulo) — agora segue essa
   mesma regra como qualquer outro módulo, tela e banco (RLS
   `private.tem_modulo`) concordando. */
export function moduloPermitido(perfil, chave) {
  return perfil.role === 'admin' || !perfil.modulos_permitidos || perfil.modulos_permitidos.includes(chave)
}

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

/* O quadro (visão Trello) do Dia a dia usa um terceiro estado que o
   resto do app não usa — "em_andamento", entre aberta e resolvida.
   Ordem fixa: é nela que as colunas aparecem e que os botões ‹ ›
   avançam/voltam o cartão. */
export const COLUNAS_QUADRO_PENDENCIA = [
  { status: 'aberta', rotulo: 'A Fazer' },
  { status: 'em_andamento', rotulo: 'Em Andamento' },
  { status: 'resolvida', rotulo: 'Concluído' },
]

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
   a semana) e Reunião gerencial (feitas na reunião semanal de gestão)
   são categorias à parte das pendências do dia a dia (manuais ou
   vindas do diário) — ritmo e urgência diferentes. O contador do
   menu e o Início só devem alertar sobre o dia a dia; as outras duas
   têm sua própria aba, dentro da tela de Pendências. */
export const ORIGEM_TATICO = 'tatico_pdf'
export const ORIGEM_REUNIAO = 'reuniao_gerencial'

export function pendenciasGerais(lista) {
  return lista.filter((p) => p.origem !== ORIGEM_TATICO && p.origem !== ORIGEM_REUNIAO)
}

export function pendenciasTaticas(lista) {
  return lista.filter((p) => p.origem === ORIGEM_TATICO)
}

export function pendenciasReuniao(lista) {
  return lista.filter((p) => p.origem === ORIGEM_REUNIAO)
}

/* O fechamento da semana tática: entre as pendências táticas,
   quais foram CONFIRMADAS pra essa semana (issue_semanas_taticas —
   uma marca por reimporte, já que o mesmo item de restrição pode
   se repetir várias semanas seguidas enquanto não resolve) e, entre
   essas, quantas já foram resolvidas. Semana passada continua com o
   retrato de quando foi fechada, mesmo que a pendência ainda exista
   e tenha sido reconfirmada em semanas mais novas depois. */
export function fecharSemanaTatica(taticas, confirmacoes, semanaInicio) {
  const idsDaSemana = new Set(
    (confirmacoes || []).filter((c) => c.semana_inicio === semanaInicio).map((c) => c.issue_id),
  )
  const itens = taticas.filter((p) => idsDaSemana.has(p.id))
  const resolvidas = itens.filter((p) => p.status === 'resolvida').length
  return {
    itens,
    total: itens.length,
    resolvidas,
    abertas: itens.length - resolvidas,
    percentual: itens.length ? Math.round((resolvidas / itens.length) * 100) : 0,
  }
}

/* ── Lembretes ────────────────────────────────────────────────
   Só GUARDA a data marcada aqui: quem de fato manda o aviso na hora
   certa é o disparador do WhatsApp (fora do escopo desta tela). Sem
   ele configurado, um lembrete "pendente" não avisa ninguém sozinho
   -- é só uma lista, não uma notificação. */

export const STATUS_LEMBRETE = ['pendente', 'enviado', 'concluido', 'cancelado']

export function situacaoLembrete(l, agora = new Date()) {
  if (l.status === 'concluido') return { chave: 'concluido', rotulo: 'Concluído', tom: 'success' }
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
  if (filtro === 'concluidos') return lista.filter((l) => l.status === 'concluido')
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
  planejada:      { rotulo: 'Planejada',      tom: '' },
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

/* Empresa em branco (dia planejado sem empresa preenchida) não pode
   criar um grupo "sem empresa" separado do resto da MESMA atividade
   só porque nem todo dia tem o campo preenchido — isso fazia a
   mesma etapa aparecer "iniciando" duas vezes na tabela (uma linha
   sem empresa, outra com). Se só existe UMA empresa real usada
   nessa combinação de serviço+local (em toda a obra, não só na
   janela olhada agora), todo dia sem empresa entra nesse grupo; só
   quando aparece mais de uma empresa real é que continuam grupos de
   verdade separados — aí é troca de subcontratada, não campo em
   branco. */
export function resolverEmpresaDoGrupo(lista, listaCompleta = lista) {
  const porServicoLocal = new Map()
  listaCompleta.forEach((p) => {
    if (!p.company_id) return
    const k = `${p.service_id}|${p.location_id}`
    if (!porServicoLocal.has(k)) porServicoLocal.set(k, new Set())
    porServicoLocal.get(k).add(p.company_id)
  })
  return lista.map((p) => {
    if (p.company_id) return p
    const empresas = porServicoLocal.get(`${p.service_id}|${p.location_id}`)
    return empresas?.size === 1 ? { ...p, company_id: [...empresas][0] } : p
  })
}

/* O fechamento da semana. Esta função alimenta a tela, o resumo e
   a exportação — se alguém recalcular em qualquer um desses
   lugares, os três passam a discordar.

   Duas correções sobre a versão antiga (que contava linha por dia):
   1. Uma atividade de vários dias (ex.: "PINTURA FINAL" de segunda a
      sexta) é UMA atividade, não cinco — os contadores agrupam por
      serviço+local+empresa, do mesmo jeito que agruparPlanejamento.
   2. "Planejada" passou a significar "veio da planilha que a gestão
      importou pra essa semana" (campo `da_planilha`), não "tem
      alguma linha no banco nesse intervalo de data" — trabalho que a
      equipe fez sem estar na planilha da semana não conta a favor
      nem contra o percentual, aparece à parte em `naoPlanejados`. */
export function fecharSemana(planejamento, diarios, de, ate, hoje = hojeISO()) {
  const resolvido = resolverEmpresaDoGrupo(planejamento)
  const itens = resolvido
    .filter((p) => p.data >= de && p.data <= ate)
    .map((p) => ({ planejada: p, situacao: situacaoExecucao(p, diarios) }))
    .sort((a, b) => (a.planejada.data < b.planejada.data ? -1 : 1))

  const gruposMapa = new Map()
  itens.forEach(({ planejada, situacao }) => {
    const chave = chaveGrupoPlanejamento(planejada)
    if (!gruposMapa.has(chave)) {
      gruposMapa.set(chave, {
        chave, service_id: planejada.service_id, location_id: planejada.location_id,
        company_id: planejada.company_id || null, itens: [], planejada: false,
      })
    }
    const g = gruposMapa.get(chave)
    g.itens.push({ planejada, situacao })
    if (planejada.da_planilha) g.planejada = true
  })

  const grupos = [...gruposMapa.values()].map((g) => {
    const concluidos = g.itens.filter((i) => i.situacao.chave === 'concluida')
    const iniciados = g.itens.filter((i) => i.situacao.chave === 'iniciada' || i.situacao.chave === 'concluida')
    const passados = g.itens.filter((i) => i.planejada.data <= hoje)
    let situacaoGeral = 'planejada'
    if (concluidos.length) situacaoGeral = 'concluida'
    else if (iniciados.length) situacaoGeral = 'iniciada'
    else if (passados.some((i) => i.situacao.chave === 'nao_executada')) situacaoGeral = 'nao_executada'
    else if (passados.length) situacaoGeral = 'sem_lancamento'
    return { ...g, situacao: { chave: situacaoGeral, ...SITUACAO_EXECUCAO[situacaoGeral] } }
  })

  const planejados = grupos.filter((g) => g.planejada)
  const naoPlanejados = grupos.filter((g) => !g.planejada)
  const conta = (chave) => planejados.filter((g) => g.situacao.chave === chave).length
  const concluidas = conta('concluida')

  return {
    itens, // por dia — quem mostra card por dia (porDia) continua usando isto
    grupos, planejados, naoPlanejados, // por atividade — o fechamento usa isto
    total: planejados.length,
    concluidas,
    iniciadas: conta('iniciada'),
    naoExecutadas: conta('nao_executada'),
    semLancamento: conta('sem_lancamento'),
    /* Percentual sobre o que estava na planilha da semana, incluindo
       o que não foi lançado. Tirar o não lançado da conta inflaria o
       número justamente nas semanas em que o campo deixou de
       registrar; contar o que não estava na planilha puniria (ou
       inflaria) o percentual por trabalho que nem era o combinado. */
    percentual: planejados.length ? Math.round((concluidas / planejados.length) * 100) : 0,
  }
}

/* A mesma combinação que agruparPlanejamento usa pra juntar os dias
   — e a mesma regra que a coluna gerada `chave` do banco usa em
   planned_group_overrides. Repare no mesmo lugar se um dos dois
   mudar, senão o override para de casar com o grupo. */
export function chaveGrupoPlanejamento(p) {
  return `${p.service_id}|${p.location_id}|${p.company_id || ''}`
}

/* Causas de não cumprimento (Last Planner System) — lista fechada,
   pra virar Pareto de verdade em vez de texto livre que ninguém
   consegue agrupar depois. */
export const MOTIVOS_NAO_EXECUTADO = [
  'falta_material', 'falta_projeto', 'chuva', 'falta_mao_de_obra',
  'retrabalho', 'interferencia_outra_equipe', 'equipamento_indisponivel', 'outro',
]
export const ROTULO_MOTIVO_NAO_EXECUTADO = {
  falta_material: 'Falta de material',
  falta_projeto: 'Falta de projeto',
  chuva: 'Chuva',
  falta_mao_de_obra: 'Falta de mão de obra',
  retrabalho: 'Retrabalho',
  interferencia_outra_equipe: 'Interferência de outra equipe',
  equipamento_indisponivel: 'Equipamento indisponível',
  outro: 'Outro',
}

/* Mesma chave de chaveGrupoPlanejamento, mas com a semana junto — o
   motivo de não cumprimento é por grupo E por semana (o mesmo
   serviço pode não rolar em semanas diferentes por razões
   diferentes). */
export function chaveMotivoNaoExecutado(grupo, semanaInicio) {
  return `${chaveGrupoPlanejamento(grupo)}|${semanaInicio}`
}

/* Reúne o planejamento de uma janela (semana ou mês) por serviço +
   local + empresa: um serviço de vários dias vira UMA linha, não uma
   por dia. O início/fim real olha para TODA a obra, não só a janela
   — assim um serviço que começou semana passada continua aparecendo
   como "iniciado" nas semanas seguintes, não só na que ele começou.
   Situação do grupo: concluído se qualquer dia (de toda a obra) foi
   concluído; iniciado se nenhum concluído mas algum começou; não
   executado se algum dia já passou sem lançamento nenhum feito nele;
   senão é só planejamento futuro.

   `overrides` é o início/fim digitado à mão em planned_group_overrides
   — quando existe, substitui o calculado inteiro (não mistura um
   digitado com um calculado), do mesmo jeito que intervalo_real_etapa
   faz no Cronograma. `historico` sai junto pra alimentar o calendário
   do grupo — sem isso a tela teria que refazer essa mesma varredura. */
export function agruparPlanejamento(planejamentoDaJanela, planejamentoTodos, diarios, overrides = [], hoje = hojeISO()) {
  const todosResolvidos = resolverEmpresaDoGrupo(planejamentoTodos || [])
  const janelaResolvida = resolverEmpresaDoGrupo(planejamentoDaJanela, planejamentoTodos || planejamentoDaJanela)

  const grupos = new Map()
  janelaResolvida.forEach((p) => {
    const chave = chaveGrupoPlanejamento(p)
    if (!grupos.has(chave)) {
      grupos.set(chave, {
        chave, service_id: p.service_id, location_id: p.location_id, company_id: p.company_id || null,
        dias: [],
      })
    }
    grupos.get(chave).dias.push(p.data)
  })

  const overridePorChave = new Map(
    (overrides || [])
      .filter((o) => o.inicio_real || o.fim_real)
      .map((o) => [chaveGrupoPlanejamento(o), o]),
  )

  return [...grupos.values()].map((g) => {
    g.dias.sort()

    const historico = todosResolvidos
      .filter((p) => chaveGrupoPlanejamento(p) === g.chave)
      .map((p) => ({ data: p.data, situacao: situacaoExecucao(p, diarios) }))
      .sort((a, b) => (a.data < b.data ? -1 : 1))

    const iniciados = historico.filter((d) => d.situacao.chave === 'iniciada' || d.situacao.chave === 'concluida')
    const concluidos = historico.filter((d) => d.situacao.chave === 'concluida')
    const passados = historico.filter((d) => d.data <= hoje)

    const override = overridePorChave.get(g.chave)

    let situacaoGeral
    if (override) {
      situacaoGeral = override.fim_real ? 'concluida' : 'iniciada'
    } else {
      situacaoGeral = 'planejada'
      if (concluidos.length) situacaoGeral = 'concluida'
      else if (iniciados.length) situacaoGeral = 'iniciada'
      else if (passados.some((d) => d.situacao.chave === 'nao_executada')) situacaoGeral = 'nao_executada'
      else if (passados.length) situacaoGeral = 'sem_lancamento'
    }

    return {
      ...g,
      historico,
      inicioReal: override ? (override.inicio_real || override.fim_real) : (iniciados[0]?.data || null),
      fimReal: override ? (override.fim_real || override.inicio_real) : (concluidos.length ? concluidos[concluidos.length - 1].data : null),
      manual: Boolean(override),
      situacao: { chave: situacaoGeral, ...SITUACAO_EXECUCAO[situacaoGeral] },
    }
  }).sort((a, b) => (a.dias[0] < b.dias[0] ? -1 : 1))
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

/* Curva S OFICIAL da Prevision (schedule_global_items.scurve, via
   prevision_project_links.scurve) — base/previsto/realizado já
   ponderados por peso de verdade, do jeito que a tela "Progresso
   Mensal" deles mostra. curvaFisica() acima é a aproximação que o
   Prumo calcula sozinho quando não tem Prevision vinculada (ou
   enquanto isso); estas duas funções usam o dado real quando ele
   existe, pra nunca discordar do que a Prevision mostra pro Julio.

   scurve tem arrays paralelos (mesmo índice = mesmo dia): dates,
   base, expected (previsto), realized, measured — os 3 primeiros são
   uma fração 0-1 acumulada desde o início do projeto; measured
   marca em quais dias existe medição de verdade (não todo dia tem).

   A tela "Avanço Físico" da Prevision não usa a data de HOJE pro
   corte — usa a data da ÚLTIMA MEDIÇÃO (measured=true), pra Base/
   Previsto/Realizado sempre estarem alinhados no mesmo ponto no
   tempo (senão previsto avança sozinho todo dia enquanto realizado
   fica parado até a próxima medição, e os três nunca "combinam").
   Confirmado contra print real: bate exato usando essa data. */
export function previsionCurvaHoje(scurve, hoje = hojeISO()) {
  if (!scurve?.dates?.length) return null
  const idxMedido = (scurve.measured || []).lastIndexOf(true)
  const idx = idxMedido >= 0 ? idxMedido : scurve.dates.indexOf(hoje)
  if (idx < 0) return null
  return {
    data: scurve.dates[idx],
    base: (scurve.base?.[idx] || 0) * 100,
    previsto: (scurve.expected?.[idx] || 0) * 100,
    realizado: (scurve.realized?.[idx] || 0) * 100,
  }
}

/* "Progresso Mensal" — quanto cada curva avançou SÓ dentro do mês
   (mesISO tipo "2026-08"), não o acumulado desde o início do
   projeto. É a diferença entre o valor no fim do mês anterior e o
   valor no fim deste mês — mesma conta que a tela da Prevision usa
   pro gráfico de barras mês a mês. */
export function previsionCurvaDoMes(scurve, mesISO) {
  if (!scurve?.dates?.length) return null
  const indicesDoMes = []
  for (let i = 0; i < scurve.dates.length; i++) if (scurve.dates[i].startsWith(mesISO)) indicesDoMes.push(i)
  if (indicesDoMes.length === 0) return null
  const primeiroIdx = indicesDoMes[0]
  const ultimoIdx = indicesDoMes[indicesDoMes.length - 1]
  const antesIdx = primeiroIdx - 1
  const delta = (arr) => {
    const fim = arr?.[ultimoIdx] || 0
    const antes = antesIdx >= 0 ? (arr?.[antesIdx] || 0) : 0
    return (fim - antes) * 100
  }
  return {
    base: delta(scurve.base),
    previsto: delta(scurve.expected),
    realizado: delta(scurve.realized),
  }
}

const MES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export function mesAbreviado(mesISO) {
  const [ano, mes] = mesISO.split('-')
  return `${MES_ABREV[Number(mes) - 1]}/${ano}`
}

/* "Progresso Mensal" — um ponto por mês do projeto (não por dia),
   pra alimentar o gráfico de barras agrupadas igual ao da tela da
   Prevision. Meta e IDPM ficam de fora de propósito: a API não
   expõe percentual nenhum pra essas duas (só nome/data do "Goal",
   ver conversa) — melhor não mostrar do que arriscar um número
   inventado. "medido" marca se o mês já tem alguma medição real,
   pra não desenhar barra de Realizado em mês futuro (a própria
   Prevision também não desenha). */
export function previsionProgressoMensal(scurve) {
  if (!scurve?.dates?.length) return []
  const meses = []
  const vistos = new Set()
  for (const d of scurve.dates) {
    const mes = d.slice(0, 7)
    if (!vistos.has(mes)) { vistos.add(mes); meses.push(mes) }
  }
  return meses
    .map((mes, i) => {
      const delta = previsionCurvaDoMes(scurve, mes)
      if (!delta) return null
      const medido = scurve.dates.some((d, idx) => d.startsWith(mes) && scurve.measured?.[idx])
      return { mes, rotulo: mesAbreviado(mes), medido, ...delta }
    })
    .filter(Boolean)
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

/* A parte depois do nome-base é o local ("Serviço - Local -
   Sublocal"), sem o hífen que separa e sem o ponto final que o PDF
   às vezes deixa em siglas ("GERAL."). É contra isso que a etapa
   casa com o cadastro de Locais, pra distinguir duas etapas do MESMO
   serviço em locais diferentes (ex.: "CALÇADA E CIRCULAÇÃO" na
   Frente Adm e no Pátio Central). */
export function localDaEtapa(etapaDescricao) {
  const base = nomeBaseDaEtapa(etapaDescricao)
  return String(etapaDescricao || '').slice(base.length).replace(/^[\s-]+/, '').replace(/[.\s]+$/, '')
}

/* A etapa do cronograma não lança diário sozinha — ela empresta os
   dias de execução dos serviços do Planejamento que o Julio ligar a
   ela (schedule_item_services). Um dia "realizado" é um dia em que
   ALGUM serviço ligado teve status diferente de "não iniciada" no
   diário daquela data. Sem vínculo cadastrado, devolve lista vazia
   — não confunde "sem dado" com "não fez nada".

   Um serviço pode estar ligado a várias etapas do MESMO nome em
   locais diferentes (ex.: "CALÇADA E CIRCULAÇÃO" repete em três
   frentes) — sem checar o local, a etapa da Frente Adm acendia como
   "realizada" só porque a do Pátio Central rodou naquele dia. Quando
   o local da etapa bate com um cadastrado, só conta atividade
   planejada NESSE local; sem bater com nenhum (etapa sem o padrão
   "Serviço - Local", ou local ainda não cadastrado), cai pro
   comportamento antigo — olha qualquer local, pra não esconder dado
   por um cadastro incompleto. */
export function diasRealizadosEtapa(etapa, vinculos, planejamento, diarios, locais) {
  const etapaId = etapa?.id
  const servicoIds = new Set(
    (vinculos || []).filter((v) => v.schedule_item_id === etapaId).map((v) => v.service_id),
  )
  if (servicoIds.size === 0) return []

  const localEtapa = normalizarParaCasar(localDaEtapa(etapa?.descricao))
  const localId = localEtapa
    ? (locais || []).find((l) => normalizarParaCasar(l.nome) === localEtapa)?.id
    : undefined

  const plannedIds = new Set(
    (planejamento || [])
      .filter((p) => servicoIds.has(p.service_id))
      .filter((p) => !localId || p.location_id === localId)
      .map((p) => p.id),
  )
  if (plannedIds.size === 0) return []

  const dias = new Set()
  ;(diarios || []).forEach((d) => {
    const teveExecucao = (d.atividades || []).some(
      (a) => plannedIds.has(a.planned_id) && a.status !== 'nao_iniciada',
    )
    if (teveExecucao) dias.add(d.data)
  })
  return [...dias].sort()
}

/* O "Real" que aparece no card prefere a data digitada à mão — pra
   quando o cálculo automático (diasRealizadosEtapa) erra ou não tem
   como saber, porque a etapa não tem serviço ligado ou o diário do
   período não foi bem preenchido. Sem nada manual, cai pro intervalo
   calculado a partir do diário; sem nenhum dos dois, não tem "Real"
   pra mostrar. */
export function intervaloRealEtapa(item, diasReais) {
  if (item?.inicio_real || item?.fim_real) {
    const inicio = item.inicio_real || item.fim_real
    const fim = item.fim_real || item.inicio_real
    return { inicio, fim, manual: true }
  }
  if (!diasReais?.length) return null
  return { inicio: diasReais[0], fim: diasReais[diasReais.length - 1], manual: false, dias: diasReais.length }
}

/* Dia dentro da janela real (manual, se o Julio digitou; senão a
   prevista) em que nem existe diário lançado — diferente de "não
   trabalhou nisso", que é um dia com diário mas sem menção aos
   serviços da etapa. Aqui não dá nem pra saber o que aconteceu,
   porque o diário do dia nunca foi lançado. Só olha até hoje: dia
   futuro ainda não tem diário pra cobrar. */
export function diasSemDiarioEtapa(item, diarios, hoje = hojeISO()) {
  const inicio = item?.inicio_real || item?.data_inicio
  const fimBase = item?.fim_real || item?.data_fim
  if (!inicio || !fimBase) return []
  const fim = fimBase < hoje ? fimBase : hoje
  if (fim < inicio) return []
  const lancados = new Set((diarios || []).map((d) => d.data))
  const dias = []
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
    if (!lancados.has(d)) dias.push(d)
  }
  return dias
}

/* O PDF operacional do Julio nomeia a etapa como "Serviço - Local -
   Sublocal" (ex.: "PINTURA FINAL - BLOCO VENDAS - DECORADO"), e o
   nome do serviço no Planejamento é só a primeira parte ("PINTURA
   FINAL"). É esse padrão que deixa ligar etapa a serviço sem digitar
   nada: casa se a etapa começar pelo nome do serviço seguido de
   espaço ou hífen (não deixa "Reboco" casar com "Reboco externo e
   fachada" por acaso — precisa ser a etapa inteira, não uma palavra
   solta dentro dela). */
export function normalizarParaCasar(s) {
  return String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

export function servicoCorrespondeEtapa(servicoNome, etapaDescricao) {
  const s = normalizarParaCasar(servicoNome)
  const e = normalizarParaCasar(etapaDescricao)
  if (!s || !e) return false
  if (e === s) return true
  return e.startsWith(s) && /^[\s-]/.test(e.slice(s.length))
}

/* Quando a etapa não casa com nenhum serviço já cadastrado, a primeira
   parte do nome ("Serviço" antes do " - Local") é o nome do serviço
   que falta criar — assim toda etapa do cronograma vira um serviço
   selecionável no Planejamento, mesmo sem cadastro prévio. */
export function nomeBaseDaEtapa(etapaDescricao) {
  const partes = String(etapaDescricao || '').split(' - ')
  return (partes[0] || '').trim()
}

/* A planilha do Global agrupa cada tarefa por uma sigla de categoria
   ("PAV - Calçada e Circulação", "IND - Projetos") que o Mensal não
   usa — sem tirar isso antes de comparar, "PAV - Calçada e
   Circulação" nunca bate com "CALÇADA E CIRCULAÇÃO - Área Externa -
   Pátio Central" mesmo sendo o mesmo serviço. Só tira quando a
   sigla é curta (até 5 letras maiúsculas, o padrão de categoria) —
   não mexe em nomes que só por acaso têm um hífen no meio. */
function semSiglaDeCategoria(descricao) {
  const m = /^[A-ZÀ-Ú]{2,5}\s*-\s*(.+)$/.exec(String(descricao || '').trim())
  return m ? m[1] : descricao
}

/* Casamento por nome parecido entre uma tarefa do cronograma Global
   (a planilha do setor de planejamento, que não segue o padrão
   "Serviço - Local" do PDF operacional) e uma etapa do Mensal —
   usado pra vincular sem exigir que os dois textos sejam idênticos.
   Exige que a menor das duas descrições tenha pelo menos 6
   caracteres pra não casar por acaso em nomes curtos genéricos. */
export function cronogramaGlobalCorrespondeEtapa(descricaoGlobal, descricaoEtapa) {
  const g = normalizarParaCasar(semSiglaDeCategoria(descricaoGlobal))
  const e = normalizarParaCasar(descricaoEtapa)
  if (!g || !e) return false
  if (g === e) return true
  const maior = g.length >= e.length ? g : e
  const menor = g.length >= e.length ? e : g
  if (menor.length < 6) return false
  return maior.includes(menor)
}

/* Mesma ideia (nome parecido, não exigir texto idêntico) pra casar o
   "Insumo" de um pedido de Suprimentos (nome do sistema/ERP) com o
   nome já cadastrado no Almoxarifado — usado pra vincular a entrada
   que o almoxarife lança na hora (a nota chega antes do sistema
   atualizar) ao pedido oficial. Limite maior que o do cronograma (8,
   não 6): nome de material costuma ser mais técnico e curto demais
   vira falso positivo fácil (ex.: "PREGO 17X21" dentro de "PREGO
   17X21X25KG" já é arriscado; "TABUA 2,5" seria pior ainda). */
export function insumoCorrespondeMaterial(nomeInsumo, nomeMaterial) {
  const a = normalizarParaCasar(nomeInsumo)
  const b = normalizarParaCasar(nomeMaterial)
  if (!a || !b) return false
  if (a === b) return true
  const maior = a.length >= b.length ? a : b
  const menor = a.length >= b.length ? b : a
  if (menor.length < 8) return false
  return maior.includes(menor)
}

/* Direção oposta de diasRealizadosEtapa: de um grupo do Semanal
   (agruparPlanejamento) pra etapa do Mensal correspondente, pra
   quando o serviço fecha lá e a etapa aqui precisa saber. Serviço
   vinculado a mais de uma etapa (uma por local) só resolve pro
   local que bate; sem bater ninguém, ou batendo mais de um, devolve
   o motivo em vez de arriscar — quem chama decide se avisa. */
export function etapaCorrespondenteAoGrupo(grupo, etapas, vinculos, locais) {
  const etapaIds = new Set(
    (vinculos || []).filter((v) => v.service_id === grupo.service_id).map((v) => v.schedule_item_id),
  )
  if (etapaIds.size === 0) return { etapa: null, motivo: 'servico_sem_vinculo' }

  const nomeLocal = (locais || []).find((l) => l.id === grupo.location_id)?.nome
  const localNormalizado = nomeLocal ? normalizarParaCasar(nomeLocal) : null

  const candidatas = (etapas || []).filter((e) => {
    if (!etapaIds.has(e.id)) return false
    const localEtapa = normalizarParaCasar(localDaEtapa(e.descricao))
    if (!localEtapa) return true
    return localNormalizado === localEtapa
  })

  if (candidatas.length === 0) return { etapa: null, motivo: 'sem_etapa_no_local' }
  if (candidatas.length > 1) return { etapa: null, motivo: 'ambiguo', candidatas }
  return { etapa: candidatas[0], motivo: null }
}

export const MOTIVO_SEM_SINCRONIA = {
  servico_sem_vinculo: 'O serviço nunca foi vinculado a nenhuma etapa em Mensal.',
  sem_etapa_no_local: 'Tem etapa desse serviço em Mensal, mas nenhuma cadastrada nesse local.',
  ambiguo: 'Mais de uma etapa desse serviço em Mensal parece ser desse local — corrija o nome de uma delas.',
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

/* ── Controle de estoque (Almoxarifado) ───────────────────────
   Modelado em cima da planilha que o almoxarife já usa: uma aba de
   entrada (o que chegou), uma de saída (o que foi consumido) e uma
   de saldo — só que aqui o saldo nunca é gravado. É sempre entrada
   menos saída, calculado na hora, do mesmo jeito que o SUMIF da
   planilha fazia. Guardar um "saldo atual" seria abrir uma segunda
   fonte de verdade que pode desalinhar do histórico. */
export function saldoEstoque(materiais, entradas, saidas) {
  return (materiais || []).map((m) => {
    const entradasDoMaterial = (entradas || []).filter((e) => e.material_id === m.id)
    const saidasDoMaterial = (saidas || []).filter((s) => s.material_id === m.id)
    const quantidadeEntrada = entradasDoMaterial.reduce((s, e) => s + Number(e.quantidade || 0), 0)
    const quantidadeSaida = saidasDoMaterial.reduce((s, e) => s + Number(e.quantidade || 0), 0)
    const custoTotal = entradasDoMaterial.reduce((s, e) => s + Number(e.valor_total || 0), 0)
    const saldo = quantidadeEntrada - quantidadeSaida
    return {
      material: m,
      quantidadeEntrada,
      quantidadeSaida,
      saldo,
      custoTotal,
      custoMedio: quantidadeEntrada > 0 ? custoTotal / quantidadeEntrada : 0,
      abaixoDoMinimo: m.estoque_minimo != null && m.estoque_minimo !== '' && saldo < Number(m.estoque_minimo),
    }
  })
}

/* Reconciliação Suprimentos × estoque lançado na mão: agrupa os
   pedidos JÁ CONFIRMADOS ("5 - Confirmado") de um Destino (almoxari-
   fado/epi) por nome de insumo, soma a quantidade que a planilha diz
   que chegou, e bate contra o total lançado manualmente em
   "Registrar entrada" pro material/EPI correspondente (mesmo
   casamento por nome de insumoCorrespondeMaterial). Não mexe no
   saldo — só ajuda a achar o que chegou pela planilha e ninguém
   lançou ainda (ou lançou quantidade diferente).

   Pedido confirmado sem Data Entrega preenchida (a nota chega na
   obra antes de o sistema deles atualizar essa data) continua
   contando pra aparecer na lista — nunca some — mas a quantidade só
   entra na soma de "quanto chegou" quando a data existir de verdade;
   nunca inventa número que a planilha não confirmou. `pedidosSemData`
   marca quantos desses pedidos ainda estão nessa situação, pra tela
   mostrar o aviso "lançado, aguardando o Suprimentos atualizar". */
export function resumoRecebidoSuprimentos(pedidos, destino, materiais, entradas) {
  const quantidadeManualPorMaterial = new Map()
  for (const e of (entradas || [])) {
    quantidadeManualPorMaterial.set(e.material_id, (quantidadeManualPorMaterial.get(e.material_id) || 0) + Number(e.quantidade || 0))
  }

  const porInsumo = new Map()
  for (const p of (pedidos || [])) {
    if (p.destino !== destino || p.estagio !== '5 - Confirmado') continue
    const atual = porInsumo.get(p.insumo) || { qtdeSuprimentos: 0, ultimaEntrega: null, pedidos: 0, pedidosSemData: 0 }
    atual.pedidos += 1
    if (p.data_entrega) {
      atual.qtdeSuprimentos += Number(p.quantidade || 0)
      if (!atual.ultimaEntrega || p.data_entrega > atual.ultimaEntrega) atual.ultimaEntrega = p.data_entrega
    } else {
      atual.pedidosSemData += 1
    }
    porInsumo.set(p.insumo, atual)
  }

  return [...porInsumo.entries()]
    .map(([insumo, info]) => {
      const material = (materiais || []).find((m) => insumoCorrespondeMaterial(insumo, m.nome))
      const qtdeManual = material ? (quantidadeManualPorMaterial.get(material.id) || 0) : 0
      return {
        insumo,
        material,
        pedidos: info.pedidos,
        pedidosSemData: info.pedidosSemData,
        ultimaEntrega: info.ultimaEntrega,
        qtdeSuprimentos: info.qtdeSuprimentos,
        qtdeManual,
        diferenca: info.qtdeSuprimentos - qtdeManual,
      }
    })
    .sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca))
}

/* Mesma ideia do resumoRecebidoSuprimentos, mas pro Destino
   "Equipamentos" — que não tem entrada/saída por quantidade como
   material e EPI, é cadastro individual (cada unidade é um registro
   próprio, com status). Aqui não dá pra "somar e bater diferença";
   o que interessa é achar pedido cujo insumo ainda não tem NENHUM
   equipamento cadastrado com nome parecido, pra lembrar de cadastrar. */
export function pedidosEquipamentoSemCadastro(pedidos, equipamentos) {
  const porInsumo = new Map()
  for (const p of (pedidos || [])) {
    if (p.destino !== 'equipamentos' || p.estagio !== '5 - Confirmado') continue
    const atual = porInsumo.get(p.insumo) || { quantidade: 0, ultimaEntrega: null, pedidos: 0 }
    atual.quantidade += Number(p.quantidade || 0)
    atual.pedidos += 1
    if (!atual.ultimaEntrega || p.data_entrega > atual.ultimaEntrega) atual.ultimaEntrega = p.data_entrega
    porInsumo.set(p.insumo, atual)
  }

  return [...porInsumo.entries()]
    .filter(([insumo]) => !(equipamentos || []).some((eq) => insumoCorrespondeMaterial(insumo, eq.nome)))
    .map(([insumo, info]) => ({ insumo, ...info }))
    .sort((a, b) => (a.ultimaEntrega < b.ultimaEntrega ? 1 : -1))
}

/* ── Controle de refeições (Almoxarifado) ─────────────────────
   Lançamento é por DIA, não por empresa — um número só, do jeito
   que o almoxarife manda ("hoje foram 20 almoços"). A quebra por
   empresa (própria × terceirizada) não vem mais de um campo
   declarado no lançamento: vem de quem foi vinculado a cada um,
   olhando a empresa de cada colaborador (`colaboradores`). Por
   isso `linhas`/`proprias`/`terceirizadas` contam PESSOAS
   vinculadas, não a quantidade oficial — os dois números só batem
   quando todo mundo do dia foi vinculado; `totalVinculado` deixa
   essa diferença visível.
   Lançamento antigo (de antes dessa mudança, sem worker_ids e com
   `company_id` preenchido no próprio registro) continua contando
   do jeito antigo — por isso o fallback abaixo. */
export function resumoRefeicoesDoMes(registros, empresas, colaboradores, mes) {
  const doMes = (registros || []).filter((r) => r.data.slice(0, 7) === mes)
  const porEmpresa = new Map()
  doMes.forEach((r) => {
    if (r.worker_ids && r.worker_ids.length > 0) {
      r.worker_ids.forEach((workerId) => {
        const colaborador = (colaboradores || []).find((c) => c.id === workerId)
        const companyId = colaborador?.company_id || r.company_id || null
        porEmpresa.set(companyId, (porEmpresa.get(companyId) || 0) + 1)
      })
    } else if (r.company_id) {
      porEmpresa.set(r.company_id, (porEmpresa.get(r.company_id) || 0) + Number(r.quantidade || 0))
    }
  })
  const linhas = Array.from(porEmpresa.entries()).map(([companyId, total]) => {
    const empresa = (empresas || []).find((e) => e.id === companyId)
    return { companyId, nome: empresa?.nome || 'Sem empresa', tipo: empresa?.tipo || 'empreiteira', total }
  }).sort((a, b) => b.total - a.total)
  return {
    registros: doMes,
    linhas,
    proprias: linhas.filter((l) => l.tipo === 'propria'),
    terceirizadas: linhas.filter((l) => l.tipo !== 'propria'),
    totalGeral: doMes.reduce((s, r) => s + (Number(r.quantidade) || 0), 0),
    totalVinculado: linhas.reduce((s, l) => s + l.total, 0),
  }
}
