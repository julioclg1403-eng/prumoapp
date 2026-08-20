/* ============================================================
   GRÁFICOS — peças pequenas em SVG/CSS puro, sem biblioteca (o
   bundle já tem peso de sobra com xlsx/pdf). Usadas pelos Dashboards
   (Suprimentos, Contratos, e o que mais precisar).

   Três formas cobrem quase todo dashboard de gestão:
   - RankingBarras: magnitude — "quem é maior" (top N, uma cor só).
   - GraficoColunas: tendência no tempo — uma barra por período.
   - GraficoDonut: parte-do-todo — poucas categorias (até uns 6).

   Regra de cor: o laranja da marca (--primary) é reservado pra ação/
   destaque, então os rankings e colunas (série única) usam ele como
   "a" cor — não tem ambiguidade porque não tem categoria nenhuma pra
   confundir. Só o donut, que PRECISA diferenciar categorias, usa o
   conjunto --chart-1..5 (ver index.css) em vez do laranja sozinho.
   ============================================================ */

/* ── Ranking (magnitude) ──────────────────────────────────────
   Uma barra por item, ordenado do maior pro menor (quem chama já
   manda ordenado). Trilho cinza + barra colorida com ponta
   arredondada; título vai à direita, curto, fora da barra (nunca
   cortado). Hover no título nativo do navegador serve de tooltip. */
export function RankingBarras({ itens, formatarValor, cor = 'var(--primary)', vazio = 'Nada aqui ainda.' }) {
  if (!itens || itens.length === 0) {
    return <div className="t-caption">{vazio}</div>
  }
  const max = Math.max(1, ...itens.map((i) => i.valor || 0))
  return (
    <div className="stack-1">
      {itens.map((item, i) => (
        <div key={item.chave ?? item.rotulo ?? i} className="rank-row" title={`${item.rotulo}: ${formatarValor(item.valor)}`}>
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
