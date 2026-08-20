/* ============================================================
   INÍCIO — PERFIL DE GESTÃO
   Painel compacto. Regra do guia: cada cartão limita a
   quantidade de itens e informa quando há mais, em vez de
   esconder rolagem dentro do cartão.
   ============================================================ */

import { useDados } from '../lib/DadosContext'
import {
  hojeISO, somarDias, diffDias, formatarData, formatarDataCurta, nomeDiaSemana,
  diarioDaData, situacaoDiario, totalPresentes, progressoDiario,
  filtrarPendencias, situacaoPendencia, contarPendencias, pendenciasGerais, pendenciasTaticas,
  consolidarEfetivo, pendentesDeRevisao, plural,
  curvaFisica, pontosDaCurvaS, contarRequisicoes, ETAPAS_REQUISICAO, ROTULO_REQUISICAO,
} from '../lib/dominio'
import { Icon, Chip, Indicador, ItemLista, PageHeader, Vazio, SeletorObra, useDesktop } from '../components'
import { GraficoColunas, RankingBarras } from '../components/charts'

export default function InicioGestao({ goto, irParaAba, perfil }) {
  const dados = useDados()
  const desktop = useDesktop()
  const hoje = hojeISO()
  const de = somarDias(hoje, -6)

  const diarioHoje = diarioDaData(dados.diarios, hoje, dados.obra.id)
  const sitDiario = situacaoDiario(diarioHoje)
  const progresso = progressoDiario(diarioHoje)
  const previstasHoje = dados.planejamento.filter((p) => p.data === hoje)

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
  const ultimosDiarios = [...dados.diarios].sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 4)

  /* ── Painel geral ── */
  const curvaFisicaHoje = curvaFisica(dados.cronograma, hoje)
  const curvaS = pontosDaCurvaS(dados.cronograma, hoje)

  const de30 = somarDias(hoje, -29)
  const efetivoMes = consolidarEfetivo(dados.diarios, { de: de30, ate: hoje })
  const barrasMes = Array.from({ length: 30 }, (_, i) => {
    const data = somarDias(de30, i)
    const dia = efetivoMes.dias.find((d) => d.data === data)
    return { data, total: dia ? dia.total : 0 }
  })
  const picoMes = Math.max(1, ...barrasMes.map((b) => b.total))

  const taticasDaObra = pendenciasTaticas(dados.pendencias)
  const contTatico = contarPendencias(taticasDaObra, hoje)

  const contPedidos = contarRequisicoes(dados.requisicoes, perfil.id, hoje)
  const porEtapaPedido = ETAPAS_REQUISICAO.map((etapa) => ({
    etapa, rotulo: ROTULO_REQUISICAO[etapa],
    total: dados.requisicoes.filter((r) => r.status === etapa).length,
  }))
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            {/* ── Diário do dia ── */}
            <div className="card">
              <div className="row-between" style={{ marginBottom: 12 }}>
                <div className="t-micro">Diário de hoje</div>
                <Chip tom={sitDiario.tom}>{sitDiario.rotulo}</Chip>
              </div>
              {diarioHoje ? (
                <div className="stack-1">
                  <div className="t-caption">
                    {plural(totalPresentes(diarioHoje), 'pessoa registrada', 'pessoas registradas')} ·{' '}
                    {progresso.concluidas} de {progresso.total} frentes concluídas
                  </div>
                  <Barra percentual={progresso.percentual} />
                  <button
                    className="btn btn-secondary btn-block" style={{ marginTop: 8 }}
                    onClick={() => goto('diario', { data: hoje, id: diarioHoje.id })}
                  >
                    Abrir o diário
                  </button>
                </div>
              ) : (
                <div className="stack-2">
                  <div className="alert danger">
                    O diário de hoje ainda não foi lançado pelo campo.
                  </div>
                  <div className="t-caption">
                    {plural(previstasHoje.length, 'frente prevista', 'frentes previstas')} para hoje.
                  </div>
                  <button className="btn btn-secondary btn-block" onClick={() => irParaAba('diarios')}>
                    Ver histórico de diários
                  </button>
                </div>
              )}
            </div>

            {/* ── Efetivo da semana ── */}
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

          {/* ── Últimos diários ── */}
          <div>
            <div className="row-between" style={{ marginBottom: 10 }}>
              <div className="t-micro">Últimos diários</div>
              <button className="btn btn-ghost btn-sm" onClick={() => irParaAba('diarios')}>
                Ver todos <Icon name="avancar" size={14} />
              </button>
            </div>
            <div className="stack-1">
              {ultimosDiarios.map((d) => {
                const s = situacaoDiario(d)
                const pr = progressoDiario(d)
                return (
                  <ItemLista
                    key={d.id}
                    titulo={formatarDataCurta(d.data)}
                    sub={`${plural(totalPresentes(d), 'pessoa', 'pessoas')} · ${pr.concluidas}/${pr.total} frentes`}
                    direita={<Chip tom={s.tom}>{s.rotulo}</Chip>}
                    onClick={() => goto('diario', { data: d.data, id: d.id })}
                  />
                )
              })}
            </div>
          </div>

          {/* ── Painel geral ── */}
          <div>
            <div className="t-micro" style={{ marginBottom: 10 }}>Painel geral</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
              {/* Curva S do cronograma */}
              <div className="card">
                <div className="row-between" style={{ marginBottom: 4 }}>
                  <div className="t-micro">Curva S — cronograma físico</div>
                  <button className="btn btn-ghost btn-sm" onClick={() => irParaAba('planejamento', { aba: 'mensal' })}>
                    Abrir <Icon name="avancar" size={14} />
                  </button>
                </div>
                {curvaS.pontos.length === 0 ? (
                  <div className="t-caption" style={{ padding: '20px 0' }}>
                    Sem etapas cadastradas ainda. Importe o cronograma para ver a curva.
                  </div>
                ) : (
                  <>
                    <CurvaS
                      pontos={curvaS.pontos} inicio={curvaS.inicio} fim={curvaS.fim}
                      hoje={hoje} real={curvaFisicaHoje.percentualReal} previstoHoje={curvaFisicaHoje.percentualPrevisto}
                    />
                    <div className="row-wrap" style={{ gap: 12, marginTop: 6 }}>
                      <span className="t-caption">
                        <b style={{ color: 'var(--graphite)' }}>●</b> Previsto hoje: {curvaFisicaHoje.percentualPrevisto}%
                      </span>
                      <span className="t-caption">
                        <b style={{ color: curvaFisicaHoje.percentualReal >= curvaFisicaHoje.percentualPrevisto ? 'var(--success)' : 'var(--danger)' }}>●</b>{' '}
                        Realizado: {curvaFisicaHoje.percentualReal}%
                      </span>
                    </div>
                    <div className="t-caption" style={{ marginTop: 4, color: 'var(--text-3)' }}>
                      A linha é o previsto (dá pra calcular para qualquer data). O realizado só tem o
                      ponto de hoje — o app guarda a medição atual de cada etapa, não um histórico.
                    </div>
                  </>
                )}
              </div>

              {/* Efetivo — 30 dias */}
              <div className="card">
                <div className="row-between" style={{ marginBottom: 14 }}>
                  <div className="t-micro">Efetivo — últimos 30 dias</div>
                  <span className="t-caption">média {efetivoMes.media} · pico {efetivoMes.pico}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 92 }}>
                  {barrasMes.map((b) => (
                    <div
                      key={b.data} className="grow" title={`${formatarData(b.data)}: ${b.total}`}
                      style={{
                        height: Math.max(2, (b.total / picoMes) * 84),
                        background: b.data === hoje ? 'var(--primary)' : 'var(--graphite)',
                        opacity: b.total ? 1 : 0.15,
                        borderRadius: 2,
                      }}
                    />
                  ))}
                </div>
                <div className="row-between" style={{ marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{formatarDataCurta(de30)}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{formatarDataCurta(hoje)}</span>
                </div>
              </div>

              {/* Pendências — dia a dia x tático */}
              <div className="card">
                <div className="row-between" style={{ marginBottom: 14 }}>
                  <div className="t-micro">Pendências</div>
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
                  <div className="t-micro">Compras — por etapa</div>
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

function Barra({ percentual }) {
  return (
    <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${percentual}%`, height: '100%', background: 'var(--success)' }} />
    </div>
  )
}

/* A linha do previsto + um ponto para o realizado de hoje — ver a
   explicação em pontosDaCurvaS() sobre por que não existe uma linha
   de realizado inteira. */
function CurvaS({ pontos, inicio, fim, hoje, real, previstoHoje }) {
  const W = 600
  const H = 130
  const PAD_TOP = 8
  const PAD_BOT = 18
  const totalDias = Math.max(1, diffDias(fim, inicio))
  const xDe = (data) => (diffDias(data, inicio) / totalDias) * W
  const yDe = (pct) => PAD_TOP + (1 - pct / 100) * (H - PAD_TOP - PAD_BOT)
  const linha = pontos.map((p) => `${xDe(p.data)},${yDe(p.previsto)}`).join(' ')
  const xHoje = Math.min(W, Math.max(0, xDe(hoje)))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 130, display: 'block' }}>
      {[0, 50, 100].map((p) => (
        <line key={p} x1={0} x2={W} y1={yDe(p)} y2={yDe(p)} stroke="var(--border)" strokeWidth={1} />
      ))}
      <polyline points={linha} fill="none" stroke="var(--graphite)" strokeWidth={2} />
      <line x1={xHoje} x2={xHoje} y1={PAD_TOP} y2={H - PAD_BOT} stroke="var(--text-3)" strokeDasharray="3,3" />
      <circle cx={xHoje} cy={yDe(previstoHoje)} r={4} fill="var(--graphite)" />
      <circle cx={xHoje} cy={yDe(real)} r={5} fill={real >= previstoHoje ? 'var(--success)' : 'var(--danger)'} />
    </svg>
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
