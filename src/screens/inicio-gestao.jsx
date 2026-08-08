/* ============================================================
   INÍCIO — PERFIL DE GESTÃO
   Painel compacto. Regra do guia: cada cartão limita a
   quantidade de itens e informa quando há mais, em vez de
   esconder rolagem dentro do cartão.
   ============================================================ */

import { useDados } from '../lib/DadosContext'
import {
  hojeISO, somarDias, formatarData, formatarDataCurta, nomeDiaSemana,
  diarioDaData, situacaoDiario, totalPresentes, progressoDiario,
  filtrarPendencias, situacaoPendencia, contarPendencias,
  consolidarEfetivo, pendentesDeRevisao, plural,
} from '../lib/dominio'
import { Icon, Chip, Indicador, ItemLista, PageHeader, Vazio, SeletorObra, useDesktop } from '../components'

export default function InicioGestao({ goto, irParaAba, perfil }) {
  const dados = useDados()
  const desktop = useDesktop()
  const hoje = hojeISO()
  const de = somarDias(hoje, -6)

  const diarioHoje = diarioDaData(dados.diarios, hoje, dados.obra.id)
  const sitDiario = situacaoDiario(diarioHoje)
  const progresso = progressoDiario(diarioHoje)
  const previstasHoje = dados.planejamento.filter((p) => p.data === hoje)

  const cont = contarPendencias(dados.pendencias, hoje)
  const atrasadas = filtrarPendencias(dados.pendencias, 'atrasadas', hoje)
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
  const pico = Math.max(1, ...barras.map((b) => b.total))

  const ultimosDiarios = [...dados.diarios].sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 4)

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
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 92 }}>
                {barras.map((b) => (
                  <div key={b.data} className="grow" style={{ textAlign: 'center' }}>
                    <div
                      title={`${formatarData(b.data)}: ${b.total}`}
                      style={{
                        height: Math.max(3, (b.total / pico) * 68),
                        background: b.data === hoje ? 'var(--primary)' : b.lancado ? 'var(--graphite)' : 'var(--border)',
                        borderRadius: 4, marginBottom: 6,
                      }}
                    />
                    <div className="t-num" style={{ fontSize: 12, fontWeight: 600 }}>{b.total || '—'}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{nomeDiaSemana(b.data)}</div>
                  </div>
                ))}
              </div>
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
