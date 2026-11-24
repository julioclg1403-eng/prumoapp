/* ============================================================
   LEITOR DO CRONOGRAMA GLOBAL — planilha mestre do setor de
   planejamento (uma linha por pacote de trabalho/tarefa).

   Cada linha tem um ID externo (do sistema deles) que serve de chave
   pra reimportar depois: quando o setor manda uma versão nova da
   planilha, dá pra casar cada linha com a que já existe aqui pelo
   ID, sem depender do texto da descrição bater igualzinho.
   ============================================================ */

import { carregarXLSX, lerWorkbook } from './xlsxCodepage'
import {
  abrirModelo, ehExemplo, texto as modeloTexto, dataISO as modeloData,
  LIMITE_LINHAS_VAZIAS as MODELO_LIMITE_VAZIAS,
} from './modeloPrumoLeitura'

const ALIASES = {
  codigo: ['id'],
  descricao: ['pacote de trabalho/tarefas', 'pacote de trabalho', 'tarefa', 'descricao', 'descrição'],
  lote: ['lote', 'local'],
  critico: ['caminho critico', 'caminho crítico'],
  inicio: ['data de inicio', 'data de início', 'inicio', 'início'],
  fim: ['data de termino', 'data de término', 'termino', 'término'],
  duracao: ['duracao', 'duração'],
  inicioReal: ['inicio real', 'início real'],
  fimReal: ['termino real', 'término real'],
  duracaoReal: ['duracao real', 'duração real'],
}

function normalizarTexto(s) {
  return String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

/* Prefere a data JÁ como objeto (cellDates:true faz o SheetJS
   entregar isso pra célula formatada como data) — bate certo
   independente de a planilha escrever no padrão americano (M/D/AA,
   como esta) ou brasileiro. Só cai pro texto quando não vem como
   data de verdade. */
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
    let [, mes, dia, ano] = m
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

const LIMITE_LINHAS_VAZIAS = 100

/* Modelo do Prumo: uma tarefa por linha. A duração sai das datas
   (dias corridos, contando o primeiro e o último). */
function lerModeloPrumoCronograma(m) {
  const { faixa, cel, linhaCabecalho, col } = m
  const c = {
    codigo: col('codigo'), tarefa: col('tarefa'), local: col('local'), critico: col('caminho critico'),
    inicio: col('data de inicio'), fim: col('data de termino'),
    inicioReal: col('inicio real'), fimReal: col('termino real'),
  }
  const dias = (a, b) => (a && b ? Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000) + 1 : null)
  const itens = []
  const avisos = []
  const codigos = new Set()
  let semData = 0
  let vazias = 0
  for (let r = linhaCabecalho + 1; r <= faixa.e.r; r++) {
    const descricao = modeloTexto(cel(r, c.tarefa))
    const primeira = modeloTexto(cel(r, c.codigo))
    if (ehExemplo(primeira) || ehExemplo(descricao)) continue
    if (!descricao) {
      if (++vazias >= MODELO_LIMITE_VAZIAS) break
      continue
    }
    vazias = 0
    const inicio = modeloData(cel(r, c.inicio))
    const fim = modeloData(cel(r, c.fim))
    if (!inicio || !fim) { semData++; continue }
    if (fim < inicio) { avisos.push(`Linha ${r + 1}: o término é antes do início. Ignorei esta linha.`); continue }
    const codigo = primeira || `L${r + 1}`
    if (codigos.has(codigo)) { avisos.push(`Linha ${r + 1}: o código ${codigo} já apareceu. Ignorei esta repetição.`); continue }
    codigos.add(codigo)
    const criticoTxt = c.critico >= 0 ? normalizarTexto(modeloTexto(cel(r, c.critico))) : ''
    const inicioReal = c.inicioReal >= 0 ? modeloData(cel(r, c.inicioReal)) : null
    const fimReal = c.fimReal >= 0 ? modeloData(cel(r, c.fimReal)) : null
    itens.push({
      linha: r + 1,
      codigo_externo: codigo,
      descricao,
      lote: c.local >= 0 ? (modeloTexto(cel(r, c.local)) || null) : null,
      caminho_critico: ['sim', 's', 'critica', 'critico'].includes(criticoTxt),
      data_inicio: inicio,
      data_fim: fim,
      duracao: dias(inicio, fim),
      inicio_real: inicioReal,
      fim_real: fimReal,
      duracao_real: dias(inicioReal, fimReal),
    })
  }
  if (!itens.length && !semData && !avisos.length) {
    return { itens, semData, erroGeral: 'Não encontrei nenhuma tarefa preenchida. Lembre de apagar só as linhas de exemplo e preencher a partir da linha 4.' }
  }
  return { itens, semData, erroGeral: null, avisos, modelo: 'prumo' }
}

