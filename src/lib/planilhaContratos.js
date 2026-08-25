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

import { carregarXLSX } from './xlsxCodepage'

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

export async function lerPlanilhaContratos(arquivo) {
  const XLSX = await carregarXLSX()
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
