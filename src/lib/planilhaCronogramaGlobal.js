/* ============================================================
   LEITOR DO CRONOGRAMA GLOBAL — planilha mestre do setor de
   planejamento (uma linha por pacote de trabalho/tarefa).

   Cada linha tem um ID externo (do sistema deles) que serve de chave
   pra reimportar depois: quando o setor manda uma versão nova da
   planilha, dá pra casar cada linha com a que já existe aqui pelo
   ID, sem depender do texto da descrição bater igualzinho.
   ============================================================ */

import { carregarXLSX } from './xlsxCodepage'

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

export async function lerCronogramaGlobal(arquivo) {
  const XLSX = await carregarXLSX()
  const buffer = await arquivo.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })

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
