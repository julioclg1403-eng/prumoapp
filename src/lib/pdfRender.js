/* ============================================================
   RENDERIZAÇÃO DE PDF EM CANVAS — só usado pela Planta (Produtividade
   e Medição). Diferente dos outros leitores de PDF do app
   (pdfEstrutura/pdfCronograma/pdfTatico), que só EXTRAEM texto pra
   importar dado, aqui o PDF precisa aparecer na tela de verdade, pra
   marcar em cima. Mesmo setup de worker dos outros (pdfjs-dist já é
   dependência do projeto), duplicado aqui de propósito — são módulos
   carregados sob demanda (`import()`), juntar num só não pouparia
   nada e criaria uma dependência cruzada sem necessidade.
   ============================================================ */

import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

export async function carregarDocumentoPDF(url) {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error('Não consegui baixar a planta.')
  const bytes = await resp.arrayBuffer()
  return pdfjsLib.getDocument({ data: bytes }).promise
}

/* Renderiza a página `numeroPagina` (1-based) no `canvas` recebido,
   na largura `larguraAlvo` (px) — a escala é calculada a partir da
   largura natural da página, pra caber certinho no container sem
   distorcer. Devolve a altura resultante (o container usa isso pra
   dimensionar a camada de marcadores por cima). */
export async function renderizarPaginaPDF(pdfDoc, numeroPagina, canvas, larguraAlvo) {
  const pagina = await pdfDoc.getPage(numeroPagina)
  const viewportBase = pagina.getViewport({ scale: 1 })
  const escala = larguraAlvo / viewportBase.width
  const viewport = pagina.getViewport({ scale: escala })

  canvas.width = viewport.width
  canvas.height = viewport.height

  const contexto = canvas.getContext('2d')
  await pagina.render({ canvasContext: contexto, viewport }).promise

  return viewport.height
}
