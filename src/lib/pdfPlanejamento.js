/* ============================================================
   PLANEJAMENTO A PARTIR DO PDF SEMANAL

   O relatório semanal é o MESMO relatório operacional mensal,
   só que mostrando apenas os dias daquela janela — as atividades
   que cruzam com ela. Por isso reaproveita o leitor do Cronograma
   (lerCronogramaDoPDF): a tabela é idêntica, e já foi testada
   byte a byte contra o arquivo real.

   O que muda é o DESTINO: em vez de virar uma etapa do cronograma
   físico, cada atividade vira uma frente de serviço planejada em
   cada dia da SEMANA ESCOLHIDA NA TELA em que ela está ativa — o
   cruzamento entre [início, fim] do pacote e os 7 dias da semana
   que a pessoa estiver vendo no Planejamento. Não precisamos ler
   a grade de dias do PDF (que nem sempre marca por texto, às
   vezes é só cor de célula) — as datas de início/fim já bastam.

   O texto do pacote mistura serviço e local numa string só
   ("MARCAÇÃO + ESTRUTURA DE DRYWALL - BLOCO VENDAS - GERAL.").
   A divisão é pelo PRIMEIRO traço: tudo antes é o serviço, tudo
   depois é o local — e bate bem com o jeito que os locais desta
   obra já foram cadastrados (ex.: "Bloco Vendas - Geral").
   Testado contra o arquivo real: 11 dos 12 locais bateram.
   ============================================================ */

import { lerCronogramaDoPDF } from './pdfCronograma'

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

/* Devolve um item por PACOTE (não por dia) — a tela decide como
   desdobrar em dias. Serviço sem correspondência vale NULL (vai
   ser criado, como material novo na requisição). Local sem
   correspondência TAMBÉM vale null, mas esse não é criado sozinho:
   local é usado em toda a obra, então uma correspondência errada
   aqui contamina o seletor de local para todo mundo — fica
   marcado como problema, para a pessoa decidir. */
export async function lerPlanejamentoDoPDF(arquivo, { servicos, locais, diasDaSemana }) {
  const lido = await lerCronogramaDoPDF(arquivo)
  if (lido.erroGeral) return lido

  const itens = lido.itens.map((it) => {
    const { servicoTexto, localTexto } = dividirPacote(it.descricao)
    const servico = casar(servicoTexto, servicos)
    const local = casar(localTexto, locais)
    const diasAtivos = diasDaSemana.filter((d) => d >= it.data_inicio && d <= it.data_fim)

    const problemas = []
    if (!localTexto) problemas.push('não consegui separar o local do serviço')
    else if (!local) problemas.push(`local "${localTexto}" não está cadastrado nesta obra`)
    if (diasAtivos.length === 0) problemas.push('fora da semana selecionada')

    return {
      linha: it.linha,
      descricao: it.descricao,
      responsavel: it.responsavel,
      data_inicio: it.data_inicio,
      data_fim: it.data_fim,
      servicoTexto, servico,
      localTexto, local,
      diasAtivos,
      valido: problemas.length === 0,
      problemas,
    }
  })

  return { itens, erroGeral: null }
}
