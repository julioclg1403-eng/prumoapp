/* ============================================================
   SEGURANÇA — CONTROLE DE ESTOQUE DE EPI

   Mesmo desenho do Controle de estoque do Almoxarifado (Entrada /
   Saída / Estoque Atual / Histórico, saldo sempre calculado — nunca
   digitado — e etiqueta QR pra dar baixa apontando a câmera), só que
   pro estoque de EPI, que é separado do estoque de material de obra.
   Ver almoxarifado-estoque.jsx pro mesmo desenho aplicado a material.
   ============================================================ */

import { useState, useMemo, useEffect } from 'react'
import { useDados } from '../lib/DadosContext'
import {
  hojeISO, formatarData, formatarDataCurta, plural, saldoEstoque, normalizarParaCasar, resumoRecebidoSuprimentos,
  insumoCorrespondeMaterial, filtrarPorPeriodo, rotuloPeriodo,
} from '../lib/dominio'
import { linkQrMaterial, gerarQRDataURL, abrirJanelaEtiquetas, escreverEtiquetas } from '../lib/qrEstoque'
import {
  Icon, Chip, PageHeader, Segmentos, Sheet, Campo, Confirmar, Vazio, ItemLista,
  RelatorioFolha, SecaoRelatorio, FiltroPeriodo, SecaoRecolhivel,
} from '../components'

