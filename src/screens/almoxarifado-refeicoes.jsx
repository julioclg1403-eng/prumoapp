/* ============================================================
   ALMOXARIFADO — REFEIÇÕES

   Lançamento é por DIA, não por empresa — o almoxarife manda um
   número só ("hoje foram 20 almoços"), que continua sendo digitado
   à mão (é a fonte oficial — o restaurante cobra por ele). O que
   este módulo faz por cima disso é vincular QUEM comeu: busca no
   Diário daquele dia, um a um, todo colaborador marcado presente
   (com a atividade/frente que estava executando), já pré-marcado.
   Quem não aparece no Diário (ele ainda não foi lançado, ou a
   pessoa comeu sem estar marcada presente) entra à mão, por busca
   — pode marcar vários de uma vez, sem a lista sumir a cada clique.

   Quando a quantidade lançada não bate com quantos colaboradores
   estão vinculados, um aviso aparece — não trava o salvamento, só
   avisa pra conferir.
   ============================================================ */

import { useState, useMemo } from 'react'
import { useDados } from '../lib/DadosContext'
import {
  hojeISO, formatarData, formatarDataCurta, somarMeses, rotuloMes, plural,
  resumoRefeicoesDoMes, resumoRefeicoesPorPeriodo, diarioDaData,
} from '../lib/dominio'
import {
  Icon, PageHeader, Sheet, Campo, Confirmar, Vazio, ItemLista, Selecionavel, SecaoRecolhivel, ChipToggle,
  RelatorioFolha, SecaoRelatorio, TabelaRelatorio,
} from '../components'

/* Cada tipo de relatório que a exportação sabe montar — marcados por
   padrão (comportamento de antes: exportava tudo), mas a pessoa pode
   desmarcar o que não quer levar pro PDF/impressão. O "Dia a dia" é
   tratado à parte no fim (uma seção por dia, não uma seção só). */
const TIPOS_RELATORIO = [
  { valor: 'colaborador', rotulo: 'Por nome' },
  { valor: 'empresa', rotulo: 'Por empresa' },
  { valor: 'servico', rotulo: 'Por serviço/frente' },
  { valor: 'funcao', rotulo: 'Por função' },
  { valor: 'matriz', rotulo: 'Colaborador × serviço' },
  { valor: 'frequencia', rotulo: 'Frequência' },
  { valor: 'diario', rotulo: 'Dia a dia' },
]

