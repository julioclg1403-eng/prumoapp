/* ============================================================
   MODELOS DE PLANILHA DO PRUMO
   Cada importação do app tem aqui o seu modelo: uma planilha limpa,
   em português, com a logo do Prumo, instruções, exemplos e listas
   de opções. O cliente baixa, preenche e importa de volta.

   Estes modelos são do Prumo (não vêm de nenhum sistema de terceiros):
   quem usa o app de fora enxerga só a marca do Prumo. Os leitores
   (planilha*.js) reconhecem o modelo pelos títulos das colunas.

   Regra das linhas de exemplo: a primeira célula começa com
   "(exemplo)". Os leitores ignoram essas linhas.
   O ExcelJS só é carregado quando alguém clica em "Baixar modelo".
   ============================================================ */

export const MARCA_EXEMPLO = '(exemplo)'

const LARANJA = 'FFEA6E1F'
const GRAFITE = 'FF18181B'
const CINZA_CLARO = 'FFF4F4F5'
const CINZA_TEXTO = 'FF71717A'

const UNIDADES = ['m', 'm²', 'm³', 'kg', 't', 'un', 'vb', 'h', 'dia', 'mês', 'l', 'cj', 'pç', 'sc']

/* Cada modelo:
   - colunas: { titulo, obrigatoria, ajuda, largura, formato?, lista?, formula? }
     `formula` recebe o número da linha e devolve a fórmula (coluna calculada: o leitor ignora).
   - exemplos: linhas de exemplo (na ordem das colunas; colunas com fórmula ficam fora).
*/
export const MODELOS = {
  contratos: {
    titulo: 'Contratos e medição',
    arquivo: 'Prumo-modelo-contratos-e-medicao.xlsx',
    resumo: 'Um item de serviço por linha, com a quantidade contratada, o preço e quanto já foi medido.',
    passos: [
      'Preencha uma linha para cada item de serviço de cada contrato.',
      'Repita o código do contrato, o objeto e o fornecedor em todas as linhas do mesmo contrato.',
      'Em "Quantidade já medida" coloque o acumulado até hoje. Deixe em branco se ainda não mediu nada.',
      'As colunas cinza (subtotal, valor medido e saldo) calculam sozinhas. Não precisa preencher.',
      'Apague as linhas de exemplo e importe o arquivo em Contratos > Importar.',
      'Para atualizar a medição depois, mude só a coluna "Quantidade já medida" e importe de novo: os itens são atualizados, não duplicados.',
    ],
    colunas: [
      { titulo: 'Contrato', obrigatoria: true, ajuda: 'Código ou número do contrato.', largura: 12 },
      { titulo: 'Objeto do contrato', ajuda: 'O que o contrato cobre. Ex.: Alvenaria e revestimento.', largura: 30 },
      { titulo: 'Fornecedor', obrigatoria: true, ajuda: 'Empreiteiro ou fornecedor contratado.', largura: 26 },
      { titulo: 'Situação do contrato', ajuda: 'Em andamento, Concluído ou Suspenso.', largura: 18, lista: ['Em andamento', 'Concluído', 'Suspenso'] },
      { titulo: 'Item', obrigatoria: true, ajuda: 'Número do item dentro do contrato: 1, 2, 3...', largura: 8, formato: '0' },
      { titulo: 'Código do serviço', ajuda: 'Código interno do serviço, se houver.', largura: 14 },
      { titulo: 'Descrição do item', obrigatoria: true, ajuda: 'Nome do serviço. Ex.: Alvenaria de vedação 14 cm.', largura: 38 },
      { titulo: 'Unidade', ajuda: 'm², m³, kg, un, vb... (a lista sugere, mas pode escrever outra).', largura: 10, lista: UNIDADES },
      { titulo: 'Quantidade contratada', obrigatoria: true, ajuda: 'Quantidade total prevista no contrato para este item.', largura: 16, formato: '#,##0.00' },
      { titulo: 'Preço unitário (R$)', obrigatoria: true, ajuda: 'Preço de uma unidade, em reais.', largura: 16, formato: '#,##0.00' },
      { titulo: 'Quantidade já medida', ajuda: 'Acumulado medido até hoje (não é a medição do mês: é o total).', largura: 16, formato: '#,##0.00' },
      { titulo: 'Subtotal (R$)', calculada: true, largura: 15, formato: '#,##0.00', formula: (l) => `IF(AND(ISNUMBER(I${l}),ISNUMBER(J${l})),I${l}*J${l},"")` },
      { titulo: 'Valor medido (R$)', calculada: true, largura: 15, formato: '#,##0.00', formula: (l) => `IF(AND(ISNUMBER(K${l}),ISNUMBER(J${l})),K${l}*J${l},"")` },
      { titulo: 'Saldo a medir (R$)', calculada: true, largura: 15, formato: '#,##0.00', formula: (l) => `IF(AND(ISNUMBER(I${l}),ISNUMBER(J${l})),(I${l}-IF(ISNUMBER(K${l}),K${l},0))*J${l},"")` },
    ],
    exemplos: [
      [`${MARCA_EXEMPLO} 001`, 'Alvenaria e revestimento', 'Alvenaria Exemplo Ltda', 'Em andamento', 1, 'ALV-14', 'Alvenaria de vedação 14 cm', 'm²', 1200, 58.5, 480],
      [`${MARCA_EXEMPLO} 001`, 'Alvenaria e revestimento', 'Alvenaria Exemplo Ltda', 'Em andamento', 2, 'REB-INT', 'Reboco interno', 'm²', 2400, 32, 0],
    ],
  },
}

