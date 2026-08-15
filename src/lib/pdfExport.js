/* ============================================================
   EXPORTAR RELATÓRIO — PDF com nome garantido no iPhone

   window.print() deixa o SISTEMA decidir o nome do arquivo ao
   "Salvar como PDF" — no Chrome de desktop ele respeita
   document.title (por isso o truque em RelatorioFolha funciona lá),
   mas no Safari do iPhone a tela de impressão ignora o título e usa
   outro nome, sempre "Prumo.pdf". Não existe workaround de JS pra
   isso — é assim que a Apple implementou a tela de impressão.

   A saída: só no iOS, GERA o PDF dentro do próprio app (html2canvas
   tira uma "foto" do relatório já formatado pra impressão — mesmo
   HTML, mesma folha — e html2pdf monta o arquivo com paginação) e
   baixa via <a download>, que o Safari respeita direitinho — o mesmo
   mecanismo que já usamos pros CSVs. Em qualquer outro navegador
   continua sendo window.print(), sem mudar nada que já funciona bem.
   ============================================================ */

function ehIOS() {
  return /iP(hone|od|ad)/.test(navigator.userAgent)
    // iPadOS 13+ se identifica como "MacIntel" — só o toque denuncia.
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

async function baixarRelatorioPDF() {
  const elemento = document.querySelector('.relatorio')
  if (!elemento) return { erro: 'Não encontrei o relatório desta tela.' }
  const nomeArquivo = elemento.dataset.arquivo || 'Prumo.pdf'

  const html2pdf = (await import('html2pdf.js')).default
  document.documentElement.classList.add('gerando-pdf')
  try {
    await html2pdf().set({
      filename: nomeArquivo,
      margin: 10,
      image: { type: 'jpeg', quality: 0.92 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    }).from(elemento).save()
    return {}
  } catch (err) {
    return { erro: `Não consegui gerar o PDF. ${err.message}` }
  } finally {
    document.documentElement.classList.remove('gerando-pdf')
  }
}

/* Chame isto no lugar de window.print() em qualquer botão de
   relatório — decide sozinho qual dos dois caminhos usar. Devolve
   {erro} quando algo dá errado (só no caminho do PDF gerado — o
   window.print() do navegador não tem como reportar erro pra cá). */
export async function imprimirOuGerarPDF() {
  if (!ehIOS()) { window.print(); return {} }
  return baixarRelatorioPDF()
}
