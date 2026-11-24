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

  suprimentos: {
    titulo: 'Pedidos de compra (Suprimentos)',
    arquivo: 'Prumo-modelo-pedidos-de-compra.xlsx',
    resumo: 'Um material por linha dentro de cada pedido de compra, com as datas de cada etapa até a entrega.',
    passos: [
      'Preencha uma linha para cada material de cada pedido. Repita o número do pedido nas linhas do mesmo pedido.',
      'As datas são opcionais: preencha as que já aconteceram. Quanto mais datas, mais completo fica o painel de prazos.',
      'Informe a situação do pedido (Criado, Aprovado, Comprado, Entregue...).',
      'As colunas cinza calculam sozinhas os dias entre pedido e compra, e entre compra e entrega.',
      'Apague as linhas de exemplo e importe o arquivo em Suprimentos > Importar.',
      'Atenção: a planilha deve trazer TODOS os pedidos que ainda estão em aberto. Pedido em aberto que não aparecer na planilha é removido do app na importação.',
      'Para atualizar depois, edite as datas e a situação e importe de novo: pedidos com o mesmo número e código do material são atualizados, não duplicados.',
    ],
    colunas: [
      { titulo: 'Pedido', obrigatoria: true, ajuda: 'Número do pedido de compra.', largura: 10, formato: '0' },
      { titulo: 'Código do material', obrigatoria: true, ajuda: 'Código interno do material. Junto com o pedido, identifica a linha.', largura: 16 },
      { titulo: 'Material', obrigatoria: true, ajuda: 'Nome do material. Ex.: Cimento CP-II 50 kg.', largura: 38 },
      { titulo: 'Quantidade', ajuda: 'Quantidade pedida.', largura: 12, formato: '#,##0.00' },
      { titulo: 'Preço unitário (R$)', ajuda: 'Preço de uma unidade, em reais.', largura: 16, formato: '#,##0.00' },
      { titulo: 'Data do pedido', ajuda: 'Quando o pedido foi feito (dd/mm/aaaa).', largura: 14, formato: 'dd/mm/yyyy' },
      { titulo: 'Data de aprovação', ajuda: 'Quando o pedido foi aprovado.', largura: 15, formato: 'dd/mm/yyyy' },
      { titulo: 'Data da cotação', ajuda: 'Quando a cotação foi confirmada.', largura: 14, formato: 'dd/mm/yyyy' },
      { titulo: 'Data da compra', ajuda: 'Quando a compra foi fechada.', largura: 14, formato: 'dd/mm/yyyy' },
      { titulo: 'Previsão de entrega', ajuda: 'Data prometida pelo fornecedor.', largura: 16, formato: 'dd/mm/yyyy' },
      { titulo: 'Data da entrega', ajuda: 'Quando o material chegou na obra.', largura: 14, formato: 'dd/mm/yyyy' },
      { titulo: 'Situação', ajuda: 'Criado, Aprovado, Em cotação, Comprado, Entregue ou Cancelado.', largura: 15, lista: ['Criado', 'Aprovado', 'Em cotação', 'Comprado', 'Entregue', 'Cancelado'] },
      { titulo: 'Dias: pedido até compra', calculada: true, largura: 15, formato: '0', formula: (l) => `IF(AND(ISNUMBER(G${l}),ISNUMBER(I${l})),I${l}-G${l},"")` },
      { titulo: 'Dias: compra até entrega', calculada: true, largura: 15, formato: '0', formula: (l) => `IF(AND(ISNUMBER(I${l}),ISNUMBER(K${l})),K${l}-I${l},"")` },
    ],
    exemplos: [
      [`${MARCA_EXEMPLO} 1024`, 'CIM-050', 'Cimento CP-II 50 kg', 400, 38.9, d('2026-11-03'), d('2026-11-04'), d('2026-11-05'), d('2026-11-06'), d('2026-11-12'), d('2026-11-11'), 'Entregue'],
      [`${MARCA_EXEMPLO} 1025`, 'ARE-M3', 'Areia média (m³)', 30, 120, d('2026-11-10'), d('2026-11-11'), null, null, d('2026-11-20'), null, 'Aprovado'],
    ],
  },

  cronograma: {
    titulo: 'Cronograma da obra (planejamento global)',
    arquivo: 'Prumo-modelo-cronograma.xlsx',
    resumo: 'Uma tarefa por linha, com as datas previstas e, quando já aconteceram, as datas reais.',
    passos: [
      'Preencha uma linha para cada tarefa ou pacote de trabalho da obra.',
      'Dê a cada tarefa um código único na primeira coluna (T-001, T-002...). É o código que permite atualizar a mesma tarefa quando você importar de novo.',
      'Informe a data de início e a de término previstas. Sem as duas datas a linha não entra.',
      'Quando a tarefa começar e terminar de verdade, preencha o início e o término reais.',
      'As colunas cinza calculam a duração em dias sozinhas.',
      'Apague as linhas de exemplo e importe o arquivo em Planejamento global > Importar.',
    ],
    colunas: [
      { titulo: 'Código', obrigatoria: true, ajuda: 'Código único da tarefa. Serve para atualizar a mesma tarefa em novas importações.', largura: 12 },
      { titulo: 'Tarefa', obrigatoria: true, ajuda: 'O que será feito. Ex.: Concretagem da laje do 2º pavimento.', largura: 40 },
      { titulo: 'Local', ajuda: 'Bloco, torre ou pavimento. Ex.: Torre 1.', largura: 22 },
      { titulo: 'Caminho crítico', ajuda: 'Sim, se a tarefa atrasar a obra inteira se atrasar.', largura: 15, lista: ['Sim', 'Não'] },
      { titulo: 'Data de início', obrigatoria: true, ajuda: 'Início previsto (dd/mm/aaaa).', largura: 15, formato: 'dd/mm/yyyy' },
      { titulo: 'Data de término', obrigatoria: true, ajuda: 'Término previsto (dd/mm/aaaa).', largura: 15, formato: 'dd/mm/yyyy' },
      { titulo: 'Duração (dias)', calculada: true, largura: 13, formato: '0', formula: (l) => `IF(AND(ISNUMBER(E${l}),ISNUMBER(F${l})),F${l}-E${l}+1,"")` },
      { titulo: 'Início real', ajuda: 'Quando a tarefa realmente começou.', largura: 14, formato: 'dd/mm/yyyy' },
      { titulo: 'Término real', ajuda: 'Quando a tarefa realmente terminou.', largura: 14, formato: 'dd/mm/yyyy' },
      { titulo: 'Duração real (dias)', calculada: true, largura: 14, formato: '0', formula: (l) => `IF(AND(ISNUMBER(H${l}),ISNUMBER(I${l})),I${l}-H${l}+1,"")` },
    ],
    exemplos: [
      [`${MARCA_EXEMPLO} T-001`, 'Concretagem da laje do 2º pavimento', 'Torre 1', 'Sim', d('2026-11-09'), d('2026-11-13'), d('2026-11-09'), d('2026-11-13')],
      [`${MARCA_EXEMPLO} T-002`, 'Alvenaria do 2º pavimento', 'Torre 1', 'Não', d('2026-11-16'), d('2026-12-04'), null, null],
    ],
  },

  estoque: {
    titulo: 'Cadastro de materiais do almoxarifado',
    arquivo: 'Prumo-modelo-materiais-do-almoxarifado.xlsx',
    resumo: 'Um material por linha, com a unidade e o estoque mínimo. O saldo você lança depois pelo app.',
    passos: [
      'Preencha uma linha para cada material que o almoxarifado controla.',
      'O estoque mínimo é a quantidade abaixo da qual o app deve avisar que está acabando. Pode deixar em branco.',
      'Esta planilha cadastra só o material, sem quantidade em estoque: o saldo vem das entradas e saídas que você lança no app.',
      'Apague as linhas de exemplo e importe o arquivo em Almoxarifado > Estoque > Importar.',
    ],
    colunas: [
      { titulo: 'Material', obrigatoria: true, ajuda: 'Nome do material. Ex.: Cimento CP-II 50 kg.', largura: 40 },
      { titulo: 'Unidade', ajuda: 'sc, un, m, m², kg... Se ficar em branco o app usa "unid".', largura: 12, lista: UNIDADES },
      { titulo: 'Estoque mínimo', ajuda: 'Quantidade mínima desejada. O app avisa quando o saldo ficar abaixo.', largura: 16, formato: '#,##0.00' },
    ],
    exemplos: [
      [`${MARCA_EXEMPLO} Cimento CP-II 50 kg`, 'sc', 40],
      [`${MARCA_EXEMPLO} Areia média`, 'm³', 6],
    ],
  },

  movimento: {
    titulo: 'Movimento de estoque do período',
    arquivo: 'Prumo-modelo-movimento-de-estoque.xlsx',
    resumo: 'O que entrou, o que saiu e quanto sobrou de cada material em um período (por exemplo, o mês).',
    periodo: true,
    passos: [
      'Preencha o período na linha 2 da aba Dados (data inicial e final). Todas as quantidades abaixo valem para esse período.',
      'Preencha uma linha para cada material: o que entrou, o que saiu e quanto ficou em estoque no fim do período.',
      'Informe o preço médio de uma unidade para o app calcular o valor parado em estoque.',
      'A coluna cinza calcula o valor do estoque sozinha.',
      'Apague as linhas de exemplo e importe o arquivo em Almoxarifado > Estoque > Importar movimento.',
      'Todo mês, gere uma nova planilha com o período novo: o histórico dos períodos anteriores é mantido.',
    ],
    colunas: [
      { titulo: 'Código', obrigatoria: true, ajuda: 'Código do material. Junto com o período, identifica a linha.', largura: 14 },
      { titulo: 'Material', obrigatoria: true, ajuda: 'Nome do material.', largura: 38 },
      { titulo: 'Unidade', ajuda: 'sc, un, m, m², kg...', largura: 11, lista: UNIDADES },
      { titulo: 'Entrada no período', ajuda: 'Quantidade que entrou no almoxarifado no período.', largura: 15, formato: '#,##0.00' },
      { titulo: 'Saída no período', ajuda: 'Quantidade que saiu (baixa) no período.', largura: 15, formato: '#,##0.00' },
      { titulo: 'Saldo em estoque', obrigatoria: true, ajuda: 'Quanto ficou no estoque no fim do período.', largura: 15, formato: '#,##0.00' },
      { titulo: 'Preço médio (R$)', ajuda: 'Preço médio de uma unidade, em reais.', largura: 15, formato: '#,##0.00' },
      { titulo: 'Valor em estoque (R$)', calculada: true, largura: 17, formato: '#,##0.00', formula: (l) => `IF(AND(ISNUMBER(F${l}),ISNUMBER(G${l})),F${l}*G${l},"")` },
    ],
    exemplos: [
      [`${MARCA_EXEMPLO} CIM-050`, 'Cimento CP-II 50 kg', 'sc', 400, 310, 90, 38.9],
      [`${MARCA_EXEMPLO} ARE-M3`, 'Areia média', 'm³', 30, 24, 6, 120],
    ],
  },
}

