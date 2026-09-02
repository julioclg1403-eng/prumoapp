/* ============================================================
   LEITOR DO PDF OPERACIONAL — extrai o cronograma mensal do
   relatório em Gantt que o setor de planejamento manda em PDF.

   ÚNICA exceção às bibliotecas do projeto: ler PDF de verdade
   exige um leitor especializado, não dá para fazer na mão. Usamos
   a pdfjs-dist, a biblioteca da Mozilla, só para isto.

   COMO FUNCIONA — por posição, não por texto solto:
   O PDF não guarda linha e coluna, guarda texto solto em posições
   (x, y) na página. Tentar reconhecer as colunas só pelo conteúdo
   ("depois da descrição vem o responsável...") não é confiável:
   nomes e descrições têm tamanhos variados demais. Em vez disso:

   1. Acha a LINHA DE CABEÇALHO ("PACOTE + LOTE", "RESPONSAVEL"...)
      e usa a posição X de cada título para definir onde cada
      coluna começa e termina.
   2. Agrupa todo o resto do texto em LINHAS, pela posição Y.
   3. Para cada linha, decide a qual coluna cada pedaço de texto
      pertence, comparando o X dele com os limites do cabeçalho.
   4. Dentro de uma coluna, texto que quebrou em duas linhas visuais
      (a descrição do pacote é longa) é remendado de volta.

   Isso é o mesmo princípio de uma planilha impressa: a régua que
   importa é a do cabeçalho, não a ordem em que o texto aparece.
   ============================================================ */

import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

const CABECALHOS = {
  // "ATIVIDADE" não entra aqui: no arquivo semanal esse texto também
  // aparece solto na legenda ("TOTAL: 37 ATIVIDADES") e batia com
  // essa coluna por engano, roubando espaço da coluna responsável.
  descricao:   ['PACOTE + LOTE', 'PACOTE+LOTE', 'PACOTE E LOTE', 'DESCRIÇÃO'],
  responsavel: ['RESPONSAVEL', 'RESPONSÁVEL'],
  inicio:      ['INICIO', 'INÍCIO'],           // a coluna "início" pura, sem "META" nem "REAL" na frente
  termino:     ['TÉRMINO', 'TERMINO'],
  duracao:     ['DURAÇÃO', 'DURACAO'],
}

/* Dia da semana em três letras + data — "seg 06/07/26" — é o
   formato do relatório. Aceita opcionalmente vírgula/espaço extra. */
const RE_DATA = /\b(seg|ter|qua|qui|sex|s[áa]b|dom)\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/i

function normalizar(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toUpperCase().trim()
}

function dataDoTexto(texto) {
  const m = String(texto || '').match(RE_DATA)
  if (!m) return null
  const [, , d, mes, a] = m
  const ano = a.length === 2 ? `20${a}` : a
  const iso = `${ano}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`
  const dt = new Date(Number(ano), Number(mes) - 1, Number(d))
  if (dt.getFullYear() !== Number(ano) || dt.getMonth() !== Number(mes) - 1 || dt.getDate() !== Number(d)) {
    return null
  }
  return iso
}

/* ── Extração bruta: texto + posição de cada fragmento ──────── */

async function extrairFragmentos(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const fragmentos = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const pagina = await pdf.getPage(p)
    const conteudo = await pagina.getTextContent()
    conteudo.items.forEach((item) => {
      const texto = item.str.trim()
      if (!texto) return
      fragmentos.push({
        pagina: p,
        texto,
        x: item.transform[4],
        y: item.transform[5],
        largura: item.width || 0,
      })
    })
  }
  return fragmentos
}

/* ── Agrupa fragmentos em linhas pela posição Y ──────────────── */

function agruparEmLinhas(fragmentos, tolerancia = 3) {
  const porPagina = new Map()
  fragmentos.forEach((f) => {
    if (!porPagina.has(f.pagina)) porPagina.set(f.pagina, [])
    porPagina.get(f.pagina).push(f)
  })

  const linhas = []
  for (const [, itens] of porPagina) {
    const ordenados = [...itens].sort((a, b) => b.y - a.y || a.x - b.x)
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
  }
  return linhas
}

/* ── Acha o cabeçalho e define os limites de cada coluna ─────── */

