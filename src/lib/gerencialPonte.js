/* ============================================================
   PONTE GERENCIAL ↔ PRUMO.

   O painel do Gerencial Yacht roda numa moldura (iframe) da mesma
   origem do Prumo. Por isso o Prumo consegue, SEM mexer no painel:
     • perceber quando um arquivo é anexado nele (campo de arquivo ou
       arrastar e soltar);
     • identificar o arquivo com as próprias funções de leitura do
       painel (window.YP.identify);
     • montar o cronograma já tratado (sem as linhas duplicadas que
       o painel descarta) pra Linha de balanço do Início.

   O que sai do Gerencial pra fora é só CRONOGRAMA. Valores em
   dinheiro nunca saem daqui.
   ============================================================ */

/* Cronograma tratado do mesmo jeito que o painel trata (dedup) — formato
   enxuto, só o que a Linha de balanço usa. */
export function tarefasDoPainel(win, crono) {
  const { tasks, dupTasks } = win.YM.dedupTasks(crono.tasks)
  const tarefas = tasks.map((t) => ({
    t: t.t, l: t.l, g: win.YM.discOf(t.pre),
    i: t.i || null, f: t.f || null, bi: t.bi || null, bf: t.bf || null, ri: t.ri || null, rf: t.rf || null,
  }))
  const locais = win.YM.lotOrder(new Set(tasks.map((t) => t.l)))
  return {
    tarefas, locais,
    geradoEm: crono.gerado || null,
    // IDs das linhas que o painel descarta (resumo e repetições do Blocão): não devem entrar no Planejamento Global
    idsDuplicados: new Set(dupTasks.map((t) => String(t.id))),
  }
}

/* O cronograma que já vem embutido no painel (a "foto" de quando ele foi gerado). */
export function cronoEmbutido(doc) {
  const el = doc.getElementById('raw-data')
  if (!el) return null
  try { return JSON.parse(el.textContent).crono || null } catch { return null }
}

/* Avisa a cada arquivo anexado dentro do painel. Devolve a função que desliga. */
export function observarArquivos(doc, aoArquivo) {
  const entregar = (lista) => { Array.from(lista || []).forEach((f) => aoArquivo(f)) }
  const aoMudar = (e) => {
    const el = e.target
    if (el && el.tagName === 'INPUT' && el.type === 'file') entregar(el.files)
  }
  const aoSoltar = (e) => { if (e.dataTransfer && e.dataTransfer.files) entregar(e.dataTransfer.files) }
  doc.addEventListener('change', aoMudar, true)
  doc.addEventListener('drop', aoSoltar, true)
  return () => {
    doc.removeEventListener('change', aoMudar, true)
    doc.removeEventListener('drop', aoSoltar, true)
  }
}

/* Que arquivo é esse?
   crono             → cronograma da Prevision (alimenta Início e Planejamento Global)
   compras           → Relação de Pedidos de Compras (alimenta Suprimentos)
   contratos         → CONTRATOS-UAU (alimenta o módulo Contratos)
   contratos-painel  → o "Relatório de Contratos" que só o painel lê (o Prumo precisa da CONTRATOS-UAU)
   outro             → Pagar&Pago, orçamento, fluxo, pesos, medição da Caixa… (só do painel) */
export async function classificarArquivo(win, file) {
  const nome = file.name || ''
  if (!/\.(xlsx|xlsm|xls)$/i.test(nome)) return { tipo: 'outro' }
  try {
    // a leitura do painel só aceita arquivo "do mundo dele" (a moldura): um File criado fora dela
    // (botão 📎 do Prumo) falha no JSZip, então reembrulha o mesmo conteúdo com o File da moldura
    const doPainel = new win.File([file], nome, { type: file.type, lastModified: file.lastModified })
    const r = await win.YP.identify(doPainel)
    if (r.kind === 'crono') return { tipo: 'crono', crono: r.data }
    if (r.kind === 'compras') return { tipo: 'compras' }
    if (r.kind === 'contratos') return { tipo: 'contratos-painel' }
    return { tipo: 'outro' }
  } catch {
    // não é nenhum dos arquivos do painel: pode ser a CONTRATOS-UAU do módulo Contratos
    try {
      const { lerPlanilhaContratos } = await import('./planilhaContratos')
      const lido = await lerPlanilhaContratos(file)
      if (lido.itens?.length) return { tipo: 'contratos' }
    } catch { /* não é */ }
    return { tipo: 'outro' }
  }
}
