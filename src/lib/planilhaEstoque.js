/* ============================================================
   LEITOR DA PLANILHA DE ESTOQUE — importação de materiais

   A planilha do almoxarife (Controle de Estoque.xlsm) tem uma aba
   "Estoque" com Material / Unidade / ... / Estoque regulador. Só
   trazemos o CADASTRO do material (nome, unidade, mínimo) — não o
   saldo nem o histórico de entrada/saída, que ficam pra lançar pelo
   app a partir de agora (decisão do Julio: começar zerado, não
   herdar quantidade da planilha).

   A aba de verdade vem com uma área "usada" de mais de 1 milhão de
   linhas — formatação de coluna inteira que o Excel salvou como
   célula por célula, sem dado nenhum na maioria. sheet_to_json
   materializa isso tudo de uma vez (~15-30s só nisso); lendo célula
   por célula direto do objeto da planilha e cortando depois de um
   bloco de linhas em branco, a varredura cai pra milissegundos — o
   que sobra de demora é só o parse do arquivo em si. */

const ALIASES = {
  material: ['material', 'materia', 'nome', 'item', 'descricao', 'descrição'],
  unidade: ['unidade', 'un', 'und', 'unid'],
  minimo: ['estoque regulador', 'estoque minimo', 'estoque mínimo', 'minimo', 'mínimo', 'regulador'],
}

function normalizarTexto(s) {
  return String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

/* Linhas em branco seguidas antes de desistir de continuar procurando
   dado nesta aba. */
const LIMITE_LINHAS_VAZIAS = 200

export async function lerPlanilhaEstoque(arquivo) {
  const XLSX = await import('xlsx')
  const buffer = await arquivo.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })

  const nomeAba = wb.SheetNames.find((n) => normalizarTexto(n) === 'estoque') || wb.SheetNames[0]
  const ws = wb.Sheets[nomeAba]
  if (!ws || !ws['!ref']) return { itens: [], erroGeral: 'Não encontrei nenhuma aba com dados nesta planilha.' }

  const faixa = XLSX.utils.decode_range(ws['!ref'])

  /* Célula com erro de fórmula (#VALUE!, #REF!...) conta como vazia —
     sem isso, o valor numérico interno do CÓDIGO do erro (ex.: 15
     pra #VALUE!) seria lido como se fosse um dado de verdade. */
  const cel = (r, c) => {
    const celula = ws[XLSX.utils.encode_cell({ r, c })]
    if (!celula || celula.t === 'e') return ''
    return String(celula.w ?? celula.v ?? '').trim()
  }

  const cabecalho = []
  for (let c = faixa.s.c; c <= faixa.e.c; c++) cabecalho.push(normalizarTexto(cel(faixa.s.r, c)))
  const acharColuna = (lista) => {
    for (const alvo of lista) {
      const i = cabecalho.indexOf(alvo)
      if (i >= 0) return faixa.s.c + i
    }
    return -1
  }
  const colMaterial = acharColuna(ALIASES.material)
  const colUnidade = acharColuna(ALIASES.unidade)
  const colMinimo = acharColuna(ALIASES.minimo)

  if (colMaterial < 0) {
    return {
      itens: [],
      erroGeral: `Não reconheci a coluna do material na aba "${nomeAba}". Preciso de uma coluna chamada "Material".`,
    }
  }

  const itens = []
  let vaziasSeguidas = 0
  for (let r = faixa.s.r + 1; r <= faixa.e.r; r++) {
    const nome = cel(r, colMaterial)
    if (!nome) {
      vaziasSeguidas++
      if (vaziasSeguidas >= LIMITE_LINHAS_VAZIAS) break
      continue
    }
    vaziasSeguidas = 0
    const unidade = colUnidade >= 0 ? cel(r, colUnidade) : ''
    const minimoTexto = colMinimo >= 0 ? cel(r, colMinimo) : ''
    const minimo = minimoTexto ? Number(minimoTexto.replace(',', '.')) : null
    itens.push({
      linha: r + 1,
      nome,
      unidade: unidade || 'unid',
      estoque_minimo: minimo && !Number.isNaN(minimo) && minimo > 0 ? minimo : null,
    })
  }

  return { itens, erroGeral: null, aba: nomeAba }
}
