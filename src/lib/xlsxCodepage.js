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
