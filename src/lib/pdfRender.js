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
   dimensionar a camada de marcadores por cima).

   `renderTaskRef` (opcional, um `useRef(null)`) é o que permite
   trocar de zoom rápido sem quebrar: o pdfjs-dist não aceita duas
   chamadas de render() ativas ao mesmo tempo no MESMO canvas — cada
   clique novo em +/− antes do anterior terminar lançava "Cannot use
   the same canvas during multiple render() operations". Cancelar o
   anterior antes de começar o próximo resolve. */
export async function renderizarPaginaPDF(pdfDoc, numeroPagina, canvas, larguraAlvo, renderTaskRef) {
  const pagina = await pdfDoc.getPage(numeroPagina)
  const viewportBase = pagina.getViewport({ scale: 1 })
  const escala = larguraAlvo / viewportBase.width
  const viewport = pagina.getViewport({ scale: escala })

  if (renderTaskRef?.current) {
    renderTaskRef.current.cancel()
    renderTaskRef.current = null
  }

  /* Celular com tela retina/alta densidade (devicePixelRatio 2-3x)
     borra a planta se o canvas só tiver 1 pixel real por pixel de
     CSS — reclamação do Julio ("qualidade ruim no mobile"). Desenha
     num canvas maior (backing store) e deixa o CSS (width:100% no
     JSX) encolher de volta pro tamanho visual certo — o navegador
     faz o downscale, que é o que dá nitidez. Capado em 2x: acima
     disso o ganho é imperceptível e o canvas fica pesado demais pra
     celular mais fraco. */
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(viewport.width * dpr)
  canvas.height = Math.round(viewport.height * dpr)

  const contexto = canvas.getContext('2d')
  const task = pagina.render({
    canvasContext: contexto, viewport,
    transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
  })
  if (renderTaskRef) renderTaskRef.current = task

  try {
    await task.promise
  } catch (e) {
    // Cancelado de propósito (zoom mudou de novo antes de terminar)
    // — não é um erro real, só o anterior perdendo a corrida.
    if (e?.name === 'RenderingCancelledException') return viewport.height
    throw e
  }
  if (renderTaskRef?.current === task) renderTaskRef.current = null

  return viewport.height
}
