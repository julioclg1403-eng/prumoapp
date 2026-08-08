/* ============================================================
   LEITOR DE CSV — para importar o cronograma que a engenharia já
   mantém em planilha ou MS Project exportado.

   Detecta o separador sozinho (";" é o que o Excel em português usa;
   "," é o padrão internacional) contando qual aparece mais na
   primeira linha. Entende aspas, inclusive aspas escapadas (""), que
   é como o Excel escreve um campo que tem o separador dentro.
   ============================================================ */

function detectarSeparador(texto) {
  const primeiraLinha = texto.split(/\r\n|\n/)[0] || ''
  const pontoVirgula = (primeiraLinha.match(/;/g) || []).length
  const virgula = (primeiraLinha.match(/,/g) || []).length
  return pontoVirgula >= virgula ? ';' : ','
}

export function parseCSV(textoBruto) {
  const texto = String(textoBruto || '').replace(/^﻿/, '') // BOM do Excel
  if (!texto.trim()) return []
  const separador = detectarSeparador(texto)

  const linhas = []
  let linha = []
  let campo = ''
  let dentroDeAspas = false

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (dentroDeAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++ } else { dentroDeAspas = false }
      } else {
        campo += c
      }
      continue
    }
    if (c === '"') { dentroDeAspas = true; continue }
    if (c === separador) { linha.push(campo); campo = ''; continue }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      linha.push(campo); campo = ''
      linhas.push(linha); linha = []
      continue
    }
    campo += c
  }
  // Última linha, se o arquivo não terminar em quebra de linha.
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha) }

  return linhas.filter((l) => l.some((c) => c.trim() !== ''))
}