function baixarCSV(nomeArquivo, cabecalho, linhas) {
  const csv = [cabecalho, ...linhas]
    .map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

/* Uma linha da lista de Suprimentos (usada nas duas divisões —
   lançados e não lançados). */
function LinhaSuprimento({ r, abrirNovaEntrada }) {
  return (
    <ItemLista
      titulo={r.insumo}
      sub={[
        `${plural(r.pedidos, 'pedido confirmado', 'pedidos confirmados')}`,
        r.ultimaEntrega ? `última em ${formatarDataCurta(r.ultimaEntrega)}` : null,
        r.material ? null : 'sem EPI correspondente no catálogo',
      ].filter(Boolean).join(' · ')}
      direita={
        <div style={{ textAlign: 'right' }}>
          <div className="t-caption">Suprimentos: <strong>{r.qtdeSuprimentos}</strong> · Lançado: <strong>{r.qtdeManual}</strong></div>
          {r.pedidosSemData > 0 && (
            <div className="t-caption" style={{ color: 'var(--text-2)', maxWidth: 220 }}>
              {plural(r.pedidosSemData, 'pedido confirmado sem data', 'pedidos confirmados sem data')} de entrega —
              provavelmente já chegou na obra, o Suprimentos ainda não atualizou
            </div>
          )}
          {r.diferenca !== 0 && (
            <Chip tom={r.diferenca > 0 ? 'danger' : 'info'}>
              {r.diferenca > 0 ? `faltam lançar ${r.diferenca}` : `lançado ${Math.abs(r.diferenca)} a mais`}
            </Chip>
          )}
          {r.diferenca > 0 && (
            <div style={{ marginTop: 4 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => abrirNovaEntrada({
                  materialId: r.material?.id || '', quantidade: r.diferenca, nomeSugerido: r.insumo,
                })}
              >
                Lançar entrada
              </button>
            </div>
          )}
        </div>
      }
    />
  )
}

export default function SegurancaEpi({ perfil, params = {} }) {
  const dados = useDados()
  const hoje = hojeISO()
  const podeExcluir = perfil?.role !== 'campo'

  const [aba, setAba] = useState('estoqueAtual')
  const [busca, setBusca] = useState('')
  const [buscaSuprimentos, setBuscaSuprimentos] = useState('')
  const [buscaEntradas, setBuscaEntradas] = useState('')
  const [buscaSaidas, setBuscaSaidas] = useState('')
  const [novaEntrada, setNovaEntrada] = useState(null)
  const [novaSaida, setNovaSaida] = useState(null)
  const [editandoMaterial, setEditandoMaterial] = useState(null)
  const [importando, setImportando] = useState(false)
  const [confirmar, setConfirmar] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [etiquetando, setEtiquetando] = useState(false)
  const [gerandoEtiquetas, setGerandoEtiquetas] = useState(false)
  const [colaboradorEpiAberto, setColaboradorEpiAberto] = useState(null)
  const [imprimindoFichaEpi, setImprimindoFichaEpi] = useState(false)
  const [buscaColaboradorSaida, setBuscaColaboradorSaida] = useState('')
  const [diaHistoricoAberto, setDiaHistoricoAberto] = useState(null)
  const [buscaColaboradorLista, setBuscaColaboradorLista] = useState('')
  const [agrupamentoColab, setAgrupamentoColab] = useState('nome')
  const [modoPeriodo, setModoPeriodo] = useState('tudo')
  const [dataDia, setDataDia] = useState(hoje)
  const [mesEscolhido, setMesEscolhido] = useState(hoje.slice(0, 7))
  const [periodoInicio, setPeriodoInicio] = useState(hoje)
  const [periodoFim, setPeriodoFim] = useState(hoje)
  const [historicoAberto, setHistoricoAberto] = useState(false)
  const [historicoPeriodo, setHistoricoPeriodo] = useState('tudo')
  const [historicoDia, setHistoricoDia] = useState(hoje)
  const [historicoMes, setHistoricoMes] = useState(hoje.slice(0, 7))
  const [historicoInicio, setHistoricoInicio] = useState(hoje)
  const [historicoFim, setHistoricoFim] = useState(hoje)
  const [pedidosVinculadosAberto, setPedidosVinculadosAberto] = useState(false)
  const [pedidosPeriodo, setPedidosPeriodo] = useState('tudo')
  const [pedidosDia, setPedidosDia] = useState(hoje)
  const [pedidosMes, setPedidosMes] = useState(hoje.slice(0, 7))
  const [pedidosInicio, setPedidosInicio] = useState(hoje)
  const [pedidosFim, setPedidosFim] = useState(hoje)

  const materiais = useMemo(
    () => (dados.materiaisEpi || []).filter((m) => m.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [dados.materiaisEpi],
  )
  const saldos = useMemo(
    () => saldoEstoque(materiais, dados.entradasEpi, dados.saidasEpi),
    [materiais, dados.entradasEpi, dados.saidasEpi],
  )
  const saldosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const lista = termo ? saldos.filter((s) => s.material.nome.toLowerCase().includes(termo)) : saldos
    return [...lista].sort((a, b) => (a.abaixoDoMinimo === b.abaixoDoMinimo ? 0 : a.abaixoDoMinimo ? -1 : 1))
  }, [saldos, busca])
  const abaixoDoMinimo = saldos.filter((s) => s.abaixoDoMinimo).length

  const emEstoque = useMemo(() => saldosFiltrados.filter((s) => s.saldo > 0), [saldosFiltrados])

  const entradas = useMemo(
    () => [...(dados.entradasEpi || [])].sort((a, b) => (a.data < b.data ? 1 : -1)),
    [dados.entradasEpi],
  )
  const saidas = useMemo(
    () => [...(dados.saidasEpi || [])].sort((a, b) => (a.data < b.data ? 1 : -1)),
    [dados.saidasEpi],
  )

  /* Mesma reconciliação do Almoxarifado, só que pro lado EPI: o que o
     Suprimentos diz que já chegou (Destino "EPI") contra o que foi
     lançado na mão em Entradas. Não mexe no saldo. */
  const resumoSuprimentos = useMemo(
    () => resumoRecebidoSuprimentos(dados.suprimentos, 'epi', dados.materiaisEpi, dados.entradasEpi),
    [dados.suprimentos, dados.materiaisEpi, dados.entradasEpi],
  )
  const resumoSuprimentosFiltrado = useMemo(() => {
    const termo = buscaSuprimentos.trim().toLowerCase()
    return termo ? resumoSuprimentos.filter((r) => r.insumo.toLowerCase().includes(termo)) : resumoSuprimentos
  }, [resumoSuprimentos, buscaSuprimentos])
  const suprimentosNaoLancados = useMemo(
    () => resumoSuprimentosFiltrado.filter((r) => r.qtdeManual === 0),
    [resumoSuprimentosFiltrado],
  )
  const suprimentosLancados = useMemo(
    () => resumoSuprimentosFiltrado.filter((r) => r.qtdeManual > 0),
    [resumoSuprimentosFiltrado],
  )

  /* Saída agrupada por dia — uma linha só com o total do dia, clicável
     pra abrir e ver quem recebeu (várias pessoas no mesmo dia é o caso
     comum desde que a saída passou a aceitar vários colaboradores de
     uma vez). Entrada continua uma linha por lançamento, como sempre. */
  const historicoMaterial = useMemo(() => {
    if (!editandoMaterial?.id) return []
    const ents = entradas
      .filter((e) => e.material_id === editandoMaterial.id)
      .map((e) => ({ tipo: 'entrada', chave: `entrada-${e.id}`, data: e.data, quantidade: e.quantidade, detalhe: e.recebido_por ? `recebido por ${e.recebido_por}` : e.fornecedor || '' }))

    const saidasDoMaterial = saidas.filter((s) => s.material_id === editandoMaterial.id)
    const porDia = new Map()
    for (const s of saidasDoMaterial) {
      if (!porDia.has(s.data)) porDia.set(s.data, [])
      porDia.get(s.data).push(s)
    }
    const sais = Array.from(porDia.entries()).map(([data, itens]) => ({
      tipo: 'saida', chave: `saida-${data}`, data,
      quantidade: itens.reduce((soma, s) => soma + Number(s.quantidade), 0),
      pessoas: itens.map((s) => ({ nome: s.destino || 'Sem destino', quantidade: s.quantidade })),
    }))

    return [...ents, ...sais].sort((a, b) => (a.data < b.data ? 1 : -1))
  }, [editandoMaterial, entradas, saidas])

  /* Todo pedido de Suprimentos (Almoxarifado ou EPI, qualquer Destino
     — inclusive sem Destino ainda) cujo nome bate com este EPI, pra
     dentro de Editar EPI dar pra ver de onde ele veio sem precisar
     ir até a tela de Suprimentos e buscar na mão. */
  const pedidosVinculadosMaterial = useMemo(() => {
    if (!editandoMaterial?.nome) return []
    return (dados.suprimentos || [])
      .filter((p) => insumoCorrespondeMaterial(p.insumo, editandoMaterial.nome))
      .sort((a, b) => b.pedido - a.pedido)
  }, [editandoMaterial, dados.suprimentos])

  /* As duas seções de dentro de Editar EPI nascem fechadas — clique
     pra abrir — e cada uma tem seu próprio filtro de período, um pelo
     `data` da entrada/saída, outro pela data de entrega (ou de
     pedido, quando ainda não tem entrega) do pedido de Suprimentos. */
  useEffect(() => { setHistoricoAberto(false); setPedidosVinculadosAberto(false) }, [editandoMaterial?.id])

  const historicoFiltrado = useMemo(
    () => filtrarPorPeriodo(
      historicoMaterial, historicoPeriodo,
      { dia: historicoDia, mes: historicoMes, inicio: historicoInicio, fim: historicoFim },
      (h) => h.data,
    ),
    [historicoMaterial, historicoPeriodo, historicoDia, historicoMes, historicoInicio, historicoFim],
  )
  const pedidosVinculadosFiltrados = useMemo(
    () => filtrarPorPeriodo(
      pedidosVinculadosMaterial, pedidosPeriodo,
      { dia: pedidosDia, mes: pedidosMes, inicio: pedidosInicio, fim: pedidosFim },
      (p) => p.data_entrega || p.data_pedido,
    ),
    [pedidosVinculadosMaterial, pedidosPeriodo, pedidosDia, pedidosMes, pedidosInicio, pedidosFim],
  )

  const nomeMaterial = (id) => dados.materiaisEpi?.find((m) => m.id === id)?.nome || 'EPI removido'
  const unidadeMaterial = (id) => dados.materiaisEpi?.find((m) => m.id === id)?.unidade || ''

  /* Recorte por período — só afeta a aba Por Colaborador. "Período"
     aceita início depois do fim (a pessoa pode digitar fora de ordem
     sem querer); normaliza sozinho. */
  const saidasNoPeriodo = useMemo(() => {
    if (modoPeriodo === 'dia') return saidas.filter((s) => s.data === dataDia)
    if (modoPeriodo === 'mes') return saidas.filter((s) => s.data.slice(0, 7) === mesEscolhido)
    if (modoPeriodo === 'periodo') {
      const ini = periodoInicio <= periodoFim ? periodoInicio : periodoFim
      const fim = periodoInicio <= periodoFim ? periodoFim : periodoInicio
      return saidas.filter((s) => s.data >= ini && s.data <= fim)
    }
    return saidas
  }, [saidas, modoPeriodo, dataDia, mesEscolhido, periodoInicio, periodoFim])

  /* Ficha de entrega por colaborador: só quem já recebeu algo com o
     vínculo estruturado (worker_id) aparece aqui — saída antiga, com
     só o texto livre de destino, não dá pra amarrar com segurança a
     um colaborador específico. */
  const colaboradoresComEpi = useMemo(() => {
    const porColaborador = new Map()
    for (const s of saidasNoPeriodo) {
      if (!s.worker_id) continue
      if (!porColaborador.has(s.worker_id)) porColaborador.set(s.worker_id, [])
      porColaborador.get(s.worker_id).push(s)
    }
    const termo = buscaColaboradorLista.trim().toLowerCase()
    return dados.colaboradores
      .filter((c) => porColaborador.has(c.id))
      .filter((c) => !termo || c.nome.toLowerCase().includes(termo))
      .map((c) => ({ colaborador: c, entregas: porColaborador.get(c.id) }))
      .sort((a, b) => a.colaborador.nome.localeCompare(b.colaborador.nome, 'pt-BR'))
  }, [saidasNoPeriodo, dados.colaboradores, buscaColaboradorLista])

  /* Mesmo padrão de agrupamento da tela Cadastros (colaboradores):
     por função agrupa pelo texto normalizado, por empresa pelo
     vínculo de verdade. Quem não tem o dado do grupo vai pro fim,
     num grupo à parte. */
  const gruposColaboradoresEpi = useMemo(() => {
    if (agrupamentoColab === 'nome') return null
    const grupos = new Map()
    colaboradoresComEpi.forEach((item) => {
      let chave, rotuloSemDado, rotulo
      if (agrupamentoColab === 'funcao') {
        const funcao = (item.colaborador.funcao || '').trim()
        chave = funcao ? normalizarParaCasar(funcao) : ''
        rotuloSemDado = 'Sem função'
        rotulo = funcao || rotuloSemDado
      } else {
        chave = item.colaborador.company_id || ''
        rotuloSemDado = 'Sem empresa'
        rotulo = item.colaborador.company_id ? dados.nomeDe(dados.empresas, item.colaborador.company_id) : rotuloSemDado
      }
      if (!grupos.has(chave)) grupos.set(chave, { rotulo, rotuloSemDado, itens: [] })
      grupos.get(chave).itens.push(item)
    })
    return Array.from(grupos.values()).sort((a, b) => {
      if (a.rotulo === a.rotuloSemDado) return 1
      if (b.rotulo === b.rotuloSemDado) return -1
      return a.rotulo.localeCompare(b.rotulo, 'pt-BR')
    })
  }, [agrupamentoColab, colaboradoresComEpi, dados])

  useEffect(() => {
    if (!imprimindoFichaEpi) return
    const id = requestAnimationFrame(() => window.print())
    return () => cancelAnimationFrame(id)
  }, [imprimindoFichaEpi])

  useEffect(() => { setDiaHistoricoAberto(null) }, [editandoMaterial?.id])

  const abrirNovaEntrada = ({ materialId = '', quantidade = '', nomeSugerido = '' } = {}) => setNovaEntrada({
    data: hoje, material_id: materialId, quantidade,
    fornecedor: '', nota_fiscal: '', data_nota: '', valor_total: '', recebido_por: '',
    nomeSugerido,
  })

  const abrirNovaSaida = (materialId = '') => {
    setBuscaColaboradorSaida('')
    setNovaSaida({ data: hoje, material_id: materialId, quantidade: '', destino: '', worker_ids: [], quantidadesPorColaborador: {} })
  }

  /* Cada colaborador marcado tem sua própria quantidade (não dá pra
     dividir 3 EPIs entre 2 pessoas igualzinho) — desmarcar limpa a
     quantidade dele; marcar começa em 1, ajustável na hora. */
  const alternarColaboradorSaida = (id) => setNovaSaida((p) => {
    const atual = p.worker_ids || []
    const marcado = atual.includes(id)
    const novo = marcado ? atual.filter((x) => x !== id) : [...atual, id]
    const quantidadesPorColaborador = { ...(p.quantidadesPorColaborador || {}) }
    if (marcado) delete quantidadesPorColaborador[id]
    else if (quantidadesPorColaborador[id] == null) quantidadesPorColaborador[id] = '1'
    const destino = novo.length === 1 ? (dados.colaboradores.find((c) => c.id === novo[0])?.nome || '') : p.destino
    return { ...p, worker_ids: novo, quantidadesPorColaborador, destino }
  })

  /* Chegada por QR Code: a etiqueta da prateleira já traz a pessoa
     direto pra "Registrar saída" deste EPI, sem passar pela lista
     nem pelo seletor. */
  useEffect(() => {
    if (params.abrirEpiMaterialId) abrirNovaSaida(params.abrirEpiMaterialId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.abrirEpiMaterialId])

  const salvarEntrada = async () => {
    if (!novaEntrada?.material_id || !novaEntrada?.data || !Number(novaEntrada?.quantidade)) return
    setSalvando(true)
    const ok = await dados.salvarEntradaEpi(novaEntrada)
    setSalvando(false)
    if (ok) setNovaEntrada(null)
  }

  /* Com 1+ colaboradores marcados, cada um vira sua própria linha de
     saída, com a quantidade que a pessoa digitou pra ele — não dá
     pra dividir 3 EPIs entre 2 colaboradores em número quebrado, por
     isso a quantidade é manual por pessoa, não um total repartido
     igual. É o que também faz a ficha por colaborador (aba Por
     Colaborador) mostrar certinho quem recebeu o quê. Sem nenhum
     colaborador marcado, continua uma linha só com o campo
     Quantidade de cima, igual sempre foi. */
  const saidaValida = (() => {
    if (!novaSaida?.material_id || !novaSaida?.data) return false
    const workerIds = novaSaida.worker_ids || []
    return workerIds.length > 0
      ? workerIds.every((id) => Number(novaSaida.quantidadesPorColaborador?.[id]) > 0)
      : Number(novaSaida.quantidade) > 0
  })()

  const salvarSaida = async () => {
    if (!saidaValida) return
    setSalvando(true)
    const workerIds = novaSaida.worker_ids || []
    if (workerIds.length > 0) {
      let ok = true
      for (const workerId of workerIds) {
        const nome = dados.colaboradores.find((c) => c.id === workerId)?.nome || ''
        const quantidade = novaSaida.quantidadesPorColaborador[workerId]
        const r = await dados.salvarSaidaEpi({ ...novaSaida, worker_id: workerId, quantidade, destino: nome })
        if (!r) { ok = false; break }
      }
      setSalvando(false)
      if (ok) setNovaSaida(null)
    } else {
      const ok = await dados.salvarSaidaEpi({ ...novaSaida, worker_id: '' })
      setSalvando(false)
      if (ok) setNovaSaida(null)
    }
  }

  const salvarMaterial = async () => {
    if (!editandoMaterial?.nome?.trim() || !editandoMaterial?.unidade?.trim()) return
    setSalvando(true)
    const ok = await dados.salvarCadastro('materiaisEpi', {
      ...editandoMaterial,
      nome: editandoMaterial.nome.trim(),
      unidade: editandoMaterial.unidade.trim(),
      categoria: (editandoMaterial.categoria || '').trim() || null,
      ca: (editandoMaterial.ca || '').trim() || null,
      estoque_minimo: editandoMaterial.estoque_minimo === '' ? null : Number(editandoMaterial.estoque_minimo),
    })
    setSalvando(false)
    if (ok) setEditandoMaterial(null)
  }

  const imprimirEtiquetas = async (lista) => {
    if (!lista.length || gerandoEtiquetas) return
    const janela = abrirJanelaEtiquetas()
    if (!janela) {
      dados.avisarErro('O navegador bloqueou a janela de impressão. Libere pop-ups pra este site e tente de novo.')
      return
    }
    setGerandoEtiquetas(true)
    try {
      const etiquetas = await Promise.all(lista.map(async (m) => ({
        nome: m.nome,
        dataUrl: await gerarQRDataURL(linkQrMaterial(m.id, 'epi')),
      })))
      escreverEtiquetas(janela, etiquetas, dados.obra.nome)
    } finally {
      setGerandoEtiquetas(false)
    }
  }

  const pedirExcluirEntrada = (item) => setConfirmar({
    titulo: 'Excluir entrada?',
    texto: `«${nomeMaterial(item.material_id)}» (${item.quantidade} ${unidadeMaterial(item.material_id)}) sai do histórico. Isso não tem volta.`,
    rotuloOk: 'Excluir', perigo: true,
    onOk: async () => { setConfirmar(null); await dados.excluirEntradaEpi(item.id) },
  })

  const pedirExcluirSaida = (item) => setConfirmar({
    titulo: 'Excluir saída?',
    texto: `«${nomeMaterial(item.material_id)}» (${item.quantidade} ${unidadeMaterial(item.material_id)}) sai do histórico. Isso não tem volta.`,
    rotuloOk: 'Excluir', perigo: true,
    onOk: async () => { setConfirmar(null); await dados.excluirSaidaEpi(item.id) },
  })

  const baixarPlanilha = () => {
    const sigla = dados.obra.sigla || 'obra'
    if (aba === 'estoqueAtual') {
      baixarCSV(
        `estoque-epi-${sigla}-${hoje}.csv`,
        ['EPI', 'Unidade', 'Quantidade', 'Custo Unitário Médio', 'Custo Total', 'Quantidade de Saída', 'Estoque', 'Estoque regulador'],
        emEstoque.map((s) => [
          s.material.nome, s.material.unidade, s.quantidadeEntrada,
          s.custoMedio.toFixed(2), s.custoTotal.toFixed(2), s.quantidadeSaida, s.saldo,
          s.material.estoque_minimo ?? '',
        ]),
      )
    } else if (aba === 'entradas') {
      baixarCSV(
        `entrada-epi-${sigla}-${hoje}.csv`,
        ['Chegou em', 'EPI', 'Fornecedor', 'Nº da Nota Fiscal', 'Data da Nota', 'Quantidade', 'Recebido por'],
        entradas.map((e) => [
          formatarData(e.data), nomeMaterial(e.material_id), e.fornecedor || '',
          e.nota_fiscal || '', formatarData(e.data_nota), e.quantidade, e.recebido_por || '',
        ]),
      )
    } else {
      baixarCSV(
        `saida-epi-${sigla}-${hoje}.csv`,
        ['Data', 'EPI', 'Quantidade', 'DESTINO'],
        saidas.map((s) => [formatarData(s.data), nomeMaterial(s.material_id), s.quantidade, s.destino || '']),
      )
    }
  }

  const pedirArquivarMaterial = (material) => setConfirmar({
    titulo: 'Arquivar EPI?',
    texto: `«${material.nome}» deixa de aparecer pra escolher em entrada/saída novas. O histórico continua intacto.`,
    rotuloOk: 'Arquivar', perigo: true,
    onOk: async () => { setConfirmar(null); setEditandoMaterial(null); await dados.arquivarCadastro('materiaisEpi', material.id) },
  })

  return (
    <div className="stack-2">
      <PageHeader
        titulo="Controle de EPI"
        sub={`${plural(materiais.length, 'EPI', 'EPIs')} cadastrado${materiais.length === 1 ? '' : 's'}${abaixoDoMinimo ? ` · ${abaixoDoMinimo} abaixo do mínimo` : ''}`}
        acao={
          <div className="row-flex" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => setImportando(true)}>
              <Icon name="baixar" size={16} style={{ transform: 'rotate(180deg)' }} /> Importar planilha
            </button>
            <button className="btn btn-secondary" onClick={() => setEtiquetando(true)}>
              <Icon name="qrcode" size={16} /> Etiquetas QR
            </button>
            <button className="btn btn-secondary" onClick={() => abrirNovaSaida()}>
              <Icon name="baixar" size={16} /> Registrar saída
            </button>
            <button className="btn btn-primary" onClick={() => abrirNovaEntrada()}>
              <Icon name="baixar" size={16} style={{ transform: 'rotate(180deg)' }} /> Nova entrada
            </button>
          </div>
        }
      />

      <Segmentos
        valor={aba} onChange={setAba}
        opcoes={[
          { valor: 'estoqueAtual', rotulo: 'Estoque Atual', contador: emEstoque.length },
          { valor: 'entradas', rotulo: 'Entradas', contador: entradas.length },
          { valor: 'saidas', rotulo: 'Saídas', contador: saidas.length },
          { valor: 'suprimentos', rotulo: 'Suprimentos', contador: resumoSuprimentos.length },
          { valor: 'porColaborador', rotulo: 'Por Colaborador', contador: colaboradoresComEpi.length },
        ]}
      />

      {aba !== 'porColaborador' && (
        <div className="row-between">
          <div className="t-caption">
            {aba === 'estoqueAtual' && `${plural(emEstoque.length, 'EPI', 'EPIs')} nesta lista`}
            {aba === 'entradas' && `${plural(entradas.length, 'entrada lançada', 'entradas lançadas')}`}
            {aba === 'saidas' && `${plural(saidas.length, 'saída lançada', 'saídas lançadas')}`}
            {aba === 'suprimentos' && `${plural(resumoSuprimentos.length, 'insumo recebido', 'insumos recebidos')} marcados como EPI`}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={baixarPlanilha}>
            <Icon name="baixar" size={15} /> Baixar planilha
          </button>
        </div>
      )}

      {aba === 'porColaborador' && (
        <div className="stack-2">
          <div style={{ position: 'relative' }}>
            <Icon
              name="busca" size={16}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}
            />
            <input
              className="ipt" style={{ paddingLeft: 34, width: '100%' }}
              value={buscaColaboradorLista} onChange={(e) => setBuscaColaboradorLista(e.target.value)}
              placeholder="Buscar colaborador…"
            />
          </div>

          <div className="row-wrap" style={{ gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 200px' }}>
              <SecaoRecolhivel
                titulo="Agrupar por"
                resumo={{ nome: 'Por nome', funcao: 'Por função', empresa: 'Por empresa' }[agrupamentoColab]}
              >
                <Segmentos
                  valor={agrupamentoColab}
                  onChange={setAgrupamentoColab}
                  opcoes={[
                    { valor: 'nome', rotulo: 'Por nome' },
                    { valor: 'funcao', rotulo: 'Por função' },
                    { valor: 'empresa', rotulo: 'Por empresa' },
                  ]}
                />
              </SecaoRecolhivel>
            </div>

            <div style={{ flex: '1 1 200px' }}>
              <SecaoRecolhivel
                titulo="Período"
                resumo={rotuloPeriodo(modoPeriodo, { dia: dataDia, mes: mesEscolhido, inicio: periodoInicio, fim: periodoFim })}
              >
                <FiltroPeriodo
                  modo={modoPeriodo} onModo={setModoPeriodo}
                  dia={dataDia} onDia={setDataDia}
                  mes={mesEscolhido} onMes={setMesEscolhido}
                  inicio={periodoInicio} onInicio={setPeriodoInicio}
                  fim={periodoFim} onFim={setPeriodoFim}
                />
              </SecaoRecolhivel>
            </div>
          </div>

          {colaboradoresComEpi.length === 0 ? (
            <div className="card-flat">
              <Vazio
                titulo={modoPeriodo === 'tudo' ? 'Nenhuma entrega vinculada a colaborador ainda' : 'Nada nesse período'}
                texto={
                  modoPeriodo === 'tudo'
                    ? 'Ao registrar uma saída, escolha o colaborador no campo próprio — daí a entrega entra na ficha dele aqui.'
                    : 'Nenhuma entrega vinculada a colaborador nesse recorte de data — troque o período.'
                }
              />
            </div>
          ) : gruposColaboradoresEpi ? (
            <div className="stack-3">
              {gruposColaboradoresEpi.map(({ rotulo, itens }) => (
                <div key={rotulo} className="stack-1">
                  <div className="t-caption" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                    {rotulo} <span style={{ opacity: 0.6, fontWeight: 400, textTransform: 'none' }}>{itens.length}</span>
                  </div>
                  {itens.map(({ colaborador, entregas }) => (
                    <ItemLista
                      key={colaborador.id}
                      titulo={colaborador.nome}
                      sub={`${plural(entregas.length, 'entrega', 'entregas')} · última em ${formatarDataCurta([...entregas].sort((a, b) => (a.data < b.data ? 1 : -1))[0].data)}`}
                      onClick={() => setColaboradorEpiAberto(colaborador)}
                      direita={<Icon name="avancar" size={16} />}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="stack-1">
              {colaboradoresComEpi.map(({ colaborador, entregas }) => (
                <ItemLista
                  key={colaborador.id}
                  titulo={colaborador.nome}
                  sub={`${plural(entregas.length, 'entrega', 'entregas')} · última em ${formatarDataCurta([...entregas].sort((a, b) => (a.data < b.data ? 1 : -1))[0].data)}`}
                  onClick={() => setColaboradorEpiAberto(colaborador)}
                  direita={<Icon name="avancar" size={16} />}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {aba === 'estoqueAtual' && (() => {
        const lista = emEstoque
        return (
          <div className="stack-2">
            {materiais.length > 0 && (
              <input
                className="ipt" value={busca} onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar EPI…"
              />
            )}
            {lista.length === 0 ? (
              <div className="card-flat">
                <Vazio
                  titulo={materiais.length === 0 ? 'Nenhum EPI cadastrado' : 'Nada com esse nome'}
                  texto={
                    materiais.length === 0
                      ? 'Cadastre o primeiro EPI lançando uma entrada — não precisa de passo separado.'
                      : 'Nenhum EPI com saldo ainda — lance uma entrada, ou troque a busca.'
                  }
                  acao={materiais.length === 0 && (
                    <button className="btn btn-primary" onClick={() => abrirNovaEntrada()}>
                      Lançar entrada
                    </button>
                  )}
                />
              </div>
            ) : (
              <div className="stack-1">
                {lista.map((s) => (
                  <ItemLista
                    key={s.material.id}
                    titulo={s.material.nome}
                    sub={[
                      s.material.categoria,
                      s.material.ca ? `CA ${s.material.ca}` : null,
                      s.material.estoque_minimo != null && s.material.estoque_minimo !== '' ? `mínimo ${s.material.estoque_minimo} ${s.material.unidade}` : null,
                    ].filter(Boolean).join(' · ')}
                    onClick={() => setEditandoMaterial({ ...s.material, estoque_minimo: s.material.estoque_minimo ?? '' })}
                    direita={
                      <div className="row-flex" style={{ gap: 4, alignItems: 'center' }}>
                        {s.abaixoDoMinimo && <Chip tom="danger">Abaixo do mínimo</Chip>}
                        <span className="t-strong" style={{ fontSize: 15, minWidth: 70, textAlign: 'right' }}>
                          {s.saldo} {s.material.unidade}
                        </span>
                        <Icon name="avancar" size={16} />
                      </div>
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {aba === 'entradas' && (
        entradas.length === 0 ? (
          <div className="card-flat">
            <Vazio titulo="Nenhuma entrada lançada" texto="Toda vez que chegar EPI na obra, lança aqui — o saldo atualiza sozinho." />
          </div>
        ) : (() => {
          const termo = buscaEntradas.trim().toLowerCase()
          const filtradas = termo ? entradas.filter((e) => nomeMaterial(e.material_id).toLowerCase().includes(termo)) : entradas
          return (
            <div className="stack-2">
              <input
                className="ipt" value={buscaEntradas} onChange={(e) => setBuscaEntradas(e.target.value)}
                placeholder="Buscar EPI…"
              />
              {filtradas.length === 0 ? (
                <div className="card-flat"><Vazio titulo="Nada com esse nome" texto="Troque a busca." /></div>
              ) : (
                <div className="stack-1">
                  {filtradas.map((e) => (
                    <ItemLista
                      key={e.id}
                      titulo={nomeMaterial(e.material_id)}
                      sub={[formatarDataCurta(e.data), e.fornecedor, e.nota_fiscal ? `NF ${e.nota_fiscal}` : null, e.recebido_por ? `recebido por ${e.recebido_por}` : null].filter(Boolean).join(' · ')}
                      direita={
                        <div className="row-flex" style={{ gap: 4, alignItems: 'center' }}>
                          <span className="t-strong" style={{ fontSize: 14 }}>+{e.quantidade} {unidadeMaterial(e.material_id)}</span>
                          {podeExcluir && (
                            <button className="btn btn-ghost btn-sm" onClick={() => pedirExcluirEntrada(e)} aria-label="Excluir">
                              <Icon name="x" size={15} />
                            </button>
                          )}
                        </div>
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })()
      )}

      {aba === 'saidas' && (
        saidas.length === 0 ? (
          <div className="card-flat">
            <Vazio titulo="Nenhuma saída lançada" texto="Toda vez que um EPI sair do estoque, lança aqui — o saldo atualiza sozinho." />
          </div>
        ) : (() => {
          const termo = buscaSaidas.trim().toLowerCase()
          const filtradas = termo ? saidas.filter((s) => nomeMaterial(s.material_id).toLowerCase().includes(termo)) : saidas
          return (
            <div className="stack-2">
              <input
                className="ipt" value={buscaSaidas} onChange={(e) => setBuscaSaidas(e.target.value)}
                placeholder="Buscar EPI…"
              />
              {filtradas.length === 0 ? (
                <div className="card-flat"><Vazio titulo="Nada com esse nome" texto="Troque a busca." /></div>
              ) : (
                <div className="stack-1">
                  {filtradas.map((s) => (
                    <ItemLista
                      key={s.id}
                      titulo={nomeMaterial(s.material_id)}
                      sub={[formatarDataCurta(s.data), s.destino].filter(Boolean).join(' · ')}
                      direita={
                        <div className="row-flex" style={{ gap: 4, alignItems: 'center' }}>
                          <span className="t-strong" style={{ fontSize: 14 }}>−{s.quantidade} {unidadeMaterial(s.material_id)}</span>
                          {podeExcluir && (
                            <button className="btn btn-ghost btn-sm" onClick={() => pedirExcluirSaida(s)} aria-label="Excluir">
                              <Icon name="x" size={15} />
                            </button>
                          )}
                        </div>
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })()
      )}

      {aba === 'suprimentos' && (
        resumoSuprimentos.length === 0 ? (
          <div className="card-flat">
            <Vazio
              titulo="Nada marcado como EPI ainda"
              texto="Vá em Suprimentos, abra um pedido já entregue e marque o Destino como EPI — pedido repetido com o mesmo nome entra sozinho depois."
            />
          </div>
        ) : (
          <div className="stack-2">
            <input
              className="ipt" value={buscaSuprimentos} onChange={(e) => setBuscaSuprimentos(e.target.value)}
              placeholder="Buscar insumo…"
            />
            {resumoSuprimentosFiltrado.length === 0 ? (
              <div className="card-flat"><Vazio titulo="Nada com esse nome" texto="Troque a busca." /></div>
            ) : (
              <div className="stack-3">
                <div className="stack-1">
                  <div className="t-caption" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                    Não foram lançados ({suprimentosNaoLancados.length})
                  </div>
                  {suprimentosNaoLancados.length === 0 ? (
                    <div className="card-flat"><Vazio titulo="Tudo lançado" texto="Nenhum insumo pendente de lançamento no estoque." /></div>
                  ) : (
                    <div className="stack-1">
                      {suprimentosNaoLancados.map((r) => (
                        <LinhaSuprimento key={r.insumo} r={r} abrirNovaEntrada={abrirNovaEntrada} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="stack-1">
                  <div className="t-caption" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                    Lançados para o estoque ({suprimentosLancados.length})
                  </div>
                  {suprimentosLancados.length === 0 ? (
                    <div className="card-flat"><Vazio titulo="Nada lançado ainda" texto="Nenhum insumo com entrada lançada no estoque." /></div>
                  ) : (
                    <div className="stack-1">
                      {suprimentosLancados.map((r) => (
                        <LinhaSuprimento key={r.insumo} r={r} abrirNovaEntrada={abrirNovaEntrada} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* ── Nova entrada ── */}
      <Sheet
        aberto={Boolean(novaEntrada)}
        titulo="Nova entrada"
        onFechar={() => setNovaEntrada(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setNovaEntrada(null)}>Cancelar</button>
            <button
              className="btn btn-primary grow" onClick={salvarEntrada}
              disabled={salvando || !novaEntrada?.material_id || !novaEntrada?.data || !Number(novaEntrada?.quantidade)}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        {novaEntrada && (
          <div className="stack-2">
            <SelecaoMaterial
              materialId={novaEntrada.material_id}
              materiais={materiais}
              dados={dados}
              nomeSugerido={novaEntrada.nomeSugerido}
              onEscolher={(id) => setNovaEntrada((p) => ({ ...p, material_id: id }))}
            />
            <div className="row-flex">
              <Campo label="Quantidade">
                <input
                  className="ipt" type="number" inputMode="decimal" min="0" step="any"
                  value={novaEntrada.quantidade}
                  onChange={(e) => setNovaEntrada((p) => ({ ...p, quantidade: e.target.value }))}
                />
              </Campo>
              <Campo label="Chegou em">
                <input
                  className="ipt" type="date" value={novaEntrada.data}
                  onChange={(e) => setNovaEntrada((p) => ({ ...p, data: e.target.value }))}
                />
              </Campo>
            </div>
            <div className="row-flex">
              <Campo label="Fornecedor" dica="Opcional">
                <input
                  className="ipt" value={novaEntrada.fornecedor}
                  onChange={(e) => setNovaEntrada((p) => ({ ...p, fornecedor: e.target.value }))}
                />
              </Campo>
              <Campo label="Recebido por" dica="Opcional — quem conferiu na obra">
                <input
                  className="ipt" value={novaEntrada.recebido_por}
                  onChange={(e) => setNovaEntrada((p) => ({ ...p, recebido_por: e.target.value }))}
                />
              </Campo>
            </div>
            <div className="row-flex">
              <Campo label="Nº da nota fiscal" dica="Opcional">
                <input
                  className="ipt" value={novaEntrada.nota_fiscal}
                  onChange={(e) => setNovaEntrada((p) => ({ ...p, nota_fiscal: e.target.value }))}
                />
              </Campo>
              <Campo label="Data da nota" dica="Opcional">
                <input
                  className="ipt" type="date" value={novaEntrada.data_nota}
                  onChange={(e) => setNovaEntrada((p) => ({ ...p, data_nota: e.target.value }))}
                />
              </Campo>
            </div>
            <Campo label="Valor total" dica="Opcional — usado pra calcular o custo médio do EPI.">
              <input
                className="ipt" type="number" inputMode="decimal" min="0" step="any"
                value={novaEntrada.valor_total}
                onChange={(e) => setNovaEntrada((p) => ({ ...p, valor_total: e.target.value }))}
                placeholder="R$"
              />
            </Campo>
          </div>
        )}
      </Sheet>

      {/* ── Nova saída ── */}
      <Sheet
        aberto={Boolean(novaSaida)}
        titulo="Registrar saída"
        onFechar={() => setNovaSaida(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setNovaSaida(null)}>Cancelar</button>
            <button
              className="btn btn-primary grow" onClick={salvarSaida}
              disabled={salvando || !saidaValida}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        {novaSaida && (
          <div className="stack-2">
            <SelecaoMaterial
              materialId={novaSaida.material_id}
              materiais={materiais}
              dados={dados}
              onEscolher={(id) => setNovaSaida((p) => ({ ...p, material_id: id }))}
            />
            {novaSaida.material_id && (
              <div className="t-caption">
                Saldo atual: {saldos.find((s) => s.material.id === novaSaida.material_id)?.saldo ?? 0} {unidadeMaterial(novaSaida.material_id)}
              </div>
            )}
            <div className="row-flex">
              {(novaSaida.worker_ids || []).length === 0 && (
                <Campo label="Quantidade">
                  <input
                    className="ipt" type="number" inputMode="decimal" min="0" step="any"
                    value={novaSaida.quantidade}
                    onChange={(e) => setNovaSaida((p) => ({ ...p, quantidade: e.target.value }))}
                  />
                </Campo>
              )}
              <Campo label="Data">
                <input
                  className="ipt" type="date" value={novaSaida.data}
                  onChange={(e) => setNovaSaida((p) => ({ ...p, data: e.target.value }))}
                />
              </Campo>
            </div>
            <Campo
              label="Colaboradores"
              dica="Marque um ou mais — cada um ganha um campo de quantidade próprio, pra dividir do jeito que saiu de verdade (ex.: 2 pra um, 1 pra outro)."
            >
              <input
                className="ipt" value={buscaColaboradorSaida} onChange={(e) => setBuscaColaboradorSaida(e.target.value)}
                placeholder="Buscar colaborador…" style={{ marginBottom: 8 }}
              />
              <div className="stack-1" style={{ maxHeight: 280, overflowY: 'auto' }}>
                {dados.colaboradores
                  .filter((c) => c.ativo !== false)
                  .filter((c) => !buscaColaboradorSaida.trim() || c.nome.toLowerCase().includes(buscaColaboradorSaida.trim().toLowerCase()))
                  .map((c) => {
                    const marcado = (novaSaida.worker_ids || []).includes(c.id)
                    return (
                      <div key={c.id} className="card-flat row-between" style={{ alignItems: 'center', gap: 10 }}>
                        <label className="row-flex grow" style={{ alignItems: 'center', gap: 10, cursor: 'pointer', minWidth: 0 }}>
                          <input type="checkbox" checked={marcado} onChange={() => alternarColaboradorSaida(c.id)} />
                          <span className="grow">{c.nome}</span>
                        </label>
                        {marcado && (
                          <input
                            className="ipt" type="number" inputMode="decimal" min="0" step="any"
                            style={{ width: 72, flex: 'none' }}
                            value={novaSaida.quantidadesPorColaborador?.[c.id] ?? ''}
                            onChange={(e) => setNovaSaida((p) => ({
                              ...p,
                              quantidadesPorColaborador: { ...(p.quantidadesPorColaborador || {}), [c.id]: e.target.value },
                            }))}
                            placeholder="Qtd"
                          />
                        )}
                      </div>
                    )
                  })}
              </div>
              {(novaSaida.worker_ids || []).length > 0 && (
                <div className="t-caption" style={{ marginTop: 8 }}>
                  Total do estoque: {novaSaida.worker_ids.reduce((s, id) => s + (Number(novaSaida.quantidadesPorColaborador?.[id]) || 0), 0)}
                  {' '}{unidadeMaterial(novaSaida.material_id)} ({plural(novaSaida.worker_ids.length, 'colaborador', 'colaboradores')})
                </div>
              )}
            </Campo>
            {(novaSaida.worker_ids || []).length === 0 && (
              <Campo label="Destino" dica="Pra onde foi — equipe, obra, ou marque um colaborador acima em vez disso.">
                <input
                  className="ipt" value={novaSaida.destino}
                  onChange={(e) => setNovaSaida((p) => ({ ...p, destino: e.target.value }))}
                  placeholder="Nome do colaborador, equipe…"
                />
              </Campo>
            )}
          </div>
        )}
      </Sheet>

      {/* ── Editar EPI ── */}
      <Sheet
        aberto={Boolean(editandoMaterial)}
        titulo="Editar EPI"
        onFechar={() => setEditandoMaterial(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setEditandoMaterial(null)}>Cancelar</button>
            <button
              className="btn btn-primary grow" onClick={salvarMaterial}
              disabled={salvando || !editandoMaterial?.nome?.trim() || !editandoMaterial?.unidade?.trim()}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        {editandoMaterial && (
          <div className="stack-2">
            <Campo label="Nome">
              <input
                className="ipt" value={editandoMaterial.nome}
                onChange={(e) => setEditandoMaterial((p) => ({ ...p, nome: e.target.value }))}
              />
            </Campo>
            <div className="row-flex">
              <Campo label="Unidade">
                <input
                  className="ipt" value={editandoMaterial.unidade}
                  onChange={(e) => setEditandoMaterial((p) => ({ ...p, unidade: e.target.value }))}
                  placeholder="unid, par…"
                />
              </Campo>
              <Campo label="Categoria" dica="Opcional">
                <input
                  className="ipt" value={editandoMaterial.categoria || ''}
                  onChange={(e) => setEditandoMaterial((p) => ({ ...p, categoria: e.target.value }))}
                  placeholder="Proteção da cabeça, mãos, pés…"
                />
              </Campo>
            </div>
            <Campo label="CA" dica="Certificado de Aprovação — opcional, mas obrigatório por norma pra cada tipo de EPI.">
              <input
                className="ipt" value={editandoMaterial.ca || ''}
                onChange={(e) => setEditandoMaterial((p) => ({ ...p, ca: e.target.value }))}
                placeholder="31.469"
              />
            </Campo>
            <Campo label="Estoque mínimo" dica="Opcional — abaixo disso, o EPI aparece marcado na aba Saldo.">
              <input
                className="ipt" type="number" inputMode="decimal" min="0" step="any"
                value={editandoMaterial.estoque_minimo}
                onChange={(e) => setEditandoMaterial((p) => ({ ...p, estoque_minimo: e.target.value }))}
              />
            </Campo>
            <div className="row-flex">
              <button
                className="btn btn-secondary grow"
                onClick={() => { const id = editandoMaterial.id; setEditandoMaterial(null); abrirNovaEntrada({ materialId: id }) }}
              >
                <Icon name="baixar" size={16} style={{ transform: 'rotate(180deg)' }} /> Lançar entrada
              </button>
              <button
                className="btn btn-secondary grow"
                onClick={() => { const id = editandoMaterial.id; setEditandoMaterial(null); abrirNovaSaida(id) }}
              >
                <Icon name="baixar" size={16} /> Lançar saída
              </button>
            </div>

            <button
              className="btn btn-ghost btn-block"
              onClick={() => imprimirEtiquetas([editandoMaterial])}
              disabled={gerandoEtiquetas}
            >
              <Icon name="qrcode" size={16} /> {gerandoEtiquetas ? 'Gerando…' : 'Imprimir etiqueta QR deste EPI'}
            </button>

            <SecaoRecolhivel
              titulo="Histórico de movimentação" contador={historicoMaterial.length}
              aberto={historicoAberto} onToggle={() => setHistoricoAberto((v) => !v)}
            >
              <FiltroPeriodo
                modo={historicoPeriodo} onModo={setHistoricoPeriodo}
                dia={historicoDia} onDia={setHistoricoDia}
                mes={historicoMes} onMes={setHistoricoMes}
                inicio={historicoInicio} onInicio={setHistoricoInicio}
                fim={historicoFim} onFim={setHistoricoFim}
              />
              {historicoFiltrado.length === 0 ? (
                <div className="t-caption">
                  {historicoMaterial.length === 0 ? 'Nenhuma entrada ou saída lançada ainda pra este EPI.' : 'Nada nesse período.'}
                </div>
              ) : (
                <div className="stack-1">
                  {historicoFiltrado.map((h) => {
                    const aberto = diaHistoricoAberto === h.chave
                    const clicavel = h.tipo === 'saida' && h.pessoas.length > 0
                    return (
                      <div key={h.chave} className="card-flat" style={{ padding: 10 }}>
                        <div
                          className="row-between"
                          style={{ alignItems: 'center', cursor: clicavel ? 'pointer' : 'default' }}
                          onClick={clicavel ? () => setDiaHistoricoAberto(aberto ? null : h.chave) : undefined}
                        >
                          <div className="row-flex" style={{ gap: 8, alignItems: 'center' }}>
                            <Chip tom={h.tipo === 'entrada' ? 'success' : 'danger'}>
                              {h.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                            </Chip>
                            <div>
                              <div className="t-caption">{formatarDataCurta(h.data)}</div>
                              {h.tipo === 'entrada' && h.detalhe && <div className="t-caption">{h.detalhe}</div>}
                              {clicavel && (
                                <div className="t-caption">
                                  {plural(h.pessoas.length, 'colaborador', 'colaboradores')} · toque para ver quem
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="row-flex" style={{ gap: 6, alignItems: 'center' }}>
                            <span className="t-strong" style={{ fontSize: 14 }}>
                              {h.tipo === 'entrada' ? '+' : '−'}{h.quantidade} {editandoMaterial.unidade}
                            </span>
                            {clicavel && (
                              <Icon name="avancar" size={13} style={{ transform: `rotate(${aberto ? 90 : 0}deg)`, transition: 'transform .15s' }} />
                            )}
                          </div>
                        </div>
                        {clicavel && aberto && (
                          <div className="stack-1" style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                            {h.pessoas.map((p, i) => (
                              <div key={i} className="row-between">
                                <span className="t-caption">{p.nome}</span>
                                <span className="t-caption t-strong">−{p.quantidade} {editandoMaterial.unidade}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </SecaoRecolhivel>

            <SecaoRecolhivel
              titulo="Pedidos de Suprimentos vinculados" contador={pedidosVinculadosMaterial.length}
              aberto={pedidosVinculadosAberto} onToggle={() => setPedidosVinculadosAberto((v) => !v)}
            >
              <FiltroPeriodo
                modo={pedidosPeriodo} onModo={setPedidosPeriodo}
                dia={pedidosDia} onDia={setPedidosDia}
                mes={pedidosMes} onMes={setPedidosMes}
                inicio={pedidosInicio} onInicio={setPedidosInicio}
                fim={pedidosFim} onFim={setPedidosFim}
              />
              {pedidosVinculadosFiltrados.length === 0 ? (
                <div className="t-caption">
                  {pedidosVinculadosMaterial.length === 0
                    ? 'Nenhum pedido de Suprimentos com esse nome ainda — nem Almoxarifado, nem EPI.'
                    : 'Nada nesse período.'}
                </div>
              ) : (
                <div className="stack-1">
                  {pedidosVinculadosFiltrados.map((p) => (
                    <div key={p.id} className="card-flat" style={{ padding: 10 }}>
                      <div className="row-between">
                        <span className="t-strong" style={{ fontSize: 14 }}>Pedido {p.pedido}</span>
                        <Chip tom={p.destino === 'almoxarifado' ? 'success' : p.destino === 'epi' ? 'info' : ''}>
                          {p.destino ? (p.destino === 'almoxarifado' ? 'Almoxarifado' : p.destino === 'epi' ? 'EPI' : p.destino) : 'Sem destino'}
                        </Chip>
                      </div>
                      <div className="t-caption" style={{ marginTop: 2 }}>{p.insumo}</div>
                      <div className="t-caption" style={{ marginTop: 2 }}>
                        {p.quantidade ?? '—'} · {p.data_entrega ? formatarDataCurta(p.data_entrega) : 'sem data de entrega'} · {p.estagio || 'sem estágio'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SecaoRecolhivel>

            <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => pedirArquivarMaterial(editandoMaterial)}>
              Arquivar EPI
            </button>
          </div>
        )}
      </Sheet>

      {/* ── Ficha de EPI por colaborador ── */}
      <Sheet
        aberto={Boolean(colaboradorEpiAberto)}
        titulo={colaboradorEpiAberto?.nome}
        onFechar={() => setColaboradorEpiAberto(null)}
        rodape={
          <button className="btn btn-primary btn-block" onClick={() => setImprimindoFichaEpi(true)}>
            <Icon name="relatorio" size={16} /> Imprimir ficha
          </button>
        }
      >
        {colaboradorEpiAberto && (
          <div className="stack-1">
            {(colaboradoresComEpi.find((c) => c.colaborador.id === colaboradorEpiAberto.id)?.entregas || [])
              .map((s) => (
                <div key={s.id} className="card-flat row-between" style={{ padding: 10, alignItems: 'center' }}>
                  <div>
                    <div className="t-strong" style={{ fontSize: 14 }}>{nomeMaterial(s.material_id)}</div>
                    <div className="t-caption" style={{ marginTop: 2 }}>{formatarDataCurta(s.data)}</div>
                  </div>
                  <span className="t-strong" style={{ fontSize: 14 }}>{s.quantidade} {unidadeMaterial(s.material_id)}</span>
                </div>
              ))}
          </div>
        )}
      </Sheet>

      {imprimindoFichaEpi && colaboradorEpiAberto && (
        <RelatorioFolha
          titulo="Ficha de entrega de EPI"
          sub={colaboradorEpiAberto.nome}
          obra={dados.obra.nome} org={dados.org.nome}
        >
          <SecaoRelatorio titulo="Equipamentos recebidos">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #18181B', padding: '4px 6px' }}>Data</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #18181B', padding: '4px 6px' }}>EPI</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #18181B', padding: '4px 6px' }}>Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {(colaboradoresComEpi.find((c) => c.colaborador.id === colaboradorEpiAberto.id)?.entregas || [])
                  .map((s) => (
                    <tr key={s.id}>
                      <td style={{ padding: '4px 6px', borderBottom: '1px solid #E4E4E7' }}>{formatarData(s.data)}</td>
                      <td style={{ padding: '4px 6px', borderBottom: '1px solid #E4E4E7' }}>{nomeMaterial(s.material_id)}</td>
                      <td style={{ padding: '4px 6px', borderBottom: '1px solid #E4E4E7', textAlign: 'right' }}>
                        {s.quantidade} {unidadeMaterial(s.material_id)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </SecaoRelatorio>
          <div style={{ marginTop: 36, fontSize: 12, lineHeight: 1.6 }}>
            Declaro ter recebido os equipamentos de proteção individual acima, em perfeito estado, e
            me comprometo a usá-los e conservá-los adequadamente (NR-06).
            <div style={{ display: 'flex', gap: 40, marginTop: 34 }}>
              <div style={{ flex: 1, borderTop: '1px solid #18181B', paddingTop: 4 }}>Assinatura do colaborador</div>
              <div style={{ width: 140, borderTop: '1px solid #18181B', paddingTop: 4 }}>Data</div>
            </div>
          </div>
        </RelatorioFolha>
      )}

      <Confirmar
        aberto={Boolean(confirmar)}
        titulo={confirmar?.titulo}
        texto={confirmar?.texto}
        rotuloOk={confirmar?.rotuloOk}
        perigo={confirmar?.perigo}
        onOk={confirmar?.onOk}
        onCancelar={() => setConfirmar(null)}
      />

      <ImportarMateriais
        aberto={importando}
        onFechar={() => setImportando(false)}
        dados={dados}
        materiaisExistentes={dados.materiaisEpi || []}
      />

      <EtiquetasQR
        aberto={etiquetando}
        onFechar={() => setEtiquetando(false)}
        materiais={materiais}
        gerando={gerandoEtiquetas}
        onImprimir={imprimirEtiquetas}
      />
    </div>
  )
}

/* ── Importação do cadastro de EPI ────────────────────────────
   Só o cadastro (nome, unidade, mínimo) — mesma decisão do Estoque
   de material: começa com saldo zerado, entradas lançadas pelo app
   a partir de agora. EPI que já existe (mesmo nome) não duplica. */
function ImportarMateriais({ aberto, onFechar, dados, materiaisExistentes }) {
  const [lendo, setLendo] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [importandoAgora, setImportandoAgora] = useState(false)
  const [feito, setFeito] = useState(null)

  const fechar = () => {
    setResultado(null); setNomeArquivo(''); setFeito(null); onFechar()
  }

  const nomesExistentes = new Set(
    materiaisExistentes.map((m) => m.nome.trim().toLowerCase()),
  )

  const onArquivo = async (e) => {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    e.target.value = ''
    setNomeArquivo(arquivo.name)
    setLendo(true)
    setResultado(null)
    setFeito(null)
    try {
      const { lerPlanilhaEstoque } = await import('../lib/planilhaEstoque')
      const lido = await lerPlanilhaEstoque(arquivo)
      const itens = lido.itens.map((i) => ({
        ...i,
        jaExiste: nomesExistentes.has(i.nome.trim().toLowerCase()),
      }))
      setResultado({ ...lido, itens })
    } catch (err) {
      setResultado({ itens: [], erroGeral: `Não consegui ler este arquivo. ${err.message}` })
    } finally {
      setLendo(false)
    }
  }

  const novos = (resultado?.itens || []).filter((i) => !i.jaExiste)

  const confirmar = async () => {
    if (!novos.length) return
    setImportandoAgora(true)
    let criados = 0
    for (const item of novos) {
      const ok = await dados.salvarCadastro('materiaisEpi', {
        nome: item.nome, unidade: item.unidade, estoque_minimo: item.estoque_minimo,
      })
      if (ok) criados++
    }
    setImportandoAgora(false)
    setFeito({ criados, jaExistiam: (resultado?.itens.length || 0) - novos.length })
  }

  return (
    <Sheet aberto={aberto} titulo="Importar EPIs da planilha" onFechar={fechar}>
      <div className="stack-2">
        {feito ? (
          <>
            <div className="alert success">
              {plural(feito.criados, 'EPI cadastrado', 'EPIs cadastrados')}.
              {feito.jaExistiam > 0 && ` ${plural(feito.jaExistiam, 'EPI já existia', 'EPIs já existiam')} e não foram duplicados.`}
            </div>
            <button className="btn btn-primary btn-block" onClick={fechar}>Fechar</button>
          </>
        ) : (
          <>
            <div className="t-caption" style={{ lineHeight: 1.5 }}>
              Escolha a planilha de EPI (.xlsx ou .xlsm) — leio a primeira aba e trago o nome, a
              unidade e o mínimo de cada EPI. Só o cadastro: quantidade e histórico ficam pra
              lançar pelo app a partir de agora.
            </div>

            <label className="btn btn-secondary btn-block" style={{ cursor: 'pointer' }}>
              {lendo ? 'Lendo a planilha…' : nomeArquivo || 'Escolher arquivo .xlsx/.xlsm'}
              <input
                type="file" accept=".xlsx,.xlsm,.xls" onChange={onArquivo}
                style={{ display: 'none' }} disabled={lendo}
              />
            </label>

            {resultado?.erroGeral && <div className="alert danger">{resultado.erroGeral}</div>}

            {resultado && !resultado.erroGeral && (
              <>
                <div className="alert info">
                  {plural(novos.length, 'EPI novo', 'EPIs novos')} para importar
                  {resultado.itens.length > novos.length
                    ? ` · ${plural(resultado.itens.length - novos.length, 'já cadastrado', 'já cadastrados')} (não duplica)`
                    : ''}.
                </div>

                <div style={{ maxHeight: 320, overflowY: 'auto' }} className="stack-1">
                  {resultado.itens.map((i) => (
                    <div
                      key={i.linha}
                      style={{
                        fontSize: 12, padding: 8, borderRadius: 8,
                        border: `1px solid ${i.jaExiste ? 'var(--border)' : 'var(--success)'}`,
                        background: i.jaExiste ? 'var(--surface-2)' : 'var(--success-tint)',
                      }}
                    >
                      <div className="row-between">
                        <strong>{i.nome}</strong>
                        <span style={{ color: i.jaExiste ? 'var(--text-3)' : 'var(--success)', fontWeight: 600 }}>
                          {i.jaExiste ? 'já cadastrado' : 'novo'}
                        </span>
                      </div>
                      <div style={{ marginTop: 2 }}>
                        {i.unidade}{i.estoque_minimo ? ` · mínimo ${i.estoque_minimo}` : ''}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="row-flex">
                  <button className="btn btn-secondary grow" onClick={() => setResultado(null)}>Corrigir</button>
                  <button
                    className="btn btn-primary grow" onClick={confirmar}
                    disabled={!novos.length || importandoAgora}
                  >
                    {importandoAgora ? 'Importando…' : `Importar ${plural(novos.length, 'EPI', 'EPIs')}`}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}

/* ── Etiquetas QR — escolhe quais EPIs imprimir ──────────────
   Nasce com tudo marcado — imprimir o lote inteiro de uma vez é o
   uso mais comum. Cada QR aponta pro link do próprio EPI (com
   &t=epi, ver lib/qrEstoque) — apontar a câmera do celular nele abre
   o Prumo direto na saída daquele EPI. */
function EtiquetasQR({ aberto, onFechar, materiais, gerando, onImprimir }) {
  const [busca, setBusca] = useState('')
  const [selecionados, setSelecionados] = useState(() => new Set())

  useEffect(() => {
    if (aberto) setSelecionados(new Set(materiais.map((m) => m.id)))
    else setBusca('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return termo ? materiais.filter((m) => m.nome.toLowerCase().includes(termo)) : materiais
  }, [materiais, busca])

  const alternar = (id) => setSelecionados((s) => {
    const novo = new Set(s)
    if (novo.has(id)) novo.delete(id); else novo.add(id)
    return novo
  })

  const todosFiltradosMarcados = filtrados.length > 0 && filtrados.every((m) => selecionados.has(m.id))
  const alternarTodos = () => setSelecionados((s) => {
    const novo = new Set(s)
    if (todosFiltradosMarcados) filtrados.forEach((m) => novo.delete(m.id))
    else filtrados.forEach((m) => novo.add(m.id))
    return novo
  })

  const confirmar = async () => {
    const lista = materiais.filter((m) => selecionados.has(m.id))
    await onImprimir(lista)
    onFechar()
  }

  return (
    <Sheet
      aberto={aberto}
      titulo="Etiquetas QR"
      onFechar={onFechar}
      rodape={
        <div className="row-flex">
          <button className="btn btn-secondary grow" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary grow" onClick={confirmar} disabled={gerando || selecionados.size === 0}>
            {gerando ? 'Gerando…' : `Imprimir ${plural(selecionados.size, 'etiqueta', 'etiquetas')}`}
          </button>
        </div>
      }
    >
      <div className="stack-2">
        <div className="t-caption" style={{ lineHeight: 1.5 }}>
          Cada etiqueta traz o QR Code e o nome do EPI embaixo. Cole na prateleira —
          apontando a câmera do celular nela, abre direto a saída daquele EPI.
        </div>

        {materiais.length === 0 ? (
          <div className="t-caption">Nenhum EPI cadastrado ainda.</div>
        ) : (
          <>
            <input
              className="ipt" value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar EPI…"
            />
            <button className="btn btn-ghost btn-sm" onClick={alternarTodos} style={{ alignSelf: 'flex-start' }}>
              {todosFiltradosMarcados ? 'Limpar seleção' : 'Selecionar todos'}
            </button>
            <div style={{ maxHeight: 360, overflowY: 'auto' }} className="stack-1">
              {filtrados.map((m) => (
                <label
                  key={m.id} className="card-flat row-flex"
                  style={{ alignItems: 'center', gap: 10, cursor: 'pointer' }}
                >
                  <input type="checkbox" checked={selecionados.has(m.id)} onChange={() => alternar(m.id)} />
                  <span className="grow">{m.nome}</span>
                </label>
              ))}
              {filtrados.length === 0 && <div className="t-caption">Nada com esse nome.</div>}
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}

/* ── Escolha de EPI, com criação rápida embutida ─────────────
   Mesmo padrão do Estoque de material: em vez de mandar cadastrar
   antes, o campo de busca já deixa criar o EPI na hora. */
function SelecaoMaterial({ materialId, materiais, dados, onEscolher, nomeSugerido = '' }) {
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState(nomeSugerido)
  const [unidade, setUnidade] = useState('unid')
  const [salvando, setSalvando] = useState(false)

  if (criando) {
    const criar = async () => {
      if (!nome.trim() || !unidade.trim()) return
      setSalvando(true)
      const criado = await dados.salvarCadastro('materiaisEpi', { nome: nome.trim(), unidade: unidade.trim() })
      setSalvando(false)
      if (criado) {
        onEscolher(criado.id)
        setCriando(false)
        setNome('')
        setUnidade('unid')
      }
    }
    return (
      <Campo label="EPI novo">
        <div className="stack-1">
          <input
            className="ipt" autoFocus value={nome} onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do EPI"
          />
          <div className="row-flex">
            <input
              className="ipt grow" value={unidade} onChange={(e) => setUnidade(e.target.value)}
              placeholder="Unidade (unid, par…)"
            />
            <button className="btn btn-primary" onClick={criar} disabled={salvando || !nome.trim() || !unidade.trim()}>
              {salvando ? '…' : 'Criar'}
            </button>
            <button className="btn btn-ghost" onClick={() => setCriando(false)} aria-label="Cancelar">
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>
      </Campo>
    )
  }

  return (
    <Campo label="EPI">
      <div className="row-flex">
        <select
          className="sel grow" value={materialId}
          onChange={(e) => onEscolher(e.target.value)}
        >
          <option value="">Escolha o EPI</option>
          {materiais.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
        <button className="btn btn-secondary" onClick={() => setCriando(true)}>
          <Icon name="mais_sinal" size={16} /> Novo
        </button>
      </div>
    </Campo>
  )
}
