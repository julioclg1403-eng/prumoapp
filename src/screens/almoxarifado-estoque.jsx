/* ============================================================
   ALMOXARIFADO — CONTROLE DE ESTOQUE

   Modelado em cima da planilha que o almoxarife já usa (Entrada /
   Saída / Estoque, uma aba cada): aqui viram três sub-abas do mesmo
   jeito. O saldo nunca é digitado — é sempre entrada menos saída,
   calculado na hora (dominio.saldoEstoque), do mesmo jeito que o
   SUMIF da planilha fazia.

   Cadastrar um material novo não é um passo à parte: acontece na
   hora de lançar a primeira entrada dele, direto no formulário —
   "fácil de adicionar material" era o pedido.
   ============================================================ */

import { useState, useMemo, useEffect } from 'react'
import { useDados } from '../lib/DadosContext'
import {
  hojeISO, formatarData, formatarDataCurta, plural, saldoEstoqueImportado, resumoRecebidoSuprimentos, normalizarParaCasar,
  insumoCorrespondeMaterial, filtrarPorPeriodo, rotuloPeriodo,
} from '../lib/dominio'
import { linkQrMaterial, gerarQRDataURL, abrirJanelaEtiquetas, escreverEtiquetas } from '../lib/qrEstoque'
import {
  Icon, Chip, PageHeader, Segmentos, Sheet, Campo, Confirmar, Vazio, ItemLista,
  RelatorioFolha, SecaoRelatorio, FiltroPeriodo, SecaoRecolhivel,
} from '../components'

/* Baixa CSV no mesmo layout de colunas da planilha do almoxarife
   (abas Estoque/Entrada/Saida) — pra continuar abrindo no Excel dele
   sem precisar remontar nada na mão. Ponto e vírgula e BOM: é o que
   faz o Excel em português abrir com colunas separadas e acentos
   certos (mesmo truque do CSV do Planejamento). */
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
        r.material ? null : 'sem material correspondente no catálogo',
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

