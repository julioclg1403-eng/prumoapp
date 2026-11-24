/* ============================================================
   DADOS FICTÍCIOS PARA MOSTRAR O RELATÓRIO NA PÁGINA DE VENDA
   Mesmo formato que o app lê do banco; nada aqui existe de verdade.
   As datas acompanham o dia de hoje, para a vitrine nunca parecer parada.
   ============================================================ */

import { hojeISO, somarDias } from './dominio'
import { montarRelatorioSemanal } from './relatorioSemanal'

export function htmlRelatorioExemplo() {
  const hoje = hojeISO()
  const obra = { id: 'o', nome: 'Residencial Aurora', endereco: 'Rua Exemplo, 100 — Cidade Exemplo' }
  const servicos = ['Formas de pilares e vigas', 'Armação de laje', 'Concretagem de laje', 'Alvenaria de vedação', 'Reboco interno', 'Contrapiso', 'Instalação elétrica'].map((nome, i) => ({ id: 's' + i, nome }))
  const locais = ['Torre 1 — 2º pavimento', 'Torre 1 — 3º pavimento', 'Térreo — área externa'].map((nome, i) => ({ id: 'l' + i, nome }))
  const empresas = [{ id: 'e1', nome: 'Alvenaria Exemplo Ltda' }, { id: 'e2', nome: 'Estruturas Exemplo' }]
  const planejamento = []
  const diarios = []
  for (let d = -6; d <= -1; d++) {
    const atividades = []
    for (let n = 1; n <= 3; n++) {
      const id = `p${d}_${n}`
      planejamento.push({ id, worksite_id: 'o', service_id: 's' + (((d + 6) * 3 + n) % 7), location_id: 'l' + (n % 3), company_id: n % 2 ? 'e1' : 'e2' })
      atividades.push({
        id: 'a' + id, planned_id: id, status: n === 1 ? 'concluida' : 'em_andamento',
        worker_ids: ['a', 'b', 'c'].slice(0, n + 1),
        observacao: d === -4 && n === 1 ? 'Não iniciada por causa da chuva' : null,
      })
    }
    diarios.push({
      worksite_id: 'o', data: somarDias(hoje, d), status: 'finalizado',
      clima: d === -4 ? 'Chuva pela manhã' : 'Bom',
      observacao: d === -1 ? 'Dia sem intercorrência relevante.' : null,
      presencas: Array.from({ length: 11 + (((d % 3) + 3) % 3) - 1 }, () => ({ presente: true })),
      atividades, fotos: d === -2 ? [{}, {}] : [],
      ocorrencias: d === -4 ? [{ tipo_id: 't1', descricao: 'Chuva forte até as 10h, serviço externo parado.' }] : [],
    })
  }
  return montarRelatorioSemanal({
    obra, org: { nome: 'Construtora Exemplo' }, de: somarDias(hoje, -6), ate: hoje,
    diarios, planejamento, servicos, locais, empresas,
    tiposOcorrencia: [{ id: 't1', nome: 'Condição climática' }],
    pendencias: [
      { worksite_id: 'o', titulo: 'Revisar detalhe de impermeabilização do reservatório', prazo: somarDias(hoje, -3), prioridade: 'alta', status: 'aberta' },
      { worksite_id: 'o', titulo: 'Instalar guarda-corpo provisório no 3º pavimento', prazo: hoje, prioridade: 'alta', status: 'aberta' },
      { worksite_id: 'o', titulo: 'Definir local de estoque da cerâmica', prazo: null, prioridade: 'baixa', status: 'aberta' },
    ],
    responsavel: 'Responsável Exemplo',
  })
}
