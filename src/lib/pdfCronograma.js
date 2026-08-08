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
  descricao:   ['PACOTE + LOTE', 'PACOTE+LOTE', 'PACOTE E LOTE', 'DESCRIÇÃO', 'ATIVIDADE'],
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
  for (const linha of linhas) {
    const achado = {}
    for (const item of linha.itens) {
      const norm = normalizar(item.texto)
      for (const [coluna, alvos] of Object.entries(CABECALHOS)) {
        if (achado[coluna]) continue
        if (alvos.some((a) => norm === a || norm.startsWith(a))) achado[coluna] = item
      }
    }
    // Cabeçalho de verdade tem pelo menos estas quatro colunas juntas na mesma linha.
    if (achado.descricao && achado.responsavel && achado.inicio && achado.termino) {
      // A fronteira de cada coluna é o MEIO DO CAMINHO até o próximo título,
      // não a posição do título em si — um título curto ("Peso") numa coluna
      // larga fica centralizado, e usar a posição dele como início cortaria
      // texto do corpo que começa mais à esquerda, como aconteceu aqui.
      const ordemNaLinha = [...linha.itens].sort((a, b) => a.x - b.x)
      const limites = {}
      for (const [coluna, item] of Object.entries(achado)) {
        const i = ordemNaLinha.indexOf(item)
        const anterior = ordemNaLinha[i - 1]
        const proximo = ordemNaLinha[i + 1]
        limites[coluna] = {
          x0: anterior ? (anterior.x + item.x) / 2 : 0,
          x1: proximo ? (item.x + proximo.x) / 2 : item.x + 400,
        }
      }
      return { y: linha.y, limites }
    }
  }
  return null
}

/* ── Remonta as atividades a partir das linhas de dados ────────

   O ponto delicado: quando a descrição de um pacote quebra em
   duas linhas ("MARCAÇÃO + ESTRUTURA DE DRYWALL -" / "BLOCO
   VENDAS - GERAL."), a célula é centralizada verticalmente — a
   linha com data e responsável fica NO MEIO das duas, não acima
   nem abaixo das duas. Tentar "colar no vizinho de cima" ou "colar
   no vizinho de baixo" (as duas primeiras tentativas) sempre erra
   uma das duas metades.

   O que não falha é o TAMANHO do espaço: dentro de um mesmo
   pacote, a distância entre linhas é de uns 7pt; entre um pacote e
   o próximo, é de uns 16pt — mais que o dobro. Em vez de adivinhar
   uma direção, agrupo as linhas pelo SALTO: um espaço grande é
   fronteira entre atividades; um espaço pequeno é a mesma
   atividade continuando. */

const LIMIAR_ENTRE_ATIVIDADES = 11   // pt — maior que o espaço interno (~7), menor que o espaço entre pacotes (~16)

function remontarAtividades(linhas, cabecalho) {
  const abaixoDoCabecalho = [...linhas]
    .filter((l) => l.y < cabecalho.y - 1)
    .sort((a, b) => b.y - a.y)
  const fimRegiaoDatas = (cabecalho.limites.duracao?.x1 || cabecalho.limites.termino.x1 + 200)

  // 1) Agrupa as linhas em blocos: um salto de Y grande abre um
  //    bloco novo (uma atividade nova); um salto pequeno continua
  //    o bloco atual.
  const blocos = []
  let yAnterior = null
  for (const linha of abaixoDoCabecalho) {
    if (yAnterior === null || (yAnterior - linha.y) > LIMIAR_ENTRE_ATIVIDADES) {
      blocos.push([])
    }
    blocos[blocos.length - 1].push(linha)
    yAnterior = linha.y
  }

  // 2) Dentro de cada bloco, separa o texto por coluna (posição X).
  return blocos.map((bloco) => {
    const descFrags = []
    const respFrags = []
    const datas = []
    for (const linha of bloco) {
      for (const item of linha.itens) {
        const meio = item.x + item.largura / 2
        if (meio >= cabecalho.limites.descricao.x0 && meio < cabecalho.limites.descricao.x1) {
          descFrags.push({ y: linha.y, x: item.x, texto: item.texto })
        } else if (meio >= cabecalho.limites.responsavel.x0 && meio < cabecalho.limites.responsavel.x1) {
          respFrags.push(item.texto)
        } else if (meio >= cabecalho.limites.inicio.x0 && meio < fimRegiaoDatas) {
          const d = dataDoTexto(item.texto)
          if (d) datas.push(d)
        }
      }
    }
    descFrags.sort((a, b) => b.y - a.y || a.x - b.x)
    return {
      descricao: descFrags.map((f) => f.texto).join(' ').replace(/\s+/g, ' ').trim(),
      responsavel: respFrags.join(' ').replace(/\s+/g, ' ').trim(),
      datas,
    }
  })
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
