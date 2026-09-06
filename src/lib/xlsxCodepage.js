/* ============================================================
   Carrega o XLSX (SheetJS) já com a tabela de codepages registrada.

   Sem isso, uma planilha .xls antiga (formato binário BIFF, não o
   .xlsx baseado em XML/UTF-8) que não declara Unicode decodifica
   caractere acentuado errado — "ELABORAÇÃO" virava "ELABORA!O" numa
   importação real de Contratos. O pacote xlsx não inclui as tabelas
   de codepage por padrão (peso do bundle); precisa registrar à mão
   com set_cptable antes do primeiro XLSX.read/readFile.
   ============================================================ */

let carregado = null

export async function carregarXLSX() {
  if (!carregado) {
    carregado = (async () => {
      const [XLSX, cptable] = await Promise.all([
        import('xlsx'),
        import('xlsx/dist/cpexcel.full.mjs'),
      ])
      XLSX.set_cptable(cptable)
      return XLSX
    })()
  }
  return carregado
}

/* Assinatura dos dois formatos binários reais de planilha: OLE2
   (.xls de verdade, BIFF) e ZIP (.xlsx). Se o arquivo não começa com
   nenhuma das duas, não é um binário de planilha de verdade. */
const ASSINATURA_OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
const ASSINATURA_ZIP = [0x50, 0x4b, 0x03, 0x04]

function pareceBinarioDePlanilha(bytes) {
  const bate = (assinatura) => assinatura.every((b, i) => bytes[i] === b)
  return bate(ASSINATURA_OLE2) || bate(ASSINATURA_ZIP)
}

/* Lê um arquivo de planilha, cobrindo um caso real do ERP do Julio:
   o relatório sai com extensão ".xls" mas o conteúdo é uma TABELA
   HTML pura (sem <meta charset>), em Windows-1252/ANSI — nenhuma
   assinatura binária pra reconhecer. Passado direto pro SheetJS como
   bytes crus, ele assume UTF-8 pra esse HTML e cada acento vira
   "replacement character" (U+FFFD), sem volta depois de importado —
   foi o que corrompeu "ESCAVAÇÃO" e "m³" nos Contratos. A tabela de
   codepage do carregarXLSX() acima não ajuda aqui: ela só cobre a
   codificação de STRING dentro do formato binário BIFF, não texto
   HTML/XML, que o SheetJS sempre lê como UTF-8. Decodificar como
   Windows-1252 antes de entregar pro SheetJS resolve, porque todo o
   alfabeto latino acentuado usado nesses relatórios cabe nesse
   charset. Arquivo binário de verdade (OLE2/ZIP) segue no caminho de
   sempre, sem essa conversão. */
export async function lerWorkbook(arquivo, opcoes = {}) {
  const XLSX = await carregarXLSX()
  const buffer = await arquivo.arrayBuffer()
  if (pareceBinarioDePlanilha(new Uint8Array(buffer))) {
    return XLSX.read(buffer, { type: 'array', ...opcoes })
  }
  const texto = new TextDecoder('windows-1252').decode(buffer)
  return XLSX.read(texto, { type: 'string', ...opcoes })
}
