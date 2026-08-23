/* ============================================================
   INÍCIO — PERFIL DE GESTÃO
   Painel compacto. Regra do guia: cada cartão limita a
   quantidade de itens e informa quando há mais, em vez de
   esconder rolagem dentro do cartão.
   ============================================================ */

import { useDados } from '../lib/DadosContext'
import {
  hojeISO, somarDias, formatarData, formatarDinheiro, nomeDiaSemana,
  diarioDaData, totalPresentes,
  filtrarPendencias, situacaoPendencia, contarPendencias, pendenciasGerais, pendenciasTaticas,
  consolidarEfetivo, pendentesDeRevisao, plural,
  contarRequisicoes, ETAPAS_REQUISICAO, ROTULO_REQUISICAO,
  previsionCurvaHoje, progressoEsperado,
} from '../lib/dominio'
import { Icon, Chip, Indicador, ItemLista, PageHeader, Vazio, SeletorObra, useDesktop } from '../components'
import { GraficoColunas, GraficoDonut, RankingBarras } from '../components/charts'

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

  /* Etapas do Mensal por situação — quanto do plano já fechou de
     verdade (100%), não só o quanto avançou em peso. */
  const etapasMensal = dados.cronograma || []
  const etapasConcluidas = etapasMensal.filter((e) => Number(e.percentual) >= 100).length
  const etapasEmAndamento = etapasMensal.filter((e) => Number(e.percentual) > 0 && Number(e.percentual) < 100).length
  const etapasNaoIniciadas = etapasMensal.length - etapasConcluidas - etapasEmAndamento

  /* Avanço geral — hero do topo. Prevision quando tem (é o dado
     oficial, ponderado por eles); senão, a média do Mensal ponderada
     pelo peso de cada etapa, mesma fórmula que curvaFisica() já usa
     em Planejamento. Sem nenhum dos dois, não inventa número. */
  const pesoTotalMensal = etapasMensal.reduce((s, e) => s + (Number(e.peso) || 0), 0)
  const avancoMensal = pesoTotalMensal > 0
    ? etapasMensal.reduce((s, e) => s + (Number(e.percentual) || 0) * (Number(e.peso) || 0), 0) / pesoTotalMensal
    : null
  const avancoGeral = previsionHoje ? previsionHoje.realizado : avancoMensal
  const previstoGeral = previsionHoje ? previsionHoje.previsto : null

  /* Meta do mês — a mesma que é digitada à mão no Progresso Mensal
     (a Prevision não expõe esse percentual pela API, ver Suprimentos
     ↔ Planejamento). Só do mês corrente. */
  const mesAtual = hoje.slice(0, 7)
  const metaDoMes = (dados.metasMensais || []).find((m) => String(m.mes).slice(0, 7) === mesAtual)

  /* Suprimentos — mesmos números do topo do Dashboard de lá: todo
     pedido importado (não só os em aberto) entra na média de tempo e
     no valor total. */
  const todosSuprimentos = dados.suprimentos || []
  const media = (itens, campo) => {
    const comValor = itens.filter((p) => p[campo] != null)
    return comValor.length ? comValor.reduce((s, p) => s + p[campo], 0) / comValor.length : null
  }
  const valorTotalSuprimentos = todosSuprimentos.reduce(
    (s, p) => s + (p.preco != null && p.quantidade != null ? p.preco * p.quantidade : 0), 0,
  )
  const mediaPedidoCompraSuprimentos = media(todosSuprimentos, 'dias_pedido_compra')
  const mediaCompraEntregaSuprimentos = media(todosSuprimentos, 'dias_compra_entrega')

  /* Pedidos importados do ERP ainda sem Data Entrega, e quantos já
     passaram da Previsão de Entrega que o Compras deu. */
  const suprimentosAbertos = todosSuprimentos.filter((p) => !p.data_entrega)
  const suprimentosAtrasados = suprimentosAbertos.filter((p) => p.previsao_entrega && p.previsao_entrega < hoje)

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
          {/* ── Hero: avanço geral da obra ── */}
          {avancoGeral != null && (
            <div
              className="card"
              style={{
                background: 'linear-gradient(135deg, var(--graphite), var(--graphite-2))',
                color: 'var(--on-graphite)', border: 'none',
              }}
            >
              <div className="row-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
                <div>
                  <div className="t-micro" style={{ color: 'var(--on-graphite-2)' }}>
                    Avanço geral da obra {previsionHoje ? '· Prevision' : '· Mensal'}
                  </div>
                  <div className="t-display" style={{ fontSize: 44, color: 'var(--on-graphite)', marginTop: 4 }}>
                    {avancoGeral.toFixed(1)}%
                  </div>
                  {previstoGeral != null && (
                    <div className="row-flex" style={{ gap: 6, alignItems: 'center', marginTop: 6 }}>
                      <span
                        className="t-caption"
                        style={{
                          color: avancoGeral >= previstoGeral ? 'var(--success)' : 'var(--danger)',
                          fontWeight: 700,
                        }}
                      >
                        {avancoGeral >= previstoGeral ? '▲' : '▼'} {Math.abs(avancoGeral - previstoGeral).toFixed(1)} p.p.
                      </span>
                      <span className="t-caption" style={{ color: 'var(--on-graphite-2)' }}>
                        {avancoGeral >= previstoGeral ? 'à frente do' : 'atrás do'} previsto ({previstoGeral.toFixed(1)}%)
                      </span>
                    </div>
                  )}
                  {atividadesAtrasadasPrevision > 0 && (
                    <div className="t-caption" style={{ color: '#E8897A', marginTop: 4 }}>
                      {plural(atividadesAtrasadasPrevision, 'atividade atrasada', 'atividades atrasadas')} segundo a Prevision
                    </div>
                  )}
                </div>

                {etapasMensal.length > 0 && (
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <AneleEtapas concluidas={etapasConcluidas} andamento={etapasEmAndamento} naoIniciadas={etapasNaoIniciadas} />
                    <div className="stack-1">
                      <LegendaAnel cor="var(--success)" rotulo="Concluídas" valor={etapasConcluidas} />
                      <LegendaAnel cor="var(--info)" rotulo="Em andamento" valor={etapasEmAndamento} />
                      <LegendaAnel cor="rgba(255,255,255,0.25)" rotulo="Não iniciadas" valor={etapasNaoIniciadas} />
                    </div>
                  </div>
                )}
              </div>
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

          {/* ── Efetivo por dia ── */}
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

          {/* ── Pendências vencidas ── */}
          <div>
            <div className="row-between" style={{ marginBottom: 10 }}>
              <div className="t-micro">Pendências vencidas</div>
              <button className="btn btn-ghost btn-sm" onClick={() => irParaAba('pendencias')}>
                Ver todas <Icon name="avancar" size={14} />
              </button>
            </div>
            {atrasadas.length === 0 ? (
              <div className="card-flat">
                <Vazio titulo="Nenhuma vencida" texto="Todas as pendências em aberto ainda estão dentro do prazo." />
              </div>
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

          {/* ── Painel geral ── */}
          <div>
            <div className="t-micro" style={{ marginBottom: 10 }}>Painel geral</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
              {/* Planejamento — etapas do Mensal + Prevision */}
              {(etapasMensal.length > 0 || linkPrevision) && (
                <div className="card">
                  <div className="row-between" style={{ marginBottom: 4 }}>
                    <TituloPainel icone="planejamento" cor="var(--info)" titulo="Planejamento" />
                    <button className="btn btn-ghost btn-sm" onClick={() => irParaAba('planejamento', { aba: 'dashboard' })}>
                      Abrir <Icon name="avancar" size={14} />
                    </button>
                  </div>
                  {etapasMensal.length > 0 && (
                    <GraficoDonut
                      tamanho={104}
                      itens={[
                        { chave: 'concluidas', rotulo: 'Concluídas', valor: etapasConcluidas, cor: 'var(--success)' },
                        { chave: 'andamento', rotulo: 'Em andamento', valor: etapasEmAndamento, cor: 'var(--info)' },
                        { chave: 'nao-iniciadas', rotulo: 'Não iniciadas', valor: etapasNaoIniciadas, cor: 'var(--border-strong)' },
                      ]}
                      formatarValor={(v) => plural(v, 'etapa', 'etapas')}
                    />
                  )}
                  {linkPrevision && (
                    previsionHoje ? (
                      <div className="stack-1" style={{ marginTop: 10 }}>
                        <div className="row-wrap" style={{ gap: 16 }}>
                          <span className="t-caption">Base <b>{previsionHoje.base.toFixed(1)}%</b></span>
                          <span className="t-caption">Previsto <b>{previsionHoje.previsto.toFixed(1)}%</b></span>
                          <span className="t-caption">
                            Realizado{' '}
                            <b style={{ color: previsionHoje.realizado >= previsionHoje.previsto ? 'var(--success)' : 'var(--danger)' }}>
                              {previsionHoje.realizado.toFixed(1)}%
                            </b>
                          </span>
                        </div>
                        <div className="row-wrap" style={{ gap: 16 }}>
                          <span className="t-caption">Atividades <b>{atividadesGlobal.length}</b></span>
                          {metaDoMes && (
                            <span className="t-caption">Meta do mês <b>{Number(metaDoMes.percentual).toFixed(2)}%</b></span>
                          )}
                        </div>
                        {atividadesAtrasadasPrevision > 0 && (
                          <div className="t-caption" style={{ color: 'var(--danger)' }}>
                            {plural(atividadesAtrasadasPrevision, 'atividade atrasada', 'atividades atrasadas')} segundo a Prevision.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="t-caption" style={{ marginTop: 10 }}>Sincronizando com a Prevision…</div>
                    )
                  )}
                </div>
              )}

              {/* Suprimentos */}
              {(dados.suprimentos || []).length > 0 && (
                <div className="card">
                  <div className="row-between" style={{ marginBottom: 4 }}>
                    <TituloPainel icone="pedidos" cor="var(--chart-4)" titulo="Suprimentos" />
                    <button className="btn btn-ghost btn-sm" onClick={() => irParaAba('suprimentos', { aba: 'dashboard' })}>
                      Abrir <Icon name="avancar" size={14} />
                    </button>
                  </div>
                  {suprimentosAbertos.length > 0 ? (
                    <GraficoDonut
                      tamanho={104}
                      itens={[
                        { chave: 'no-prazo', rotulo: 'Aguardando, dentro do prazo', valor: suprimentosAbertos.length - suprimentosAtrasados.length, cor: 'var(--info)' },
                        { chave: 'atrasado', rotulo: 'Previsão vencida', valor: suprimentosAtrasados.length, cor: 'var(--danger)' },
                      ]}
                      formatarValor={(v) => plural(v, 'pedido', 'pedidos')}
                    />
                  ) : (
                    <div className="t-caption" style={{ padding: '10px 0' }}>Todo pedido importado já tem Data Entrega.</div>
                  )}
                  <div className="row-wrap" style={{ gap: 16, marginTop: 8 }}>
                    <span className="t-caption">Pedidos <b>{todosSuprimentos.length}</b></span>
                    <span className="t-caption">Valor total <b>{formatarDinheiro(valorTotalSuprimentos)}</b></span>
                  </div>
                  <div className="row-wrap" style={{ gap: 16, marginTop: 4 }}>
                    <span className="t-caption">Pedido → Compra <b>{formatarDias(mediaPedidoCompraSuprimentos)}</b></span>
                    <span className="t-caption">Compra → Entrega <b>{formatarDias(mediaCompraEntregaSuprimentos)}</b></span>
                  </div>
                </div>
              )}

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

              {/* Pendências — dia a dia x tático */}
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

/* Anel de etapas do hero — mesma técnica de offset acumulado do
   GraficoDonut, só que sem legenda embutida (a legenda do hero vai
   ao lado, em texto claro sobre fundo escuro) e sem depender de
   tokens de cor claros (o "não iniciadas" precisa ser translúcido
   branco pra aparecer no fundo grafite). */
function AneleEtapas({ concluidas, andamento, naoIniciadas }) {
  const total = concluidas + andamento + naoIniciadas
  if (total === 0) return null
  const segmentos = [
    { valor: concluidas, cor: 'var(--success)' },
    { valor: andamento, cor: 'var(--info)' },
    { valor: naoIniciadas, cor: 'rgba(255,255,255,0.18)' },
  ]
  let acumulado = 0
  return (
    <svg viewBox="0 0 100 100" width={76} height={76} style={{ flex: 'none', transform: 'rotate(-90deg)' }}>
      {segmentos.map((s, i) => {
        const pct = (s.valor / total) * 100
        if (pct <= 0) return null
        const el = (
          <circle
            key={i} cx="50" cy="50" r={34} fill="none" stroke={s.cor} strokeWidth={16}
            strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={-acumulado} pathLength="100"
          />
        )
        acumulado += pct
        return el
      })}
    </svg>
  )
}

function LegendaAnel({ cor, rotulo, valor }) {
  return (
    <div className="row-flex" style={{ gap: 6, alignItems: 'center' }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: cor, flex: 'none' }} />
      <span className="t-caption" style={{ color: 'var(--on-graphite-2)' }}>
        {rotulo} <b style={{ color: 'var(--on-graphite)' }}>{valor}</b>
      </span>
    </div>
  )
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