/* ── Geração do arquivo ───────────────────────────────────── */

async function carregarLogo() {
  try {
    const r = await fetch('/icon-192.png')
    if (!r.ok) return null
    return await r.arrayBuffer()
  } catch { return null }
}

function baixarBuffer(buffer, nome) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nome
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export async function baixarModelo(id) {
  const { buffer, arquivo } = await gerarModelo(id)
  baixarBuffer(buffer, arquivo)
}

/* Monta o arquivo (sem baixar). `logo` só existe para testes: o app
   sempre busca a logo do Prumo em /icon-192.png. */
export async function gerarModelo(id, { logo } = {}) {
  const modelo = MODELOS[id]
  if (!modelo) throw new Error('Modelo desconhecido.')
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Prumo'
  wb.created = new Date()

  const logoBuf = logo !== undefined ? logo : await carregarLogo()
  const logoId = logoBuf ? wb.addImage({ buffer: logoBuf, extension: 'png' }) : null

  /* Aba 1: instruções */
  const ins = wb.addWorksheet('Como preencher', { views: [{ showGridLines: false }] })
  ins.columns = [{ width: 26 }, { width: 14 }, { width: 62 }]
  ins.getRow(1).height = 46
  if (logoId != null) ins.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 44, height: 44 } })
  ins.mergeCells('B1:C1')
  const tit = ins.getCell('B1')
  tit.value = { richText: [{ text: 'Prumo', font: { bold: true, size: 22, color: { argb: GRAFITE } } }, { text: '.', font: { bold: true, size: 22, color: { argb: LARANJA } } }] }
  tit.alignment = { vertical: 'middle' }
  ins.mergeCells('A2:C2')
  ins.getCell('A2').value = `Modelo de planilha · ${modelo.titulo}`
  ins.getCell('A2').font = { bold: true, size: 15, color: { argb: GRAFITE } }
  ins.mergeCells('A3:C3')
  ins.getCell('A3').value = modelo.resumo
  ins.getCell('A3').font = { size: 11, color: { argb: CINZA_TEXTO } }
  ins.getCell('A3').alignment = { wrapText: true }
  ins.getRow(3).height = 30

  let l = 5
  ins.getCell(`A${l}`).value = 'PASSO A PASSO'
  ins.getCell(`A${l}`).font = { bold: true, size: 10, color: { argb: LARANJA } }
  l++
  modelo.passos.forEach((p, i) => {
    ins.mergeCells(`A${l}:C${l}`)
    ins.getCell(`A${l}`).value = `${i + 1}. ${p}`
    ins.getCell(`A${l}`).alignment = { wrapText: true, vertical: 'top' }
    ins.getRow(l).height = p.length > 95 ? 32 : 18
    l++
  })
  l++
  ins.getCell(`A${l}`).value = 'O QUE COLOCAR EM CADA COLUNA'
  ins.getCell(`A${l}`).font = { bold: true, size: 10, color: { argb: LARANJA } }
  l++
  ;['Coluna', 'Obrigatória?', 'O que colocar'].forEach((t, i) => {
    const c = ins.getCell(l, i + 1)
    c.value = t
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAFITE } }
  })
  l++
  modelo.colunas.forEach((c) => {
    ins.getCell(l, 1).value = c.titulo
    ins.getCell(l, 1).font = { bold: true }
    ins.getCell(l, 2).value = c.calculada ? 'Calcula sozinha' : c.obrigatoria ? 'Sim' : 'Não'
    ins.getCell(l, 3).value = c.calculada ? 'Não preencha: o Prumo e a planilha calculam.' : c.ajuda
    ins.getCell(l, 3).alignment = { wrapText: true }
    ins.getRow(l).height = (c.ajuda || '').length > 62 ? 30 : 18
    if (l % 2 === 0) for (let k = 1; k <= 3; k++) ins.getCell(l, k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA_CLARO } }
    l++
  })

  /* Aba 2: dados */
  const ws = wb.addWorksheet('Dados', { views: [{ state: 'frozen', ySplit: 3, showGridLines: true }] })
  ws.columns = modelo.colunas.map((c) => ({ width: c.largura || 16 }))
  ws.getRow(1).height = 40
  if (logoId != null) ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 38, height: 38 } })
  ws.mergeCells(1, 2, 1, Math.max(3, modelo.colunas.length))
  const t1 = ws.getCell(1, 2)
  t1.value = { richText: [{ text: 'Prumo', font: { bold: true, size: 16, color: { argb: GRAFITE } } }, { text: '.', font: { bold: true, size: 16, color: { argb: LARANJA } } }, { text: `   ${modelo.titulo}`, font: { size: 13, color: { argb: CINZA_TEXTO } } }] }
  t1.alignment = { vertical: 'middle' }
  ws.mergeCells(2, 1, 2, Math.max(3, modelo.colunas.length))
  ws.getCell(2, 1).value = 'Preencha a partir da linha 4. Apague as linhas de exemplo antes de importar. As colunas cinza calculam sozinhas.'
  ws.getCell(2, 1).font = { italic: true, size: 10, color: { argb: CINZA_TEXTO } }

  const cab = ws.getRow(3)
  cab.height = 34
  modelo.colunas.forEach((c, i) => {
    const cel = cab.getCell(i + 1)
    cel.value = c.titulo
    cel.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cel.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.calculada ? 'FF71717A' : c.obrigatoria ? LARANJA : GRAFITE } }
  })

  const LINHAS = 300
  const ncol = modelo.colunas.length
  const exemplos = modelo.exemplos || []
  for (let n = 0; n < LINHAS; n++) {
    const linha = 4 + n
    const row = ws.getRow(linha)
    const ex = exemplos[n]
    let k = 0
    modelo.colunas.forEach((c, i) => {
      const cel = row.getCell(i + 1)
      if (c.calculada) {
        cel.value = { formula: c.formula(linha) }
        cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA_CLARO } }
      } else if (ex) {
        cel.value = ex[k]
        cel.font = { italic: true, color: { argb: CINZA_TEXTO } }
        k++
      }
      if (c.formato) cel.numFmt = c.formato
      if (c.lista) cel.dataValidation = { type: 'list', allowBlank: true, formulae: [`"${c.lista.join(',')}"`], showErrorMessage: false }
      cel.border = { bottom: { style: 'hair', color: { argb: 'FFD4D4D8' } } }
    })
  }
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: ncol } }

  wb.views = [{ activeTab: 1 }]
  return { buffer: await wb.xlsx.writeBuffer(), arquivo: modelo.arquivo }
}
