/* ============================================================
   GRÁFICOS — peças pequenas em SVG/CSS puro, sem biblioteca (o
   bundle já tem peso de sobra com xlsx/pdf). Usadas pelos Dashboards
   (Suprimentos, Contratos, e o que mais precisar).

   Quatro formas cobrem quase todo dashboard de gestão:
   - RankingBarras: magnitude — "quem é maior" (top N, uma cor só).
   - GraficoColunas: tendência no tempo — uma barra por período.
   - GraficoDonut: parte-do-todo — poucas categorias (até uns 6).
   - ReguaAderencia: previsto x realizado — a pergunta que se repete
     em Cronograma, Planejamento semanal, Medições, Efetivo, Projetos
     e Contratos. Um componente só, aprendido uma vez.
   - GraficoPareto: causas — poucas barras respondem pela maior parte
     do problema (regra 80/20). Barra + linha acumulada.
   - CurvaSPrevision: base/previsto/realizado completos, mês a mês —
     a curva S oficial da Prevision, mesma linguagem visual de lá.

   Regra de cor: o laranja da marca (--primary) é reservado pra ação/
   destaque, então os rankings e colunas (série única) usam ele como
   "a" cor — não tem ambiguidade porque não tem categoria nenhuma pra
   confundir. Só o donut, que PRECISA diferenciar categorias, usa o
   conjunto --chart-1..5 (ver index.css) em vez do laranja sozinho.
   ============================================================ */

import { useState } from 'react'
import { Icon } from './index'

/* ── Ranking (magnitude) ──────────────────────────────────────
   Uma barra por item, ordenado do maior pro menor (quem chama já
   manda ordenado). Trilho cinza + barra colorida com ponta
   arredondada; título vai à direita, curto, fora da barra (nunca
   cortado). Hover no título nativo do navegador serve de tooltip. */
