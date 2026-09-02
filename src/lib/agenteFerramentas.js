/* ============================================================
   FERRAMENTAS DO ASSISTENTE DE IA — o que o ChatBot pode fazer
   além de só conversar: abrir telas e consultar dados reais do
   Prumo. As definições (FERRAMENTAS) vão pro Claude via a Edge
   Function prumo-chat; a execução (executarFerramenta) roda aqui
   no navegador, com os dados já carregados no DadosContext.
   ============================================================ */

import { normalizarParaCasar, hojeISO, diarioDaData, moduloPermitido } from './dominio'

export const FERRAMENTAS = [
  {
    name: 'abrir_tela',
    description: 'Abre uma tela do Prumo direto pro usuário ver. Use quando o pedido for pra "abrir", "ver" ou "ir para" um módulo específico, como o diário de hoje.',
    input_schema: {
      type: 'object',
      properties: {
        destino: {
          type: 'string',
          enum: [
            'diarioHoje', 'diarios', 'efetivo', 'pendencias', 'planejamento', 'galeria',
            'lembretes', 'equipamentos', 'suprimentos', 'contratos', 'producao', 'seguranca',
            'projetos', 'cadastros',
          ],
          description: '"diarioHoje" abre o diário de hoje da obra atual (mesmo que ainda não exista). Os demais valores abrem o módulo correspondente.',
        },
      },
      required: ['destino'],
    },
  },
  {
    name: 'consultar_rendimento',
    description: 'Consulta o ranking de rendimento (produtividade) dos colaboradores no módulo Produtividade, do maior pro menor, em quantidade produzida por dia trabalhado. Use pra perguntas tipo "qual colaborador de X mais produz" ou "quem tem o melhor rendimento em Y". Considera o histórico completo, todas as obras.',
    input_schema: {
      type: 'object',
      properties: {
        busca: {
          type: 'string',
          description: 'Termo pra filtrar por tipo de serviço ou nome do serviço, ex: "escavação", "concretagem". Vazio considera todos os serviços.',
        },
      },
      required: [],
    },
  },
]

export function executarFerramenta(nome, input, contexto) {
  if (nome === 'abrir_tela') return abrirTela(input?.destino, contexto)
  if (nome === 'consultar_rendimento') return consultarRendimento(contexto, input?.busca || '')
  return { erro: 'Ferramenta desconhecida.' }
}

function abrirTela(destino, { dados, navegar }) {
  if (!destino || !navegar) return { erro: 'Não consegui abrir essa tela.' }
  if (destino === 'diarioHoje') {
    const hoje = hojeISO()
    const diario = diarioDaData(dados.diarios, hoje, dados.obra.id)
    navegar('diario', { data: hoje, id: diario?.id })
  } else {
    navegar(destino, {})
  }
  return { ok: true }
}

function consultarRendimento({ dados, perfil }, busca) {
  if (perfil && !moduloPermitido(perfil, 'producao')) {
    return { erro: 'Este usuário não tem acesso ao módulo de Produtividade.' }
  }

  const alvo = normalizarParaCasar(busca)

  const tiposCorrespondentes = new Set(
    (dados.tiposServico || [])
      .filter((t) => alvo && normalizarParaCasar(t.nome).includes(alvo))
      .map((t) => t.id),
  )
  const servicosCorrespondentes = new Set(
    (dados.servicosProducaoTodasObras || [])
      .filter((s) => !alvo || tiposCorrespondentes.has(s.service_type_id) || normalizarParaCasar(s.nome).includes(alvo))
      .map((s) => s.id),
  )

  if (alvo && servicosCorrespondentes.size === 0) {
    return { encontrado: false, mensagem: `Nenhum serviço de produtividade encontrado com "${busca}".` }
  }

  const planIds = new Set(
    (dados.plantasProducaoTodasObras || [])
      .filter((p) => servicosCorrespondentes.has(p.service_id))
      .map((p) => p.id),
  )
  const markerIds = new Set(
    (dados.marcadoresProducaoTodasObras || [])
      .filter((m) => planIds.has(m.plan_id) && m.ativo !== false)
      .map((m) => m.id),
  )
  const eventos = (dados.eventosProducaoTodasObras || []).filter((e) => markerIds.has(e.marker_id))

  const mapa = new Map()
  for (const ev of eventos) {
    if (!ev.worker_id) continue
    const atual = mapa.get(ev.worker_id) || { quantidade: 0, dias: new Set() }
    atual.quantidade += Number(ev.quantidade) || 0
    atual.dias.add(ev.data_execucao)
    mapa.set(ev.worker_id, atual)
  }

  const ranking = [...mapa.entries()]
    .map(([workerId, info]) => {
      const colaborador = dados.colaboradorPorId(workerId)
      if (!colaborador) return null
      return {
        nome: colaborador.nome,
        quantidade: Math.round(info.quantidade * 100) / 100,
        dias_trabalhados: info.dias.size,
        rendimento_por_dia: info.dias.size > 0 ? Math.round((info.quantidade / info.dias.size) * 100) / 100 : 0,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.rendimento_por_dia - a.rendimento_por_dia)
    .slice(0, 10)

  if (ranking.length === 0) {
    return { encontrado: false, mensagem: 'Nenhum evento de produtividade com colaborador vinculado encontrado nesse filtro.' }
  }
  return { encontrado: true, ranking }
}
