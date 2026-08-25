/* ============================================================
   LEITOR DO "RELATÓRIO DE ESTOQUE" — exportação que o Julio baixa do
   UAU com o movimento de estoque de um período (entrada, baixa e
   saldo de cada insumo). Diferente da planilha antiga (planilhaEstoque.js,
   só cadastro/mínimo): esta traz números de verdade — é o que agora
   alimenta o saldo do estoque no app, substituindo o cálculo manual
   de entrada−saída.

   Cada LINHA da planilha é um LOTE (um "Proc.", ligado a uma compra
   específica), não um material — o mesmo insumo aparece em várias
   linhas quando foi comprado mais de uma vez no período (confirmado
   numa planilha real: "CABO FLEXÍVEL VERDE" em 3 linhas, Proc.
   diferentes). Por pedido do Julio, aqui elas já saem SOMADAS: uma
   linha só por (código, nome), com a entrada/baixa/saldo do período
   inteiro — não guarda lote a lote. O preço médio final é recalculado
   pela soma (Total ÷ Saldo), não uma média simples dos lotes, pra não
   distorcer quando um lote é bem maior que outro.

   Cabeçalho de coluna (linha "Proc. | Insumo | ... | Unidade | Qtde. |
   Baixa | ... | Estoque | Preço Médio | Total") não alinha 1-pra-1
   com o dado embaixo — célula mesclada desloca "Baixa" e "Total" uma
   e duas colunas pra direita do rótulo. Os deslocamentos abaixo
   (+1, +2) foram conferidos contra uma planilha real, célula por
   célula — não é chute.

   Linha sem Proc. E sem código não é dado (nota tipo "DENSIDADE" no
   meio da tabela, ou o rodapé "Total da Obra/Empresa/Geral" e a
   assinatura "UAU! Software..." no fim) — mesmo filtro que já existe
   nos outros leitores desta pasta: exige as duas colunas-chave
   preenchidas pra contar como linha de verdade.

   Chave de reimportação: (worksite_id, código, período-fim) — bate
   com o unique de `stock_movements`. Reimportar o MESMO período
   atualiza; um período novo (planilha mais recente) cria uma linha
   nova, preservando o histórico de cada importação ao longo do
   tempo — não sobrescreve o que já foi importado antes. */

import { carregarXLSX } from './xlsxCodepage'

const LINHAS_PARA_ACHAR_CABECALHO = 15

