/* ============================================================
   LEITOR DO PDF DA ESTRUTURA DE CUSTOS (planejamento) — extrai a
   árvore Tipo → Etapa → Sub-etapa → Insumo do relatório que a UAU
   exporta (ex.: "FAMA-ESTRUTURA-UAU-IDEAL.pdf"), pra recadastrar
   tudo de uma vez quando a estrutura for atualizada, em vez de
   digitar item por item.

   Mesmo princípio de leitura por posição do pdfCronograma.js e do
   pdfTatico.js — três colunas (ESTRUTURA/CÓDIGO/DESCRIÇÃO), cabeçalho
   só na primeira página. Sem cor pra ler aqui (diferença do tático):
   o nível de cada linha (Tipo/Etapa/Sub-etapa/Insumo) já vem como
   texto na própria coluna da esquerda.

   A hierarquia é reconstruída pela ORDEM das linhas no PDF, não por
   indentação visual: cada Etapa pertence ao Tipo mais recente antes
   dela, cada Sub-etapa à Etapa mais recente, cada Insumo à Sub-etapa
   mais recente — é assim que o relatório da UAU está estruturado.
   Uma linha cujo nível eu não reconheço não vira registro novo: gruda
   a descrição na linha anterior (é uma descrição comprida que
   quebrou em duas linhas no PDF, não um item novo). */

import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

const CABECALHOS = {
  nivel: ['ESTUTURA', 'ESTRUTURA'],
  codigo: ['CODIGO'],
  nome: ['DESCRICAO'],
}

function normalizar(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toUpperCase().trim()
}

function nivelDoTexto(texto) {
  const n = normalizar(texto).replace(/[^A-Z]/g, '')
  if (n === 'TIPO') return 'tipo'
  if (n === 'ETAPA') return 'etapa'
  if (n === 'SUBETAPA') return 'sub_etapa'
  if (n === 'INSUMO') return 'insumo'
  return null
}

async function extrairPaginas(bytes) {
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise
  const paginas = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const pagina = await pdf.getPage(p)
    const conteudo = await pagina.getTextContent()
    const fragmentos = conteudo.items
      .map((item) => ({ texto: item.str.trim(), x: item.transform[4], y: item.transform[5] }))
      .filter((f) => f.texto)
    paginas.push(fragmentos)
  }
  return paginas
}

function agruparEmLinhas(fragmentos, tolerancia = 3) {
  const linhas = []
  const ordenados = [...fragmentos].sort((a, b) => b.y - a.y || a.x - b.x)
  let atual = null
  for (const item of ordenados) {
    if (atual && Math.abs(atual.y - item.y) <= tolerancia) {
      atual.itens.push(item)
      atual.y = (atual.y + item.y) / 2
    } else {
      atual = { y: item.y, itens: [item] }
      linhas.push(atual)
    }
  }
  return linhas
}

/* Acha as três colunas a partir do cabeçalho — só existe na 1ª página. */
function acharColunas(linhasPagina1) {
  let melhor = null
  for (const linha of linhasPagina1) {
    const achado = {}
    for (const item of linha.itens) {
      const norm = normalizar(item.texto)
      if (!norm) continue
      for (const [coluna, alvos] of Object.entries(CABECALHOS)) {
        if (achado[coluna]) continue
        if (alvos.some((a) => norm === a)) achado[coluna] = item
      }
    }
    if (achado.nivel && achado.codigo && achado.nome) { melhor = { linha, achado }; break }
  }
  if (!melhor) return null
  const { achado } = melhor
  const pontos = [achado.nivel, achado.codigo, achado.nome].sort((a, b) => a.x - b.x)

  const limites = {}
  for (const [coluna, item] of Object.entries(achado)) {
    const i = pontos.indexOf(item)
    const anterior = pontos[i - 1]
    const proximo = pontos[i + 1]
    limites[coluna] = {
      x0: anterior ? (anterior.x + item.x) / 2 : 0,
      x1: proximo ? (item.x + proximo.x) / 2 : item.x + 2000,
    }
  }
  return limites
}

function textoNaColuna(linha, x0, x1) {
  return linha.itens
    .filter((it) => it.x >= x0 && it.x < x1)
    .sort((a, b) => a.x - b.x)
    .map((it) => it.texto)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/* ── Função pública ───────────────────────────────────────────
   Devolve { itens, erroGeral }. Cada item já sai com `id` (gerado
   aqui) e `parent_id` calculado pela posição na árvore — pronto pra
   ir direto pra `dados.salvarEstruturaCustosEmLote`. */
export async function lerEstruturaDoPDF(arquivo) {
  const bytes = await arquivo.arrayBuffer()
  const paginas = await extrairPaginas(bytes)
  if (paginas.every((p) => p.length === 0)) {
    return { itens: [], erroGeral: 'Não consegui ler nenhum texto deste PDF. Ele pode ser uma imagem escaneada.' }
  }

  const linhasPagina1 = agruparEmLinhas(paginas[0])
  const limites = acharColunas(linhasPagina1)
  if (!limites) {
    return {
      itens: [], erroGeral: 'Não reconheci a tabela deste PDF. Preciso de colunas com os títulos ' +
        '"Estrutura", "Código" e "Descrição".',
    }
  }

  const todasAsLinhas = paginas.flatMap((p) => agruparEmLinhas(p))

  const itens = []
  let ultimoTipo = null
  let ultimaEtapa = null
  let ultimaSubEtapa = null
  let ultimoItem = null

  for (const linha of todasAsLinhas) {
    const textoNivel = textoNaColuna(linha, limites.nivel.x0, limites.nivel.x1)
    const nivel = nivelDoTexto(textoNivel)
    const codigo = textoNaColuna(linha, limites.codigo.x0, limites.codigo.x1) || null
    const nome = textoNaColuna(linha, limites.nome.x0, limites.nome.x1)

    if (!nivel) {
      // Não é uma linha de item reconhecida (cabeçalho, rodapé, ou
      // descrição que quebrou em duas linhas) — gruda no item anterior
      // em vez de criar um registro novo ou perder o texto.
      if (ultimoItem && nome) ultimoItem.nome = `${ultimoItem.nome} ${nome}`.trim()
      continue
    }
    if (!nome) continue

    const item = { id: crypto.randomUUID(), nivel, codigo, nome, parent_id: null }
    if (nivel === 'tipo') {
      item.parent_id = null
      ultimoTipo = item
    } else if (nivel === 'etapa') {
      item.parent_id = ultimoTipo?.id || null
      ultimaEtapa = item
    } else if (nivel === 'sub_etapa') {
      item.parent_id = ultimaEtapa?.id || null
      ultimaSubEtapa = item
    } else {
      item.parent_id = ultimaSubEtapa?.id || null
    }
    itens.push(item)
    ultimoItem = item
  }

  if (itens.length === 0) {
    return { itens: [], erroGeral: 'Encontrei a tabela, mas nenhuma linha com Tipo/Etapa/Sub-etapa/Insumo reconhecível.' }
  }
  return { itens, erroGeral: null }
}
