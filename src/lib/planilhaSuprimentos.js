/* ============================================================
   LEITOR DA PLANILHA DE SUPRIMENTOS — "Relação de Pedidos de
   Compras" que o Julio baixa do sistema (ERP) dele. Cada linha é um
   insumo dentro de um pedido, com as datas do fluxo inteiro (Pedido
   → Aprovação → Cotação → Compra → Entrega) e os dois indicadores de
   dias já calculados pelo próprio sistema.

   O cabeçalho de verdade não é a primeira linha — tem um bloco de
   "Empresa:"/"Obra:" antes — por isso a busca varre as primeiras
   linhas procurando a que tem "Pedido" e "Insumo" juntos, em vez de
   assumir uma posição fixa.

   O UAU exporta pensando em impressão paginada: nome de insumo comprido
   quebra em até 3 linhas físicas, e a cada quebra de página entra um
   bloco de cabeçalho/rodapé repetido no meio da tabela — às vezes bem
   no meio de um nome que estava sendo quebrado. `realinharNomesQuebrados`
   remonta isso automaticamente antes da extração normal, então tanto a
   planilha crua (baixada direto do UAU) quanto uma já corrigida à mão
   importam certo — não precisa mais rodar uma correção à parte antes.
   Os poucos casos em que a remontagem fica ambígua (raro — a própria
   planilha não dá informação suficiente pra decidir sozinho) viram um
   aviso não-bloqueante em vez de um item com nome errado.

   Chave de reimportação: (Pedido, Cód. Insumo) — bate com o unique
   de `supply_orders` no banco. Reimportar a mesma planilha (ou uma
   mais nova) atualiza a linha existente em vez de duplicar.
   ============================================================ */

const ALIASES = {
  pedido: ['pedido'],
  cotacao: ['cotacao'],
  codigoInsumo: ['cod insumo', 'codigo insumo'],
  insumo: ['insumo'],
  dataPedido: ['data pedido'],
  aprovPedido: ['aprov pedido'],
  aprovSimulacao: ['aprov simul'],
  confirmCotacao: ['confirm cot'],
  fechamentoCompra: ['fech comp'],
  dataEntrega: ['data entrega'],
  excluido: ['excluido'],
  quantidade: ['qtde', 'quantidade'],
  preco: ['preco'],
  diasPedidoCompra: ['ped compra dias'],
  diasCompraEntrega: ['compra ent dias'],
  estagio: ['estagio'],
}

const LINHAS_PARA_ACHAR_CABECALHO = 20
const LIMITE_LINHAS_VAZIAS = 100

