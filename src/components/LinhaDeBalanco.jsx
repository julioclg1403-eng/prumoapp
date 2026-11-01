/* ============================================================
   LINHA DE BALANÇO — o mesmo desenho do painel Gerencial Yacht
   (aba "Linha de balanço"), só com dados de CRONOGRAMA: nenhum valor
   em dinheiro entra aqui. Fica no Início, abaixo da Curva S e do
   Progresso mensal, e se atualiza sozinha quando o Gerencial é
   atualizado (o painel grava o cronograma tratado em
   gerencial_cronograma).

   Eixo X = tempo; eixo Y = local (pavimento), de cima (último
   pavimento) pra baixo. Faixa colorida = datas atuais do cronograma ·
   contorno tracejado = linha de base · traço escuro = real.
   ============================================================ */

import { useMemo, useState } from 'react'

const DISCIPLINAS = [
  'Estrutura e fundação', 'Vedação e revestimento', 'Instalações', 'Esquadrias',
  'Acabamentos', 'Segurança e equipamentos', 'Limpeza e entrega',
]
const COR = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6']
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const dia = (s) => (s ? Date.parse(`${s}T00:00:00Z`) : null)
const curta = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}` : '–')
const diasEntre = (a, b) => Math.round((dia(b) - dia(a)) / 864e5)
const andarDe = (l) => {
  const k = /^Pav (\d+)/.exec(l)
  if (k && !/Fachada/.test(l)) return Number(k[1])
  return /^Pav Térreo$/.test(l) ? 1 : null
}

const RH = 15 // altura de cada local
const LW = 190 // largura da coluna de nomes
const W = 1100

export default function LinhaDeBalanco({ tarefas, locais, hoje }) {
  const [periodo, setPeriodo] = useState('12m')
  const [discAtivas, setDiscAtivas] = useState(() => new Set(DISCIPLINAS.map((_, i) => i)))
  const [mostrarBase, setMostrarBase] = useState(true)
  const [mostrarAtual, setMostrarAtual] = useState(true)
  const [mostrarReal, setMostrarReal] = useState(true)
  const [busca, setBusca] = useState('')
  const [dica, setDica] = useState(null)

  const desenho = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const T = (tarefas || [])
      .map((t, k) => ({ ...t, k }))
      .filter((t) => discAtivas.has(t.g) && (!q || t.t.toLowerCase().includes(q)) && (t.i || t.bi))

    const ref = dia(hoje)
    const [ano, mes] = [Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7))]
    let t0
    let t1
    if (periodo === '3m') { t0 = ref - 7 * 864e5; t1 = Date.UTC(ano, mes + 3, 1) }
    else if (periodo === '12m') { t0 = ref - 30 * 864e5; t1 = Date.UTC(ano, mes + 11, 1) }
    else {
      const ds = T.flatMap((t) => [t.i, t.f, t.bi, t.bf]).filter(Boolean).sort()
      if (!ds.length) return { vazio: true }
      t0 = dia(ds[0]) - 15 * 864e5
      t1 = dia(ds[ds.length - 1]) + 15 * 864e5
    }

    const visiveis = T.filter((t) => dia(t.f || t.bf) >= t0 && dia(t.i || t.bi) <= t1)
    if (!visiveis.length) return { vazio: true }

    const ordem = locais && locais.length ? locais : [...new Set(visiveis.map((t) => t.l))]
    const lots = ordem.filter((l) => visiveis.some((t) => t.l === l)).reverse() // de cima (último pav.) pra baixo
    const P = { t: 26, b: 8 }
    const H = P.t + lots.length * RH + P.b
    const iw = W - LW - 10
    const X = (t) => LW + ((t - t0) / (t1 - t0)) * iw
    const idx = new Map(lots.map((l, i) => [l, i]))
    const Y = (l) => P.t + idx.get(l) * RH
    return { t0, t1, visiveis, lots, P, H, iw, X, Y, ref }
  }, [tarefas, locais, hoje, periodo, discAtivas, busca])

  const alternarDisc = (i) => setDiscAtivas((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })

  if (!tarefas || !tarefas.length) return null

  const corpo = (() => {
    if (desenho.vazio) return <div className="t-caption" style={{ padding: 12 }}>Nenhuma atividade no período ou filtro escolhido.</div>
    const { t0, t1, visiveis, lots, P, H, iw, X, Y, ref } = desenho
    const g = []

    // grade de meses
    const span = (t1 - t0) / 864e5
    const passo = span > 900 ? 3 : span > 400 ? 2 : 1
    const d0 = new Date(t0)
    let m = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1)
    let mi = 0
    while (m <= t1) {
      const d = new Date(m)
      if (m >= t0) {
        g.push(<line key={`g${m}`} x1={X(m)} x2={X(m)} y1={P.t - 4} y2={H - P.b} stroke={d.getUTCMonth() === 0 ? '#b8b8b2' : '#e3e3e0'} />)
        if (mi % passo === 0 && Math.abs(X(m) - X(ref)) > 70) {
          g.push(<text key={`m${m}`} x={X(m) + 3} y={P.t - 9} fontSize="10.5" fill="#7d7c78">{MES[d.getUTCMonth()]}/{String(d.getUTCFullYear()).slice(2)}</text>)
        }
        mi++
      }
      m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
    }

    // nomes dos locais + zebra
    lots.forEach((l, i) => {
      if (i % 2) g.push(<rect key={`z${i}`} x={LW} y={P.t + i * RH} width={iw} height={RH} fill="#f4f4f3" />)
      g.push(<text key={`l${i}`} x={LW - 6} y={P.t + i * RH + RH / 2 + 4} fontSize="11" fill="#3a3a38" textAnchor="end">{l}</text>)
    })

    // faixas (tarefas repetidas em pavimentos consecutivos)
    const porTarefa = {}
    visiveis.forEach((t) => { (porTarefa[t.t] = porTarefa[t.t] || []).push(t) })
    const meio = (t) => Y(t.l) + RH / 2
    Object.entries(porTarefa).forEach(([nome, arr]) => {
      const fl = arr.filter((t) => andarDe(t.l) != null && t.i && t.f).sort((a, b) => andarDe(a.l) - andarDe(b.l))
      if (fl.length < 3) return
      const c = COR[arr[0].g]
      if (mostrarAtual) {
        const pts = [...fl.map((t) => `${X(dia(t.i))},${meio(t)}`), ...fl.slice().reverse().map((t) => `${X(dia(t.f) + 864e5)},${meio(t)}`)].join(' ')
        g.push(<polygon key={`b${nome}`} points={pts} fill={c} fillOpacity=".13" stroke={c} strokeOpacity=".55" strokeWidth="1" />)
      }
      if (mostrarBase) {
        const fb = arr.filter((t) => andarDe(t.l) != null && t.bi && t.bf).sort((a, b) => andarDe(a.l) - andarDe(b.l))
        if (fb.length >= 3) g.push(<polyline key={`p${nome}`} points={fb.map((t) => `${X(dia(t.bi))},${meio(t)}`).join(' ')} fill="none" stroke={c} strokeWidth="1" strokeDasharray="3 3" opacity=".8" />)
      }
    })

    // barras por atividade
    visiveis.forEach((t) => {
      const c = COR[t.g]
      const y = Y(t.l)
      if (mostrarBase && t.bi && t.bf) {
        g.push(<rect key={`bb${t.k}`} x={X(dia(t.bi))} y={y + 2} width={Math.max(2, X(dia(t.bf) + 864e5) - X(dia(t.bi)))} height={RH - 4} fill="none" stroke={c} strokeDasharray="3 2" rx="2" />)
      }
      if (mostrarAtual && t.i && t.f) {
        g.push(<rect key={`ba${t.k}`} x={X(dia(t.i))} y={y + 3} width={Math.max(2, X(dia(t.f) + 864e5) - X(dia(t.i)))} height={RH - 6} fill={c} rx="2" />)
      }
      if (mostrarReal && t.ri) {
        const fim = t.rf ? dia(t.rf) + 864e5 : Math.max(dia(t.ri) + 864e5, ref)
        g.push(<rect key={`br${t.k}`} x={X(dia(t.ri))} y={y + RH / 2 - 1.5} width={Math.max(2, X(fim) - X(dia(t.ri)))} height="3" fill="#0b0b0b" rx="1.5" pointerEvents="none" />)
      }
      const ini = X(dia(t.i || t.bi)) - 2
      const larg = Math.max(8, X(dia(t.f || t.bf) + 864e5) - X(dia(t.i || t.bi)) + 4)
      g.push(
        <rect
          key={`h${t.k}`} x={ini} y={y} width={larg} height={RH} fill="transparent"
          onMouseMove={(e) => setDica({ t, x: e.clientX, y: e.clientY })} onMouseLeave={() => setDica(null)}
        />,
      )
    })

    // hoje
    const rx = X(ref)
    if (rx > LW && rx < W) {
      g.push(<line key="hoje" x1={rx} x2={rx} y1={P.t - 4} y2={H - P.b} stroke="#d03b3b" strokeDasharray="4 3" />)
      g.push(<text key="hojet" x={rx + 3} y={P.t - 9} fontSize="10.5" fill="#d03b3b">hoje {curta(hoje)}</text>)
    }

    return (
      <>
        <div style={{ overflow: 'auto', maxHeight: 560, border: '1px solid var(--border)', borderRadius: 10, background: '#fcfcfb' }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ minWidth: 760, display: 'block' }} role="img" aria-label="Linha de balanço">{g}</svg>
        </div>
        <div className="t-caption">{visiveis.length} atividades em {lots.length} locais · {Object.keys(porTarefa).length} tarefas</div>
      </>
    )
  })()

  const t = dica?.t
  const desvio = t && t.f && t.bf ? diasEntre(t.bf, t.f) : null

  return (
    <div className="card-flat chart-panel stack-2">
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="t-micro">Linha de balanço — só cronograma</div>
        <div className="row-flex" style={{ gap: 4 }}>
          {[['3m', 'Próx. 3 meses'], ['12m', '12 meses'], ['obra', 'Obra toda']].map(([v, r]) => (
            <button key={v} type="button" className={`btn btn-sm ${periodo === v ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setPeriodo(v)}>{r}</button>
          ))}
        </div>
      </div>

      <div className="row-wrap" style={{ gap: 6 }}>
        {DISCIPLINAS.map((nome, i) => (
          <button
            key={nome} type="button" onClick={() => alternarDisc(i)}
            className={`btn btn-sm ${discAtivas.has(i) ? 'btn-secondary' : 'btn-ghost'}`}
            style={{ opacity: discAtivas.has(i) ? 1 : 0.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <i style={{ width: 10, height: 10, borderRadius: 3, background: COR[i], display: 'inline-block' }} />{nome}
          </button>
        ))}
      </div>

      <div className="row-wrap" style={{ gap: 14, alignItems: 'center' }}>
        <label className="row-flex" style={{ gap: 6 }}><input type="checkbox" checked={mostrarBase} onChange={(e) => setMostrarBase(e.target.checked)} /> Linha de base</label>
        <label className="row-flex" style={{ gap: 6 }}><input type="checkbox" checked={mostrarAtual} onChange={(e) => setMostrarAtual(e.target.checked)} /> Atual</label>
        <label className="row-flex" style={{ gap: 6 }}><input type="checkbox" checked={mostrarReal} onChange={(e) => setMostrarReal(e.target.checked)} /> Real</label>
        <input className="ipt" style={{ flex: 1, minWidth: 180, maxWidth: 280 }} type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar tarefa (ex.: Alvenaria)" />
      </div>

      {corpo}

      {t && (
        <div
          style={{
            position: 'fixed', left: Math.min(dica.x + 14, window.innerWidth - 270), top: Math.min(dica.y + 14, window.innerHeight - 190), zIndex: 3000,
            width: 250, background: '#18181B', color: '#FAFAFA', borderRadius: 8, padding: '8px 10px', fontSize: 12, lineHeight: 1.45, pointerEvents: 'none',
            boxShadow: '0 6px 20px rgba(0,0,0,.35)',
          }}
        >
          <b>{t.t}</b>
          <div style={{ opacity: 0.7 }}>{t.l}</div>
          <div>Linha de base: <b>{curta(t.bi)} – {curta(t.bf)}</b></div>
          <div>Atual: <b>{curta(t.i)} – {curta(t.f)}</b></div>
          <div>Real: <b>{t.ri ? `${curta(t.ri)} – ${t.rf ? curta(t.rf) : 'em andamento'}` : 'não iniciada'}</b></div>
          {desvio != null && <div>Desvio do término: <b style={{ color: desvio > 0 ? '#ff8a8a' : '#9be39b' }}>{desvio > 0 ? '+' : ''}{desvio} dias</b></div>}
        </div>
      )}
    </div>
  )
}