function acharColunas(linhas) {
  let melhor = null

  for (const linha of linhas) {
    const achado = {}
    for (const item of linha.itens) {
      const norm = normalizar(item.texto)
      if (!norm) continue
      for (const [coluna, alvos] of Object.entries(CABECALHOS)) {
        if (achado[coluna]) continue
        // As duas direções importam: um relatório real veio com o
        // título "RESPONSAVEL" cortado ao meio ("RESPONS"), por causa
        // de uma quebra de linha estranha no PDF de origem. O guard de
        // 4 letras evita que um fragmento curto qualquer combine à toa.
        const bate = alvos.some((a) => norm === a || norm.startsWith(a)
          || (norm.length >= 4 && a.startsWith(norm)))
        if (bate) achado[coluna] = item
      }
    }
    // O mínimo para confiar que é a linha do cabeçalho: estas três
    // nunca vieram quebradas de um jeito irreconhecível nos arquivos
    // reais. "Pacote + Lote" (a descrição) às vezes vem — quando não
    // vem, cai no plano B logo abaixo.
    if (achado.responsavel && achado.inicio && achado.termino) {
      if (!melhor || Object.keys(achado).length > Object.keys(melhor.achado).length) {
        melhor = { linha, achado }
      }
    }
  }

  if (!melhor) return null
  const { linha, achado } = melhor

  // Se a descrição não tiver título reconhecível nesta linha, ela
  // ainda existe: é sempre a coluna mais à esquerda da tabela. Um
  // marcador virtual em x=0 garante que a fronteira entre ela e a
  // próxima coluna real seja calculada do mesmo jeito — o meio do
  // caminho — em vez de a coluna vizinha "comer" o espaço todo.
  if (!achado.descricao) achado.descricao = { x: 0, virtual: true }

  // O cabeçalho pode se espalhar por VÁRIAS linhas visuais — pra
  // cima ("META"/"REAL" às vezes vêm numa linha acima, como
  // super-título das colunas gêmeas "META INÍCIO"/"META TÉRMINO",
  // separado do "INÍCIO"/"TÉRMINO" de baixo) e pra baixo (mesmo
  // motivo de "RESPONSAVEL" virar "RESPONS" + "AVEL": o título
  // quebrou, ou "INÍCIO"/"TÉRMINO" repetidos como sub-rótulo da
  // META). Absorve enquanto a linha vizinha parecer continuação de
  // título (sem data, só fragmentos curtos) — para no primeiro
  // sinal de dado de verdade, nas duas direções.
  const ehLinhaDeTitulo = (l) => l.itens.every((it) => it.texto.length <= 10) && !l.itens.some((it) => dataDoTexto(it.texto))
  let yFinal = linha.y
  const abaixo = [...linhas].filter((l) => l.y < linha.y - 0.5).sort((a, b) => b.y - a.y)
  for (const l of abaixo) {
    if (!ehLinhaDeTitulo(l)) break
    yFinal = l.y
  }
  let yTopo = linha.y
  const acima = [...linhas].filter((l) => l.y > linha.y + 0.5).sort((a, b) => a.y - b.y)
  const blocoAcima = []
  for (const l of acima) {
    if (!ehLinhaDeTitulo(l)) break
    yTopo = l.y
    blocoAcima.push(l)
  }
  const blocoAbaixo = [...linhas].filter((l) => l.y < linha.y - 0.5 && l.y >= yFinal - 0.5)

  // A fronteira de cada coluna é o MEIO DO CAMINHO até o próximo
  // título de verdade — não até o próximo fragmento de texto
  // qualquer da linha, que pode ser um rótulo solto ("MÊS: 08/2026",
  // "TOTAL: 37 ATIVIDADES") sem relação nenhuma com a tabela.
  //
  // "Próximo título de verdade" inclui colunas que eu não extraio
  // ("META INÍCIO", "REAL TÉRMINO", "JUSTIFICATIVA", ou uma coluna
  // de código de 1 letra tipo "P") mas que EXISTEM de verdade na
  // tabela e ocupam espaço real entre as colunas que eu uso.
  // Ignorá-las faria a coluna vizinha esticar e engolir a data
  // errada — foi exatamente o que aconteceu num arquivo real: sem
  // contar "META INÍCIO", a coluna do responsável esticava até
  // dentro da primeira data. E sem contar a coluna de 1 letra, ela
  // esticava para o OUTRO lado e engolia o código da coluna vizinha.
  //
  // Esses marcadores podem estar em QUALQUER linha do bloco do
  // cabeçalho (não só na linha principal) — um relatório real tinha
  // "META"/"REAL" numa linha acima da de "INÍCIO"/"TÉRMINO", e sem
  // varrer essa linha também, a coluna "início" esticava pra
  // esquerda e engolia a data de "meta término" vizinha.
  const marcadoresDeFronteira = ['META', 'REAL', 'JUSTIFICATIVA']
  const ehColunaDeCodigo = (item) => normalizar(item.texto).length === 1
  const pontos = [...Object.values(achado)]
  const linhasDoBloco = [linha, ...blocoAcima, ...blocoAbaixo]
  for (const l of linhasDoBloco) {
    for (const item of l.itens) {
      if (pontos.includes(item)) continue
      const norm = normalizar(item.texto)
      if (marcadoresDeFronteira.some((m) => norm === m || norm.startsWith(m)) || ehColunaDeCodigo(item)) {
        pontos.push(item)
      }
    }
  }
  pontos.sort((a, b) => a.x - b.x)

  // O meio do caminho é a régua padrão — mas uma coluna de código
  // de 1 letra (valores curtos como "C", "A") não precisa de largura
  // nenhuma: dar a ela metade do espaço até a vizinha rouba o começo
  // do texto da coluna seguinte. Por isso a fronteira ao lado de uma
  // coluna de código fica colada nela, não no meio do caminho.
  const MARGEM_COLUNA_DE_CODIGO = 8
  function fronteira(a, b) {
    if (ehColunaDeCodigo(a) && !a.virtual) return a.x + MARGEM_COLUNA_DE_CODIGO
    if (ehColunaDeCodigo(b) && !b.virtual) return b.x - MARGEM_COLUNA_DE_CODIGO
    return (a.x + b.x) / 2
  }

  const limites = {}
  for (const [coluna, item] of Object.entries(achado)) {
    const i = pontos.indexOf(item)
    const anterior = pontos[i - 1]
    const proximo = pontos[i + 1]
    limites[coluna] = {
      x0: anterior ? fronteira(anterior, item) : 0,
      x1: proximo ? fronteira(item, proximo) : item.x + 400,
    }
  }

  return { y: yFinal, limites }
}

