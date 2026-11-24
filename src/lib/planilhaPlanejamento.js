/* ============================================================
   LEITORES DOS MODELOS DE PLANEJAMENTO (planilhas do Prumo)
   Os quatro entregam o MESMO formato dos leitores de PDF da Fama,
   então as telas de importação reaproveitam toda a conferência e
   a gravação que já existem:
   - lerMensalDaPlanilha  -> itens do cronograma mensal (como o CSV)
   - lerSemanalDaPlanilha -> pacotes "serviço - local" (como o PDF semanal)
   - lerTaticoDaPlanilha  -> restrições do tático (como o PDF tático)
   - lerEstruturaDaPlanilha -> árvore Tipo > Etapa > Sub-etapa > Insumo
   ============================================================ */

import { carregarXLSX, lerWorkbook } from './xlsxCodepage'
import {
  abrirModelo, ehExemplo, texto, numero, dataISO, LIMITE_LINHAS_VAZIAS, normalizar,
} from './modeloPrumoLeitura'

const SEM_EXEMPLOS = 'Não encontrei nada preenchido. Lembre de apagar só as linhas de exemplo e preencher a partir da linha 4.'

async function abrir(arquivo, titulos) {
  const XLSX = await carregarXLSX()
  const wb = await lerWorkbook(arquivo, { cellDates: true })
  return abrirModelo(XLSX, wb, titulos, { soAbaDados: true })
}

/* ── Mensal ───────────────────────────────────────────────── */

export async function lerMensalDaPlanilha(arquivo) {
  const m = await abrir(arquivo, ['etapa', 'inicio', 'fim'])
  if (!m) return { itens: [], erroGeral: 'Não reconheci o modelo. Baixe o modelo de planilha do Prumo, preencha e importe de novo.' }
  const { faixa, cel, linhaCabecalho, col } = m
  const c = { etapa: col('etapa'), inicio: col('inicio'), fim: col('fim'), peso: col('peso') }
  const itens = []
  let vazias = 0
  for (let r = linhaCabecalho + 1; r <= faixa.e.r; r++) {
    const descricao = texto(cel(r, c.etapa))
    if (ehExemplo(descricao)) continue
    if (!descricao && !texto(cel(r, c.inicio))) {
      if (++vazias >= LIMITE_LINHAS_VAZIAS) break
      continue
    }
    vazias = 0
    const data_inicio = dataISO(cel(r, c.inicio))
    const data_fim = dataISO(cel(r, c.fim))
    const pesoLido = c.peso >= 0 ? numero(cel(r, c.peso)) : null
    const peso = pesoLido && pesoLido > 0 ? pesoLido : 1
    const problemas = []
    if (!descricao) problemas.push('sem descrição')
    if (!data_inicio) problemas.push('data de início inválida')
    if (!data_fim) problemas.push('data de fim inválida')
    if (data_inicio && data_fim && data_fim < data_inicio) problemas.push('fim antes do início')
    itens.push({ linha: r + 1, descricao, data_inicio, data_fim, peso, problemas, valido: problemas.length === 0 })
  }
  if (!itens.length) return { itens, erroGeral: SEM_EXEMPLOS }
  return { itens, erroGeral: null, modelo: 'prumo' }
}

/* ── Semanal ──────────────────────────────────────────────── */
/* Devolve os "pacotes brutos" no mesmo formato do leitor de PDF: a
   descrição é "serviço - local" e o responsável é a empresa. Quem casa
   com os cadastros e conta os dias da semana é casarPacotes. */

export async function lerSemanalDaPlanilha(arquivo) {
  const m = await abrir(arquivo, ['servico', 'local', 'inicio', 'fim'])
  if (!m) return { itensBrutos: [], erroGeral: 'Não reconheci o modelo. Baixe o modelo de planilha do Prumo, preencha e importe de novo.' }
  const { faixa, cel, linhaCabecalho, col } = m
  const c = { servico: col('servico'), local: col('local'), empresa: col('empresa'), inicio: col('inicio'), fim: col('fim') }
  const itensBrutos = []
  const avisos = []
  let vazias = 0
  for (let r = linhaCabecalho + 1; r <= faixa.e.r; r++) {
    const servico = texto(cel(r, c.servico))
    if (ehExemplo(servico)) continue
    if (!servico && !texto(cel(r, c.local))) {
      if (++vazias >= LIMITE_LINHAS_VAZIAS) break
      continue
    }
    vazias = 0
    const local = texto(cel(r, c.local))
    const data_inicio = dataISO(cel(r, c.inicio))
    const data_fim = dataISO(cel(r, c.fim))
    if (!servico || !local || !data_inicio || !data_fim) {
      avisos.push(`Linha ${r + 1}: faltou serviço, local, início ou fim. Ignorei esta linha.`)
      continue
    }
    if (data_fim < data_inicio) { avisos.push(`Linha ${r + 1}: o fim é antes do início. Ignorei esta linha.`); continue }
    itensBrutos.push({
      linha: r + 1,
      descricao: `${servico} - ${local}`,
      responsavel: (c.empresa >= 0 && texto(cel(r, c.empresa))) || null,
      data_inicio, data_fim,
      valido: true, problemas: [],
    })
  }
  if (!itensBrutos.length && !avisos.length) return { itensBrutos, erroGeral: SEM_EXEMPLOS }
  return { itensBrutos, erroGeral: null, avisos, modelo: 'prumo' }
}

