/* ============================================================
   LEITOR DO PDF TÁTICO — extrai as pendências (restrições a
   remover) do "Planejamento Tático" que o setor de planejamento
   manda em PDF.

   Mesmo princípio de leitura por posição do pdfCronograma.js — mas
   é uma tabela diferente, com uma pegadinha a mais: qual linha é
   "desta semana" não vem escrito em lugar nenhum, é a COR DE FUNDO
   da linha inteira (vermelho claro = "A Resolver na Semana", ver
   a legenda do próprio relatório). Texto puro (getTextContent) não
   enxerga cor nenhuma — para isso é preciso ler a lista de operações
   gráficas da página (getOperatorList) e achar os retângulos
   pintados, computando a matriz de transformação (CTM) à mão, já
   que as coordenadas de um "constructPath" vêm no espaço de
   coordenadas de ANTES da transformação da página.

   Nesta versão do pdf.js, um retângulo pintado vem compilado num
   ÚNICO "constructPath" cujo primeiro argumento já É o código da
   operação de pintura (fill/eoFill/...), não uma operação 'fill'
   separada depois — por isso o código lê esse argumento direto,
   em vez de esperar por um 'fill' à parte.
   ============================================================ */

import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

const CABECALHOS = {
  servico:     ['LINHA DE PRODUÇÃO/SERVIÇO', 'LINHA DE PRODUCAO/SERVICO', 'SERVIÇO'],
  lote:        ['LOTE'],
  inicio:      ['INICIO DO SERVIÇO', 'INÍCIO DO SERVIÇO', 'INICIO DO SERVICO'],
  acao:        ['AÇÃO DE REMOÇÃO', 'ACAO DE REMOCAO'],
  responsavel: ['RESPONSÁVEL', 'RESPONSAVEL'],
  motivo:      ['MOTIVO'],
}

// Marcam onde as colunas que eu NÃO extraio (M.O / MAT. / EQP. /
// SEG. / OUT / STATUS) começam, só para elas não "desaparecerem"
// e o cálculo do meio do caminho esticar a coluna vizinha por cima
// delas — o mesmo problema já visto no leitor do Cronograma.
const MARCADORES_DE_FRONTEIRA = ['M.O', 'MAT.', 'EQP.', 'SEG.', 'OUT', 'STATUS']

// Linhas de legenda/título que se repetem no topo de cada página —
// não são dado nenhum, mas caem dentro da faixa de x de alguma
// coluna de verdade (ex.: "STATUS:" começa quase junto da coluna
// do serviço) e contaminariam a linha mais próxima se não fossem
// descartadas antes de remontar as atividades.
const LINHAS_DE_RUIDO = ['PLANEJAMENTO TÁTICO', 'STATUS:', 'RESOLVIDO NO PRAZO', 'RESOLVIDO FORA DO PRAZO',
  'NÃO RESOLVIDO', 'TIPO DE RESTRIÇÃO', 'A RESOLVER NA SEMANA', 'A RESOLVER NA QUINZENA', 'PÁGINA',
  ...Object.values(CABECALHOS).flat()]
  .map((s) => normalizar(s))

const COR_SEMANA = '#ffcccc'   // vermelho claro — "A Resolver na Semana", confirmado contra a legenda do próprio PDF

const RE_DATA = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/

function normalizar(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toUpperCase().trim()
}

function dataDoTexto(texto) {
  const m = String(texto || '').trim().match(RE_DATA)
  if (!m) return null
  const [, d, mes, a] = m
  const ano = a.length === 2 ? `20${a}` : a
  const iso = `${ano}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`
  const dt = new Date(Number(ano), Number(mes) - 1, Number(d))
  if (dt.getFullYear() !== Number(ano) || dt.getMonth() !== Number(mes) - 1 || dt.getDate() !== Number(d)) {
    return null
  }
  return iso
}

/* ── Extração bruta, uma página por vez (a cor é por página) ──── */