export default function AlmoxarifadoEstoque({ perfil, params = {} }) {
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
  const [importandoMovimento, setImportandoMovimento] = useState(false)
  const [confirmar, setConfirmar] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [etiquetando, setEtiquetando] = useState(false)
  const [gerandoEtiquetas, setGerandoEtiquetas] = useState(false)
  const [colaboradorMaterialAberto, setColaboradorMaterialAberto] = useState(null)
  const [imprimindoFichaMaterial, setImprimindoFichaMaterial] = useState(false)
  const [buscaColaboradorSaida, setBuscaColaboradorSaida] = useState('')
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
    () => (dados.materiaisEstoque || []).filter((m) => m.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [dados.materiaisEstoque],
  )
  const saldos = useMemo(
    () => saldoEstoqueImportado(materiais, dados.movimentosEstoque),
    [materiais, dados.movimentosEstoque],
  )
  const saldosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const lista = termo ? saldos.filter((s) => s.material.nome.toLowerCase().includes(termo)) : saldos
    return [...lista].sort((a, b) => (a.abaixoDoMinimo === b.abaixoDoMinimo ? 0 : a.abaixoDoMinimo ? -1 : 1))
  }, [saldos, busca])
  const abaixoDoMinimo = saldos.filter((s) => s.abaixoDoMinimo).length

  /* Material recém-cadastrado (importado da planilha, ou criado na
     hora) nasce com saldo zero — a partir da primeira entrada o
     saldo recalcula sozinho (dominio.saldoEstoque) e ele passa a
     aparecer aqui, sem precisar mover nada na mão. */
  const emEstoque = useMemo(() => saldosFiltrados.filter((s) => s.saldo > 0), [saldosFiltrados])

  const entradas = useMemo(
    () => [...(dados.entradasEstoque || [])].sort((a, b) => (a.data < b.data ? 1 : -1)),
    [dados.entradasEstoque],
  )
  const saidas = useMemo(
    () => [...(dados.saidasEstoque || [])].sort((a, b) => (a.data < b.data ? 1 : -1)),
    [dados.saidasEstoque],
  )

  /* Compara o que o Suprimentos (planilha do ERP) diz que já chegou
     — marcado com Destino "Almoxarifado" — contra o total de entrada
     que já veio pelo Relatório de Estoque importado (somado de todos
     os períodos já importados, não só o mais recente), pra achar o
     que o Suprimentos já confirma mas o Estoque ainda não trouxe. Não
     mexe no saldo — só ajuda a achar a diferença. O casamento entre
     pedido e material agora prioriza código (mais confiável), com o
     nome como reserva (ver resumoRecebidoSuprimentos). */
  const entradaImportadaPorMaterial = useMemo(() => {
    const somas = new Map()
    for (const m of (dados.movimentosEstoque || [])) {
      somas.set(m.material_id, (somas.get(m.material_id) || 0) + Number(m.qtde_entrada || 0))
    }
    return [...somas.entries()].map(([material_id, quantidade]) => ({ material_id, quantidade }))
  }, [dados.movimentosEstoque])
  const resumoSuprimentos = useMemo(
    () => resumoRecebidoSuprimentos(dados.suprimentos, 'almoxarifado', dados.materiaisEstoque, entradaImportadaPorMaterial),
    [dados.suprimentos, dados.materiaisEstoque, entradaImportadaPorMaterial],
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

  /* Histórico de movimentação de UM material (dentro de Editar
     material) — entrada e saída lançadas no app, MAIS cada período já
     importado da planilha da UAU (dados.movimentosEstoque), tudo
     junto, mais recente primeiro. Antes só mostrava entrada/saída
     manual: reimportar a planilha (que é como "dar baixa" funciona
     na prática hoje, ver dominio.saldoEstoqueImportado) não aparecia
     aqui — a pessoa importava e não via nada mudar na história do
     material. */
  const historicoMaterial = useMemo(() => {
    if (!editandoMaterial?.id) return []
    const ents = entradas
      .filter((e) => e.material_id === editandoMaterial.id)
      .map((e) => ({ tipo: 'entrada', data: e.data, quantidade: e.quantidade, detalhe: e.recebido_por ? `recebido por ${e.recebido_por}` : e.fornecedor || '' }))
    const sais = saidas
      .filter((s) => s.material_id === editandoMaterial.id)
      .map((s) => ({ tipo: 'saida', data: s.data, quantidade: s.quantidade, detalhe: s.destino || '' }))
    const importacoes = (dados.movimentosEstoque || [])
      .filter((mov) => mov.material_id === editandoMaterial.id)
      .map((mov) => ({
        tipo: 'importacao',
        data: mov.periodo_fim,
        quantidade: Number(mov.saldo),
        detalhe: `período ${formatarDataCurta(mov.periodo_inicio)}–${formatarDataCurta(mov.periodo_fim)} · entrada ${mov.qtde_entrada} · baixa ${mov.qtde_baixa}`,
      }))
    return [...ents, ...sais, ...importacoes].sort((a, b) => (a.data < b.data ? 1 : -1))
  }, [editandoMaterial, entradas, saidas, dados.movimentosEstoque])

  /* Todo pedido de Suprimentos (Almoxarifado ou EPI, qualquer Destino
     — inclusive sem Destino ainda) cujo nome bate com este material,
     pra dentro de Editar material dar pra ver de onde ele veio sem
     precisar ir até a tela de Suprimentos e buscar na mão. */
  const pedidosVinculadosMaterial = useMemo(() => {
    if (!editandoMaterial?.nome) return []
    return (dados.suprimentos || [])
      .filter((p) => insumoCorrespondeMaterial(p.insumo, editandoMaterial.nome))
      .sort((a, b) => b.pedido - a.pedido)
  }, [editandoMaterial, dados.suprimentos])

  /* As duas seções de dentro de Editar material nascem fechadas —
     clique pra abrir — e cada uma tem seu próprio filtro de período,
     um pelo `data` da entrada/saída, outro pela data de entrega (ou
     de pedido, quando ainda não tem entrega) do pedido de Suprimentos. */
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

  const nomeMaterial = (id) => dados.materiaisEstoque?.find((m) => m.id === id)?.nome || 'Material removido'
  const unidadeMaterial = (id) => dados.materiaisEstoque?.find((m) => m.id === id)?.unidade || ''

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
  const colaboradoresComMaterial = useMemo(() => {
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
  const gruposColaboradoresMaterial = useMemo(() => {
    if (agrupamentoColab === 'nome') return null
    const grupos = new Map()
    colaboradoresComMaterial.forEach((item) => {
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
  }, [agrupamentoColab, colaboradoresComMaterial, dados])

  useEffect(() => {
    if (!imprimindoFichaMaterial) return
    const id = requestAnimationFrame(() => window.print())
    return () => cancelAnimationFrame(id)
  }, [imprimindoFichaMaterial])

  /* Mesmo ponto de partida pro botão "Nova entrada" do topo, pro
     "Lançar entrada" de dentro de Editar material, e pro "Lançar
     entrada" da aba Suprimentos — só muda o que já vem preenchido
     (pulando o seletor, que com 752 opções não é rápido de navegar
     de novo). `nomeSugerido` é só o nome pra pré-preencher a busca/
     "Material novo" quando o insumo do Suprimentos ainda não tem
     material correspondente cadastrado — não é salvo, é descartado
     assim que o material é escolhido/criado. */
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
     dividir 3 sacos de cimento entre 2 pessoas igualzinho) —
     desmarcar limpa a quantidade dele; marcar começa em 1, ajustável
     na hora. */
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
     direto pra "Registrar saída" deste material, sem passar pela
     lista nem pelo seletor. */
  useEffect(() => {
    if (params.abrirEstoqueMaterialId) abrirNovaSaida(params.abrirEstoqueMaterialId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.abrirEstoqueMaterialId])

  const salvarEntrada = async () => {
    if (!novaEntrada?.material_id || !novaEntrada?.data || !Number(novaEntrada?.quantidade)) return
    setSalvando(true)
    const ok = await dados.salvarEntradaEstoque(novaEntrada)
    setSalvando(false)
    if (ok) setNovaEntrada(null)
  }

  /* Com 1+ colaboradores marcados, cada um vira sua própria linha de
     saída, com a quantidade que a pessoa digitou pra ele — não dá
     pra dividir 3 sacos entre 2 colaboradores em número quebrado, por
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
        const r = await dados.salvarSaidaEstoque({ ...novaSaida, worker_id: workerId, quantidade, destino: nome })
        if (!r) { ok = false; break }
      }
      setSalvando(false)
      if (ok) setNovaSaida(null)
    } else {
      const ok = await dados.salvarSaidaEstoque({ ...novaSaida, worker_id: '' })
      setSalvando(false)
      if (ok) setNovaSaida(null)
    }
  }

  const salvarMaterial = async () => {
    if (!editandoMaterial?.nome?.trim() || !editandoMaterial?.unidade?.trim()) return
    setSalvando(true)
    const ok = await dados.salvarCadastro('materiaisEstoque', {
      ...editandoMaterial,
      nome: editandoMaterial.nome.trim(),
      unidade: editandoMaterial.unidade.trim(),
      categoria: (editandoMaterial.categoria || '').trim() || null,
      codigo: (editandoMaterial.codigo || '').trim() || null,
      estoque_minimo: editandoMaterial.estoque_minimo === '' ? null : Number(editandoMaterial.estoque_minimo),
      reutilizavel: Boolean(editandoMaterial.reutilizavel),
      observacao: (editandoMaterial.observacao || '').trim() || null,
    })
    setSalvando(false)
    if (ok) setEditandoMaterial(null)
  }

  /* Gera o QR de cada material selecionado (o link é sempre o mesmo
     formato: origem do app + ?qr=<id>, ver lib/qrEstoque) e abre a
     aba de impressão já pronta pra colar na prateleira.

     A janela abre ANTES de gerar os QR Codes (que é assíncrono) —
     precisa ser assim: o navegador só deixa `window.open` passar sem
     bloqueio quando ele roda no mesmo tique do clique, e "gerar 700
     QR Codes" não pode acontecer nesse mesmo tique. */
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
        dataUrl: await gerarQRDataURL(linkQrMaterial(m.id)),
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
    onOk: async () => { setConfirmar(null); await dados.excluirEntradaEstoque(item.id) },
  })

  const pedirExcluirSaida = (item) => setConfirmar({
    titulo: 'Excluir saída?',
    texto: `«${nomeMaterial(item.material_id)}» (${item.quantidade} ${unidadeMaterial(item.material_id)}) sai do histórico. Isso não tem volta.`,
    rotuloOk: 'Excluir', perigo: true,
    onOk: async () => { setConfirmar(null); await dados.excluirSaidaEstoque(item.id) },
  })

  const baixarPlanilha = () => {
    const sigla = dados.obra.sigla || 'obra'
    if (aba === 'estoqueAtual') {
      baixarCSV(
        `estoque-${sigla}-${hoje}.csv`,
        ['Material', 'Unidade', 'Quantidade', 'Custo Unitário Médio', 'Custo Total', 'Quantidade de Saída', 'Estoque', 'Estoque regulador', 'Observação'],
        emEstoque.map((s) => [
          s.material.nome, s.material.unidade, s.quantidadeEntrada,
          s.custoMedio.toFixed(2), s.custoTotal.toFixed(2), s.quantidadeSaida, s.saldo,
          s.material.estoque_minimo ?? '',
          s.material.reutilizavel ? (s.material.observacao || '') : '',
        ]),
      )
    } else if (aba === 'entradas') {
      baixarCSV(
        `entrada-${sigla}-${hoje}.csv`,
        ['Chegou em', 'Material', 'Fornecedor', 'Nº da Nota Fiscal', 'Data da Nota', 'Quantidade', 'Recebido por'],
        entradas.map((e) => [
          formatarData(e.data), nomeMaterial(e.material_id), e.fornecedor || '',
          e.nota_fiscal || '', formatarData(e.data_nota), e.quantidade, e.recebido_por || '',
        ]),
      )
    } else {
      baixarCSV(
        `saida-${sigla}-${hoje}.csv`,
        ['Data', 'Material', 'Quantidade', 'DESTINO'],
        saidas.map((s) => [formatarData(s.data), nomeMaterial(s.material_id), s.quantidade, s.destino || '']),
      )
    }
  }

  const pedirArquivarMaterial = (material) => setConfirmar({
    titulo: 'Arquivar material?',
    texto: `«${material.nome}» deixa de aparecer pra escolher em entrada/saída novas. O histórico continua intacto.`,
    rotuloOk: 'Arquivar', perigo: true,
    onOk: async () => { setConfirmar(null); setEditandoMaterial(null); await dados.arquivarCadastro('materiaisEstoque', material.id) },
  })

  return (
    <div className="page stack-2">
      <PageHeader
        titulo="Controle de estoque"
        sub={`${plural(materiais.length, 'material', 'materiais')} cadastrado${materiais.length === 1 ? '' : 's'}${abaixoDoMinimo ? ` · ${abaixoDoMinimo} abaixo do mínimo` : ''}`}
        acao={
          <div className="row-flex" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => setImportando(true)}>
              <Icon name="baixar" size={16} style={{ transform: 'rotate(180deg)' }} /> Importar cadastro
            </button>
            <button className="btn btn-secondary" onClick={() => setEtiquetando(true)}>
              <Icon name="qrcode" size={16} /> Etiquetas QR
            </button>
            <button className="btn btn-secondary" onClick={() => abrirNovaSaida()}>
              <Icon name="baixar" size={16} /> Registrar saída
            </button>
            <button className="btn btn-primary" onClick={() => setImportandoMovimento(true)}>
              <Icon name="baixar" size={16} style={{ transform: 'rotate(180deg)' }} /> Importar planilha
            </button>
            <button className="btn btn-secondary" onClick={() => abrirNovaEntrada()}>
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
          { valor: 'porColaborador', rotulo: 'Por Colaborador', contador: colaboradoresComMaterial.length },
        ]}
      />

      {aba !== 'porColaborador' && (
        <div className="row-between">
          <div className="t-caption">
            {aba === 'estoqueAtual' && `${plural(emEstoque.length, 'material', 'materiais')} nesta lista`}
            {aba === 'entradas' && `${plural(entradas.length, 'entrada lançada', 'entradas lançadas')}`}
            {aba === 'saidas' && `${plural(saidas.length, 'saída lançada', 'saídas lançadas')}`}
            {aba === 'suprimentos' && `${plural(resumoSuprimentos.length, 'insumo recebido', 'insumos recebidos')} marcados como Almoxarifado`}
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

          {colaboradoresComMaterial.length === 0 ? (
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
          ) : gruposColaboradoresMaterial ? (
            <div className="stack-3">
              {gruposColaboradoresMaterial.map(({ rotulo, itens }) => (
                <div key={rotulo} className="stack-1">
                  <div className="t-caption" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                    {rotulo} <span style={{ opacity: 0.6, fontWeight: 400, textTransform: 'none' }}>{itens.length}</span>
                  </div>
                  {itens.map(({ colaborador, entregas }) => (
                    <ItemLista
                      key={colaborador.id}
                      titulo={colaborador.nome}
                      sub={`${plural(entregas.length, 'entrega', 'entregas')} · última em ${formatarDataCurta([...entregas].sort((a, b) => (a.data < b.data ? 1 : -1))[0].data)}`}
                      onClick={() => setColaboradorMaterialAberto(colaborador)}
                      direita={<Icon name="avancar" size={16} />}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="stack-1">
              {colaboradoresComMaterial.map(({ colaborador, entregas }) => (
                <ItemLista
                  key={colaborador.id}
                  titulo={colaborador.nome}
                  sub={`${plural(entregas.length, 'entrega', 'entregas')} · última em ${formatarDataCurta([...entregas].sort((a, b) => (a.data < b.data ? 1 : -1))[0].data)}`}
                  onClick={() => setColaboradorMaterialAberto(colaborador)}
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
                placeholder="Buscar material…"
              />
            )}
            {lista.length === 0 ? (
              <div className="card-flat">
                <Vazio
                  titulo={materiais.length === 0 ? 'Nenhum material cadastrado' : 'Nada com esse nome'}
                  texto={
                    materiais.length === 0
                      ? 'Importe o Relatório de Estoque da UAU pra trazer os materiais com código, saldo e histórico de uma vez.'
                      : 'Nenhum material com saldo ainda — importe a planilha, ou troque a busca.'
                  }
                  acao={materiais.length === 0 && (
                    <button className="btn btn-primary" onClick={() => setImportandoMovimento(true)}>
                      Importar planilha
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
                      s.material.codigo,
                      s.material.categoria,
                      s.material.estoque_minimo != null && s.material.estoque_minimo !== '' ? `mínimo ${s.material.estoque_minimo} ${s.material.unidade}` : null,
                      s.periodoFim ? `importado até ${formatarDataCurta(s.periodoFim)}` : 'nunca importado',
                      s.material.reutilizavel && s.material.observacao ? `em uso: ${s.material.observacao}` : null,
                    ].filter(Boolean).join(' · ')}
                    onClick={() => setEditandoMaterial({ ...s.material, estoque_minimo: s.material.estoque_minimo ?? '' })}
                    direita={
                      <div className="row-flex" style={{ gap: 4, alignItems: 'center' }}>
                        {s.material.reutilizavel && <Chip tom="info">Reutilizável</Chip>}
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
            <Vazio titulo="Nenhuma entrada lançada" texto="Toda vez que chegar material na obra, lança aqui — o saldo atualiza sozinho." />
          </div>
        ) : (() => {
          const termo = buscaEntradas.trim().toLowerCase()
          const filtradas = termo ? entradas.filter((e) => nomeMaterial(e.material_id).toLowerCase().includes(termo)) : entradas
          return (
            <div className="stack-2">
              <input
                className="ipt" value={buscaEntradas} onChange={(e) => setBuscaEntradas(e.target.value)}
                placeholder="Buscar material…"
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
            <Vazio titulo="Nenhuma saída lançada" texto="Toda vez que um material sair do almoxarifado, lança aqui — o saldo atualiza sozinho." />
          </div>
        ) : (() => {
          const termo = buscaSaidas.trim().toLowerCase()
          const filtradas = termo ? saidas.filter((s) => nomeMaterial(s.material_id).toLowerCase().includes(termo)) : saidas
          return (
            <div className="stack-2">
              <input
                className="ipt" value={buscaSaidas} onChange={(e) => setBuscaSaidas(e.target.value)}
                placeholder="Buscar material…"
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
              titulo="Nada marcado como Almoxarifado ainda"
              texto="Vá em Suprimentos, abra um pedido já entregue e marque o Destino como Almoxarifado — pedido repetido com o mesmo nome entra sozinho depois."
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
            <Campo label="Valor total" dica="Opcional — usado pra calcular o custo médio do material.">
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
            {novaSaida.material_id && (() => {
              const s = saldos.find((x) => x.material.id === novaSaida.material_id)
              return (
                <div className="card-flat" style={{ padding: 10 }}>
                  <div className="t-micro">Estoque atual</div>
                  <div className="t-strong" style={{ fontSize: 18, color: s?.abaixoDoMinimo ? 'var(--danger)' : undefined }}>
                    {(s?.saldo ?? 0).toLocaleString('pt-BR')} {unidadeMaterial(novaSaida.material_id)}
                  </div>
                  {s?.abaixoDoMinimo && (
                    <div className="t-caption" style={{ color: 'var(--danger)' }}>Abaixo do estoque mínimo cadastrado.</div>
                  )}
                </div>
              )
            })()}
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
              <Campo label="Destino" dica="Pra onde foi — obra, empresa, ou marque um colaborador acima em vez disso.">
                <input
                  className="ipt" value={novaSaida.destino}
                  onChange={(e) => setNovaSaida((p) => ({ ...p, destino: e.target.value }))}
                  placeholder="Bloco Vendas, Equipe própria…"
                />
              </Campo>
            )}
          </div>
        )}
      </Sheet>

      {/* ── Editar material ── */}
      <Sheet
        aberto={Boolean(editandoMaterial)}
        titulo="Editar material"
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
                  placeholder="unid, kg, m, L…"
                />
              </Campo>
              <Campo label="Categoria" dica="Opcional">
                <input
                  className="ipt" value={editandoMaterial.categoria || ''}
                  onChange={(e) => setEditandoMaterial((p) => ({ ...p, categoria: e.target.value }))}
                  placeholder="Elétrico, hidráulico, limpeza…"
                />
              </Campo>
            </div>
            <Campo
              label="Código (UAU)"
              dica="Opcional — o código do insumo no sistema (ex.: IF010002). É o que casa este material com a importação do Relatório de Estoque e com os pedidos de Suprimentos."
            >
              <input
                className="ipt" value={editandoMaterial.codigo || ''}
                onChange={(e) => setEditandoMaterial((p) => ({ ...p, codigo: e.target.value }))}
                placeholder="IF010002"
              />
            </Campo>
            <Campo label="Estoque mínimo" dica="Opcional — abaixo disso, o material aparece marcado na aba Saldo.">
              <input
                className="ipt" type="number" inputMode="decimal" min="0" step="any"
                value={editandoMaterial.estoque_minimo}
                onChange={(e) => setEditandoMaterial((p) => ({ ...p, estoque_minimo: e.target.value }))}
              />
            </Campo>
            <label className="pick" data-on={editandoMaterial.reutilizavel ? '1' : '0'} style={{ cursor: 'pointer' }}>
              <input
                type="checkbox" style={{ display: 'none' }}
                checked={Boolean(editandoMaterial.reutilizavel)}
                onChange={(e) => setEditandoMaterial((p) => ({ ...p, reutilizavel: e.target.checked }))}
              />
              <span className="box"><Icon name="check" size={14} /></span>
              <span className="grow">
                Item reutilizável — não sai definitivamente do estoque
                <span className="t-caption" style={{ display: 'block', marginTop: 2 }}>
                  Ferramenta/equipamento que empresta e volta (furadeira, carrinho…), não um consumível.
                </span>
              </span>
            </label>
            {editandoMaterial.reutilizavel && (
              <Campo label="Observação" dica="Onde está sendo usado agora — entra na coluna Observação quando baixar a planilha do Estoque Atual.">
                <textarea
                  className="ipt" style={{ minHeight: 60 }}
                  value={editandoMaterial.observacao || ''}
                  onChange={(e) => setEditandoMaterial((p) => ({ ...p, observacao: e.target.value }))}
                  placeholder="Ex.: emprestada pro Bloco Vendas, com o Fulano…"
                />
              </Campo>
            )}
            {saldos.find((s) => s.material.id === editandoMaterial.id)?.periodoFim && (
              <div className="t-caption">
                Saldo importado do Relatório de Estoque até {formatarDataCurta(saldos.find((s) => s.material.id === editandoMaterial.id).periodoFim)}.
              </div>
            )}
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
              <Icon name="qrcode" size={16} /> {gerandoEtiquetas ? 'Gerando…' : 'Imprimir etiqueta QR deste material'}
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
                  {historicoMaterial.length === 0 ? 'Nenhuma movimentação (lançada no app ou importada da planilha) ainda pra este material.' : 'Nada nesse período.'}
                </div>
              ) : (
                <div className="stack-1">
                  {historicoFiltrado.map((h, i) => (
                    <div key={i} className="card-flat row-between" style={{ padding: 10, alignItems: 'center' }}>
                      <div className="row-flex" style={{ gap: 8, alignItems: 'center' }}>
                        <Chip tom={h.tipo === 'entrada' ? 'success' : h.tipo === 'saida' ? 'danger' : 'info'}>
                          {h.tipo === 'entrada' ? 'Entrada' : h.tipo === 'saida' ? 'Saída' : 'Importação'}
                        </Chip>
                        <div>
                          <div className="t-caption">{formatarDataCurta(h.data)}</div>
                          {h.detalhe && <div className="t-caption">{h.detalhe}</div>}
                        </div>
                      </div>
                      <span className="t-strong" style={{ fontSize: 14 }}>
                        {h.tipo === 'entrada' ? `+${h.quantidade}` : h.tipo === 'saida' ? `−${h.quantidade}` : `saldo ${h.quantidade}`} {editandoMaterial.unidade}
                      </span>
                    </div>
                  ))}
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
              Arquivar material
            </button>
          </div>
        )}
      </Sheet>

      {/* ── Ficha de material por colaborador ── */}
      <Sheet
        aberto={Boolean(colaboradorMaterialAberto)}
        titulo={colaboradorMaterialAberto?.nome}
        onFechar={() => setColaboradorMaterialAberto(null)}
        rodape={
          <button className="btn btn-primary btn-block" onClick={() => setImprimindoFichaMaterial(true)}>
            <Icon name="relatorio" size={16} /> Imprimir ficha
          </button>
        }
      >
        {colaboradorMaterialAberto && (
          <div className="stack-1">
            {(colaboradoresComMaterial.find((c) => c.colaborador.id === colaboradorMaterialAberto.id)?.entregas || [])
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

      {imprimindoFichaMaterial && colaboradorMaterialAberto && (
        <RelatorioFolha
          titulo="Ficha de entrega de material"
          sub={colaboradorMaterialAberto.nome}
          obra={dados.obra.nome} org={dados.org.nome}
        >
          <SecaoRelatorio titulo="Materiais recebidos">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #18181B', padding: '4px 6px' }}>Data</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #18181B', padding: '4px 6px' }}>Material</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #18181B', padding: '4px 6px' }}>Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {(colaboradoresComMaterial.find((c) => c.colaborador.id === colaboradorMaterialAberto.id)?.entregas || [])
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
            Declaro ter recebido os materiais acima, em perfeito estado.
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
        materiaisExistentes={dados.materiaisEstoque || []}
      />

      <ImportarMovimentoEstoque
        aberto={importandoMovimento}
        onFechar={() => setImportandoMovimento(false)}
        dados={dados}
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

/* ── Importação do cadastro de materiais ─────────────────────
   Só o cadastro (nome, unidade, mínimo) — decisão do Julio: começar
   com o saldo zerado no app e lançar as entradas daqui pra frente,
   sem herdar quantidade nem histórico da planilha antiga. Material
   que já existe (mesmo nome) não duplica, só é avisado. */
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
      const ok = await dados.salvarCadastro('materiaisEstoque', {
        nome: item.nome, unidade: item.unidade, estoque_minimo: item.estoque_minimo,
      })
      if (ok) criados++
    }
    setImportandoAgora(false)
    setFeito({ criados, jaExistiam: (resultado?.itens.length || 0) - novos.length })
  }

  return (
    <Sheet aberto={aberto} titulo="Importar materiais da planilha" onFechar={fechar}>
      <div className="stack-2">
        {feito ? (
          <>
            <div className="alert success">
              {plural(feito.criados, 'material cadastrado', 'materiais cadastrados')}.
              {feito.jaExistiam > 0 && ` ${plural(feito.jaExistiam, 'material já existia', 'materiais já existiam')} e não foram duplicados.`}
            </div>
            <button className="btn btn-primary btn-block" onClick={fechar}>Fechar</button>
          </>
        ) : (
          <>
            <div className="t-caption" style={{ lineHeight: 1.5 }}>
              Escolha a planilha de estoque (.xlsx ou .xlsm) — leio a aba "Estoque" e trago o nome, a
              unidade e o mínimo de cada material. Só o cadastro: quantidade e histórico ficam pra
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
                  {plural(novos.length, 'material novo', 'materiais novos')} para importar
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
                    {importandoAgora ? 'Importando…' : `Importar ${plural(novos.length, 'material', 'materiais')}`}
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

/* ── Importação do movimento de estoque (Relatório de Estoque) ──
   O import de verdade agora: traz entrada, baixa e saldo do
   período direto da UAU, consolidado por material (lotes somados —
   ver lib/planilhaMovimentoEstoque.js). Material que ainda não
   existe (código novo) é cadastrado na hora, sem passo separado.
   Reimportar o mesmo período atualiza; um período novo soma ao
   histórico, sem apagar o anterior. */
function ImportarMovimentoEstoque({ aberto, onFechar, dados }) {
  const [lendo, setLendo] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [importandoAgora, setImportandoAgora] = useState(false)
  const [feito, setFeito] = useState(null)

  const fechar = () => {
    setResultado(null); setNomeArquivo(''); setFeito(null); onFechar()
  }

  const materiaisPorCodigo = useMemo(
    () => new Map((dados.materiaisEstoque || []).filter((m) => m.codigo).map((m) => [m.codigo, m])),
    [dados.materiaisEstoque],
  )

  /* Saldo de ANTES desta importação, pra dizer se cada material subiu
     ou desceu — o mais recente já importado (maior período_fim) pra
     cada material, do jeito que dominio.saldoEstoqueImportado também
     calcula "estoque atual" hoje, antes desta planilha nova entrar. */
  const saldoAnteriorPorMaterial = useMemo(() => {
    const maisRecente = new Map()
    for (const mov of (dados.movimentosEstoque || [])) {
      const atual = maisRecente.get(mov.material_id)
      if (!atual || mov.periodo_fim > atual.periodo_fim) maisRecente.set(mov.material_id, mov)
    }
    return new Map([...maisRecente.entries()].map(([materialId, mov]) => [materialId, Number(mov.saldo)]))
  }, [dados.movimentosEstoque])

  const onArquivo = async (e) => {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    e.target.value = ''
    setNomeArquivo(arquivo.name)
    setLendo(true)
    setResultado(null)
    setFeito(null)
    try {
      const { lerMovimentoEstoque } = await import('../lib/planilhaMovimentoEstoque')
      setResultado(await lerMovimentoEstoque(arquivo))
    } catch (err) {
      setResultado({ itens: [], erroGeral: `Não consegui ler este arquivo. ${err.message}` })
    } finally {
      setLendo(false)
    }
  }

  const itensComStatus = useMemo(() => {
    return (resultado?.itens || []).map((i) => {
      const materialExistente = materiaisPorCodigo.get(i.codigo) || null
      const saldoAnterior = materialExistente ? (saldoAnteriorPorMaterial.get(materialExistente.id) ?? 0) : null
      const diferenca = saldoAnterior == null ? null : Math.round((i.saldo - saldoAnterior) * 100) / 100
      return { item: i, materialExistente, saldoAnterior, diferenca }
    })
  }, [resultado, materiaisPorCodigo, saldoAnteriorPorMaterial])
  const novos = itensComStatus.filter((x) => !x.materialExistente).length
  const subiram = itensComStatus.filter((x) => x.diferenca > 0).length
  const desceram = itensComStatus.filter((x) => x.diferenca < 0).length

  const confirmar = async () => {
    if (!resultado?.itens?.length) return
    setImportandoAgora(true)
    const r = await dados.importarMovimentoEstoque(resultado.itens, {
      periodoInicio: resultado.periodoInicio, periodoFim: resultado.periodoFim,
    })
    setImportandoAgora(false)
    if (r) setFeito(r)
  }

  return (
    <Sheet aberto={aberto} titulo="Importar planilha de estoque" onFechar={fechar}>
      <div className="stack-2">
        {feito ? (
          <>
            <div className="alert success">
              {plural(feito.movimentos, 'material atualizado', 'materiais atualizados')} com o saldo deste período.
              {feito.materiaisNovos > 0 && ` ${plural(feito.materiaisNovos, 'material novo cadastrado', 'materiais novos cadastrados')} na hora.`}
              {subiram > 0 && ` ${subiram} ↑ subiu/subiram.`}
              {desceram > 0 && ` ${desceram} ↓ desceu/desceram.`}
            </div>
            <button className="btn btn-primary btn-block" onClick={fechar}>Fechar</button>
          </>
        ) : (
          <>
            <div className="t-caption" style={{ lineHeight: 1.5 }}>
              O "Relatório de Estoque" que você baixa da UAU (.xls), com entrada, baixa e saldo do
              período. Cada material entra com o total já somado, mesmo tendo vindo em mais de um
              lote/compra na planilha. Vira a fonte do saldo — reimporte sempre que quiser atualizar.
            </div>

            <label className="btn btn-secondary btn-block" style={{ cursor: 'pointer' }}>
              {lendo ? 'Lendo a planilha…' : nomeArquivo || 'Escolher arquivo .xls'}
              <input
                type="file" accept=".xls,.xlsx" onChange={onArquivo}
                style={{ display: 'none' }} disabled={lendo}
              />
            </label>

            {resultado?.erroGeral && <div className="alert danger">{resultado.erroGeral}</div>}

            {resultado && !resultado.erroGeral && (
              <>
                <div className="alert info">
                  Período de {formatarDataCurta(resultado.periodoInicio)} a {formatarDataCurta(resultado.periodoFim)} ·{' '}
                  {plural(resultado.itens.length, 'material', 'materiais')}
                  {novos > 0 ? ` · ${plural(novos, 'novo (será cadastrado)', 'novos (serão cadastrados)')}` : ''}
                  {subiram > 0 ? ` · ${subiram} ↑ subiu/subiram` : ''}
                  {desceram > 0 ? ` · ${desceram} ↓ desceu/desceram` : ''}.
                </div>

                <div style={{ maxHeight: 320, overflowY: 'auto' }} className="stack-1">
                  {itensComStatus.map(({ item, materialExistente, saldoAnterior, diferenca }) => (
                    <div
                      key={item.codigo}
                      style={{
                        fontSize: 12, padding: 8, borderRadius: 8,
                        border: `1px solid ${materialExistente ? 'var(--border)' : 'var(--success)'}`,
                        background: materialExistente ? 'var(--surface-2)' : 'var(--success-tint)',
                      }}
                    >
                      <div className="row-between">
                        <strong>{item.codigo} · {item.nome}</strong>
                        <span style={{ color: materialExistente ? 'var(--text-3)' : 'var(--success)', fontWeight: 600 }}>
                          {materialExistente ? 'já cadastrado' : 'novo'}
                        </span>
                      </div>
                      <div style={{ marginTop: 2 }}>
                        entrada {item.qtde_entrada} · baixa {item.qtde_baixa} · saldo {item.saldo} {item.unidade}
                        {item.lotes > 1 ? ` (${plural(item.lotes, 'lote', 'lotes')} somados)` : ''}
                      </div>
                      {diferenca != null && diferenca !== 0 && (
                        <div style={{ marginTop: 2, fontWeight: 600, color: diferenca > 0 ? 'var(--success)' : 'var(--danger)' }}>
                          {diferenca > 0 ? '↑' : '↓'} {diferenca > 0 ? 'subiu' : 'desceu'} {Math.abs(diferenca)} {item.unidade}
                          {' '}(era {saldoAnterior} {item.unidade})
                        </div>
                      )}
                      {diferenca === 0 && (
                        <div style={{ marginTop: 2, color: 'var(--text-3)' }}>sem mudança de saldo</div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="row-flex">
                  <button className="btn btn-secondary grow" onClick={() => setResultado(null)}>Corrigir</button>
                  <button
                    className="btn btn-primary grow" onClick={confirmar}
                    disabled={!resultado.itens.length || importandoAgora}
                  >
                    {importandoAgora ? 'Importando…' : `Importar ${plural(resultado.itens.length, 'material', 'materiais')}`}
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

/* ── Etiquetas QR — escolhe quais materiais imprimir ─────────
   Nasce com tudo marcado — imprimir o lote inteiro de uma vez é o
   uso mais comum (etiquetar a prateleira toda). Cada QR aponta pro
   link do próprio material (lib/qrEstoque); apontar a câmera do
   celular nele abre o Prumo direto na saída daquele material. */
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
          Cada etiqueta traz o QR Code e o nome do material embaixo. Cole na prateleira —
          apontando a câmera do celular nela, abre direto a saída daquele material.
        </div>

        {materiais.length === 0 ? (
          <div className="t-caption">Nenhum material cadastrado ainda.</div>
        ) : (
          <>
            <input
              className="ipt" value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar material…"
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

/* ── Escolha de material, com criação rápida embutida ────────
   "Fácil de adicionar material" era o pedido: em vez de mandar
   cadastrar antes, em outro lugar, o campo de busca já deixa criar
   o material na hora, direto aqui — some do formulário de entrada,
   sobra pronto pra próxima saída. */
/* Catálogo do Almoxarifado passa de 500 materiais — um <select> puro
   virou uma lista impossível de rolar até achar o certo, e isso
   levava a criar material duplicado (mais rápido clicar "Novo" que
   procurar). A busca filtra as opções antes de escolher; o aviso no
   formulário de criação reforça conferir antes de criar. */
function SelecaoMaterial({ materialId, materiais, dados, onEscolher, nomeSugerido = '' }) {
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState(nomeSugerido)
  const [unidade, setUnidade] = useState('unid')
  const [salvando, setSalvando] = useState(false)
  const [busca, setBusca] = useState(nomeSugerido)

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return termo ? materiais.filter((m) => m.nome.toLowerCase().includes(termo)) : materiais
  }, [materiais, busca])

  if (criando) {
    const criar = async () => {
      if (!nome.trim() || !unidade.trim()) return
      setSalvando(true)
      const criado = await dados.salvarCadastro('materiaisEstoque', { nome: nome.trim(), unidade: unidade.trim() })
      setSalvando(false)
      if (criado) {
        onEscolher(criado.id)
        setCriando(false)
        setNome('')
        setUnidade('unid')
      }
    }
    return (
      <Campo label="Material novo" dica="Confira na busca se ele já não existe antes de criar — evita duplicar.">
        <div className="stack-1">
          <input
            className="ipt" autoFocus value={nome} onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do material"
          />
          <div className="row-flex">
            <input
              className="ipt grow" value={unidade} onChange={(e) => setUnidade(e.target.value)}
              placeholder="Unidade (unid, kg, m…)"
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
    <Campo label="Material">
      <div className="stack-1">
        <input
          className="ipt" value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar material…"
        />
        <div className="row-flex">
          <select
            className="sel grow" value={materialId}
            onChange={(e) => onEscolher(e.target.value)}
          >
            <option value="">
              {busca.trim() ? `${plural(filtrados.length, 'resultado', 'resultados')} para "${busca.trim()}"` : 'Escolha o material'}
            </option>
            {filtrados.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
          <button className="btn btn-secondary" onClick={() => setCriando(true)}>
            <Icon name="mais_sinal" size={16} /> Novo
          </button>
        </div>
      </div>
    </Campo>
  )
}
