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

import { dividirPacote, casarPacotes } from './planejamentoCasar'

export { dividirPacote, casarPacotes }

/* Devolve um item por PACOTE (não por dia) — a tela decide como
   desdobrar em dias. Serviço sem correspondência vale NULL (vai
   ser criado, como material novo na requisição). Local sem
   correspondência TAMBÉM vale null, mas esse não é criado sozinho:
   local é usado em toda a obra, então uma correspondência errada
   aqui contamina o seletor de local para todo mundo — fica
   marcado como problema, para a pessoa decidir (ou cadastrar ali
   mesmo, ver casarPacotes acima). */
export async function lerPlanejamentoDoPDF(arquivo, { servicos, locais, diasDaSemana, empresas }) {
  const lido = await lerCronogramaDoPDF(arquivo)
  if (lido.erroGeral) return lido

  const itens = casarPacotes(lido.itens, { servicos, locais, diasDaSemana, empresas })
  return { itens, itensBrutos: lido.itens, erroGeral: null }
}