async function extrairPaginas(bytes) {
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise
  const paginas = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const pagina = await pdf.getPage(p)
    const conteudo = await pagina.getTextContent()
    const fragmentos = conteudo.items
      .map((item) => ({ texto: item.str.trim(), x: item.transform[4], y: item.transform[5], largura: item.width || 0 }))
      .filter((f) => f.texto)
    paginas.push({ fragmentos, faixasDeCor: await faixasDeCorDaPagina(pagina) })
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

/* ── Cor de fundo de cada linha — via lista de operações gráficas ─
   As coordenadas de um retângulo pintado vêm no espaço ANTES da
   matriz de transformação da página (CTM); preciso aplicar essa
   matriz à mão para elas caírem no mesmo sistema de coordenadas
   do texto (getTextContent já vem com a transformação embutida). */

function multiplicar(m1, m2) {
  return [
    m1[0] * m2[0] + m1[1] * m2[2], m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2], m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4], m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ]
}
function aplicar(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

const CODIGOS_DE_PREENCHIMENTO = new Set([
  pdfjsLib.OPS.fill, pdfjsLib.OPS.eoFill, pdfjsLib.OPS.fillStroke,
  pdfjsLib.OPS.eoFillStroke, pdfjsLib.OPS.closeFillStroke, pdfjsLib.OPS.closeEOFillStroke,
])

async function faixasDeCorDaPagina(pagina) {
  const opList = await pagina.getOperatorList()
  const nomesPorOp = {}
  for (const [nome, cod] of Object.entries(pdfjsLib.OPS)) nomesPorOp[cod] = nome

  const retangulos = []
  let corAtual = null
  let ctm = [1, 0, 0, 1, 0, 0]
  const pilha = []
  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i]
    const args = opList.argsArray[i]
    const nome = nomesPorOp[fn]
    if (nome === 'save') {
      pilha.push(ctm)
    } else if (nome === 'restore') {
      ctm = pilha.pop() || ctm
    } else if (nome === 'transform') {
      ctm = multiplicar(args, ctm)
    } else if (nome === 'setFillRGBColor') {
      corAtual = args.slice(0, 3)
    } else if (nome === 'constructPath' && CODIGOS_DE_PREENCHIMENTO.has(args[0]) && corAtual) {
      const pontos = args[1]?.[0]
      if (!pontos) continue
      const vals = Object.values(pontos)
      const xs = []; const ys = []
      let j = 0
      while (j < vals.length) {
        if (vals[j] === 4) { j += 1; continue } // closePath, sem coordenadas
        const [dx, dy] = aplicar(ctm, vals[j + 1], vals[j + 2])
        xs.push(dx); ys.push(dy)
        j += 3
      }
      if (xs.length >= 4) {
        const x0 = Math.min(...xs); const x1 = Math.max(...xs)
        const y0 = Math.min(...ys); const y1 = Math.max(...ys)
        // Só interessam faixas que cobrem a largura toda da tabela
        // (o fundo da linha) — um retângulo estreito é outra coisa
        // (moldura de célula, sublinhado etc.), não a marcação de cor.
        if (x1 - x0 > 1000) {
          // setFillRGBColor nesta versão do pdf.js já entrega a cor
          // pronta como string CSS ("#ffcccc"), não como r/g/b 0-1.
          retangulos.push({ y0, y1, cor: corAtual[0] })
        }
      }
    }
  }
  return retangulos
}

function corDaLinha(y, faixasDeCor) {
  const faixa = faixasDeCor.find((f) => y >= f.y0 && y <= f.y1)
  return faixa?.cor || null
}

/* ── Acha as colunas a partir do cabeçalho (só existe na 1ª página) ── */

function acharColunas(linhasPagina1) {
  let melhor = null
  for (const linha of linhasPagina1) {
    const achado = {}
    for (const item of linha.itens) {
      const norm = normalizar(item.texto)
      if (!norm) continue
      for (const [coluna, alvos] of Object.entries(CABECALHOS)) {
        if (achado[coluna]) continue
        const bate = alvos.some((a) => norm === a || norm.startsWith(a) || (norm.length >= 4 && a.startsWith(norm)))
        if (bate) achado[coluna] = item
      }
    }
    if (achado.servico && achado.lote && achado.inicio && achado.acao && achado.responsavel) {
      if (!melhor || Object.keys(achado).length > Object.keys(melhor.achado).length) melhor = { linha, achado }
    }
  }
  if (!melhor) return null
  const { linha, achado } = melhor

  const pontos = [...Object.values(achado)]
  for (const item of linha.itens) {
    if (pontos.includes(item)) continue
    const norm = normalizar(item.texto)
    if (MARCADORES_DE_FRONTEIRA.includes(norm)) pontos.push(item)
  }
  pontos.sort((a, b) => a.x - b.x)

  const limites = {}
  for (const [coluna, item] of Object.entries(achado)) {
    const i = pontos.indexOf(item)
    const anterior = pontos[i - 1]
    const proximo = pontos[i + 1]
    limites[coluna] = {
      x0: anterior ? (anterior.x + item.x) / 2 : 0,
      x1: proximo ? (item.x + proximo.x) / 2 : item.x + 400,
    }
  }
  // "Início do serviço" é uma coluna estreita (só data curta,
  // "01/09/26") com um título comprido — o meio do caminho até o
  // título de "Ação de remoção" fica bem depois de onde os dados de
  // ação realmente começam (a coluna dela também é mais larga que o
  // título sugere), cortando o começo da ação. Dou pouco mais que a
  // largura de uma data à coluna de início, e o resto vai para a ação.
  if (limites.inicio && limites.acao) {
    const x1Estreito = achado.inicio.x + 90
    if (x1Estreito < limites.inicio.x1) {
      limites.inicio = { ...limites.inicio, x1: x1Estreito }
      limites.acao = { ...limites.acao, x0: x1Estreito }
    }
  }
  // Mesma história para "Status" (só um símbolo, sem largura de
  // texto de verdade) vs. "Motivo" — o meio do caminho até o
  // título fica um pouco depois de onde o texto do motivo começa.
  const statusItem = linha.itens.find((it) => normalizar(it.texto) === 'STATUS')
  if (statusItem && limites.motivo) {
    const x0Estreito = statusItem.x + 20
    if (x0Estreito < limites.motivo.x0) limites.motivo = { ...limites.motivo, x0: x0Estreito }
  }
  return { limites, yCabecalho: linha.y }
}