/* ── Remonta as atividades a partir das linhas de dados ────────

   O ponto delicado: quando a descrição de um pacote quebra em
   duas linhas, a linha com a DATA e o RESPONSÁVEL — a ÂNCORA da
   atividade — nem sempre fica no mesmo lugar em relação às duas.
   Num relatório real ela ficava centralizada, entre as duas linhas
   da descrição. Noutro (o semanal, mais compacto) ela fica no
   topo, e a quebra vem DEPOIS. Tentar adivinhar uma direção fixa
   ("cola no vizinho de cima", "cola no vizinho de baixo", "separa
   pelo tamanho do espaço") quebra sempre que o próximo arquivo é
   formatado diferente.

   O que nunca falha: um pedaço de texto solto pertence à âncora
   MAIS PERTO DELE, na distância vertical — não importa se ela está
   acima ou abaixo. Isso vale para célula centralizada, alinhada
   pelo topo, ou qualquer variação — e sobrevive até a espaçamentos
   tão apertados que uma quebra de linha fica mais perto da
   atividade seguinte do que da largura normal da própria linha. */

function remontarAtividades(linhas, cabecalho) {
  const abaixoDoCabecalho = [...linhas]
    .filter((l) => l.y < cabecalho.y - 1)
    .sort((a, b) => b.y - a.y)
  const fimRegiaoDatas = (cabecalho.limites.duracao?.x1 || cabecalho.limites.termino.x1 + 200)

  // 1) Âncoras: linhas com pelo menos duas datas reconhecidas —
  //    cada uma marca o "centro de gravidade" de uma atividade.
  //
  //    A tabela é alinhada à esquerda: um texto longo (uma descrição
  //    comprida) pode vir num único fragmento cuja largura ultrapassa
  //    a coluna dele e invade a próxima — o MEIO desse fragmento cai
  //    fora da coluna onde ele começou. Por isso a classificação usa
  //    a borda esquerda (item.x), não o meio: é ela que diz onde o
  //    texto foi de fato escrito, não até onde ele se estende.
  const ancoras = []
  for (const linha of abaixoDoCabecalho) {
    const datas = []
    for (const item of linha.itens) {
      if (item.x >= cabecalho.limites.inicio.x0 && item.x < fimRegiaoDatas) {
        const d = dataDoTexto(item.texto)
        if (d) datas.push(d)
      }
    }
    if (datas.length >= 2) {
      ancoras.push({ y: linha.y, datas, respFrags: [], descFrags: [] })
    }
  }
  if (ancoras.length === 0) return []

  // 2) Cada fragmento das colunas descrição e responsável, em
  //    QUALQUER linha (âncora ou não), vai para a âncora numericamente
  //    mais perto. O nome do responsável quebra em duas linhas do
  //    mesmo jeito que a descrição às vezes quebra ("JOSE" numa linha,
  //    "AMÉRICO" na de baixo) — por isso usa a mesma régua para as
  //    duas colunas, em vez de só ler o texto da própria linha-âncora.
  const rotear = (chave) => (linha, item) => {
    let maisPerto = ancoras[0]
    let menorDistancia = Math.abs(ancoras[0].y - linha.y)
    for (const ancora of ancoras) {
      const distancia = Math.abs(ancora.y - linha.y)
      if (distancia < menorDistancia) { menorDistancia = distancia; maisPerto = ancora }
    }
    maisPerto[chave].push({ y: linha.y, x: item.x, texto: item.texto })
  }
  const paraDescricao = rotear('descFrags')
  const paraResponsavel = rotear('respFrags')
  for (const linha of abaixoDoCabecalho) {
    for (const item of linha.itens) {
      if (item.x >= cabecalho.limites.descricao.x0 && item.x < cabecalho.limites.descricao.x1) {
        paraDescricao(linha, item)
      } else if (item.x >= cabecalho.limites.responsavel.x0 && item.x < cabecalho.limites.responsavel.x1) {
        paraResponsavel(linha, item)
      }
    }
  }

  const juntar = (frags) => [...frags].sort((a, b) => b.y - a.y || a.x - b.x)
    .map((f) => f.texto).join(' ').replace(/\s+/g, ' ').trim()

  return ancoras.map((ancora) => ({
    descricao: juntar(ancora.descFrags),
    responsavel: juntar(ancora.respFrags),
    datas: ancora.datas,
  }))
    .filter((a) => a.descricao && a.datas.length >= 2)
    .map((a, i) => {
      // As datas na região aparecem na ordem: meta início, meta término,
      // início, término[, real início[, real término]]. Uso início/término
      // (a 3ª e a 4ª) por serem a programação atual; se só houver duas
      // (meta = atual, caso comum quando nada foi reprogramado), uso essas.
      const [dataInicio, dataFim] = a.datas.length >= 4 ? a.datas.slice(2, 4) : a.datas.slice(0, 2)
      return {
        linha: i + 1,
        descricao: a.descricao,
        responsavel: a.responsavel || null,
        data_inicio: dataInicio,
        data_fim: dataFim,
        problemas: !dataInicio || !dataFim ? ['datas incompletas']
          : dataFim < dataInicio ? ['fim antes do início'] : [],
      }
    })
    .map((a) => ({ ...a, valido: a.problemas.length === 0 }))
}

/* ── Função pública ───────────────────────────────────────────
   Devolve sempre um resultado com o que foi entendido, para a
   tela mostrar em pré-visualização — nunca grava nada sozinho. */
export async function lerCronogramaDoPDF(arquivo) {
  const bytes = await arquivo.arrayBuffer()
  const fragmentos = await extrairFragmentos(bytes)
  if (fragmentos.length === 0) {
    return { itens: [], erroGeral: 'Não consegui ler nenhum texto deste PDF. Ele pode ser uma imagem escaneada.' }
  }

  const linhas = agruparEmLinhas(fragmentos)
  const cabecalho = acharColunas(linhas)
  if (!cabecalho) {
    return {
      itens: [],
      erroGeral: 'Não reconheci a tabela deste PDF. Preciso de colunas com os títulos "Pacote + Lote", ' +
        '"Responsável", "Início" e "Término" — o mesmo formato do relatório operacional mensal.',
    }
  }

  const itens = remontarAtividades(linhas, cabecalho)
  if (itens.length === 0) {
    return { itens: [], erroGeral: 'Encontrei a tabela, mas nenhuma linha com data válida abaixo dela.' }
  }
  return { itens, erroGeral: null }
}