MODELOS.epi = {
  ...MODELOS.estoque,
  titulo: 'Cadastro de EPI',
  arquivo: 'Prumo-modelo-cadastro-de-epi.xlsx',
  resumo: 'Um EPI por linha, com a unidade e o estoque mínimo. O saldo você lança depois pelo app.',
  passos: [
    'Preencha uma linha para cada EPI que a obra controla (capacete, luva, bota...).',
    'O estoque mínimo é a quantidade abaixo da qual o app deve avisar que está acabando. Pode deixar em branco.',
    'Esta planilha cadastra só o EPI, sem quantidade em estoque: o saldo vem das entradas e entregas que você lança no app.',
    'Apague as linhas de exemplo e importe o arquivo em Segurança > Estoque de EPI > Importar.',
  ],
  colunas: MODELOS.estoque.colunas.map((c, i) => (i === 0 ? { ...c, titulo: 'Material', ajuda: 'Nome do EPI. Ex.: Capacete branco com jugular.' } : c)),
  exemplos: [
    [`${MARCA_EXEMPLO} Capacete branco com jugular`, 'un', 20],
    [`${MARCA_EXEMPLO} Luva de raspa`, 'par', 30],
  ],
}

/* Data de exemplo ao meio-dia (UTC), para não cair no dia errado em nenhum fuso. */
function d(iso) { return new Date(`${iso}T12:00:00Z`) }

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
  if (modelo.periodo) {
    /* Período que vale para a planilha toda: dois campos na linha 2. */
    const rotulo = ws.getCell(2, 1)
    rotulo.value = 'Período do movimento:'
    rotulo.font = { bold: true, color: { argb: LARANJA } }
    const campo = (col, valor) => {
      const c = ws.getCell(2, col)
      c.value = valor
      c.numFmt = 'dd/mm/yyyy'
      c.alignment = { horizontal: 'center' }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1E6' } }
      c.border = { top: { style: 'thin', color: { argb: LARANJA } }, bottom: { style: 'thin', color: { argb: LARANJA } }, left: { style: 'thin', color: { argb: LARANJA } }, right: { style: 'thin', color: { argb: LARANJA } } }
    }
    campo(2, null)
    ws.getCell(2, 3).value = 'até'
    ws.getCell(2, 3).alignment = { horizontal: 'center' }
    campo(4, null)
    ws.getCell(2, 5).value = '← preencha as duas datas (dd/mm/aaaa)'
    ws.getCell(2, 5).font = { italic: true, size: 10, color: { argb: CINZA_TEXTO } }
  } else {
    ws.mergeCells(2, 1, 2, Math.max(3, modelo.colunas.length))
    ws.getCell(2, 1).value = 'Preencha a partir da linha 4. Apague as linhas de exemplo antes de importar. As colunas cinza calculam sozinhas.'
    ws.getCell(2, 1).font = { italic: true, size: 10, color: { argb: CINZA_TEXTO } }
  }

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