export function RankingBarras({ itens, formatarValor, cor = 'var(--primary)', vazio = 'Nada aqui ainda.', onClicarItem }) {
  if (!itens || itens.length === 0) {
    return <div className="t-caption">{vazio}</div>
  }
  const max = Math.max(1, ...itens.map((i) => i.valor || 0))
  return (
    <div className="stack-1">
      {itens.map((item, i) => (
        <div
          key={item.chave ?? item.rotulo ?? i} className="rank-row" title={`${item.rotulo}: ${formatarValor(item.valor)}`}
          onClick={onClicarItem ? () => onClicarItem(item) : undefined}
          style={onClicarItem ? { cursor: 'pointer' } : undefined}
        >
          <div className="row-between" style={{ marginBottom: 4 }}>
            <span className="t-caption" style={{ maxWidth: '68%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.rotulo}
              {item.contador != null && <span style={{ opacity: 0.6 }}> ({item.contador})</span>}
            </span>
            <span className="t-caption t-strong" style={{ flex: 'none' }}>{formatarValor(item.valor)}</span>
          </div>
          <div className="rank-track">
            <div className="rank-fill" style={{ width: `${Math.max(2, (item.valor / max) * 100)}%`, background: item.cor || cor }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Colunas (tendência no tempo) ──────────────────────────────
   Uma coluna por período (mês, semana…), altura proporcional ao
   valor, rótulo do valor no topo e o período embaixo. Rola na
   horizontal se tiver muitos períodos, em vez de espremer tudo. */
export function GraficoColunas({ itens, formatarValor, cor = 'var(--primary)', alturaMax = 90 }) {
  if (!itens || itens.length === 0) {
    return <div className="t-caption">Nada nesse período ainda.</div>
  }
  const max = Math.max(1, ...itens.map((i) => i.valor || 0))
  return (
    <div className="col-chart" style={{ height: alturaMax + 40 }}>
      {itens.map((item, i) => (
        <div key={item.chave ?? item.rotulo ?? i} className="col-chart-item" title={`${item.rotulo}: ${formatarValor(item.valor)}`}>
          <span className="t-caption t-strong" style={{ fontSize: 11 }}>{formatarValor(item.valor)}</span>
          <div
            className="col-bar"
            style={{ height: Math.max(3, (item.valor / max) * alturaMax), background: item.cor || cor }}
          />
          <span className="t-caption" style={{ fontSize: 10, color: 'var(--text-3)' }}>{item.rotulo}</span>
        </div>
      ))}
    </div>
  )
}

const CORES_DONUT = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

/* ── Donut (parte-do-todo) ──────────────────────────────────────
   SVG com cada fatia como um círculo tracejado (stroke-dasharray em
   %, pathLength=100 evita ter que calcular circunferência). Legenda
   sempre visível embaixo — é categórico, então cor sozinha nunca
   carrega a identidade da fatia. */
export function GraficoDonut({ itens, formatarValor, tamanho = 132, espessura = 20 }) {
  const total = (itens || []).reduce((s, i) => s + (i.valor || 0), 0)
  if (!itens || itens.length === 0 || total <= 0) {
    return <div className="t-caption">Nada aqui ainda.</div>
  }
  const raio = 50 - espessura / 2
  let acumulado = 0
  const fatias = itens.map((item, i) => {
    const pct = (item.valor / total) * 100
    const fatia = { ...item, pct, cor: item.cor || CORES_DONUT[i % CORES_DONUT.length], offset: -acumulado }
    acumulado += pct
    return fatia
  })

  return (
    <div className="row-flex" style={{ gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
      <svg viewBox="0 0 100 100" width={tamanho} height={tamanho} style={{ flex: 'none', transform: 'rotate(-90deg)' }} role="img" aria-label="Gráfico de proporção por categoria">
        {fatias.map((f, i) => (
          <circle
            key={f.chave ?? f.rotulo ?? i}
            cx="50" cy="50" r={raio} fill="none"
            stroke={f.cor} strokeWidth={espessura}
            strokeDasharray={`${f.pct} ${100 - f.pct}`}
            strokeDashoffset={f.offset}
            pathLength="100"
          >
            <title>{`${f.rotulo}: ${formatarValor(f.valor)} (${f.pct.toFixed(0)}%)`}</title>
          </circle>
        ))}
      </svg>
      <div className="stack-1" style={{ flex: '1 1 160px', minWidth: 160 }}>
        {fatias.map((f, i) => (
          <div key={f.chave ?? f.rotulo ?? i} className="row-between" style={{ gap: 8 }}>
            <span className="row-flex" style={{ gap: 8, minWidth: 0 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: f.cor, flex: 'none' }} />
              <span className="t-caption truncate">{f.rotulo}</span>
            </span>
            <span className="t-caption t-strong" style={{ flex: 'none' }}>{formatarValor(f.valor)} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({f.pct.toFixed(0)}%)</span></span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Régua de aderência (previsto x realizado) ────────────────────
   Trilho cinza + preenchimento do realizado na cor da série, com um
   traço vertical de 2px marcando onde o previsto deveria estar hoje.
   Só dois estados — no prazo (traço grafite) ou atrasado (traço e
   valor em --danger) — nunca âmbar: o BRIEFING já decidiu que âmbar
   fica perto demais do laranja da marca pra confundir "botão" com
   "atenção", então não existe um terceiro tom aqui. */
export function ReguaAderencia({ itens, formatarValor = (v) => `${Math.round(v)}%`, cor = 'var(--primary)', vazio = 'Nada aqui ainda.' }) {
  if (!itens || itens.length === 0) {
    return <div className="t-caption">{vazio}</div>
  }
  return (
    <div className="stack-2">
      {itens.map((item, i) => {
        const realizado = Math.max(0, Math.min(100, item.realizado || 0))
        const previsto = Math.max(0, Math.min(100, item.previsto || 0))
        /* Aceita um "atrasado" já calculado por quem chama (ex.: com
           tolerância de alguns pontos, como situacaoCronograma já faz)
           — só cai na comparação crua se ninguém mandar isso pronto. */
        const atrasado = item.atrasado ?? (previsto > realizado)
        return (
          <div key={item.chave ?? item.rotulo ?? i}>
            <div className="row-between" style={{ marginBottom: 4 }}>
              <span className="t-caption">{item.rotulo}</span>
              <span className="t-caption t-strong" style={{ color: atrasado ? 'var(--danger)' : 'var(--text)' }}>
                {formatarValor(item.realizado)}
              </span>
            </div>
            <div
              style={{ position: 'relative', height: 8 }}
              title={`Realizado: ${formatarValor(item.realizado)} · Previsto hoje: ${formatarValor(item.previsto)}`}
            >
              <div className="rank-track">
                <div className="rank-fill" style={{ width: `${realizado}%`, background: item.cor || cor }} />
              </div>
              <div
                style={{
                  position: 'absolute', top: -2, bottom: -2, left: `${previsto}%`, width: 2,
                  background: atrasado ? 'var(--danger)' : 'var(--graphite)', transform: 'translateX(-1px)',
                }}
              />
            </div>
            {item.referencia && (
              <div className="t-caption" style={{ marginTop: 3, color: 'var(--text-3)' }}>{item.referencia}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── Pareto (regra 80/20) ──────────────────────────────────────
   Barras ordenadas do maior pro menor (a única forma que faz sentido
   pra Pareto — sem isso a linha acumulada não é monotônica de forma
   útil) + linha do percentual acumulado, com uma marca pontilhada
   nos 80%. Cor padrão --danger porque o caso de uso típico (causas
   de não cumprimento) é sempre "isto é um problema". */
export function GraficoPareto({ itens, formatarValor = (v) => String(v), cor = 'var(--danger)', vazio = 'Nada aqui ainda.' }) {
  const ordenados = (itens || []).filter((i) => (i.valor || 0) > 0).sort((a, b) => (b.valor || 0) - (a.valor || 0))
  const total = ordenados.reduce((s, i) => s + (i.valor || 0), 0)
  if (ordenados.length === 0 || total <= 0) {
    return <div className="t-caption">{vazio}</div>
  }

  let acumulado = 0
  const comAcumulado = ordenados.map((item) => {
    acumulado += item.valor || 0
    return { ...item, pctAcumulado: (acumulado / total) * 100 }
  })

  const max = Math.max(1, ...ordenados.map((i) => i.valor || 0))
  const H = 170
  const PAD_TOP = 10
  const PAD_BOT = 34
  const larguraColuna = 68
  const W = larguraColuna * comAcumulado.length
  const areaUtil = H - PAD_TOP - PAD_BOT
  const yBarra = (v) => PAD_TOP + (1 - v / max) * areaUtil
  const yPct = (p) => PAD_TOP + (1 - p / 100) * areaUtil
  const xCentro = (i) => larguraColuna * i + larguraColuna / 2
  const linha = comAcumulado.map((item, i) => `${xCentro(i)},${yPct(item.pctAcumulado)}`).join(' ')

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: W, height: H, display: 'block' }}>
        <line x1={0} x2={W} y1={yPct(80)} y2={yPct(80)} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="3,3" />
        <text x={W} y={yPct(80) - 3} textAnchor="end" fontSize="9" fill="var(--text-3)">80%</text>

        {comAcumulado.map((item, i) => (
          <g key={item.chave ?? item.rotulo ?? i}>
            <rect
              x={xCentro(i) - larguraColuna * 0.28} y={yBarra(item.valor)}
              width={larguraColuna * 0.56} height={Math.max(1, H - PAD_BOT - yBarra(item.valor))}
              rx={3} fill={item.cor || cor}
            >
              <title>{`${item.rotulo}: ${formatarValor(item.valor)} · acumulado ${item.pctAcumulado.toFixed(0)}%`}</title>
            </rect>
            <text x={xCentro(i)} y={H - PAD_BOT + 13} textAnchor="middle" fontSize="9" fill="var(--text-3)">
              {item.rotulo.length > 11 ? `${item.rotulo.slice(0, 10)}…` : item.rotulo}
            </text>
          </g>
        ))}

        <polyline points={linha} fill="none" stroke="var(--graphite)" strokeWidth={2} />
        {comAcumulado.map((item, i) => (
          <circle key={`pt-${item.chave ?? item.rotulo ?? i}`} cx={xCentro(i)} cy={yPct(item.pctAcumulado)} r={3.5} fill="var(--graphite)">
            <title>{`Acumulado: ${item.pctAcumulado.toFixed(0)}%`}</title>
          </circle>
        ))}
      </svg>
    </div>
  )
}

const dataCurta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/* ── Curva S completa da Prevision (base/previsto/realizado) ───────
   Mesma linguagem visual da tela "Curva S" da Prevision: base em
   linha tracejada, previsto em linha sólida escura, realizado em
   barra — só até a última medição de verdade (depois disso a
   Prevision também não desenha barra nenhuma, porque não tem dado).
   Amostra por ponto de fechamento de mês (scurve.period_end_dates)
   em vez de todo dia — ~450 pontos diários não caberiam legíveis
   num gráfico pequeno, e mês a mês já conta a história toda. */
export function CurvaSPrevision({ scurve, vazio = 'Nada aqui ainda.' }) {
  const [selecionado, setSelecionado] = useState(null)
  if (!scurve?.period_end_dates?.length || !scurve?.dates?.length) {
    return <div className="t-caption">{vazio}</div>
  }
  const pontos = scurve.period_end_dates
    .map((data) => {
      const idx = scurve.dates.indexOf(data)
      if (idx < 0) return null
      return {
        data,
        base: (scurve.base?.[idx] || 0) * 100,
        previsto: (scurve.expected?.[idx] || 0) * 100,
        realizado: (scurve.realized?.[idx] || 0) * 100,
        medido: Boolean(scurve.measured?.[idx]),
      }
    })
    .filter(Boolean)
  if (pontos.length < 2) return <div className="t-caption">{vazio}</div>

  const ultimoMedidoIdx = pontos.reduce((acc, p, i) => (p.medido ? i : acc), -1)
  const idxAtivo = selecionado ?? (ultimoMedidoIdx >= 0 ? ultimoMedidoIdx : pontos.length - 1)
  const atual = pontos[idxAtivo]

  const W = 640
  const H = 200
  const PAD_TOP = 10
  const PAD_BOT = 30
  const areaUtil = H - PAD_TOP - PAD_BOT
  const x = (i) => (pontos.length > 1 ? (i / (pontos.length - 1)) * W : 0)
  const y = (v) => PAD_TOP + (1 - Math.min(100, Math.max(0, v)) / 100) * areaUtil
  const faixaW = pontos.length > 1 ? W / (pontos.length - 1) : W

  const linhaBase = pontos.map((p, i) => `${x(i)},${y(p.base)}`).join(' ')
  const linhaPrevisto = pontos.map((p, i) => `${x(i)},${y(p.previsto)}`).join(' ')

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
        {[0, 25, 50, 75, 100].map((p) => (
          <line key={p} x1={0} x2={W} y1={y(p)} y2={y(p)} stroke="var(--border)" strokeWidth={1} />
        ))}

        {pontos.map((p, i) => (
          i <= ultimoMedidoIdx && p.realizado > 0 ? (
            <rect
              key={`r-${i}`} x={x(i) - 6} y={y(p.realizado)} width={12}
              height={Math.max(0, H - PAD_BOT - y(p.realizado))} rx={2} fill="var(--info)"
            />
          ) : null
        ))}

        <polyline points={linhaBase} fill="none" stroke="var(--danger)" strokeWidth={2} strokeDasharray="5,3" />
        <polyline points={linhaPrevisto} fill="none" stroke="var(--graphite)" strokeWidth={2} />

        {pontos.map((p, i) => (
          <text
            key={`lbl-${i}`} x={x(i)} y={H - PAD_BOT + 15} textAnchor="middle" fontSize="9"
            fill={i === idxAtivo ? 'var(--text)' : 'var(--text-3)'} fontWeight={i === idxAtivo ? 700 : 400}
          >
            {dataCurta(p.data)}
          </text>
        ))}

        {/* Faixas de toque invisíveis — mais fáceis de acertar no dedo do
            que os pontos finos da linha. */}
        {pontos.map((p, i) => (
          <rect
            key={`hit-${i}`} x={x(i) - faixaW / 2} y={0} width={faixaW} height={H}
            fill="transparent" onClick={() => setSelecionado(i)} onMouseEnter={() => setSelecionado(i)}
            style={{ cursor: 'pointer' }}
          />
        ))}
        <line x1={x(idxAtivo)} x2={x(idxAtivo)} y1={PAD_TOP} y2={H - PAD_BOT} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="2,2" pointerEvents="none" />
      </svg>

      <div className="row-wrap t-caption" style={{ gap: 12, marginTop: 2, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
        <span className="t-strong">{dataCurta(atual.data)}</span>
        <span style={{ color: 'var(--danger)' }}>Base {atual.base.toFixed(2)}%</span>
        <span style={{ color: 'var(--graphite)' }}>Previsto {atual.previsto.toFixed(2)}%</span>
        <span style={{ color: 'var(--info)' }}>
          {idxAtivo <= ultimoMedidoIdx ? `Realizado ${atual.realizado.toFixed(2)}%` : 'Realizado: ainda sem medição'}
        </span>
      </div>

      <div className="row-wrap" style={{ gap: 14, marginTop: 6 }}>
        <span className="t-caption" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 14, height: 2, background: 'var(--danger)', display: 'inline-block' }} /> Base
        </span>
        <span className="t-caption" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 14, height: 2, background: 'var(--graphite)', display: 'inline-block' }} /> Previsto
        </span>
        <span className="t-caption" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--info)', display: 'inline-block' }} /> Realizado
        </span>
      </div>
    </div>
  )
}

/* ── Progresso mensal (Prevision) ──────────────────────────────
   Igual à CurvaSPrevision, mas o que cada curva andou DENTRO de
   cada mês (não acumulado) — três barras por mês, mesma leitura do
   gráfico "Progresso Mensal" da tela deles. Sem minWidth de
   propósito (ver conversa: era isso que travava o toque no celular
   na Curva S) — o SVG escala pelo viewBox, nunca força scroll
   horizontal.

   A Prevision mostra o valor exato de cada barra num tooltip ao
   passar o mouse — no celular não tem mouse, então aqui é por
   toque: tocar num mês (ou passar o mouse, no desktop) mostra os
   valores dele embaixo do gráfico, igual ao "clique num período pra
   ver o detalhamento" que a tela deles já sugere.

   Meta (a barra cinza) não vem da API — a Prevision computa esse
   número só no front deles, a partir de um arquivo interno que a
   API não expõe (ver conversa, foi conferido de novo via
   introspecção e até interceptando a chamada de rede real da tela
   deles). Por isso ela é digitada à mão aqui: quando `onSalvarMeta`
   é passado, o mês selecionado ganha um campo editável. */
export function ProgressoMensalPrevision({ meses, onSalvarMeta, vazio = 'Nada aqui ainda.' }) {
  const [selecionado, setSelecionado] = useState(null)
  const [editando, setEditando] = useState(false)
  const [valorDigitado, setValorDigitado] = useState('')
  const [salvando, setSalvando] = useState(false)
  if (!meses || meses.length === 0) return <div className="t-caption">{vazio}</div>

  const max = Math.max(5, ...meses.flatMap((m) => [m.base, m.previsto, m.realizado || 0, m.meta || 0]))
  const W = 640
  const H = 200
  const PAD_TOP = 10
  const PAD_BOT = 30
  const areaUtil = H - PAD_TOP - PAD_BOT
  const grupoW = W / meses.length
  const barW = Math.min(11, grupoW / 6)
  const y = (v) => PAD_TOP + (1 - Math.min(max, Math.max(0, v)) / max) * areaUtil
  const xCentro = (i) => grupoW * i + grupoW / 2
  const idxAtivo = selecionado ?? meses.length - 1
  const atual = meses[idxAtivo]

  const selecionar = (i) => { setSelecionado(i); setEditando(false) }

  const iniciarEdicao = () => {
    setValorDigitado(atual.meta != null ? String(atual.meta) : '')
    setEditando(true)
  }

  const salvar = async () => {
    const numero = Number(String(valorDigitado).replace(',', '.'))
    if (!Number.isFinite(numero)) return
    setSalvando(true)
    await onSalvarMeta(atual.mes, numero)
    setSalvando(false)
    setEditando(false)
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={0} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="var(--border)" strokeWidth={1} />
        ))}
        {meses.map((m, i) => {
          const cx = xCentro(i)
          const ativo = i === idxAtivo
          return (
            <g key={m.mes} onClick={() => selecionar(i)} onMouseEnter={() => selecionar(i)} style={{ cursor: 'pointer' }}>
              <rect x={cx - grupoW / 2} y={PAD_TOP} width={grupoW} height={areaUtil} fill={ativo ? 'var(--surface-2)' : 'transparent'} />
              <rect x={cx - barW * 2 - 3} y={y(m.base)} width={barW} height={Math.max(0, H - PAD_BOT - y(m.base))} rx={1} fill="var(--danger)" />
              <rect x={cx - barW - 1} y={y(m.previsto)} width={barW} height={Math.max(0, H - PAD_BOT - y(m.previsto))} rx={1} fill="var(--graphite)" />
              {m.medido && (
                <rect x={cx + 1} y={y(m.realizado)} width={barW} height={Math.max(0, H - PAD_BOT - y(m.realizado))} rx={1} fill="var(--info)" />
              )}
              {m.meta != null && (
                <rect x={cx + barW + 3} y={y(m.meta)} width={barW} height={Math.max(0, H - PAD_BOT - y(m.meta))} rx={1} fill="var(--text-3)" />
              )}
              <text x={cx} y={H - PAD_BOT + 15} textAnchor="middle" fontSize="9" fill={ativo ? 'var(--text)' : 'var(--text-3)'} fontWeight={ativo ? 700 : 400}>
                {m.rotulo}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="row-wrap t-caption" style={{ gap: 12, marginTop: 2, paddingTop: 6, borderTop: '1px solid var(--border)', alignItems: 'center' }}>
        <span className="t-strong">{atual.rotulo}</span>
        <span style={{ color: 'var(--danger)' }}>Base {atual.base.toFixed(2)}%</span>
        <span style={{ color: 'var(--graphite)' }}>Previsto {atual.previsto.toFixed(2)}%</span>
        <span style={{ color: 'var(--info)' }}>{atual.medido ? `Realizado ${atual.realizado.toFixed(2)}%` : 'Realizado: ainda sem medição'}</span>

        {!editando && onSalvarMeta && (
          <button
            type="button" onClick={iniciarEdicao}
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
          >
            {atual.meta != null ? `Meta ${atual.meta.toFixed(2)}%` : 'Meta: não digitada'}
            <Icon name="editar" size={12} />
          </button>
        )}
        {!editando && !onSalvarMeta && (
          <span style={{ color: 'var(--text-3)' }}>{atual.meta != null ? `Meta ${atual.meta.toFixed(2)}%` : 'Meta: não digitada'}</span>
        )}

        {editando && (
          <span className="row-flex" style={{ gap: 6, alignItems: 'center' }}>
            <input
              type="number" inputMode="decimal" step="0.01" autoFocus
              value={valorDigitado} onChange={(e) => setValorDigitado(e.target.value)}
              style={{ width: 64, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
              placeholder="%"
            />
            <button type="button" className="btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }} disabled={salvando} onClick={salvar}>
              {salvando ? '...' : 'Salvar'}
            </button>
            <button type="button" style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer' }} onClick={() => setEditando(false)}>
              cancelar
            </button>
          </span>
        )}
      </div>

      <div className="row-wrap" style={{ gap: 14, marginTop: 6 }}>
        <span className="t-caption" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--danger)', display: 'inline-block' }} /> Base
        </span>
        <span className="t-caption" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--graphite)', display: 'inline-block' }} /> Previsto
        </span>
        <span className="t-caption" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--info)', display: 'inline-block' }} /> Realizado
        </span>
        <span className="t-caption" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--text-3)', display: 'inline-block' }} /> Meta (digitada à mão)
        </span>
      </div>
    </div>
  )
}
