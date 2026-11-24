/* ============================================================
   CASAMENTO DOS PACOTES DE PLANEJAMENTO SEMANAL
   Parte pura (sem leitor de PDF): separa "serviço - local", casa com os
   cadastros da obra e conta os dias da semana em que cada pacote vale.
   Usada pelo leitor de PDF (pdfPlanejamento.js) e pela planilha do Prumo.
   ============================================================ */

function normalizarComparar(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/\.+$/, '').replace(/\s+/g, ' ').trim()
}

export function dividirPacote(descricao) {
  const i = descricao.indexOf(' - ')
  if (i < 0) return { servicoTexto: descricao.trim(), localTexto: '' }
  return {
    servicoTexto: descricao.slice(0, i).trim(),
    localTexto: descricao.slice(i + 3).trim(),
  }
}

function casar(texto, lista) {
  if (!texto) return null
  const alvo = normalizarComparar(texto)
  return lista.find((item) => normalizarComparar(item.nome) === alvo) || null
}

/* O "RESPONSÁVEL" do PDF ("RDL PINTURA") raramente bate letra por
   letra com o nome cadastrado da empresa ("RDL pinturas") — plural,
   abreviação, etc. Tenta exato primeiro; sem isso, casa por conter
   um o outro (com mínimo de 4 letras, pra "FAMA" não virar alvo de
   qualquer coisa por acaso). Nomes genéricos do relatório
   ("TERCEIRIZADO") ou gente que ainda não foi cadastrada como
   empresa ("ORTEGA") não batem com nada — fica null de propósito,
   não inventa nem cria empresa sozinho (mesma regra do local: errar
   aqui contamina o cadastro pra obra toda). */
function casarEmpresa(texto, lista) {
  if (!texto) return null
  const alvo = normalizarComparar(texto)
  if (alvo.length < 4) return null
  const exato = lista.find((item) => normalizarComparar(item.nome) === alvo)
  if (exato) return exato
  const candidatos = lista.filter((item) => {
    const nome = normalizarComparar(item.nome)
    return nome.length >= 4 && (nome.includes(alvo) || alvo.includes(nome))
  })
  return candidatos.length === 1 ? candidatos[0] : null
}

/* Separado de lerPlanejamentoDoPDF pra poder re-rodar só o casamento
   depois que a pessoa cadastra um local que faltava, sem reler o PDF
   inteiro — é o que permite a tela oferecer "+ Cadastrar este local"
   direto na lista de problemas e o item virar válido na hora, assim
   que dados.locais atualizar. */
export function casarPacotes(itensBrutos, { servicos, locais, diasDaSemana, empresas }) {
  return itensBrutos.map((it) => {
    const { servicoTexto, localTexto } = dividirPacote(it.descricao)
    const servico = casar(servicoTexto, servicos)
    const local = casar(localTexto, locais)
    const empresa = casarEmpresa(it.responsavel, empresas || [])
    const diasAtivos = diasDaSemana.filter((d) => d >= it.data_inicio && d <= it.data_fim)

    const problemas = []
    if (!localTexto) problemas.push('não consegui separar o local do serviço')
    else if (!local) problemas.push(`local "${localTexto}" não está cadastrado nesta obra`)
    if (diasAtivos.length === 0) problemas.push('fora da semana selecionada')

    return {
      linha: it.linha,
      descricao: it.descricao,
      responsavel: it.responsavel,
      empresa,
      data_inicio: it.data_inicio,
      data_fim: it.data_fim,
      servicoTexto, servico,
      localTexto, local,
      diasAtivos,
      valido: problemas.length === 0,
      problemas,
    }
  })
}