function normalizarTexto(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

function celTexto(cell) {
  if (!cell || cell.t === 'e') return ''
  return String(cell.w ?? cell.v ?? '').trim()
}

/* O valor numérico já vem pronto em `cell.v` (célula tipo 'n') nesta
   planilha — sem separador de milhar, ponto já é decimal ("300.00",
   "11.17"). Só cai pra texto quando a célula não é numérica de
   verdade (raro, mas mais seguro que confiar sempre em `.w`). */
function celNumero(cell) {
  if (!cell || cell.t === 'e') return 0
  if (cell.t === 'n' && typeof cell.v === 'number') return cell.v
  const texto = celTexto(cell)
  if (!texto || texto === '-') return 0
  const n = Number(texto)
  return Number.isNaN(n) ? 0 : n
}

const RE_DATA = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
function dataISO(texto) {
  const m = String(texto || '').trim().match(RE_DATA)
  if (!m) return null
  const [, d, mes, a] = m
  return `${a}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`
}

export async function lerMovimentoEstoque(arquivo) {
  const XLSX = await carregarXLSX()
  const buffer = await arquivo.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })

  const nomeAba = wb.SheetNames[0]
  const ws = wb.Sheets[nomeAba]
  if (!ws || !ws['!ref']) return { itens: [], erroGeral: 'Não encontrei nenhuma aba com dados nesta planilha.' }

  const faixa = XLSX.utils.decode_range(ws['!ref'])
  const cel = (r, c) => ws[XLSX.utils.encode_cell({ r, c })]

  // Período do relatório: linha "Período de : dd/mm/aaaa ... à dd/mm/aaaa"
  let periodoInicio = null
  let periodoFim = null
  for (let r = faixa.s.r; r <= Math.min(faixa.e.r, faixa.s.r + LINHAS_PARA_ACHAR_CABECALHO); r++) {
    for (let c = faixa.s.c; c <= faixa.e.c; c++) {
      if (normalizarTexto(celTexto(cel(r, c))) === 'periodo de :') {
        for (let cc = c + 1; cc <= faixa.e.c; cc++) {
          const t = celTexto(cel(r, cc))
          const iso = dataISO(t)
          if (iso && !periodoInicio) periodoInicio = iso
          else if (iso && !periodoFim) periodoFim = iso
        }
      }
    }
    if (periodoFim) break
  }
  if (!periodoFim) {
    return { itens: [], erroGeral: 'Não achei o "Período de:" no topo da planilha — preciso dele pra saber até quando este relatório vale.' }
  }

  // Linha de cabeçalho: tem "Proc." e "Insumo" e "Qtde" na mesma linha.
  let linhaCabecalho = -1
  let colProc = -1
  let colCodigo = -1
  for (let r = faixa.s.r; r <= Math.min(faixa.e.r, faixa.s.r + LINHAS_PARA_ACHAR_CABECALHO); r++) {
    const textos = []
    for (let c = faixa.s.c; c <= faixa.e.c; c++) textos.push(normalizarTexto(celTexto(cel(r, c))))
    const cProc = textos.indexOf('proc.')
    const cInsumo = textos.indexOf('insumo')
    const cQtde = textos.findIndex((t) => t.startsWith('qtde'))
    if (cProc >= 0 && cInsumo >= 0 && cQtde >= 0) {
      linhaCabecalho = r
      colProc = faixa.s.c + cProc
      colCodigo = faixa.s.c + cInsumo
      break
    }
  }
  if (linhaCabecalho < 0) {
    return { itens: [], erroGeral: 'Não achei a linha de cabeçalho (preciso das colunas "Proc.", "Insumo" e "Qtde.") nesta planilha.' }
  }

  // Deslocamentos conferidos contra uma exportação real (ver comentário no topo).
  const colNome = colCodigo + 1
  const colUnidade = colCodigo + 5
  const colQtde = colUnidade + 1
  const colBaixa = colQtde + 2
  const colEstoque = colBaixa + 1
  const colPreco = colEstoque + 1
  const colTotal = colPreco + 2

  const porCodigo = new Map()
  let vaziasSeguidas = 0
  for (let r = linhaCabecalho + 1; r <= faixa.e.r; r++) {
    const proc = celTexto(cel(r, colProc))
    const codigo = celTexto(cel(r, colCodigo))
    if (!proc || !codigo) {
      vaziasSeguidas++
      if (vaziasSeguidas >= 200) break
      continue
    }
    vaziasSeguidas = 0

    const nome = celTexto(cel(r, colNome)) || codigo
    const unidade = celTexto(cel(r, colUnidade))
    const qtdeEntrada = celNumero(cel(r, colQtde))
    const qtdeBaixa = celNumero(cel(r, colBaixa))
    const saldo = celNumero(cel(r, colEstoque))
    const valorTotal = celNumero(cel(r, colTotal))

    if (!porCodigo.has(codigo)) {
      porCodigo.set(codigo, { codigo, nome, unidade, qtdeEntrada: 0, qtdeBaixa: 0, saldo: 0, valorTotal: 0, lotes: 0 })
    }
    const acc = porCodigo.get(codigo)
    acc.qtdeEntrada += qtdeEntrada
    acc.qtdeBaixa += qtdeBaixa
    acc.saldo += saldo
    acc.valorTotal += valorTotal
    acc.lotes += 1
  }

  const itens = [...porCodigo.values()].map((m) => ({
    codigo: m.codigo,
    nome: m.nome,
    unidade: m.unidade,
    qtde_entrada: Math.round(m.qtdeEntrada * 100) / 100,
    qtde_baixa: Math.round(m.qtdeBaixa * 100) / 100,
    saldo: Math.round(m.saldo * 100) / 100,
    valor_total: Math.round(m.valorTotal * 100) / 100,
    preco_medio: m.saldo > 0 ? Math.round((m.valorTotal / m.saldo) * 100) / 100 : null,
    lotes: m.lotes,
  }))

  if (itens.length === 0) {
    return { itens: [], erroGeral: 'Encontrei a tabela, mas nenhuma linha com Proc. e código de insumo preenchidos.' }
  }
  return { itens, periodoInicio, periodoFim, erroGeral: null }
}
