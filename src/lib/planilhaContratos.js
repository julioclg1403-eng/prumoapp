/* ============================================================
   LEITOR DA PLANILHA DE CONTRATOS — exportação "CONTRATOS-UAU" que
   o Julio baixa do sistema (ERP) dele. Cada linha é um item de
   serviço dentro de um contrato, com os campos do contrato inteiro
   (fornecedor, valor contratado, valor medido, saldo) repetidos em
   toda linha — mesmo formato "achatado" da planilha de Suprimentos.

   O cabeçalho já vem com o nome de coluna cru do banco deles
   (Cod_cont, Item_itens, Qtde_itens…), sem bloco de "Empresa:"/"Obra:"
   antes — mas a busca ainda varre as primeiras linhas por segurança,
   caso um dia venha um título extra.

   Chave de reimportação: CHAVECONTRATO (ex: "17-OBCEN-1-1", já único
   por Empresa-Obra-Contrato-Item na origem) — bate com o unique de
   `contract_items` no banco. Reimportar a mesma planilha (ou uma mais
   nova, com as medições atualizadas) atualiza a linha existente em
   vez de duplicar.

   Os campos "Retido" e "A Pagar" são um retrato do momento da
   importação — o próprio Julio confirmou que "a pagar" é uma medição
   em andamento que ainda não foi paga NA HORA em que a planilha foi
   baixada, e isso muda a cada nova importação. Por isso o app nunca
   deriva um "valor pago" a partir daí — só mostra os números crus,
   com a data da última importação ao lado, pra não inventar um saldo
   que a planilha não confirma. */

import { carregarXLSX, lerWorkbook } from './xlsxCodepage'

const ALIASES = {
  chave: ['chavecontrato'],
  codContrato: ['cod cont'],
  objetoContrato: ['objeto cont'],
  fornecedor: ['nome pes'],
  codFornecedor: ['codpes cont'],
  statusContrato: ['statuscont'],
  situacaoContrato: ['situacaocont'],
  totalContrato: ['totalcontrato'],
  saldoContrato: ['saldocontrato'],
  valorMedidoContrato: ['valormedido'],
  retido: ['retido'],
  aPagar: ['apagar'],
  itemNum: ['item itens'],
  codigoServico: ['serv itens'],
  descricaoItem: ['descr itens'],
  unidade: ['unid itens'],
  qtdeItem: ['qtde itens'],
  precoItem: ['preco itens'],
  subtotalItem: ['subtotal'],
  qtdeMedida: ['qtdeacomp'],
  valorMedidoItem: ['valoracomp'],
  qtdeAMedir: ['qtdeaacomp'],
  valorAMedir: ['valoraacomp'],
}

const LINHAS_PARA_ACHAR_CABECALHO = 10
const LIMITE_LINHAS_VAZIAS = 100