export async function lerCronogramaGlobal(arquivo) {
  const XLSX = await carregarXLSX()
  const wb = await lerWorkbook(arquivo, { cellDates: true })

  const doModelo = abrirModelo(XLSX, wb, ['tarefa', 'data de inicio', 'data de termino'], { soAbaDados: true })
  if (doModelo) return { ...lerModeloPrumoCronograma(doModelo), aba: doModelo.nomeAba }

  const nomeAba = wb.SheetNames.find((n) => normalizarTexto(n) === 'activities') || wb.SheetNames[0]
  const ws = wb.Sheets[nomeAba]
  if (!ws || !ws['!ref']) return { itens: [], erroGeral: 'Não encontrei nenhuma aba com dados nesta planilha.' }

  const faixa = XLSX.utils.decode_range(ws['!ref'])
  const cel = (r, c) => ws[XLSX.utils.encode_cell({ r, c })]

  const cabecalho = []
  for (let c = faixa.s.c; c <= faixa.e.c; c++) cabecalho.push(normalizarTexto(celTexto(cel(faixa.s.r, c))))
  const acharColuna = (lista) => {
    for (const alvo of lista) {
      const i = cabecalho.indexOf(alvo)
      if (i >= 0) return faixa.s.c + i
    }
    return -1
  }
  const colunas = {
    codigo: acharColuna(ALIASES.codigo),
    descricao: acharColuna(ALIASES.descricao),
    lote: acharColuna(ALIASES.lote),
    critico: acharColuna(ALIASES.critico),
    inicio: acharColuna(ALIASES.inicio),
    fim: acharColuna(ALIASES.fim),
    duracao: acharColuna(ALIASES.duracao),
    inicioReal: acharColuna(ALIASES.inicioReal),
    fimReal: acharColuna(ALIASES.fimReal),
    duracaoReal: acharColuna(ALIASES.duracaoReal),
  }

  if (colunas.descricao < 0 || colunas.inicio < 0 || colunas.fim < 0) {
    return {
      itens: [],
      erroGeral: `Não reconheci as colunas na aba "${nomeAba}". Preciso pelo menos de "Pacote de trabalho/tarefas", "Data de Início" e "Data de Término".`,
    }
  }

  const itens = []
  let vaziasSeguidas = 0
  for (let r = faixa.s.r + 1; r <= faixa.e.r; r++) {
    const descricao = celTexto(cel(r, colunas.descricao))
    if (!descricao) {
      vaziasSeguidas++
      if (vaziasSeguidas >= LIMITE_LINHAS_VAZIAS) break
      continue
    }
    vaziasSeguidas = 0
    itens.push({
      linha: r + 1,
      codigo_externo: colunas.codigo >= 0 ? (celTexto(cel(r, colunas.codigo)) || String(r + 1)) : String(r + 1),
      descricao,
      lote: colunas.lote >= 0 ? (celTexto(cel(r, colunas.lote)) || null) : null,
      caminho_critico: colunas.critico >= 0 && normalizarTexto(celTexto(cel(r, colunas.critico))) === 'critica',
      data_inicio: colunas.inicio >= 0 ? celParaISO(cel(r, colunas.inicio)) : null,
      data_fim: colunas.fim >= 0 ? celParaISO(cel(r, colunas.fim)) : null,
      duracao: colunas.duracao >= 0 ? celNumero(cel(r, colunas.duracao)) : null,
      inicio_real: colunas.inicioReal >= 0 ? celParaISO(cel(r, colunas.inicioReal)) : null,
      fim_real: colunas.fimReal >= 0 ? celParaISO(cel(r, colunas.fimReal)) : null,
      duracao_real: colunas.duracaoReal >= 0 ? celNumero(cel(r, colunas.duracaoReal)) : null,
    })
  }

  const validos = itens.filter((i) => i.data_inicio && i.data_fim)
  const semData = itens.length - validos.length

  return { itens: validos, semData, erroGeral: null, aba: nomeAba }
}
