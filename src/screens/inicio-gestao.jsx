/* ============================================================
   INÍCIO — PERFIL DE GESTÃO
   Painel compacto. Regra do guia: cada cartão limita a
   quantidade de itens e informa quando há mais, em vez de
   esconder rolagem dentro do cartão.
   ============================================================ */

import { useState } from 'react'
import { useDados } from '../lib/DadosContext'
import {
  hojeISO, somarDias, formatarData, formatarDinheiro, nomeDiaSemana,
  diarioDaData, totalPresentes,
  filtrarPendencias, situacaoPendencia, contarPendencias, pendenciasGerais, pendenciasTaticas,
  consolidarEfetivo, pendentesDeRevisao, plural,
  contarRequisicoes, ETAPAS_REQUISICAO, ROTULO_REQUISICAO,
  previsionCurvaHoje, previsionProgressoMensal, progressoEsperado, filtrarPorPeriodo,
} from '../lib/dominio'
import { Icon, Chip, Indicador, ItemLista, PageHeader, Vazio, SeletorObra, useDesktop, Segmentos, Campo } from '../components'
import { GraficoColunas, GraficoDonut, RankingBarras, CurvaSPrevision, ProgressoMensalPrevision } from '../components/charts'

const ROTULO_DESTINO = {
  almoxarifado: 'Almoxarifado', epi: 'EPI', administracao: 'Administração', equipamentos: 'Equipamentos',
}
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export default function InicioGestao({ goto, irParaAba, perfil }) {
  const dados = useDados()
  const desktop = useDesktop()
  const hoje = hojeISO()
  const de = somarDias(hoje, -6)

  const diarioHoje = diarioDaData(dados.diarios, hoje, dados.obra.id)

  const pendenciasGeraisDaObra = pendenciasGerais(dados.pendencias)
  const cont = contarPendencias(pendenciasGeraisDaObra, hoje)
  const atrasadas = filtrarPendencias(pendenciasGeraisDaObra, 'atrasadas', hoje)
    .map((p) => ({ p, s: situacaoPendencia(p, hoje) }))
    .sort((a, b) => (b.s.dias || 0) - (a.s.dias || 0))

  const semana = consolidarEfetivo(dados.diarios, { de, ate: hoje })
  const revisoes = pendentesDeRevisao(dados.colaboradores)

  /* Sete colunas fixas, mesmo nos dias sem lançamento — um buraco
     no gráfico é informação, não deve ser omitido. */
  const barras = Array.from({ length: 7 }, (_, i) => {
    const data = somarDias(de, i)
    const dia = semana.dias.find((d) => d.data === data)
    return { data, total: dia ? dia.total : 0, lancado: Boolean(dia) }
  })

  /* ── Painel geral ── */
  const taticasDaObra = pendenciasTaticas(dados.pendencias)
  const contTatico = contarPendencias(taticasDaObra, hoje)

  const contPedidos = contarRequisicoes(dados.requisicoes, perfil.id, hoje)
  const porEtapaPedido = ETAPAS_REQUISICAO.map((etapa) => ({
    etapa, rotulo: ROTULO_REQUISICAO[etapa],
    total: dados.requisicoes.filter((r) => r.status === etapa).length,
  }))

  /* Planejamento (Prevision) — mesmo dado oficial que o Dashboard de
     Planejamento usa, não o cálculo local do Prumo. Só aparece se a
     obra já tem um projeto da Prevision vinculado. */
  const linkPrevision = dados.previsionProjectLinks?.[0]
  const previsionHoje = previsionCurvaHoje(linkPrevision?.scurve, hoje)
  const atividadesGlobal = dados.cronogramaGlobal || []
  const atividadesAtrasadasPrevision = atividadesGlobal.filter((i) => {
    if (!i.data_inicio || !i.data_fim || i.percentual_prevision == null) return false
    return progressoEsperado(i, hoje) - (Number(i.percentual_prevision) || 0) > 5
  }).length

  const etapasMensal = dados.cronograma || []

  /* Avanço geral só quando não tem Prevision vinculada — quando tem,
     o bloco do Planejamento já mostra o Realizado oficial deles.
     Mesma fórmula que curvaFisica() já usa em Planejamento. */
  const pesoTotalMensal = etapasMensal.reduce((s, e) => s + (Number(e.peso) || 0), 0)
  const avancoMensal = pesoTotalMensal > 0
    ? etapasMensal.reduce((s, e) => s + (Number(e.percentual) || 0) * (Number(e.peso) || 0), 0) / pesoTotalMensal
    : null

  /* Meta do mês — a mesma que é digitada à mão no Progresso Mensal
     (a Prevision não expõe esse percentual pela API, ver Suprimentos
     ↔ Planejamento). Só do mês corrente. */
  const mesAtual = hoje.slice(0, 7)
  const metaDoMes = (dados.metasMensais || []).find((m) => String(m.mes).slice(0, 7) === mesAtual)

  /* Curva S + Progresso Mensal — mesmos dados e mesmos componentes
     do Dashboard de Planejamento (não é um cálculo paralelo). */
  const metasPorMes = {}
  for (const m of dados.metasMensais || []) metasPorMes[String(m.mes).slice(0, 7)] = Number(m.percentual)
  const progressoMensal = previsionProgressoMensal(linkPrevision?.scurve).map((m) => ({ ...m, meta: metasPorMes[m.mes] ?? null }))
  const salvarMeta = (mesISO, percentual) => dados.salvarMetaMensal(`${mesISO}-01`, percentual)

  /* Suprimentos — mesmos números e mesmo filtro de Período (data do
     pedido) do topo do Dashboard de lá, só sem o recorte por tipo de
     material (esse fica só na tela de Suprimentos). */
  const todosSuprimentos = dados.suprimentos || []
  const [periodoModo, setPeriodoModo] = useState('tudo')
  const [periodoDia, setPeriodoDia] = useState(hoje)
  const [periodoMes, setPeriodoMes] = useState(hoje.slice(0, 7))
  const [periodoInicio, setPeriodoInicio] = useState(hoje)
  const [periodoFim, setPeriodoFim] = useState(hoje)
  const suprimentosPeriodo = filtrarPorPeriodo(
    todosSuprimentos, periodoModo,
    { dia: periodoDia, mes: periodoMes, inicio: periodoInicio, fim: periodoFim },
    (p) => p.data_pedido,
  )
  const media = (itens, campo) => {
    const comValor = itens.filter((p) => p[campo] != null)
    return comValor.length ? comValor.reduce((s, p) => s + p[campo], 0) / comValor.length : null
  }
  const valorTotalSuprimentos = suprimentosPeriodo.reduce(
    (s, p) => s + (p.preco != null && p.quantidade != null ? p.preco * p.quantidade : 0), 0,
  )
  const mediaPedidoCompraSuprimentos = media(suprimentosPeriodo, 'dias_pedido_compra')
  const mediaCompraEntregaSuprimentos = media(suprimentosPeriodo, 'dias_compra_entrega')
  const suprimentosComAmbosTempos = suprimentosPeriodo.filter((p) => p.dias_pedido_compra != null && p.dias_compra_entrega != null)
  const mediaTotalSuprimentos = suprimentosComAmbosTempos.length
    ? suprimentosComAmbosTempos.reduce((s, p) => s + p.dias_pedido_compra + p.dias_compra_entrega, 0) / suprimentosComAmbosTempos.length
    : null

  /* Por tipo de material (Destino) — mesmo agrupamento do Dashboard
     de Suprimentos. */
  const gruposDestino = { almoxarifado: [], epi: [], equipamentos: [], administracao: [], sem: [] }
  for (const p of suprimentosPeriodo) gruposDestino[p.destino || 'sem'].push(p)
  const porDestinoSuprimentos = Object.entries(gruposDestino)
    .map(([destino, itens]) => ({
      destino, quantidade: itens.length,
      valor: itens.reduce((s, p) => s + (p.preco != null && p.quantidade != null ? p.preco * p.quantidade : 0), 0),
    }))
    .filter((d) => d.quantidade > 0)

  /* Evolução mensal (quantidade de pedidos por mês do Pedido). */
  const mapaEvolucaoMensal = new Map()
  for (const p of suprimentosPeriodo) {
    if (!p.data_pedido) continue
    const mes = p.data_pedido.slice(0, 7)
    mapaEvolucaoMensal.set(mes, (mapaEvolucaoMensal.get(mes) || 0) + 1)
  }
  const evolucaoMensalSuprimentos = [...mapaEvolucaoMensal.entries()]
    .map(([mes, quantidade]) => ({ mes, quantidade }))
    .sort((a, b) => a.mes.localeCompare(b.mes))

  /* Contratos — um registro por contrato (os campos do contrato se
     repetem em toda linha de item da planilha achatada). */
  const contratosMapa = new Map()
  for (const i of dados.contratos || []) {
    if (!contratosMapa.has(i.cod_contrato)) {
      contratosMapa.set(i.cod_contrato, { total: i.total_contrato, medido: i.valor_medido_contrato, saldo: i.saldo_contrato })
    }
  }
  const contratosUnicos = [...contratosMapa.values()]
  const totalContratado = contratosUnicos.reduce((s, c) => s + (Number(c.total) || 0), 0)
  const totalMedido = contratosUnicos.reduce((s, c) => s + (Number(c.medido) || 0), 0)
  const totalSaldoContratos = contratosUnicos.reduce((s, c) => s + (Number(c.saldo) || 0), 0)

  return (
    <>
      <div className="topbar">
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>{dados.obra.nome}</div>
          <div className="sub">{dados.org.nome} · {formatarData(hoje)}</div>
        </div>
        {/* No desktop o seletor já está no menu lateral. */}
        {!desktop && dados.obras.length > 1 ? (
          <div style={{ width: 145, flex: 'none' }}>
            <SeletorObra obras={dados.obras} obraId={dados.obra.id} onTrocar={dados.trocarObra} escuro />
          </div>
        ) : (
          <Icon name="obra" size={22} />
        )}
      </div>

      <div className="page">
        <PageHeader titulo="Visão da obra" sub={`Últimos 7 dias · até ${formatarData(hoje)}`} />

        <div className="stack-3">
          {/* ── Planejamento: mesmo dado oficial do Dashboard da Prevision ── */}
          {(linkPrevision || etapasMensal.length > 0) && (
            <div className="card">
              <div className="row-between" style={{ marginBottom: 4 }}>
                <TituloPainel icone="planejamento" cor="var(--info)" titulo={`Avanço geral da obra · ${linkPrevision ? 'Prevision' : 'Mensal'}`} />
                <button className="btn btn-ghost btn-sm" onClick={() => irParaAba('planejamento', { aba: 'dashboard' })}>
                  Abrir <Icon name="avancar" size={14} />
                </button>
              </div>

              {linkPrevision ? (
                previsionHoje ? (
                  <div className="stack-2" style={{ marginTop: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                      <Indicador rotulo="Base" valor={`${previsionHoje.base.toFixed(1)}%`} />
                      <Indicador rotulo="Previsto" valor={`${previsionHoje.previsto.toFixed(1)}%`} />
                      <Indicador
                        rotulo="Realizado" valor={`${previsionHoje.realizado.toFixed(1)}%`}
                        tom={previsionHoje.realizado >= previsionHoje.previsto ? 'success' : 'danger'}
                      />
                      <Indicador rotulo="Atividades" valor={atividadesGlobal.length} />
                      <Indicador rotulo="Meta do mês" valor={metaDoMes ? `${Number(metaDoMes.percentual).toFixed(2)}%` : '—'} />
                    </div>

                    {atividadesAtrasadasPrevision > 0 && (
                      <div className="t-caption" style={{ color: 'var(--danger)' }}>
                        {plural(atividadesAtrasadasPrevision, 'atividade atrasada', 'atividades atrasadas')} segundo a Prevision
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'repeat(2, 1fr)' : '1fr', gap: 12 }}>
                      <div className="card-flat chart-panel stack-2">
                        <div className="t-micro">Curva S — Base × Previsto × Realizado</div>
                        <CurvaSPrevision scurve={linkPrevision.scurve} />
                      </div>
                      <div className="card-flat chart-panel stack-2">
                        <div className="t-micro">Progresso mensal — Base × Previsto × Realizado</div>
                        <ProgressoMensalPrevision meses={progressoMensal} onSalvarMeta={salvarMeta} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="t-caption" style={{ marginTop: 6 }}>Sincronizando com a Prevision…</div>
                )
              ) : (
                avancoMensal != null && (
                  <div className="t-display" style={{ fontSize: 36, marginTop: 6 }}>{avancoMensal.toFixed(1)}%</div>
                )
              )}
            </div>
          )}

          {/* ── Indicadores ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <Indicador
              rotulo="Efetivo hoje" valor={totalPresentes(diarioHoje)}
              onClick={() => irParaAba('efetivo')}
            />
            <Indicador rotulo="Média 7 dias" valor={semana.media} onClick={() => irParaAba('efetivo')} />
            <Indicador
              rotulo="Pendências atrasadas" valor={cont.atrasadas}
              tom={cont.atrasadas ? 'danger' : undefined}
              onClick={() => irParaAba('pendencias')}
            />
            <Indicador
              rotulo="Aguardando revisão" valor={revisoes.length}
              tom={revisoes.length ? 'info' : undefined}
              onClick={() => goto('efetivo', { aba: 'revisao' })}
            />
          </div>

          {/* ── Coluna esquerda (Efetivo + Pendências) e coluna direita
              (Suprimentos) — a esquerda empilha pra acompanhar a altura
              do card de Suprimentos, que é mais alto por causa dos
              gráficos. ── */}
          <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'repeat(2, 1fr)' : '1fr', gap: 12 }}>
            <div className="stack-3">
              <div className="card">
                <div className="row-between" style={{ marginBottom: 14 }}>
                  <div className="t-micro">Efetivo por dia</div>
                  <span className="t-caption">pico {semana.pico}</span>
                </div>
                <GraficoColunas
                  itens={barras.map((b) => ({
                    chave: b.data, rotulo: nomeDiaSemana(b.data), valor: b.total,
                    cor: b.data === hoje ? 'var(--primary)' : b.lancado ? 'var(--graphite)' : 'var(--border)',
                  }))}
                  formatarValor={(v) => v || '—'}
                  alturaMax={68}
                />
                <button
                  className="btn btn-secondary btn-block" style={{ marginTop: 14 }}
                  onClick={() => irParaAba('efetivo')}
                >
                  Abrir efetivo
                </button>
              </div>

              <div className="card">
                <div className="row-between" style={{ marginBottom: 14 }}>
                  <TituloPainel icone="pendencias" cor="var(--danger)" titulo="Pendências" />
                  <button className="btn btn-ghost btn-sm" onClick={() => irParaAba('pendencias')}>
                    Abrir <Icon name="avancar" size={14} />
                  </button>
                </div>
                <div className="stack-2">
                  <BarraPendencias titulo="Dia a dia" cont={cont} />
                  <BarraPendencias titulo="Tático" cont={contTatico} />
                </div>
              </div>

              <div className="card" style={{ flex: 1 }}>
                <div className="row-between" style={{ marginBottom: 14 }}>
                  <TituloPainel icone="pendencias" cor="var(--danger)" titulo="Pendências vencidas" />
                  <button className="btn btn-ghost btn-sm" onClick={() => irParaAba('pendencias')}>
                    Ver todas <Icon name="avancar" size={14} />
                  </button>
                </div>
                {atrasadas.length === 0 ? (
                  <Vazio titulo="Nenhuma vencida" texto="Todas as pendências em aberto ainda estão dentro do prazo." />
                ) : (
                  <div className="stack-1">
                    {atrasadas.slice(0, 4).map(({ p, s }) => (
                      <ItemLista
                        key={p.id} titulo={p.titulo} aviso
                        sub={`${dados.perfilPorId(p.responsavel_id)?.nome || 'Sem responsável'} · prazo ${formatarData(p.prazo)}`}
                        direita={<Chip tom={s.tom}>{s.rotulo}</Chip>}
                        onClick={() => goto('pendencias', { destacar: p.id })}
                      />
                    ))}
                    {atrasadas.length > 4 && (
                      <button className="btn btn-ghost btn-sm" onClick={() => irParaAba('pendencias')}>
                        + {atrasadas.length - 4} além destas
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {(dados.suprimentos || []).length > 0 && (
              <div className="card">
                <div className="row-between" style={{ marginBottom: 4 }}>
                  <TituloPainel icone="pedidos" cor="var(--chart-4)" titulo="Suprimentos" />
                  <button className="btn btn-ghost btn-sm" onClick={() => irParaAba('suprimentos', { aba: 'dashboard' })}>
                    Abrir <Icon name="avancar" size={14} />
                  </button>
                </div>

                <Segmentos
                  valor={periodoModo} onChange={setPeriodoModo}
                  opcoes={[
                    { valor: 'tudo', rotulo: 'Tudo' },
                    { valor: 'dia', rotulo: 'Dia' },
                    { valor: 'mes', rotulo: 'Mês' },
                    { valor: 'periodo', rotulo: 'Período' },
                  ]}
                />
                {periodoModo === 'dia' && (
                  <input className="ipt" type="date" value={periodoDia} onChange={(e) => setPeriodoDia(e.target.value)} style={{ marginTop: 6 }} />
                )}
                {periodoModo === 'mes' && (
                  <input className="ipt" type="month" value={periodoMes} onChange={(e) => setPeriodoMes(e.target.value)} style={{ marginTop: 6 }} />
                )}
                {periodoModo === 'periodo' && (
                  <div className="row-flex" style={{ gap: 8, marginTop: 6 }}>
                    <Campo label="De">
                      <input className="ipt" type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} />
                    </Campo>
                    <Campo label="Até">
                      <input className="ipt" type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} />
                    </Campo>
                  </div>
                )}

                {suprimentosPeriodo.length === 0 ? (
                  <div className="t-caption" style={{ padding: '10px 0' }}>Nenhum pedido nesse período.</div>
                ) : (
                  <>
                    <div className="row-wrap" style={{ gap: 16, marginTop: 10 }}>
                      <span className="t-caption">Pedidos (itens) <b>{suprimentosPeriodo.length}</b></span>
                      <span className="t-caption">Valor total <b>{formatarDinheiro(valorTotalSuprimentos)}</b></span>
                    </div>
                    <div className="row-wrap" style={{ gap: 16, marginTop: 4 }}>
                      <span className="t-caption">Pedido → Compra <b>{formatarDias(mediaPedidoCompraSuprimentos)}</b></span>
                      <span className="t-caption">Compra → Entrega <b>{formatarDias(mediaCompraEntregaSuprimentos)}</b></span>
                    </div>
                    <div className="row-wrap" style={{ gap: 16, marginTop: 4 }}>
                      <span className="t-caption">Total (pedido até chegar) <b>{formatarDias(mediaTotalSuprimentos)}</b></span>
                    </div>

                    {porDestinoSuprimentos.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div className="t-micro" style={{ marginBottom: 6 }}>Por tipo de material</div>
                        <GraficoDonut
                          tamanho={104}
                          itens={porDestinoSuprimentos.map((d) => ({
                            chave: d.destino, rotulo: `${ROTULO_DESTINO[d.destino] || 'Sem destino'} (${d.quantidade})`, valor: d.valor,
                          }))}
                          formatarValor={formatarDinheiro}
                        />
                      </div>
                    )}

                    {evolucaoMensalSuprimentos.length > 1 && (
                      <div style={{ marginTop: 14 }}>
                        <div className="t-micro" style={{ marginBottom: 6 }}>Evolução mensal</div>
                        <GraficoColunas
                          itens={evolucaoMensalSuprimentos.map((m) => {
                            const [ano, mesNum] = m.mes.split('-')
                            return { chave: m.mes, rotulo: `${MESES_ABREV[Number(mesNum) - 1]}/${ano.slice(2)}`, valor: m.quantidade }
                          })}
                          formatarValor={(v) => String(v)}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Painel geral ── */}
          <div>
            <div className="t-micro" style={{ marginBottom: 10 }}>Painel geral</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
              {/* Planejamento e Suprimentos já têm bloco próprio, mais
                  acima na página — não repetem aqui. */}

              {/* Contratos */}
              {contratosUnicos.length > 0 && (
                <div className="card">
                  <div className="row-between" style={{ marginBottom: 4 }}>
                    <TituloPainel icone="relatorio" cor="var(--chart-3)" titulo="Contratos" />
                    <button className="btn btn-ghost btn-sm" onClick={() => irParaAba('contratos', { aba: 'dashboard' })}>
                      Abrir <Icon name="avancar" size={14} />
                    </button>
                  </div>
                  {totalContratado > 0 && (
                    <GraficoDonut
                      tamanho={104}
                      itens={[
                        { chave: 'medido', rotulo: 'Medido', valor: totalMedido, cor: 'var(--success)' },
                        { chave: 'saldo', rotulo: 'Saldo a medir', valor: Math.max(0, totalSaldoContratos), cor: 'var(--border-strong)' },
                      ]}
                      formatarValor={formatarDinheiro}
                    />
                  )}
                  <div className="row-wrap" style={{ gap: 16, marginTop: 8 }}>
                    <span className="t-caption">Contratado <b>{formatarDinheiro(totalContratado)}</b></span>
                    <span className="t-caption">Medido <b>{formatarDinheiro(totalMedido)}</b></span>
                    <span className="t-caption">Saldo <b>{formatarDinheiro(totalSaldoContratos)}</b></span>
                  </div>
                </div>
              )}

              {/* Compras — etapas */}
              <div className="card">
                <div className="row-between" style={{ marginBottom: 14 }}>
                  <TituloPainel icone="pedidos" cor="var(--success)" titulo="Compras — por etapa" />
                  <button className="btn btn-ghost btn-sm" onClick={() => irParaAba('requisicoes')}>
                    Abrir <Icon name="avancar" size={14} />
                  </button>
                </div>
                {dados.requisicoes.length === 0 ? (
                  <div className="t-caption" style={{ padding: '20px 0' }}>Nenhuma requisição ainda.</div>
                ) : (
                  <div className="stack-1">
                    <RankingBarras
                      itens={porEtapaPedido.map((e) => ({ chave: e.etapa, rotulo: e.rotulo, valor: e.total }))}
                      formatarValor={(v) => String(v)}
                    />
                    {contPedidos.atrasadas > 0 && (
                      <div className="t-caption" style={{ color: 'var(--danger)', marginTop: 4 }}>
                        {plural(contPedidos.atrasadas, 'requisição atrasada', 'requisições atrasadas')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function formatarDias(v) {
  if (v == null) return '—'
  return `${v.toFixed(1)} dia${v >= 1.95 ? 's' : ''}`
}

/* Selo colorido antes do título de cada cartão do Painel geral — só
   pra escanear rápido qual é qual (uma cor por módulo, sem usar o
   laranja da marca: ver regra do BRIEFING em index.css). */
function TituloPainel({ icone, cor, titulo }) {
  return (
    <div className="row-flex" style={{ gap: 8, alignItems: 'center' }}>
      <div style={{
        width: 26, height: 26, borderRadius: 8, flex: 'none',
        background: `color-mix(in srgb, ${cor} 14%, transparent)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={icone} size={14} style={{ color: cor }} />
      </div>
      <div className="t-micro">{titulo}</div>
    </div>
  )
}

function BarraPendencias({ titulo, cont }) {
  const abertasNoPrazo = Math.max(0, cont.abertas - cont.atrasadas)
  return (
    <div>
      <div className="row-between" style={{ marginBottom: 6 }}>
        <span className="t-caption">{titulo}</span>
        <span className="t-caption">
          {cont.total} no total
          {cont.atrasadas > 0 && <span style={{ color: 'var(--danger)', fontWeight: 600 }}> · {cont.atrasadas} atrasada(s)</span>}
        </span>
      </div>
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--surface-2)' }}>
        {cont.total === 0 ? null : (
          <>
            <div style={{ width: `${(cont.resolvidas / cont.total) * 100}%`, background: 'var(--success)' }} />
            <div style={{ width: `${(abertasNoPrazo / cont.total) * 100}%`, background: 'var(--graphite)' }} />
            <div style={{ width: `${(cont.atrasadas / cont.total) * 100}%`, background: 'var(--danger)' }} />
          </>
        )}
      </div>
    </div>
  )
}
