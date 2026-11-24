/* ============================================================
   AJUDANTES PARA LER OS MODELOS DE PLANILHA DO PRUMO
   Os modelos (modelosPlanilha.js) têm uma aba "Dados" com o cabeçalho
   na linha 3 e linhas de exemplo marcadas com "(exemplo)". Estas funções
   encontram o cabeçalho, leem número, texto e data com o valor de
   verdade da célula (não o texto formatado) e ignoram os exemplos.
   Cada leitor (planilha*.js) só decide quais colunas usar.
   ============================================================ */

export const MARCA_EXEMPLO = '(exemplo)'
const LINHAS_PARA_ACHAR_CABECALHO = 12

export function normalizar(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[.*/()_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function texto(cell) {
  if (!cell || cell.t === 'e') return ''
  return String(cell.w ?? cell.v ?? '').trim()
}

/* Número: valor real da célula; só cai para texto quando a pessoa digitou
   como texto ("1.234,56" ou "1234.5"). */
export function numero(cell) {
  if (!cell || cell.t === 'e') return null
  if (cell.t === 'n' && typeof cell.v === 'number') return cell.v
  const t = String(cell.v ?? cell.w ?? '').trim().replace(/\s|R\$/g, '')
  if (!t || t === '-') return null
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = Number(normal)
  return Number.isNaN(n) ? null : n
}

export function inteiro(cell) {
  const n = numero(cell)
  return n == null ? null : Math.round(n)
}

/* Data: célula de data de verdade, ou texto dd/mm/aaaa, ou aaaa-mm-dd. */
export function dataISO(cell) {
  if (!cell || cell.t === 'e') return null
  if (cell.t === 'd' && cell.v instanceof Date) {
    const d = cell.v
    return [d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, '0'), String(d.getUTCDate()).padStart(2, '0')].join('-')
  }
  const t = String(cell.w ?? cell.v ?? '').trim()
  if (!t || t === '-') return null
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t)
  if (m) {
    let [, dia, mes, ano] = m
    if (ano.length === 2) ano = (Number(ano) < 70 ? '20' : '19') + ano
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

export const ehExemplo = (valor) => String(valor || '').trim().toLowerCase().startsWith(MARCA_EXEMPLO)

/* Escolhe a aba "Dados" do modelo (ou a primeira) e acha a linha de
   cabeçalho que contém todos os títulos exigidos. Devolve null quando
   a planilha não é o modelo do Prumo. */
export function abrirModelo(XLSX, wb, titulosExigidos, { soAbaDados = false } = {}) {
  const achada = wb.SheetNames.find((n) => normalizar(n) === 'dados')
  if (soAbaDados && !achada) return null
  const nomeAba = achada || wb.SheetNames[0]
  const ws = wb.Sheets[nomeAba]
  if (!ws || !ws['!ref']) return null
  const faixa = XLSX.utils.decode_range(ws['!ref'])
  const cel = (r, c) => ws[XLSX.utils.encode_cell({ r, c })]
  for (let r = faixa.s.r; r <= Math.min(faixa.e.r, faixa.s.r + LINHAS_PARA_ACHAR_CABECALHO); r++) {
    const cabecalho = []
    for (let c = faixa.s.c; c <= faixa.e.c; c++) cabecalho.push(normalizar(texto(cel(r, c))))
    if (titulosExigidos.every((t) => cabecalho.includes(t))) {
      const col = (...nomes) => {
        for (const n of nomes) { const i = cabecalho.indexOf(n); if (i >= 0) return faixa.s.c + i }
        return -1
      }
      return { nomeAba, faixa, cel, linhaCabecalho: r, cabecalho, col }
    }
  }
  return null
}

export const LIMITE_LINHAS_VAZIAS = 100