function normalizarTexto(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[.*/()_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

/* Lê o modelo do Prumo: um item por linha, sem coluna de chave. A chave
   (contrato-item) e os totais do contrato são calculados aqui, a partir
   das quantidades e preços; as colunas cinza da planilha (fórmulas) são
   ignoradas de propósito, porque o arquivo gerado nem sempre guarda o
   resultado calculado. */
const MARCA_EXEMPLO = '(exemplo)'

/* Número do modelo: usa o valor de verdade da célula. Só cai para texto
   quando a pessoa digitou o número como texto ("1.234,56" ou "1234.5"). */
function numeroModelo(cell) {
  if (!cell || cell.t === 'e') return null
  if (cell.t === 'n' && typeof cell.v === 'number') return cell.v
  const texto = String(cell.v ?? cell.w ?? '').trim().replace(/\s|R\$/g, '')
  if (!texto || texto === '-') return null
  const normal = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto
  const n = Number(normal)
  return Number.isNaN(n) ? null : n
}

function lerModeloPrumo({ cel, faixa, linhaCabecalho, cabecalho }) {
  const col = (...nomes) => {
    for (const n of nomes) { const i = cabecalho.indexOf(n); if (i >= 0) return faixa.s.c + i }
    return -1
  }
  const c = {
    contrato: col('contrato'), objeto: col('objeto do contrato'), fornecedor: col('fornecedor'),
    situacao: col('situacao do contrato'), item: col('item'), codServico: col('codigo do servico'),
    descricao: col('descricao do item'), unidade: col('unidade'),
    qtde: col('quantidade contratada'), preco: col('preco unitario r$', 'preco unitario'),
    medida: col('quantidade ja medida'),
  }
  if (c.contrato < 0 || c.descricao < 0 || c.qtde < 0 || c.preco < 0 || c.item < 0) {
    return { itens: [], erroGeral: 'Faltam colunas do modelo do Prumo (Contrato, Item, Descrição do item, Quantidade contratada e Preço unitário).' }
  }

  const itens = []
  const avisos = []
  const vistos = new Set()
  let vaziasSeguidas = 0
  for (let r = linhaCabecalho + 1; r <= faixa.e.r; r++) {
    const contrato = celTexto(cel(r, c.contrato))
    const descricao = celTexto(cel(r, c.descricao))
    if (contrato.toLowerCase().startsWith(MARCA_EXEMPLO)) continue
    if (!contrato && !descricao) {
      vaziasSeguidas++
      if (vaziasSeguidas >= LIMITE_LINHAS_VAZIAS) break
      continue
    }
    vaziasSeguidas = 0
    const nItem = numeroModelo(cel(r, c.item))
    const itemNum = nItem == null ? null : Math.round(nItem)
    const qtde = numeroModelo(cel(r, c.qtde))
    const preco = numeroModelo(cel(r, c.preco))
    if (!contrato || !descricao || itemNum == null || qtde == null || preco == null) {
      avisos.push(`Linha ${r + 1}: faltou contrato, item, descrição, quantidade ou preço. Ignorei esta linha.`)
      continue
    }
    const chave = `${contrato}-${itemNum}`
    if (vistos.has(chave)) {
      avisos.push(`Linha ${r + 1}: o item ${itemNum} do contrato ${contrato} já apareceu antes. Ignorei esta repetição.`)
      continue
    }
    vistos.add(chave)
    const medida = c.medida >= 0 ? (numeroModelo(cel(r, c.medida)) ?? 0) : 0
    itens.push({
      linha: r + 1,
      chave,
      cod_contrato: contrato,
      objeto_contrato: c.objeto >= 0 ? (celTexto(cel(r, c.objeto)) || null) : null,
      fornecedor: c.fornecedor >= 0 ? (celTexto(cel(r, c.fornecedor)) || null) : null,
      cod_fornecedor: null,
      status_contrato: c.situacao >= 0 ? (celTexto(cel(r, c.situacao)) || null) : null,
      situacao_contrato: null,
      retido: null,
      a_pagar: null,
      item_num: itemNum,
      codigo_servico: c.codServico >= 0 ? (celTexto(cel(r, c.codServico)) || null) : null,
      descricao_item: descricao,
      unidade: c.unidade >= 0 ? (celTexto(cel(r, c.unidade)) || null) : null,
      qtde_item: qtde,
      preco_item: preco,
      subtotal_item: round2(qtde * preco),
      qtde_medida: medida,
      valor_medido_item: round2(medida * preco),
      qtde_a_medir: round2(qtde - medida),
      valor_a_medir: round2((qtde - medida) * preco),
    })
  }

  /* Totais por contrato: somam os itens do próprio contrato. */
  const porContrato = new Map()
  for (const i of itens) {
    const t = porContrato.get(i.cod_contrato) || { total: 0, medido: 0 }
    t.total += i.subtotal_item; t.medido += i.valor_medido_item
    porContrato.set(i.cod_contrato, t)
  }
  for (const i of itens) {
    const t = porContrato.get(i.cod_contrato)
    i.total_contrato = round2(t.total)
    i.valor_medido_contrato = round2(t.medido)
    i.saldo_contrato = round2(t.total - t.medido)
  }
  if (!itens.length && !avisos.length) return { itens, erroGeral: 'Não encontrei nenhum item preenchido. Lembre de apagar só as linhas de exemplo e preencher a partir da linha 4.' }
  return { itens, erroGeral: null, avisos, modelo: 'prumo' }
}

const round2 = (n) => Math.round(n * 100) / 100

export async function lerPlanilhaContratos(arquivo) {
  const XLSX = await carregarXLSX()
  const wb = await lerWorkbook(arquivo, { cellDates: true })

  /* O modelo do Prumo tem a aba de instruções na frente e os dados na aba "Dados". */
  const nomeAba = wb.SheetNames.find((n) => normalizarTexto(n) === 'dados') || wb.SheetNames[0]
  const ws = wb.Sheets[nomeAba]
  if (!ws || !ws['!ref']) return { itens: [], erroGeral: 'Não encontrei nenhuma aba com dados nesta planilha.' }

  const faixa = XLSX.utils.decode_range(ws['!ref'])
  const cel = (r, c) => ws[XLSX.utils.encode_cell({ r, c })]

  const lerCabecalhoNaLinha = (r) => {
    const linha = []
    for (let c = faixa.s.c; c <= faixa.e.c; c++) linha.push(normalizarTexto(celTexto(cel(r, c))))
    return linha
  }

  /* Modelo do Prumo (planilha limpa, em português): tem prioridade
     quando os títulos dele aparecem; senão segue para o formato do sistema. */
  for (let r = faixa.s.r; r <= Math.min(faixa.e.r, faixa.s.r + LINHAS_PARA_ACHAR_CABECALHO); r++) {
    const linha = lerCabecalhoNaLinha(r)
    if (linha.includes('contrato') && linha.includes('descricao do item') && linha.includes('quantidade contratada')) {
      return { ...lerModeloPrumo({ cel, faixa, linhaCabecalho: r, cabecalho: linha }), aba: nomeAba }
    }
  }

  let linhaCabecalho = -1
  let cabecalho = []
  for (let r = faixa.s.r; r <= Math.min(faixa.e.r, faixa.s.r + LINHAS_PARA_ACHAR_CABECALHO); r++) {
    const linha = lerCabecalhoNaLinha(r)
    if (linha.includes('cod cont') && linha.includes('item itens')) {
      linhaCabecalho = r
      cabecalho = linha
      break
    }
  }
  if (linhaCabecalho < 0) {
    return { itens: [], erroGeral: 'Não achei a linha de cabeçalho (preciso das colunas "Cod_cont" e "Item_itens") nas primeiras linhas da planilha.' }
  }

  const acharColuna = (lista) => {
    for (const alvo of lista) {
      const i = cabecalho.indexOf(alvo)
      if (i >= 0) return faixa.s.c + i
    }
    return -1
  }
  const colunas = Object.fromEntries(Object.entries(ALIASES).map(([chave, lista]) => [chave, acharColuna(lista)]))

  if (colunas.chave < 0 || colunas.codContrato < 0 || colunas.descricaoItem < 0) {
    return { itens: [], erroGeral: 'Não reconheci as colunas "CHAVECONTRATO", "Cod_cont" e "Descr_itens" nesta planilha.' }
  }

  const itens = []
  let vaziasSeguidas = 0
  for (let r = linhaCabecalho + 1; r <= faixa.e.r; r++) {
    const chaveVal = celTexto(cel(r, colunas.chave))
    const codContrato = celTexto(cel(r, colunas.codContrato))
    if (!chaveVal || !codContrato) {
      vaziasSeguidas++
      if (vaziasSeguidas >= LIMITE_LINHAS_VAZIAS) break
      continue
    }
    vaziasSeguidas = 0
    itens.push({
      linha: r + 1,
      chave: chaveVal,
      cod_contrato: codContrato,
      objeto_contrato: celTexto(cel(r, colunas.objetoContrato)) || null,
      fornecedor: celTexto(cel(r, colunas.fornecedor)) || null,
      cod_fornecedor: celTexto(cel(r, colunas.codFornecedor)) || null,
      status_contrato: celTexto(cel(r, colunas.statusContrato)) || null,
      situacao_contrato: celTexto(cel(r, colunas.situacaoContrato)) || null,
      total_contrato: celNumero(cel(r, colunas.totalContrato)),
      saldo_contrato: celNumero(cel(r, colunas.saldoContrato)),
      valor_medido_contrato: celNumero(cel(r, colunas.valorMedidoContrato)),
      retido: celNumero(cel(r, colunas.retido)),
      a_pagar: celNumero(cel(r, colunas.aPagar)),
      item_num: celInteiro(cel(r, colunas.itemNum)),
      codigo_servico: celTexto(cel(r, colunas.codigoServico)) || null,
      descricao_item: celTexto(cel(r, colunas.descricaoItem)),
      unidade: celTexto(cel(r, colunas.unidade)) || null,
      qtde_item: celNumero(cel(r, colunas.qtdeItem)),
      preco_item: celNumero(cel(r, colunas.precoItem)),
      subtotal_item: celNumero(cel(r, colunas.subtotalItem)),
      qtde_medida: celNumero(cel(r, colunas.qtdeMedida)),
      valor_medido_item: celNumero(cel(r, colunas.valorMedidoItem)),
      qtde_a_medir: celNumero(cel(r, colunas.qtdeAMedir)),
      valor_a_medir: celNumero(cel(r, colunas.valorAMedir)),
    })
  }

  return { itens, erroGeral: null, aba: nomeAba }
}