/* ── Tático ───────────────────────────────────────────────── */

export async function lerTaticoDaPlanilha(arquivo) {
  const m = await abrir(arquivo, ['servico', 'inicio do servico', 'acao para remover a restricao'])
  if (!m) return { itens: [], erroGeral: 'Não reconheci o modelo. Baixe o modelo de planilha do Prumo, preencha e importe de novo.' }
  const { faixa, cel, linhaCabecalho, col } = m
  const c = {
    servico: col('servico'), local: col('local'), inicio: col('inicio do servico'),
    acao: col('acao para remover a restricao'), responsavel: col('responsavel'), motivo: col('motivo'),
  }
  const itens = []
  const avisos = []
  let vazias = 0
  for (let r = linhaCabecalho + 1; r <= faixa.e.r; r++) {
    const servico = texto(cel(r, c.servico))
    const acao = texto(cel(r, c.acao))
    if (ehExemplo(servico)) continue
    if (!servico && !acao) {
      if (++vazias >= LIMITE_LINHAS_VAZIAS) break
      continue
    }
    vazias = 0
    const inicio = dataISO(cel(r, c.inicio))
    if (!servico || !acao || !inicio) {
      avisos.push(`Linha ${r + 1}: faltou o serviço, a ação para remover a restrição ou a data de início. Ignorei esta linha.`)
      continue
    }
    itens.push({
      linha: itens.length + 1,
      servico,
      lote: (c.local >= 0 && texto(cel(r, c.local))) || '',
      data_inicio_servico: inicio,
      acao_remocao: acao,
      responsavel: (c.responsavel >= 0 && texto(cel(r, c.responsavel))) || null,
      motivo: (c.motivo >= 0 && texto(cel(r, c.motivo))) || null,
    })
  }
  if (!itens.length && !avisos.length) return { itens, erroGeral: SEM_EXEMPLOS }
  if (!itens.length) return { itens, erroGeral: avisos[0] }
  return { itens, erroGeral: null, avisos, modelo: 'prumo' }
}

/* ── Estrutura de custos ──────────────────────────────────── */
/* Lista em ordem: um Tipo, as Etapas dele, as Sub-etapas de cada Etapa e os
   Insumos de cada Sub-etapa. O pai de cada linha é o último item do nível
   acima (a mesma regra do relatório em PDF). */

const NIVEIS = { tipo: 'tipo', etapa: 'etapa', 'sub etapa': 'sub_etapa', subetapa: 'sub_etapa', insumo: 'insumo' }
const ORDEM = { tipo: 0, etapa: 1, sub_etapa: 2, insumo: 3 }

export async function lerEstruturaDaPlanilha(arquivo) {
  const m = await abrir(arquivo, ['nivel', 'codigo', 'descricao'])
  if (!m) return { itens: [], erroGeral: 'Não reconheci o modelo. Baixe o modelo de planilha do Prumo, preencha e importe de novo.' }
  const { faixa, cel, linhaCabecalho, col } = m
  const c = { nivel: col('nivel'), codigo: col('codigo'), nome: col('descricao') }
  const itens = []
  const avisos = []
  const ultimo = {}
  let vazias = 0
  for (let r = linhaCabecalho + 1; r <= faixa.e.r; r++) {
    const nivelTxt = texto(cel(r, c.nivel))
    const nome = texto(cel(r, c.nome))
    if (ehExemplo(nivelTxt)) continue
    if (!nivelTxt && !nome) {
      if (++vazias >= LIMITE_LINHAS_VAZIAS) break
      continue
    }
    vazias = 0
    const nivel = NIVEIS[normalizar(nivelTxt).replace(/-/g, ' ')]
    if (!nivel || !nome) {
      avisos.push(`Linha ${r + 1}: o nível precisa ser Tipo, Etapa, Sub-etapa ou Insumo, e a descrição não pode ficar vazia. Ignorei esta linha.`)
      continue
    }
    const nivelPai = Object.keys(ORDEM).find((k) => ORDEM[k] === ORDEM[nivel] - 1)
    const pai = nivelPai ? ultimo[nivelPai] : null
    if (nivelPai && !pai) {
      avisos.push(`Linha ${r + 1}: "${nome}" é ${nivelTxt} mas ainda não há ${nivelPai === 'sub_etapa' ? 'Sub-etapa' : nivelPai === 'etapa' ? 'Etapa' : 'Tipo'} acima dele na lista. Ignorei esta linha.`)
      continue
    }
    const item = { id: crypto.randomUUID(), nivel, codigo: (c.codigo >= 0 && texto(cel(r, c.codigo))) || null, nome, parent_id: pai?.id || null }
    ultimo[nivel] = item
    for (const k of Object.keys(ORDEM)) if (ORDEM[k] > ORDEM[nivel]) ultimo[k] = null
    itens.push(item)
  }
  if (!itens.length && !avisos.length) return { itens, erroGeral: SEM_EXEMPLOS }
  if (!itens.length) return { itens, erroGeral: avisos[0] }
  return { itens, erroGeral: null, avisos, modelo: 'prumo' }
}
