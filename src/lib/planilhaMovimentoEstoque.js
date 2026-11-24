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

import { carregarXLSX, lerWorkbook } from './xlsxCodepage'
import {
  abrirModelo, ehExemplo, texto as modeloTexto, numero as modeloNumero, dataISO as modeloData,
  normalizar as modeloNormalizar, LIMITE_LINHAS_VAZIAS as MODELO_LIMITE_VAZIAS,
} from './modeloPrumoLeitura'

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

/* Modelo do Prumo: o período fica na linha 2 ("Período do movimento: [de] até [até]")
   e cada material tem uma linha com entrada, saída, saldo e preço médio. */
function lerModeloPrumoMovimento(m) {
  const { faixa, cel, linhaCabecalho, col } = m
  let periodoInicio = null
  let periodoFim = null
  for (let r = faixa.s.r; r < linhaCabecalho && !periodoFim; r++) {
    for (let c = faixa.s.c; c <= faixa.e.c; c++) {
      if (modeloNormalizar(modeloTexto(cel(r, c))).replace(/:$/, '') === 'periodo do movimento') {
        periodoInicio = modeloData(cel(r, c + 1))
        periodoFim = modeloData(cel(r, c + 3))
        break
      }
    }
  }
  if (!periodoInicio || !periodoFim) {
    return { itens: [], erroGeral: 'Preencha o período na linha 2 da aba Dados (as duas datas, no formato dd/mm/aaaa).' }
  }
  if (periodoFim < periodoInicio) {
    return { itens: [], erroGeral: 'No período da linha 2, a data final está antes da inicial.' }
  }

  const c = {
    codigo: col('codigo'), nome: col('material'), unidade: col('unidade'),
    entrada: col('entrada no periodo'), saida: col('saida no periodo'),
    saldo: col('saldo em estoque'), preco: col('preco medio r$', 'preco medio'),
  }
  const arredonda = (n) => Math.round(n * 100) / 100
  const itens = []
  const avisos = []
  const codigos = new Set()
  let vazias = 0
  for (let r = linhaCabecalho + 1; r <= faixa.e.r; r++) {
    const codigo = modeloTexto(cel(r, c.codigo))
    const nome = modeloTexto(cel(r, c.nome))
    if (ehExemplo(codigo)) continue
    if (!codigo && !nome) {
      if (++vazias >= MODELO_LIMITE_VAZIAS) break
      continue
    }
    vazias = 0
    const saldo = c.saldo >= 0 ? modeloNumero(cel(r, c.saldo)) : null
    if (!codigo || !nome || saldo == null) {
      avisos.push(`Linha ${r + 1}: faltou o código, o material ou o saldo em estoque. Ignorei esta linha.`)
      continue
    }
    if (codigos.has(codigo)) { avisos.push(`Linha ${r + 1}: o código ${codigo} já apareceu antes. Ignorei esta repetição.`); continue }
    codigos.add(codigo)
    const preco = c.preco >= 0 ? modeloNumero(cel(r, c.preco)) : null
    itens.push({
      codigo,
      nome,
      unidade: (c.unidade >= 0 && modeloTexto(cel(r, c.unidade))) || '',
      qtde_entrada: arredonda(c.entrada >= 0 ? (modeloNumero(cel(r, c.entrada)) ?? 0) : 0),
      qtde_baixa: arredonda(c.saida >= 0 ? (modeloNumero(cel(r, c.saida)) ?? 0) : 0),
      saldo: arredonda(saldo),
      valor_total: arredonda(preco != null ? saldo * preco : 0),
      preco_medio: preco != null ? arredonda(preco) : null,
      lotes: 1,
    })
  }
  if (!itens.length) {
    return { itens, erroGeral: avisos[0] || 'Não encontrei nenhum material preenchido. Lembre de apagar só as linhas de exemplo e preencher a partir da linha 4.' }
  }
  return { itens, periodoInicio, periodoFim, erroGeral: null, avisos, modelo: 'prumo' }
}

export async function lerMovimentoEstoque(arquivo) {
  const XLSX = await carregarXLSX()
  const wb = await lerWorkbook(arquivo, { cellDates: true })

  const doModelo = abrirModelo(XLSX, wb, ['codigo', 'material', 'saldo em estoque'], { soAbaDados: true })
  if (doModelo) return { ...lerModeloPrumoMovimento(doModelo), aba: doModelo.nomeAba }

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