/* ── Remonta as pendências de uma página ──────────────────────── */

function linhaEhRuido(linha) {
  return linha.itens.some((it) => {
    const norm = normalizar(it.texto)
    return LINHAS_DE_RUIDO.some((r) => norm.includes(r))
  })
}

function remontarPagina(linhas, faixasDeCor, limites) {
  const uteis = linhas.filter((l) => !linhaEhRuido(l))

  const ancoras = []
  for (const linha of uteis) {
    for (const item of linha.itens) {
      if (item.x >= limites.inicio.x0 && item.x < limites.inicio.x1) {
        const d = dataDoTexto(item.texto)
        if (d) { ancoras.push({ y: linha.y, data: d, cor: corDaLinha(linha.y, faixasDeCor), campos: {} }); break }
      }
    }
  }
  if (ancoras.length === 0) return []

  const colunasDeTexto = ['servico', 'lote', 'acao', 'responsavel', 'motivo']
  for (const coluna of colunasDeTexto) {
    for (const ancora of ancoras) ancora.campos[coluna] = []
    const { x0, x1 } = limites[coluna]
    for (const linha of uteis) {
      for (const item of linha.itens) {
        if (item.x < x0 || item.x >= x1) continue
        let maisPerto = ancoras[0]
        let menorDistancia = Math.abs(ancoras[0].y - linha.y)
        for (const ancora of ancoras) {
          const distancia = Math.abs(ancora.y - linha.y)
          if (distancia < menorDistancia) { menorDistancia = distancia; maisPerto = ancora }
        }
        maisPerto.campos[coluna].push({ y: linha.y, x: item.x, texto: item.texto })
      }
    }
  }

  const juntar = (frags) => [...frags].sort((a, b) => b.y - a.y || a.x - b.x)
    .map((f) => f.texto).join(' ').replace(/\s+/g, ' ').trim()

  return ancoras.map((a) => ({
    servico: juntar(a.campos.servico),
    lote: juntar(a.campos.lote),
    data_inicio_servico: a.data,
    acao_remocao: juntar(a.campos.acao),
    responsavel: juntar(a.campos.responsavel) || null,
    motivo: juntar(a.campos.motivo) || null,
    cor: a.cor,
  }))
}

/* ── Função pública ───────────────────────────────────────────
   Só devolve as linhas marcadas em vermelho ("A Resolver na
   Semana") — é o que a tela usa. As outras cores (quinzena,
   resolvida) ficam de fora aqui; se um dia fizer falta, dá pra
   devolver todas e filtrar na tela. */
export async function lerTaticoDoPDF(arquivo) {
  const bytes = await arquivo.arrayBuffer()
  const paginas = await extrairPaginas(bytes)
  if (paginas.every((p) => p.fragmentos.length === 0)) {
    return { itens: [], erroGeral: 'Não consegui ler nenhum texto deste PDF. Ele pode ser uma imagem escaneada.' }
  }

  const linhasPagina1 = agruparEmLinhas(paginas[0].fragmentos)
  const colunas = acharColunas(linhasPagina1)
  if (!colunas) {
    return {
      itens: [], erroGeral: 'Não reconheci a tabela deste PDF. Preciso de colunas com os títulos "Linha de ' +
        'Produção/Serviço", "Lote", "Início do Serviço", "Ação de Remoção" e "Responsável".',
    }
  }

  const todasAsLinhas = paginas.flatMap((p) => remontarPagina(agruparEmLinhas(p.fragmentos), p.faixasDeCor, colunas.limites))
  const itens = todasAsLinhas
    .filter((l) => l.cor === COR_SEMANA && l.acao_remocao)
    .map((l, i) => ({ linha: i + 1, ...l }))

  if (itens.length === 0) {
    return { itens: [], erroGeral: 'Encontrei a tabela, mas nenhuma linha marcada em vermelho ("A Resolver na Semana").' }
  }
  return { itens, erroGeral: null }
}