function normalizarTexto(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[.*/()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/* Diferente do cronograma global (planilha americana, M/D): esta é
   brasileira, dd/mm/aaaa — a ordem dos grupos capturados é invertida
   de propósito em relação a planilhaCronogramaGlobal.js. */
function celParaISO(cell) {
  if (!cell || cell.t === 'e') return null
  if (cell.t === 'd' && cell.v instanceof Date) {
    const d = cell.v
    return [d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, '0'), String(d.getUTCDate()).padStart(2, '0')].join('-')
  }
  const texto = String(cell.w ?? cell.v ?? '').trim()
  if (!texto || texto === '-') return null
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(texto)
  if (m) {
    let [, dia, mes, ano] = m
    if (ano.length === 2) ano = (Number(ano) < 70 ? '20' : '19') + ano
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`
  }
  return null
}

function celTexto(cell) {
  if (!cell || cell.t === 'e') return ''
  return String(cell.w ?? cell.v ?? '').trim()
}

function celNumero(cell) {
  const texto = celTexto(cell)
  if (!texto || texto === '-') return null
  const n = Number(texto.replace(',', '.'))
  return Number.isNaN(n) ? null : n
}

function celInteiro(cell) {
  const n = celNumero(cell)
  return n == null ? null : Math.round(n)
}

/* Às vezes o UAU exporta "*Ped/Compra (dias)" e "**Compra/Ent (dias)" em
   branco mesmo quando as datas que dariam pra calcular essa diferença
   estão preenchidas na planilha (visto num export real da Sede: as duas
   colunas de dias vieram 100% vazias nos 498 itens, mas Aprov. Pedido,
   Fech. Compra e Data Entrega estavam lá). Nesse caso o Prumo calcula
   ele mesmo — mesma fórmula que as notas de rodapé da própria planilha
   descrevem, confirmada batendo 100% contra linhas onde o UAU já tinha
   calculado (Fech.Compra − Aprov.Pedido, e Entrega − Fech.Compra). Só
   entra em ação quando o valor de origem está ausente — nunca sobrescreve
   um número que a planilha já trouxe. */
function diferencaDias(dataInicioISO, dataFimISO) {
  if (!dataInicioISO || !dataFimISO) return null
  const inicio = new Date(`${dataInicioISO}T00:00:00Z`)
  const fim = new Date(`${dataFimISO}T00:00:00Z`)
  return Math.round((fim - inicio) / 86400000)
}

export async function lerPlanilhaSuprimentos(arquivo) {
  const XLSX = await import('xlsx')
  const buffer = await arquivo.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })

  const nomeAba = wb.SheetNames[0]
  const ws = wb.Sheets[nomeAba]
  if (!ws || !ws['!ref']) return { itens: [], erroGeral: 'Não encontrei nenhuma aba com dados nesta planilha.' }

  const faixa = XLSX.utils.decode_range(ws['!ref'])
  const cel = (r, c) => ws[XLSX.utils.encode_cell({ r, c })]

  const lerCabecalhoNaLinha = (r) => {
    const linha = []
    for (let c = faixa.s.c; c <= faixa.e.c; c++) linha.push(normalizarTexto(celTexto(cel(r, c))))
    return linha
  }

  let linhaCabecalho = -1
  let cabecalho = []
  for (let r = faixa.s.r; r <= Math.min(faixa.e.r, faixa.s.r + LINHAS_PARA_ACHAR_CABECALHO); r++) {
    const linha = lerCabecalhoNaLinha(r)
    if (linha.includes('pedido') && linha.includes('insumo')) {
      linhaCabecalho = r
      cabecalho = linha
      break
    }
  }
  if (linhaCabecalho < 0) {
    return { itens: [], erroGeral: 'Não achei a linha de cabeçalho (preciso das colunas "Pedido" e "Insumo") nas primeiras linhas da planilha.' }
  }

  const acharColuna = (lista) => {
    for (const alvo of lista) {
      const i = cabecalho.indexOf(alvo)
      if (i >= 0) return faixa.s.c + i
    }
    return -1
  }
  const colunas = Object.fromEntries(Object.entries(ALIASES).map(([chave, lista]) => [chave, acharColuna(lista)]))

  if (colunas.pedido < 0 || colunas.insumo < 0 || colunas.codigoInsumo < 0) {
    return { itens: [], erroGeral: 'Não reconheci as colunas "Pedido", "Cód. Insumo" e "Insumo" nesta planilha.' }
  }

  const { beforeMap, afterMap, avisos } = realinharNomesQuebrados(cel, faixa, linhaCabecalho + 1, colunas)

  const itens = []
  const avisosNomeInconsistente = []
  const nomePorCodigo = new Map()
  let vaziasSeguidas = 0
  for (let r = linhaCabecalho + 1; r <= faixa.e.r; r++) {
    /* Linha "de verdade" é a que tem Cód. Insumo preenchido — quando o
       nome do insumo é longo, o UAU quebra ele em cima e/ou embaixo
       desta linha (ver realinharNomesQuebrados), então não dá pra usar
       "tem Insumo preenchido" como critério de linha de dado igual
       antes: a linha físico às vezes vem com a coluna Insumo vazia até
       ela ser remontada aqui. */
    const codigoInsumoRaw = celTexto(cel(r, colunas.codigoInsumo))
    if (!codigoInsumoRaw) {
      vaziasSeguidas++
      if (vaziasSeguidas >= LIMITE_LINHAS_VAZIAS) break
      continue
    }
    const partes = []
    if (beforeMap.has(r)) partes.push(beforeMap.get(r))
    const nomeProprio = celTexto(cel(r, colunas.insumo))
    if (nomeProprio) partes.push(nomeProprio)
    if (afterMap.has(r)) partes.push(afterMap.get(r))
    const insumo = partes.join(' ').replace(/\s+/g, ' ').trim()
    const pedido = celInteiro(cel(r, colunas.pedido))
    if (!insumo || pedido == null) {
      vaziasSeguidas++
      if (vaziasSeguidas >= LIMITE_LINHAS_VAZIAS) break
      continue
    }
    vaziasSeguidas = 0
    const nomeAnterior = nomePorCodigo.get(codigoInsumoRaw)
    if (nomeAnterior && nomeAnterior !== insumo) avisosNomeInconsistente.push(codigoInsumoRaw)
    nomePorCodigo.set(codigoInsumoRaw, insumo)
    const aprovPedido = colunas.aprovPedido >= 0 ? celParaISO(cel(r, colunas.aprovPedido)) : null
    const fechamentoCompra = colunas.fechamentoCompra >= 0 ? celParaISO(cel(r, colunas.fechamentoCompra)) : null
    const dataEntrega = colunas.dataEntrega >= 0 ? celParaISO(cel(r, colunas.dataEntrega)) : null
    const diasPedidoCompra = (colunas.diasPedidoCompra >= 0 ? celInteiro(cel(r, colunas.diasPedidoCompra)) : null)
      ?? diferencaDias(aprovPedido, fechamentoCompra)
    const diasCompraEntrega = (colunas.diasCompraEntrega >= 0 ? celInteiro(cel(r, colunas.diasCompraEntrega)) : null)
      ?? diferencaDias(fechamentoCompra, dataEntrega)
    itens.push({
      linha: r + 1,
      pedido,
      cotacao: colunas.cotacao >= 0 ? celInteiro(cel(r, colunas.cotacao)) : null,
      codigo_insumo: codigoInsumoRaw,
      insumo,
      data_pedido: colunas.dataPedido >= 0 ? celParaISO(cel(r, colunas.dataPedido)) : null,
      aprov_pedido: aprovPedido,
      aprov_simulacao: colunas.aprovSimulacao >= 0 ? celParaISO(cel(r, colunas.aprovSimulacao)) : null,
      confirm_cotacao: colunas.confirmCotacao >= 0 ? celParaISO(cel(r, colunas.confirmCotacao)) : null,
      fechamento_compra: fechamentoCompra,
      data_entrega: dataEntrega,
      excluido: colunas.excluido >= 0 ? (celTexto(cel(r, colunas.excluido)) || null) : null,
      quantidade: colunas.quantidade >= 0 ? celNumero(cel(r, colunas.quantidade)) : null,
      preco: colunas.preco >= 0 ? celNumero(cel(r, colunas.preco)) : null,
      dias_pedido_compra: diasPedidoCompra,
      dias_compra_entrega: diasCompraEntrega,
      estagio: colunas.estagio >= 0 ? (celTexto(cel(r, colunas.estagio)) || null) : null,
    })
  }

  const todosAvisos = [...avisos]
  if (avisosNomeInconsistente.length) {
    const codigos = [...new Set(avisosNomeInconsistente)]
    todosAvisos.push(
      `${codigos.length} código${codigos.length > 1 ? 's' : ''} de insumo (${codigos.slice(0, 5).join(', ')}${codigos.length > 5 ? '…' : ''}) apareceu com nomes diferentes em linhas diferentes — o nome mais recente foi o que ficou. Vale conferir esses itens depois de importar.`,
    )
  }

  return { itens, erroGeral: null, aba: nomeAba, avisos: todosAvisos }
}

/* O UAU exporta pensando em impressão paginada: quando o nome do
   Insumo é longo demais pra caber na altura da linha, ele quebra o
   nome em cima e/ou embaixo da linha de dados de verdade (que fica
   reconhecível pela coluna Cód. Insumo preenchida) — e, além disso,
   insere um bloco de cabeçalho/rodapé repetido bem no meio da tabela
   a cada quebra de página, que às vezes cai entre o pedaço "de cima"
   do nome e a linha de dados. Esta função remonta o nome completo de
   cada item antes da extração normal, atravessando esses blocos de
   lixo quando precisa. Baseado no mesmo algoritmo (já validado contra
   um export real) da skill "planilha-compras" que corrige essas
   planilhas manualmente — aqui roda direto no import, sem precisar de
   um passo separado antes. Em planilha já limpa (sem linhas de texto
   solto) isso não muda nada — before/afterMap saem vazios. */
function realinharNomesQuebrados(cel, faixa, dataStart, colunas) {
  const colInsumo = colunas.insumo
  const colCodigo = colunas.codigoInsumo

  const linhaVazia = (r) => {
    for (let c = faixa.s.c; c <= faixa.e.c; c++) {
      if (celTexto(cel(r, c))) return false
    }
    return true
  }
  const somenteTexto = (r) => {
    if (!celTexto(cel(r, colInsumo))) return false
    for (let c = faixa.s.c; c <= faixa.e.c; c++) {
      if (c === colInsumo) continue
      if (celTexto(cel(r, c))) return false
    }
    return true
  }
  const ehDado = (r) => r >= dataStart && Boolean(celTexto(cel(r, colCodigo)))
  const ehLixo = (r) => r >= dataStart && !linhaVazia(r) && !ehDado(r) && !somenteTexto(r)

  const nrows = faixa.e.r + 1

  const runs = []
  for (let r = dataStart; r < nrows;) {
    if (somenteTexto(r)) {
      const inicio = r
      while (r < nrows && somenteTexto(r)) r++
      runs.push([inicio, r - 1])
    } else {
      r++
    }
  }

  const dadoMaisProximo = (idxInicial, direcao) => {
    let r = idxInicial + direcao
    while (r >= 0 && r < nrows) {
      if (ehDado(r)) return r
      if (ehLixo(r) || linhaVazia(r)) { r += direcao; continue }
      if (somenteTexto(r)) return null
      r += direcao
    }
    return null
  }

  const beforeMap = new Map()
  const afterMap = new Map()
  const avisos = []

  for (const [s, e] of runs) {
    const tamanho = e - s + 1
    if (tamanho === 2) {
      const anterior = dadoMaisProximo(s, -1)
      const proximo = dadoMaisProximo(e, 1)
      if (anterior != null) afterMap.set(anterior, celTexto(cel(s, colInsumo)))
      if (proximo != null) beforeMap.set(proximo, celTexto(cel(e, colInsumo)))
    } else if (tamanho === 1) {
      const anterior = dadoMaisProximo(s, -1)
      const proximo = dadoMaisProximo(s, 1)
      const anteriorVazio = anterior != null && !celTexto(cel(anterior, colInsumo))
      const proximoVazio = proximo != null && !celTexto(cel(proximo, colInsumo))
      if (anterior != null && proximo == null) {
        afterMap.set(anterior, celTexto(cel(s, colInsumo)))
      } else if (proximo != null && anterior == null) {
        beforeMap.set(proximo, celTexto(cel(s, colInsumo)))
      } else if (anteriorVazio && !proximoVazio) {
        afterMap.set(anterior, celTexto(cel(s, colInsumo)))
      } else if (proximoVazio && !anteriorVazio) {
        beforeMap.set(proximo, celTexto(cel(s, colInsumo)))
      } else {
        avisos.push(`Linha ${s + 1}: pedaço de nome "${celTexto(cel(s, colInsumo))}" ficou ambíguo (não deu pra saber se pertence ao item de cima ou de baixo) — confira esse item depois de importar.`)
      }
    } else {
      avisos.push(`Linha ${s + 1}: trecho de nome "${celTexto(cel(s, colInsumo))}" com ${tamanho} linhas seguidas não foi reconhecido automaticamente — confira esse item depois de importar.`)
    }
  }

  return { beforeMap, afterMap, avisos }
}
