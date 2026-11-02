/* ============================================================
   LEITURA DO GERENCIAL YACHT PELA ANA (assistente do Prumo).

   O painel mostra todos os números em texto, nas abas (tabela mês a
   mês de pago/a pagar/previsto, avanço físico previsto × realizado,
   medição da Caixa, fluxo, compras…). Em vez de recalcular tudo por
   fora (e correr o risco de dar número diferente do que o Julio vê),
   a Ana LÊ o texto do próprio painel: troca de aba, abre as tabelas
   recolhidas, lê, e devolve a aba em que o Julio estava.

   Só leitura: não grava nada, não importa nada, não clica em botão
   de ação. Só funciona com o painel aberto e destravado (admin +
   senha); a Ana nunca vê nem digita a senha.
   ============================================================ */

export const ABAS = {
  painel: 'Painel',
  orcamento_gasto: 'Orçamento × gasto',
  cronograma: 'Cronograma',
  linha_balanco: 'Linha de balanço',
  medicao_caixa: 'Medição Caixa',
  servicos: 'Serviços',
  fluxo: 'Fluxo',
  programacao_fluxo: 'Programação fluxo',
  compras: 'Compras',
  vinculos: 'Vínculos',
}

const norm = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

// primeira linha de cada tabela (pra devolver junto das linhas achadas e dar sentido aos números)
const CABECALHO = /^(Mês|Etapa \/ serviço|Serviço|Contrato \/ item|Insumo|Pedido|Item|Fornecedor)\b/

export async function lerAba(doc, { aba, busca, maxChars = 12000 } = {}) {
  const nomeAba = ABAS[aba]
  if (!nomeAba) return { erro: `Aba desconhecida. Use uma destas: ${Object.keys(ABAS).join(', ')}.` }

  const botoes = Array.from(doc.querySelectorAll('nav button'))
  const alvo = botoes.find((b) => norm(b.textContent) === norm(nomeAba))
  const principal = doc.getElementById('main')
  if (!alvo || !principal) return { erro: 'O painel ainda não terminou de abrir. Tente de novo em alguns segundos.' }

  const abaAnterior = botoes.find((b) => b.classList.contains('on'))
  alvo.click()
  await espera(700)
  doc.querySelectorAll('details').forEach((d) => { d.open = true }) // "Ver tabela" e afins vêm fechados
  await espera(150)

  const bruto = principal.innerText || ''
  const dataRef = doc.querySelector('.refbox input')?.value || null

  // devolve o painel pra aba em que a pessoa estava
  if (abaAnterior && abaAnterior !== alvo) abaAnterior.click()

  const linhas = bruto.split('\n').map((l) => l.replace(/\s+$/g, '')).filter((l) => l.trim())
  let texto
  let filtrado = false
  if (busca && String(busca).trim()) {
    const termo = norm(busca)
    const saida = []
    let cabecalho = null
    let cabecalhoEmitido = false
    linhas.forEach((l, i) => {
      if (CABECALHO.test(l.trim())) { cabecalho = l; cabecalhoEmitido = false }
      if (norm(l).includes(termo)) {
        if (cabecalho && !cabecalhoEmitido && l !== cabecalho) { saida.push(cabecalho); cabecalhoEmitido = true }
        saida.push(l)
        if (i + 1 < linhas.length && !norm(linhas[i + 1]).includes(termo) && linhas[i + 1].length < 140 && !CABECALHO.test(linhas[i + 1].trim())) saida.push(linhas[i + 1])
      }
    })
    // sem acerto: devolve o começo da aba, pra a Ana ver o que existe
    texto = saida.length ? [...new Set(saida)].join('\n') : `(nenhuma linha com "${busca}" nesta aba)\n${linhas.slice(0, 40).join('\n')}`
    filtrado = true
  } else {
    texto = linhas.join('\n')
  }

  const cortado = texto.length > maxChars
  return {
    aba: nomeAba,
    data_de_referencia_do_painel: dataRef,
    filtrado_por: filtrado ? busca : null,
    cortado,
    aviso: cortado ? 'Texto cortado: refine com "busca" (ex.: o mês "nov/26", o código "02.01" ou uma palavra).' : undefined,
    texto: texto.slice(0, maxChars),
  }
}