function ultimoDiaDoMes(mesISO) {
  const [ano, mes] = mesISO.split('-').map(Number)
  const d = new Date(ano, mes, 0) // dia 0 do mês seguinte = último dia do mês atual
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function normalizarComparar(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().trim()
}

/* Mesma cara do Selecionavel (classes .pick/.box/.grow), só que como
   botões IRMÃOS em vez de botão dentro de botão — precisa disso
   porque esta linha tem uma segunda ação (fixar/desafixar como
   administrativo) ao lado do toggle de marcar/desmarcar. */
function LinhaColaborador({ marcado, onToggle, titulo, sub, onFixar, onDesfixar }) {
  return (
    <div className="row-flex" style={{ gap: 6, alignItems: 'stretch' }}>
      <button className="pick" data-on={marcado ? '1' : '0'} onClick={onToggle} style={{ flex: 1 }}>
        <span className="box"><Icon name="check" size={14} /></span>
        <span className="grow" style={{ textAlign: 'left' }}>
          <span className="t-strong" style={{ display: 'block', fontSize: 15 }}>{titulo}</span>
          {sub && <span className="t-caption" style={{ display: 'block', marginTop: 2 }}>{sub}</span>}
        </span>
      </button>
      {onFixar && (
        <button
          className="btn btn-ghost btn-sm" onClick={onFixar} style={{ flex: 'none' }}
          title="Manter sempre visível aqui, como administrativo"
        >
          <Icon name="mais_sinal" size={16} />
        </button>
      )}
      {onDesfixar && (
        <button
          className="btn btn-ghost btn-sm" onClick={onDesfixar} style={{ flex: 'none' }}
          title="Remover da lista fixa de administrativo"
        >
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  )
}

/* Serviço/frente de quem não tem atividade lançada no diário: em vez
   de só digitar à mão (e cada um escrever a mesma coisa de um jeito
   diferente), oferece ESCOLHER (clicar), com o código, direto do
   Planejamento (Cadastros → Planejamento — a estrutura de custos da
   UAU) — só os itens de nível Insumo, que é o nível que corresponde
   a um cargo/atividade de verdade (Tipo/Etapa/Sub-etapa são
   categorias grandes demais pra isso). "Outro" mantém a digitação
   livre pra quem não está naquela lista. Modo (lista vs. livre) parte
   do valor já salvo: se bate com um insumo cadastrado, começa na
   lista; senão, começa no campo livre — não perde o que já foi
   digitado antes dessa mudança. */
function CampoServicoManual({ dados, valor, onChange }) {
  const opcoes = useMemo(() => {
    return (dados.estruturaCustos || [])
      .filter((x) => x.ativo !== false && x.nivel === 'insumo')
      .map((x) => ({ valor: x.nome, rotulo: x.codigo ? `${x.codigo} · ${x.nome}` : x.nome }))
      .sort((a, b) => a.valor.localeCompare(b.valor, 'pt-BR'))
  }, [dados.estruturaCustos])

  const bateComOpcao = valor && opcoes.some((o) => o.valor === valor)
  const [modoLivre, setModoLivre] = useState(Boolean(valor) && !bateComOpcao)

  if (opcoes.length === 0 || modoLivre) {
    return (
      <div className="stack-1">
        <input
          className="ipt"
          placeholder="Serviço/frente (opcional — digite à mão)"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
        />
        {opcoes.length > 0 && (
          <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setModoLivre(false)}>
            Escolher do Planejamento
          </button>
        )}
      </div>
    )
  }

  return (
    <select
      className="sel"
      value={bateComOpcao ? valor : ''}
      onChange={(e) => {
        if (e.target.value === '__outro__') { setModoLivre(true); return }
        onChange(e.target.value)
      }}
    >
      <option value="">Vincular ao Planejamento</option>
      {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
      <option value="__outro__">Outro (digitar à mão)…</option>
    </select>
  )
}

/* Todo colaborador que o Diário daquele dia marcou presente, de
   QUALQUER empresa — é a lista-fonte "buscada um a um". Sem diário
   lançado nesse dia (ou sem data escolhida ainda), devolve lista
   vazia: não tem vínculo automático pra oferecer, só o campo de
   busca manual continua disponível. */
function colaboradoresDoDiario(dados, data) {
  if (!data) return []
  const diario = diarioDaData(dados.diarios, data, dados.obra.id)
  if (!diario) return []
  return diario.presencas
    .filter((p) => p.presente)
    .map((p) => {
      const colaborador = dados.colaboradorPorId(p.worker_id)
      const empresa = dados.empresas?.find((e) => e.id === p.company_id)
      const atividades = diario.atividades
        .filter((a) => a.worker_ids.includes(p.worker_id))
        .map((a) => dados.rotuloAtividade(a.planned_id))
      return {
        workerId: p.worker_id,
        nome: colaborador?.nome || 'Colaborador removido',
        funcao: colaborador?.funcao || '',
        empresa: empresa?.nome || 'Sem empresa',
        atividades,
      }
    })
    .sort((a, b) => a.empresa.localeCompare(b.empresa) || a.nome.localeCompare(b.nome))
}

/* Resolve o "quem" de uma pessoa vinculada num lançamento: nome,
   empresa e o serviço/frente — do Diário quando tem atividade
   lançada naquele dia; senão, do que foi digitado à mão nesse
   lançamento (servicos_manuais). Sem nenhum dos dois, fica sem
   serviço mesmo — não inventa. */
function pessoaDoLancamento(dados, r, workerId) {
  const colaborador = dados.colaboradorPorId(workerId)
  const empresaId = colaborador?.company_id || r.company_id
  const empresa = dados.empresas?.find((e) => e.id === empresaId)?.nome || 'Empresa removida'
  const diario = diarioDaData(dados.diarios, r.data, dados.obra.id)
  const atividades = diario
    ? diario.atividades.filter((a) => a.worker_ids.includes(workerId)).map((a) => dados.rotuloAtividade(a.planned_id))
    : []
  const servicoManual = (r.servicos_manuais || {})[workerId]?.trim()
  const servico = atividades.length ? atividades.map((a) => `${a.servico} · ${a.local}`).join(', ') : (servicoManual || null)
  return { nome: colaborador?.nome || 'Colaborador removido', empresa, servico }
}

/* Relatório por período: agrupa os lançamentos por dia (mais de um
   lançamento no mesmo dia soma a quantidade) e lista quem foi
   vinculado, com a empresa e o serviço/frente de cada um naquele
   dia. Um dia sem ninguém vinculado ainda aparece no relatório (com
   a quantidade lançada), só sem a lista de nomes embaixo — não
   esconde lançamento nenhum do período. */
function agruparRefeicoesPorDia(dados, registros) {
  const porDia = new Map()
  for (const r of registros) {
    if (!porDia.has(r.data)) porDia.set(r.data, { data: r.data, quantidade: 0, pessoas: [] })
    const grupo = porDia.get(r.data)
    grupo.quantidade += Number(r.quantidade) || 0
    for (const workerId of r.worker_ids || []) {
      const p = pessoaDoLancamento(dados, r, workerId)
      grupo.pessoas.push({ nome: p.nome, empresa: p.empresa, servico: p.servico || '—' })
    }
  }
  return [...porDia.values()]
    .map((g) => ({ ...g, pessoas: g.pessoas.sort((a, b) => a.nome.localeCompare(b.nome)) }))
    .sort((a, b) => (a.data < b.data ? -1 : 1))
}

/* Mesma fonte de serviço (diário ou manual), agrupada por período —
   pra ver quanto cada frente consumiu, não só cada empresa/pessoa.
   Porcentagem sobre o total vinculado, igual porColaborador/porEmpresa. */
function resumoServicosPorPeriodo(dados, registros) {
  const porServico = new Map()
  let totalVinculado = 0
  registros.forEach((r) => {
    (r.worker_ids || []).forEach((workerId) => {
      const p = pessoaDoLancamento(dados, r, workerId)
      const chave = p.servico || 'Sem serviço vinculado'
      porServico.set(chave, (porServico.get(chave) || 0) + 1)
      totalVinculado += 1
    })
  })
  const percentual = (total) => (totalVinculado ? Math.round((total / totalVinculado) * 1000) / 10 : 0)
  return Array.from(porServico.entries())
    .map(([servico, total]) => ({ servico, total, percentual: percentual(total) }))
    .sort((a, b) => b.total - a.total || a.servico.localeCompare(b.servico))
}

/* Por função/cargo do colaborador (não o serviço/frente do dia) —
   é o mesmo dado que "Por colaborador" olha por outro corte: quantos
   almoços cada função (pedreiro, carpinteiro…) consumiu no período,
   e qual fatia isso é do total vinculado. Função vem do cadastro do
   colaborador (Cadastros → Colaboradores), não do diário. */
function resumoFuncoesPorPeriodo(dados, registros) {
  const porFuncao = new Map()
  let totalVinculado = 0
  registros.forEach((r) => {
    (r.worker_ids || []).forEach((workerId) => {
      const colaborador = dados.colaboradorPorId(workerId)
      const chave = (colaborador?.funcao || '').trim() || 'Sem função cadastrada'
      porFuncao.set(chave, (porFuncao.get(chave) || 0) + 1)
      totalVinculado += 1
    })
  })
  const percentual = (total) => (totalVinculado ? Math.round((total / totalVinculado) * 1000) / 10 : 0)
  return Array.from(porFuncao.entries())
    .map(([funcao, total]) => ({ funcao, total, percentual: percentual(total) }))
    .sort((a, b) => b.total - a.total || a.funcao.localeCompare(b.funcao))
}

/* Tabela de frequência: uma linha por colaborador (nome exatamente
   como está cadastrado), uma coluna por dia com lançamento no
   período — a célula já traz o serviço/frente vinculado naquele
   dia (ou "Sem serviço vinculado"), não só uma marcação genérica de
   presença. Só entram os dias que realmente tiveram lançamento
   (mesmo conjunto de dias do "Dia a dia" acima). */
function matrizFrequenciaRefeicoes(dados, registros) {
  const dias = [...new Set(registros.map((r) => r.data))].sort()
  const porPessoa = new Map()
  registros.forEach((r) => {
    (r.worker_ids || []).forEach((workerId) => {
      const p = pessoaDoLancamento(dados, r, workerId)
      if (!porPessoa.has(workerId)) porPessoa.set(workerId, { nome: p.nome, porDia: new Map() })
      porPessoa.get(workerId).porDia.set(r.data, p.servico || 'Sem serviço vinculado')
    })
  })
  const linhas = Array.from(porPessoa.values())
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map((p) => ({ nome: p.nome, celulas: dias.map((d) => p.porDia.get(d) || '') }))
  return { dias, linhas }
}

/* Cruzamento colaborador × serviço: pra cada pessoa, quanto (em %)
   das refeições DELA no período foram em cada serviço/frente — não
   é a mesma coisa que "Por serviço" (que é % sobre o total geral).
   Aqui a porcentagem é sobre o total de CADA colaborador, então a
   linha de cada um soma 100%. */
function matrizColaboradorServico(dados, registros) {
  const porPessoa = new Map()
  const servicosVistos = new Set()
  registros.forEach((r) => {
    (r.worker_ids || []).forEach((workerId) => {
      const p = pessoaDoLancamento(dados, r, workerId)
      const servico = p.servico || 'Sem serviço vinculado'
      servicosVistos.add(servico)
      if (!porPessoa.has(workerId)) porPessoa.set(workerId, { nome: p.nome, porServico: new Map(), total: 0 })
      const pessoa = porPessoa.get(workerId)
      pessoa.porServico.set(servico, (pessoa.porServico.get(servico) || 0) + 1)
      pessoa.total += 1
    })
  })
  const servicos = [...servicosVistos].sort()
  const linhas = Array.from(porPessoa.values())
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map((p) => ({
      nome: p.nome,
      total: p.total,
      celulas: servicos.map((s) => {
        const qtd = p.porServico.get(s) || 0
        return { qtd, percentual: p.total ? Math.round((qtd / p.total) * 1000) / 10 : 0 }
      }),
    }))
  return { servicos, linhas }
}

export default function AlmoxarifadoRefeicoes({ perfil }) {
  const dados = useDados()
  const hoje = hojeISO()
  const podeExcluir = perfil?.role !== 'campo'

  const [mes, setMes] = useState(() => hoje.slice(0, 7))
  const [editando, setEditando] = useState(null)
  const [buscaAdicionar, setBuscaAdicionar] = useState('')
  const [confirmar, setConfirmar] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [modoRelatorio, setModoRelatorio] = useState('periodo') // 'dia' | 'mes' | 'periodo'
  const [relatorioDia, setRelatorioDia] = useState(hoje)
  const [relatorioMes, setRelatorioMes] = useState(() => hoje.slice(0, 7))
  const [relatorioInicio, setRelatorioInicio] = useState(() => `${hoje.slice(0, 7)}-01`)
  const [relatorioFim, setRelatorioFim] = useState(hoje)
  const [tiposRelatorio, setTiposRelatorio] = useState(() => new Set(TIPOS_RELATORIO.map((t) => t.valor)))

  const alternarTipoRelatorio = (valor) => {
    setTiposRelatorio((atual) => {
      const novo = new Set(atual)
      if (novo.has(valor)) novo.delete(valor); else novo.add(valor)
      return novo
    })
  }

  const resumo = useMemo(
    () => resumoRefeicoesDoMes(dados.refeicoes, dados.empresas, dados.colaboradores, mes),
    [dados.refeicoes, dados.empresas, dados.colaboradores, mes],
  )
  const registrosOrdenados = useMemo(
    () => [...resumo.registros].sort((a, b) => (a.data < b.data ? 1 : -1)),
    [resumo.registros],
  )

  let periodoIni = relatorioInicio <= relatorioFim ? relatorioInicio : relatorioFim
  let periodoFim = relatorioInicio <= relatorioFim ? relatorioFim : relatorioInicio
  if (modoRelatorio === 'dia') {
    periodoIni = relatorioDia
    periodoFim = relatorioDia
  } else if (modoRelatorio === 'mes') {
    periodoIni = `${relatorioMes}-01`
    periodoFim = ultimoDiaDoMes(relatorioMes)
  }

  const registrosDoRelatorio = useMemo(() => {
    return (dados.refeicoes || []).filter((r) => r.data >= periodoIni && r.data <= periodoFim)
  }, [dados.refeicoes, periodoIni, periodoFim])
  const diasDoRelatorio = useMemo(
    () => agruparRefeicoesPorDia(dados, registrosDoRelatorio),
    [dados, registrosDoRelatorio],
  )
  const resumoPeriodo = useMemo(
    () => resumoRefeicoesPorPeriodo(dados.refeicoes, dados.empresas, dados.colaboradores, periodoIni, periodoFim),
    [dados.refeicoes, dados.empresas, dados.colaboradores, periodoIni, periodoFim],
  )
  const servicosDoPeriodo = useMemo(
    () => resumoServicosPorPeriodo(dados, registrosDoRelatorio),
    [dados, registrosDoRelatorio],
  )
  const funcoesDoPeriodo = useMemo(
    () => resumoFuncoesPorPeriodo(dados, registrosDoRelatorio),
    [dados, registrosDoRelatorio],
  )
  const matrizFrequencia = useMemo(
    () => matrizFrequenciaRefeicoes(dados, registrosDoRelatorio),
    [dados, registrosDoRelatorio],
  )
  const matrizColabServico = useMemo(
    () => matrizColaboradorServico(dados, registrosDoRelatorio),
    [dados, registrosDoRelatorio],
  )

  /* Vincular direto do relatório: pega o lançamento daquele dia (o
     modelo é um lançamento por dia) e abre o mesmo formulário de
     edição de sempre — não existe uma UI de vínculo separada, é a
     mesma, só que disparada daqui em vez de lá de cima na lista. */
  const abrirVinculoDoDia = (data) => {
    const registro = registrosDoRelatorio.find((r) => r.data === data)
    if (!registro) return
    setBuscaAdicionar('')
    setEditando({ ...registro, worker_ids: registro.worker_ids || [] })
  }

  /* Ao trocar a data de um lançamento NOVO, se ainda não tem
     ninguém vinculado à mão, vincula automaticamente só quem o
     Diário marcou presente E TEM atividade/frente lançada naquele
     dia — presença sem atividade ainda não foi preenchida pela
     engenharia, então não é vínculo automático, fica pra pessoa
     confirmar à mão (continua aparecendo na lista, só sem vir
     marcado). Numa edição já existente, nunca mexe sozinho. */
  const escolherData = (data) => {
    setEditando((p) => {
      const novo = { ...p, data }
      if (!p.id && (!p.worker_ids || p.worker_ids.length === 0)) {
        const comAtividade = colaboradoresDoDiario(dados, data).filter((c) => c.atividades.length > 0)
        if (comAtividade.length > 0) {
          novo.worker_ids = comAtividade.map((c) => c.workerId)
          if (!novo.quantidade) novo.quantidade = String(comAtividade.length)
        }
      }
      return novo
    })
  }

  const abrirNovo = () => {
    setBuscaAdicionar('')
    const comAtividade = colaboradoresDoDiario(dados, hoje).filter((c) => c.atividades.length > 0)
    setEditando({ data: hoje, quantidade: '', fornecedor: '', worker_ids: comAtividade.map((c) => c.workerId) })
  }

  const salvar = async () => {
    if (!editando?.data || !Number(editando?.quantidade)) return
    setSalvando(true)
    const ok = await dados.salvarRefeicao(editando)
    setSalvando(false)
    if (ok) setEditando(null)
  }

  const pedirExcluir = (item) => setConfirmar({
    titulo: 'Excluir lançamento?',
    texto: `${item.quantidade} refeições em ${formatarDataCurta(item.data)} saem do histórico. Isso não tem volta.`,
    rotuloOk: 'Excluir', perigo: true,
    onOk: async () => { setConfirmar(null); await dados.excluirRefeicao(item.id) },
  })

  const doDiario = editando ? colaboradoresDoDiario(dados, editando.data) : []
  const idsNoDiario = new Set(doDiario.map((c) => c.workerId))
  const vinculados = editando?.worker_ids || []
  const quantidadeNum = Number(editando?.quantidade) || 0
  const divergencia = Boolean(editando) && quantidadeNum !== vinculados.length

  /* O Diário só registra presença de mão de obra de campo — quem é
     administrativo (escritório, engenharia fixa na obra) nunca
     aparece lá, mas come todo dia igual. Em vez de buscar o nome
     toda vez, quem foi marcado como administrativo (ver Cadastros
     ou o botão "+" nas linhas abaixo) fica sempre visível aqui. */
  const administrativos = useMemo(() => {
    if (!editando) return []
    return (dados.colaboradores || [])
      .filter((c) => c.administrativo && c.ativo !== false && !idsNoDiario.has(c.id))
      .map((c) => {
        const empresa = dados.empresas?.find((e) => e.id === c.company_id)
        return { workerId: c.id, nome: c.nome, funcao: c.funcao || '', empresa: empresa?.nome || 'Sem empresa' }
      })
      .sort((a, b) => a.nome.localeCompare(b.nome))
  }, [editando, dados, idsNoDiario])
  const idsAdministrativos = new Set(administrativos.map((c) => c.workerId))

  /* Quem já está vinculado mas não veio do Diário nem da lista fixa
     de administrativo (foi marcado à mão avulso, só pra esse dia) —
     precisa continuar visível mesmo depois que a busca some da
     tela, senão não tem como desmarcar de novo. */
  const adicionadosManualmente = useMemo(() => {
    if (!editando) return []
    return vinculados
      .filter((id) => !idsNoDiario.has(id) && !idsAdministrativos.has(id))
      .map((id) => {
        const colaborador = dados.colaboradorPorId(id)
        const empresa = dados.empresas?.find((e) => e.id === colaborador?.company_id)
        return { workerId: id, nome: colaborador?.nome || 'Colaborador removido', funcao: colaborador?.funcao || '', empresa: empresa?.nome || 'Sem empresa' }
      })
      .sort((a, b) => a.nome.localeCompare(b.nome))
  }, [editando, vinculados, idsNoDiario, idsAdministrativos, dados])

  const resultadosBusca = useMemo(() => {
    const alvo = normalizarComparar(buscaAdicionar)
    if (!alvo) return []
    return (dados.colaboradores || [])
      .filter((c) => c.ativo !== false && !idsNoDiario.has(c.id) && !idsAdministrativos.has(c.id) && normalizarComparar(c.nome).includes(alvo))
      .slice(0, 20)
  }, [buscaAdicionar, dados.colaboradores, idsNoDiario, idsAdministrativos])

  const alternarColaborador = (workerId) => {
    setEditando((p) => {
      const atual = p.worker_ids || []
      const novo = atual.includes(workerId) ? atual.filter((id) => id !== workerId) : [...atual, workerId]
      return { ...p, worker_ids: novo }
    })
  }

  /* Serviço/frente digitado à mão pra quem não tem atividade lançada
     no diário nesse dia — fica guardado no próprio lançamento, por
     colaborador (servicos_manuais: { [workerId]: texto }). */
  const atualizarServicoManual = (workerId, texto) => {
    setEditando((p) => ({ ...p, servicos_manuais: { ...(p.servicos_manuais || {}), [workerId]: texto } }))
  }

  return (
    <div className="page stack-2">
      <PageHeader
        titulo="Refeições"
        sub={`${plural(resumo.registros.length, 'lançamento', 'lançamentos')} em ${rotuloMes(mes).toLowerCase()}`}
        acao={
          <button className="btn btn-primary" onClick={abrirNovo}>
            <Icon name="mais_sinal" size={18} /> Nova refeição
          </button>
        }
      />

      <SecaoRecolhivel
        titulo="Relatório"
        resumo={
          modoRelatorio === 'dia' ? formatarDataCurta(relatorioDia)
            : modoRelatorio === 'mes' ? rotuloMes(relatorioMes)
              : `${formatarDataCurta(periodoIni)}–${formatarDataCurta(periodoFim)}`
        }
      >
        <div className="row-flex" style={{ gap: 6 }}>
          <button
            className={`btn btn-sm ${modoRelatorio === 'dia' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setModoRelatorio('dia')}
          >
            Dia
          </button>
          <button
            className={`btn btn-sm ${modoRelatorio === 'mes' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setModoRelatorio('mes')}
          >
            Mês
          </button>
          <button
            className={`btn btn-sm ${modoRelatorio === 'periodo' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setModoRelatorio('periodo')}
          >
            Período
          </button>
        </div>

        {modoRelatorio === 'dia' && (
          <Campo label="Dia">
            <input className="ipt" type="date" value={relatorioDia} onChange={(e) => setRelatorioDia(e.target.value)} />
          </Campo>
        )}

        {modoRelatorio === 'mes' && (
          <Campo label="Mês">
            <input className="ipt" type="month" value={relatorioMes} onChange={(e) => setRelatorioMes(e.target.value)} />
          </Campo>
        )}

        {modoRelatorio === 'periodo' && (
          <div className="row-flex">
            <Campo label="De">
              <input className="ipt" type="date" value={relatorioInicio} onChange={(e) => setRelatorioInicio(e.target.value)} />
            </Campo>
            <Campo label="Até">
              <input className="ipt" type="date" value={relatorioFim} onChange={(e) => setRelatorioFim(e.target.value)} />
            </Campo>
          </div>
        )}

        <div>
          <div className="t-micro" style={{ marginBottom: 6 }}>O que entra na exportação</div>
          <div className="row-wrap">
            {TIPOS_RELATORIO.map((t) => (
              <ChipToggle key={t.valor} ativo={tiposRelatorio.has(t.valor)} onClick={() => alternarTipoRelatorio(t.valor)}>
                {t.rotulo}
              </ChipToggle>
            ))}
          </div>
        </div>

        <button
          className="btn btn-primary btn-block"
          onClick={() => window.print()}
          disabled={tiposRelatorio.size === 0}
        >
          <Icon name="relatorio" size={17} /> Imprimir / baixar PDF ({plural(diasDoRelatorio.length, 'dia', 'dias')})
        </button>

        {resumoPeriodo.totalVinculado > 0 && (
          <div className="stack-2">
            <div>
              <div className="t-micro" style={{ marginBottom: 6 }}>
                Por colaborador ({resumoPeriodo.totalVinculado} vinculado{resumoPeriodo.totalVinculado === 1 ? '' : 's'} no período)
              </div>
              <div className="stack-1">
                {resumoPeriodo.porColaborador.map((c) => (
                  <div key={c.workerId} className="row-between" style={{ fontSize: 13 }}>
                    <span>{c.nome}</span>
                    <span className="t-caption">{c.total} · {c.percentual}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="t-micro" style={{ marginBottom: 6 }}>Por empresa</div>
              <div className="stack-1">
                {resumoPeriodo.porEmpresa.map((e) => (
                  <div key={e.companyId || 'sem-empresa'} className="row-between" style={{ fontSize: 13 }}>
                    <span>{e.nome}</span>
                    <span className="t-caption">{e.total} · {e.percentual}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="t-micro" style={{ marginBottom: 6 }}>Por serviço / frente</div>
              <div className="stack-1">
                {servicosDoPeriodo.map((s) => (
                  <div key={s.servico} className="row-between" style={{ fontSize: 13 }}>
                    <span>{s.servico}</span>
                    <span className="t-caption">{s.total} · {s.percentual}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="t-micro" style={{ marginBottom: 6 }}>Por função</div>
              <div className="stack-1">
                {funcoesDoPeriodo.map((f) => (
                  <div key={f.funcao} className="row-between" style={{ fontSize: 13 }}>
                    <span>{f.funcao}</span>
                    <span className="t-caption">{f.total} · {f.percentual}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {matrizColabServico.linhas.length > 0 && (
          <div>
            <div className="t-micro" style={{ marginBottom: 6 }}>
              Colaborador × serviço — % das refeições de cada um em cada frente
            </div>
            <div className="scroll-x">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Nome</th>
                    {matrizColabServico.servicos.map((s) => <th key={s}>{s}</th>)}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {matrizColabServico.linhas.map((l) => (
                    <tr key={l.nome}>
                      <td className="t-strong" style={{ whiteSpace: 'nowrap' }}>{l.nome}</td>
                      {l.celulas.map((c, i) => (
                        <td key={i} style={{ fontSize: 12, color: c.qtd ? 'inherit' : 'var(--text-3)' }}>
                          {c.qtd ? `${c.percentual}% (${c.qtd})` : '—'}
                        </td>
                      ))}
                      <td className="t-strong">{l.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {matrizFrequencia.linhas.length > 0 && (
          <div>
            <div className="t-micro" style={{ marginBottom: 6 }}>
              Frequência — quem comeu em cada dia, e onde estava vinculado
            </div>
            <div className="scroll-x">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Nome</th>
                    {matrizFrequencia.dias.map((d) => <th key={d}>{formatarDataCurta(d)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {matrizFrequencia.linhas.map((l) => (
                    <tr key={l.nome}>
                      <td className="t-strong" style={{ whiteSpace: 'nowrap' }}>{l.nome}</td>
                      {l.celulas.map((c, i) => (
                        <td key={i} style={{ fontSize: 12, color: c ? 'inherit' : 'var(--text-3)' }}>{c || '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {diasDoRelatorio.length > 0 && (
          <div>
            <div className="t-micro" style={{ marginBottom: 6 }}>Dia a dia</div>
            <div className="stack-1">
              {diasDoRelatorio.map((dia) => {
                const vinculadosNoDia = dia.pessoas.length
                const precisaVincular = vinculadosNoDia < dia.quantidade
                return (
                  <ItemLista
                    key={dia.data}
                    titulo={formatarDataCurta(dia.data)}
                    sub={`${vinculadosNoDia}/${dia.quantidade} vinculado(s)${vinculadosNoDia ? ' — ' + dia.pessoas.map((p) => p.nome).join(', ') : ''}`}
                    direita={precisaVincular && (
                      <button className="btn btn-secondary btn-sm" onClick={() => abrirVinculoDoDia(dia.data)}>
                        Vincular
                      </button>
                    )}
                  />
                )
              })}
            </div>
          </div>
        )}
      </SecaoRecolhivel>

      <div className="row-between" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setMes(hoje.slice(0, 7))}>
          Este mês
        </button>
        <div className="row-flex" style={{ gap: 4 }}>
          <button className="btn btn-ghost btn-sm" aria-label="Mês anterior" onClick={() => setMes(somarMeses(mes, -1))}>
            <Icon name="voltar" size={16} />
          </button>
          <div className="t-strong" style={{ fontSize: 14, minWidth: 140, textAlign: 'center' }}>
            {rotuloMes(mes)}
          </div>
          <button className="btn btn-ghost btn-sm" aria-label="Próximo mês" onClick={() => setMes(somarMeses(mes, 1))}>
            <Icon name="avancar" size={16} />
          </button>
        </div>
      </div>

      {resumo.totalGeral > 0 && (
        <div className="card stack-2">
          <div className="row-between">
            <div className="t-micro">Total do mês</div>
            <span className="t-num t-strong" style={{ fontSize: 20 }}>{resumo.totalGeral}</span>
          </div>
          {resumo.totalVinculado > 0 && resumo.totalVinculado !== resumo.totalGeral && (
            <div className="t-caption">
              {resumo.totalVinculado} vinculado(s) a um colaborador — o resto da quantidade oficial ainda não foi vinculado.
            </div>
          )}

          {resumo.proprias.length > 0 && (
            <div>
              <div className="t-micro" style={{ marginBottom: 6 }}>Equipe própria (vinculados)</div>
              <div className="stack-1">
                {resumo.proprias.map((l) => (
                  <div key={l.companyId || 'sem-empresa'} className="row-between" style={{ fontSize: 13 }}>
                    <span>{l.nome}</span>
                    <span className="t-strong">{l.total}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {resumo.terceirizadas.length > 0 && (
            <div>
              <div className="t-micro" style={{ marginBottom: 6 }}>Terceirizados (vinculados)</div>
              <div className="stack-1">
                {resumo.terceirizadas.map((l) => (
                  <div key={l.companyId || 'sem-empresa'} className="row-between" style={{ fontSize: 13 }}>
                    <span>{l.nome}</span>
                    <span className="t-strong">{l.total}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {registrosOrdenados.length === 0 ? (
        <div className="card-flat">
          <Vazio
            titulo="Nenhuma refeição lançada"
            texto={`Nenhum lançamento em ${rotuloMes(mes).toLowerCase()}. Toda vez que o restaurante servir, lança aqui.`}
            acao={<button className="btn btn-primary" onClick={abrirNovo}>Nova refeição</button>}
          />
        </div>
      ) : (
        <div className="stack-1">
          {registrosOrdenados.map((r) => {
            const vinculadosDoRegistro = r.worker_ids?.length || 0
            const naoBate = vinculadosDoRegistro !== r.quantidade
            return (
              <ItemLista
                key={r.id}
                titulo={formatarDataCurta(r.data)}
                sub={[
                  r.fornecedor,
                  vinculadosDoRegistro > 0 ? `${vinculadosDoRegistro} vinculado(s)` : 'Ninguém vinculado ainda',
                ].filter(Boolean).join(' · ')}
                direita={
                  <div className="row-flex" style={{ gap: 4, alignItems: 'center' }}>
                    {naoBate && (
                      <span title="Quantidade não bate com os colaboradores vinculados">
                        <Icon name="alerta" size={15} style={{ color: 'var(--danger)' }} />
                      </span>
                    )}
                    <span className="t-strong" style={{ fontSize: 15 }}>{r.quantidade}</span>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => { setBuscaAdicionar(''); setEditando({ ...r, worker_ids: r.worker_ids || [] }) }}
                      aria-label="Editar"
                    >
                      <Icon name="editar" size={15} />
                    </button>
                    {podeExcluir && (
                      <button className="btn btn-ghost btn-sm" onClick={() => pedirExcluir(r)} aria-label="Excluir">
                        <Icon name="x" size={15} />
                      </button>
                    )}
                  </div>
                }
              />
            )
          })}
        </div>
      )}

      <Sheet
        aberto={Boolean(editando)}
        titulo={editando?.id ? 'Editar lançamento' : 'Nova refeição'}
        onFechar={() => setEditando(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setEditando(null)}>Cancelar</button>
            <button
              className="btn btn-primary grow" onClick={salvar}
              disabled={salvando || !editando?.data || !Number(editando?.quantidade)}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        {editando && (
          <div className="stack-2">
            <div className="row-flex">
              <Campo label="Quantidade do dia" dica="O número que o almoxarife mandou.">
                <input
                  className="ipt" type="number" inputMode="numeric" min="0" step="1"
                  value={editando.quantidade}
                  onChange={(e) => setEditando((p) => ({ ...p, quantidade: e.target.value }))}
                />
              </Campo>
              <Campo label="Data">
                <input
                  className="ipt" type="date" value={editando.data}
                  onChange={(e) => escolherData(e.target.value)}
                />
              </Campo>
            </div>
            <Campo label="Fornecedor" dica="Opcional — o restaurante que serviu.">
              <input
                className="ipt" value={editando.fornecedor || ''}
                onChange={(e) => setEditando((p) => ({ ...p, fornecedor: e.target.value }))}
              />
            </Campo>

            {divergencia && (
              <div className="alert danger">
                A quantidade lançada ({quantidadeNum}) não bate com os {vinculados.length} colaborador(es)
                vinculado(s) abaixo. Revise a quantidade ou marque/desmarque quem comeu.
              </div>
            )}

            <div>
              <div className="t-micro" style={{ marginBottom: 8 }}>Vinculados ({vinculados.length})</div>

              {doDiario.length === 0 ? (
                <div className="t-caption" style={{ marginBottom: 8 }}>
                  Não achei diário lançado nessa data — busque os colaboradores abaixo pra vincular à mão.
                </div>
              ) : (
                <div className="stack-1" style={{ marginBottom: 12 }}>
                  <div className="t-caption" style={{ fontWeight: 700 }}>Confirmados no diário desse dia</div>
                  {doDiario.map((c) => (
                    <div key={c.workerId} className="stack-1">
                      <Selecionavel
                        marcado={vinculados.includes(c.workerId)}
                        onToggle={() => alternarColaborador(c.workerId)}
                        titulo={c.nome}
                        sub={[
                          c.empresa, c.funcao,
                          c.atividades.length > 0
                            ? c.atividades.map((a) => `${a.servico} · ${a.local}`).join(', ')
                            : 'Sem atividade lançada no diário',
                        ].filter(Boolean).join(' — ')}
                      />
                      {c.atividades.length === 0 && vinculados.includes(c.workerId) && (
                        <CampoServicoManual
                          dados={dados}
                          valor={editando.servicos_manuais?.[c.workerId] || ''}
                          onChange={(texto) => atualizarServicoManual(c.workerId, texto)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {administrativos.length > 0 && (
                <div className="stack-1" style={{ marginBottom: 12 }}>
                  <div className="t-caption" style={{ fontWeight: 700 }}>Administrativo (não passa pelo diário)</div>
                  {administrativos.map((c) => (
                    <div key={c.workerId} className="stack-1">
                      <LinhaColaborador
                        marcado={vinculados.includes(c.workerId)}
                        onToggle={() => alternarColaborador(c.workerId)}
                        titulo={c.nome}
                        sub={[c.empresa, c.funcao].filter(Boolean).join(' — ')}
                        onDesfixar={() => dados.definirAdministrativoColaborador(c.workerId, false)}
                      />
                      {vinculados.includes(c.workerId) && (
                        <CampoServicoManual
                          dados={dados}
                          valor={editando.servicos_manuais?.[c.workerId] || ''}
                          onChange={(texto) => atualizarServicoManual(c.workerId, texto)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {adicionadosManualmente.length > 0 && (
                <div className="stack-1" style={{ marginBottom: 12 }}>
                  <div className="t-caption" style={{ fontWeight: 700 }}>Adicionados à mão</div>
                  {adicionadosManualmente.map((c) => (
                    <div key={c.workerId} className="stack-1">
                      <LinhaColaborador
                        marcado
                        onToggle={() => alternarColaborador(c.workerId)}
                        titulo={c.nome}
                        sub={[c.empresa, c.funcao].filter(Boolean).join(' — ')}
                        onFixar={() => dados.definirAdministrativoColaborador(c.workerId, true)}
                      />
                      <CampoServicoManual
                        dados={dados}
                        valor={editando.servicos_manuais?.[c.workerId] || ''}
                        onChange={(texto) => atualizarServicoManual(c.workerId, texto)}
                      />
                    </div>
                  ))}
                </div>
              )}

              <Campo label="Adicionar colaborador que não apareceu acima">
                <input
                  className="ipt" value={buscaAdicionar}
                  onChange={(e) => setBuscaAdicionar(e.target.value)}
                  placeholder="Buscar por nome…"
                />
              </Campo>
              {resultadosBusca.length > 0 && (
                <div className="stack-1" style={{ marginTop: 8 }}>
                  {resultadosBusca.map((c) => {
                    const empresa = dados.empresas?.find((e) => e.id === c.company_id)
                    return (
                      <LinhaColaborador
                        key={c.id}
                        marcado={vinculados.includes(c.id)}
                        onToggle={() => alternarColaborador(c.id)}
                        titulo={c.nome}
                        sub={[empresa?.nome, c.funcao].filter(Boolean).join(' — ')}
                        onFixar={() => dados.definirAdministrativoColaborador(c.id, true)}
                      />
                    )
                  })}
                </div>
              )}
              {buscaAdicionar.trim() && resultadosBusca.length === 0 && (
                <div className="t-caption" style={{ marginTop: 8 }}>Nenhum colaborador com esse nome.</div>
              )}
            </div>
          </div>
        )}
      </Sheet>

      <Confirmar
        aberto={Boolean(confirmar)}
        titulo={confirmar?.titulo}
        texto={confirmar?.texto}
        rotuloOk={confirmar?.rotuloOk}
        perigo={confirmar?.perigo}
        onOk={confirmar?.onOk}
        onCancelar={() => setConfirmar(null)}
      />

      <RelatorioFolha
        titulo="Refeições"
        sub={periodoIni === periodoFim ? formatarData(periodoIni) : `${formatarData(periodoIni)} a ${formatarData(periodoFim)}`}
        obra={dados.obra.nome} org={dados.org.nome}
      >
        {diasDoRelatorio.length === 0 ? (
          <SecaoRelatorio>
            <div style={{ fontSize: 12, color: '#71717A' }}>Nenhum lançamento nesse período.</div>
          </SecaoRelatorio>
        ) : (
          <>
            {tiposRelatorio.has('colaborador') && (
              <SecaoRelatorio titulo={`Por colaborador (${resumoPeriodo.totalVinculado} vinculado(s))`}>
                <TabelaRelatorio
                  colunas={['Nome', 'Refeições', '%']}
                  linhas={resumoPeriodo.porColaborador.map((c) => [c.nome, c.total, `${c.percentual}%`])}
                />
              </SecaoRelatorio>
            )}
            {tiposRelatorio.has('empresa') && (
              <SecaoRelatorio titulo="Por empresa">
                <TabelaRelatorio
                  colunas={['Empresa', 'Refeições', '%']}
                  linhas={resumoPeriodo.porEmpresa.map((e) => [e.nome, e.total, `${e.percentual}%`])}
                />
              </SecaoRelatorio>
            )}
            {tiposRelatorio.has('servico') && (
              <SecaoRelatorio titulo="Por serviço / frente">
                <TabelaRelatorio
                  colunas={['Serviço / Frente', 'Refeições', '%']}
                  linhas={servicosDoPeriodo.map((s) => [s.servico, s.total, `${s.percentual}%`])}
                />
              </SecaoRelatorio>
            )}
            {tiposRelatorio.has('funcao') && (
              <SecaoRelatorio titulo="Por função">
                <TabelaRelatorio
                  colunas={['Função', 'Refeições', '%']}
                  linhas={funcoesDoPeriodo.map((f) => [f.funcao, f.total, `${f.percentual}%`])}
                />
              </SecaoRelatorio>
            )}
            {tiposRelatorio.has('matriz') && (
              <SecaoRelatorio titulo="Colaborador × serviço — % das refeições de cada um em cada frente">
                <TabelaRelatorio
                  colunas={['Nome', ...matrizColabServico.servicos, 'Total']}
                  linhas={matrizColabServico.linhas.map((l) => [
                    l.nome, ...l.celulas.map((c) => (c.qtd ? `${c.percentual}% (${c.qtd})` : '—')), l.total,
                  ])}
                />
              </SecaoRelatorio>
            )}
            {tiposRelatorio.has('frequencia') && (
              <SecaoRelatorio titulo="Frequência — quem comeu em cada dia, e onde estava vinculado">
                <TabelaRelatorio
                  colunas={['Nome', ...matrizFrequencia.dias.map((d) => formatarDataCurta(d))]}
                  linhas={matrizFrequencia.linhas.map((l) => [l.nome, ...l.celulas.map((c) => c || '—')])}
                />
              </SecaoRelatorio>
            )}
            {tiposRelatorio.has('diario') && diasDoRelatorio.map((dia) => (
              <SecaoRelatorio key={dia.data} titulo={`${formatarData(dia.data)} — ${plural(dia.quantidade, 'refeição', 'refeições')}`}>
                {dia.pessoas.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#71717A' }}>Nenhum colaborador vinculado nesse lançamento.</div>
                ) : (
                  <TabelaRelatorio
                    colunas={['Nome', 'Empresa', 'Serviço / Frente']}
                    linhas={dia.pessoas.map((p) => [p.nome, p.empresa, p.servico])}
                  />
                )}
              </SecaoRelatorio>
            ))}
          </>
        )}
      </RelatorioFolha>
    </div>
  )
}
