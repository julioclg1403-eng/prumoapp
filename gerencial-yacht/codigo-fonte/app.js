/* Aplicativo de consulta — Obra YACHT · Gellen & Guimarães */
(function () {
  const PRISTINE = '<!DOCTYPE html>\n' + document.documentElement.outerHTML; // cópia limpa p/ "baixar HTML atualizado"
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const brl = (v, d = 0) => (v == null || isNaN(v)) ? '–' : (Math.abs(v) < 0.005 ? '–' : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const brlK = v => Math.abs(v) >= 1e6 ? (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi' : Math.abs(v) >= 1e3 ? (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil' : brl(v);
  const pct = v => (v == null || !isFinite(v)) ? '–' : (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  const fd = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(2, 4) : '–';
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const ml = k => MES[+k.slice(5, 7) - 1] + '/' + k.slice(2, 4);
  const addM = (k, n) => { let y = +k.slice(0, 4), m = +k.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + String(m + 1).padStart(2, '0'); };
  const mrange = (a, b) => { const o = []; for (let k = a; k <= b; k = addM(k, 1)) o.push(k); return o; };
  const D = s => s ? new Date(s + 'T00:00:00Z').getTime() : null;
  const days = (a, b) => Math.round((D(b) - D(a)) / 864e5);
  const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x), 0);
  const COL = { pago: 'var(--s1)', apagar: 'var(--s2)', prev: 'var(--ink2)', crono: 'var(--s3)', base: 'var(--s7)' };
  const DCOL = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)'];

  let RAW = JSON.parse($('#raw-data').textContent);
  let M = null;
  const S = { ref: todayISO(), view: 'painel', lob: { disc: new Set([0, 1, 2, 3, 4, 5, 6]), base: false, atual: true, real: true, per: 'obra', q: '', node: null }, svcOpen: new Set(), fluxoB: '', painelPer: 6, svcQ: '', memM: null, memOpen: new Set() };

  /* ---------------- cálculos ---------------- */
  function rebuild() {
    M = YM.build(RAW);
    // curva do cronograma por C (atual e linha de base)
    for (const n of Object.values(M.nodes)) {
      if (n.lv !== 'C') continue;
      const sc = YM.scope(M, n.id);
      n.cur = YM.curvaCrono(n.orc, sc.tasks, 'atual'); n.curBL = YM.curvaCrono(n.orc, sc.tasks, 'bl');
      n.herd = sc.herdadas; n.origem = sc.origem;
    }
    for (const n of Object.values(M.nodes)) if (n.lv === 'B') {
      n.cur = {}; n.curBL = {};
      for (const k of n.kids) { const c = M.nodes[k]; for (const [m, v] of Object.entries(c.cur)) n.cur[m] = (n.cur[m] || 0) + v; for (const [m, v] of Object.entries(c.curBL)) n.curBL[m] = (n.curBL[m] || 0) + v; }
    }
    M.cmp = RAW.orc ? YO.build(M, RAW) : null;
    M.ct = null;
    if (M.cmp) for (const o of Object.values(M.cmp.items)) { o.ct = 0; o.cts = []; o.qex = null; o.qx = null; }
    if (RAW.contratos && M.cmp) {
      const its = RAW.contratos.itens.map(x => ({ ...x })); YC.link(M, M.cmp, its); YC.qlink(M, M.cmp, its); YC.manual(M.cmp, its, (RAW.plano && RAW.plano.vinc) || {});
      const QX = YC.qexec(M.cmp, its); for (const [k, o] of Object.entries(QX)) { M.cmp.items[k].qex = o.qex; M.cmp.items[k].qx = o; }
      for (const it of its) for (const [k, sh] of it.parts) { const o = M.cmp.items[k]; o.ct += it.va * sh; o.cts.push({ it, sh }); }
      M.ct = { itens: its, sem: its.filter(i => !i.parts.length), dup: RAW.contratos.dup || [] };
    }
  }
  /* planejamento dos próximos 3 meses: fica nos dados do aplicativo (vai junto no "Baixar HTML atualizado") e no navegador */
  const LSK = 'yacht_plano_v1';
  function loadPlano() { let p = RAW.plano && RAW.plano.lines ? RAW.plano : { lines: [], upd: 0 }; try { const l = JSON.parse(localStorage.getItem(LSK) || 'null'); if (l && l.lines && (l.upd || 0) > (p.upd || 0)) p = l; } catch (e) { } p.vinc = p.vinc || {}; p.ovr = p.ovr || {}; p.mo = p.mo || {}; p.ok = p.ok || {}; p.aloc = p.aloc || {}; RAW.plano = p; }
  function savePlano() { RAW.plano.upd = Date.now(); try { localStorage.setItem(LSK, JSON.stringify(RAW.plano)); } catch (e) { } }
  const refM = () => S.ref.slice(0, 7);
  const win3 = () => [addM(refM(), 1), addM(refM(), 3)];
  /* competência da revisão (mês que está sendo fechado): R10 = out/26 → fluxo nov/26…jan/27. Só muda quando vocês fecham o mês. */
  const compM = () => RAW.cur ? (RAW.cur.mes || addM(RAW.cur.target, -1)) : refM();
  function lancStats(L) {
    const ref = S.ref, [a, b] = win3();
    const st = { pago: 0, ap: 0, venc: 0, j3: 0, apos: 0, mes: {} };
    for (const x of L) {
      st.pago += x.pg; st.ap += x.ap;
      const mk = x.d.slice(0, 7); const o = st.mes[mk] || (st.mes[mk] = { pg: 0, ap: 0 }); o.pg += x.pg; o.ap += x.ap;
      if (x.ap) { if (x.d < ref) st.venc += x.ap; else if (mk >= a && mk <= b) st.j3 += x.ap; else if (mk > b) st.apos += x.ap; }
    }
    return st;
  }
  function nodeAgg(id) {
    const sc = YM.scope(M, id); const n = sc.n;
    const nodes = sc.ids.map(i => M.nodes[i]);
    const mat = sum(nodes, x => x.mat), mo = sum(nodes, x => x.mo), ou = sum(nodes, x => x.ou);
    const prevTot = sum(Object.values(n.prev || {}));
    const st = lancStats(sc.lanc);
    const [a, b] = win3();
    let prev3 = 0; for (const [m, v] of Object.entries(n.prev || {})) if (m >= a && m <= b) prev3 += v;
    const t = sc.tasks;
    const ini = t.map(x => x.i).filter(Boolean).sort()[0], fim = t.map(x => x.f).filter(Boolean).sort().at(-1);
    const bfim = t.map(x => x.bf).filter(Boolean).sort().at(-1);
    const conc = t.filter(x => x.rf).length, and = t.filter(x => x.ri && !x.rf).length;
    const atras = t.filter(x => x.f && x.bf && x.f > x.bf).length;
    return { sc, n, mat, mo, ou, prevTot, st, prev3, ini, fim, bfim, conc, and, atras, desv: fim && bfim ? days(bfim, fim) : null };
  }

  /* ---------------- tooltip ---------------- */
  const tip = $('#tip');
  function showTip(html, ev) { tip.innerHTML = html; tip.hidden = false; moveTip(ev); }
  function moveTip(ev) { const w = tip.offsetWidth, h = tip.offsetHeight; let x = ev.clientX + 14, y = ev.clientY + 14; if (x + w > innerWidth - 8) x = ev.clientX - w - 14; if (y + h > innerHeight - 8) y = ev.clientY - h - 14; tip.style.left = x + 'px'; tip.style.top = y + 'px'; }
  const hideTip = () => { tip.hidden = true; };

  /* ---------------- gráfico mensal (barras empilhadas + linhas) ---------------- */
  function monthChart(el, months, bars, lines, opts = {}) {
    const W = Math.max(320, el.clientWidth || 900), H = opts.h || 260, P = { l: 64, r: 12, t: 12, b: 28 };
    const iw = W - P.l - P.r, ih = H - P.t - P.b, n = months.length;
    let max = 0;
    months.forEach(m => { const s = opts.grouped ? Math.max(0, ...bars.map(b => b.v[m] || 0)) : sum(bars, b => b.v[m] || 0); max = Math.max(max, s, ...lines.map(l => l.v[m] || 0)); });
    if (!max) max = 1;
    const nice = (() => { const e = Math.pow(10, Math.floor(Math.log10(max))); const f = max / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; })();
    const y = v => P.t + ih - v / nice * ih, bw = iw / n, x = i => P.l + bw * i + bw / 2;
    const barW = Math.max(3, Math.min(34, bw * 0.62));
    let g = '';
    for (let i = 0; i <= 4; i++) { const v = nice * i / 4, yy = y(v); g += `<line x1="${P.l}" x2="${W - P.r}" y1="${yy}" y2="${yy}" class="grid"/><text x="${P.l - 8}" y="${yy + 4}" class="ax" text-anchor="end">${(opts.fmt || brlK)(v)}</text>`; }
    const step = Math.ceil(n / Math.floor(iw / 52));
    months.forEach((m, i) => { if (i % step === 0) g += `<text x="${x(i)}" y="${H - 8}" class="ax" text-anchor="middle">${ml(m)}</text>`; });
    if (opts.refM) { const i = months.indexOf(opts.refM); if (i >= 0) g += `<line x1="${x(i)}" x2="${x(i)}" y1="${P.t}" y2="${P.t + ih}" class="refl"/><text x="${x(i) + 4}" y="${P.t + 10}" class="ax">hoje</text>`; }
    if (opts.grouped) months.forEach((m, i) => {
      const k = bars.length, gw = Math.min(bw * 0.8, 14 * k + 2 * (k - 1)), w1 = Math.max(1.5, (gw - 2 * (k - 1)) / k);
      bars.forEach((b, j) => {
        const v = b.v[m] || 0; if (v <= 0) return;
        const x0 = x(i) - gw / 2 + j * (w1 + 2), yy = y(v), hgt = Math.max(1, y(0) - yy), r = Math.min(3, w1 / 2, hgt);
        g += `<path d="M${x0},${yy + hgt}V${yy + r}Q${x0},${yy} ${x0 + r},${yy}H${x0 + w1 - r}Q${x0 + w1},${yy} ${x0 + w1},${yy + r}V${yy + hgt}Z" fill="${b.c}"/>`;
      });
    });
    else months.forEach((m, i) => {
      let base = 0; const vals = bars.map(b => b.v[m] || 0); const top = vals.reduce((a, v, j) => v > 0 ? j : a, -1);
      bars.forEach((b, j) => {
        const v = vals[j]; if (v <= 0) return;
        const y0 = y(base), y1 = y(base + v); const hgt = Math.max(1, y0 - y1 - (base > 0 ? 2 : 0));
        const r = j === top ? Math.min(4, barW / 2, hgt) : 0;
        const x0 = x(i) - barW / 2, yy = y1;
        g += r ? `<path d="M${x0},${yy + hgt}V${yy + r}Q${x0},${yy} ${x0 + r},${yy}H${x0 + barW - r}Q${x0 + barW},${yy} ${x0 + barW},${yy + r}V${yy + hgt}Z" fill="${b.c}"/>` : `<rect x="${x0}" y="${yy}" width="${barW}" height="${hgt}" fill="${b.c}"/>`;
        base += v;
      });
    });
    lines.forEach(l => {
      // meses sem valor (ex.: realizado depois de hoje) não viram zero: a linha para ali
      const segs = []; let cur = []; months.forEach((m, i) => { if (l.v[m] == null && opts.gaps) { if (cur.length) segs.push(cur); cur = []; } else cur.push(`${x(i)},${y(l.v[m] || 0)}`); }); if (cur.length) segs.push(cur);
      for (const sg of segs) g += `<polyline points="${sg.join(' ')}" fill="none" stroke="${l.c}" stroke-width="2" ${l.dash ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round"/>`;
      if (n <= 40) months.forEach((m, i) => { if (l.v[m]) g += `<circle cx="${x(i)}" cy="${y(l.v[m])}" r="3" fill="${l.c}" stroke="var(--surf)" stroke-width="1.5"/>`; });
    });
    g += `<line class="xh" x1="0" x2="0" y1="${P.t}" y2="${P.t + ih}" visibility="hidden"/>`;
    g += `<rect class="hit" x="${P.l}" y="${P.t}" width="${iw}" height="${ih}" fill="transparent"/>`;
    const leg = [...bars.map(b => `<span><i style="background:${b.c}"></i>${esc(b.name)}</span>`), ...lines.map(l => `<span><i class="ln${l.dash ? ' dash' : ''}" style="border-color:${l.c}"></i>${esc(l.name)}</span>`)].join('');
    el.innerHTML = `<div class="legend">${leg}</div><svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(opts.label || 'Gráfico mensal')}">${g}</svg>`;
    const svg = el.querySelector('svg'), xh = svg.querySelector('.xh');
    svg.querySelector('.hit').addEventListener('mousemove', ev => {
      const r = svg.getBoundingClientRect(); const px = (ev.clientX - r.left) * W / r.width;
      const i = Math.max(0, Math.min(n - 1, Math.floor((px - P.l) / bw))); const m = months[i];
      xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.setAttribute('visibility', 'visible');
      const rows = [...bars.map(b => [b.name, b.v[m] || 0, b.c]), ...lines.map(l => [l.name, l.v[m] || 0, l.c])];
      showTip(`<b>${ml(m)}</b>` + rows.map(([nm, v, c]) => `<div class="tr"><i style="background:${c}"></i>${esc(nm)}<b>${(opts.fmt || brl)(v)}</b></div>`).join('') + (opts.onPick ? '<div class="sub tipclk">Clique para ver os cálculos deste mês</div>' : ''), ev);
    });
    svg.querySelector('.hit').addEventListener('mouseleave', () => { xh.setAttribute('visibility', 'hidden'); hideTip(); });
    if (opts.onPick) { svg.querySelector('.hit').style.cursor = 'pointer'; svg.querySelector('.hit').addEventListener('click', ev => { const r = svg.getBoundingClientRect(); const px = (ev.clientX - r.left) * W / r.width; const i = Math.max(0, Math.min(n - 1, Math.floor((px - P.l) / bw))); opts.onPick(months[i]); }); }
    if (opts.table) {
      const t = document.createElement('details'); t.className = 'tview';
      t.innerHTML = `<summary>Ver em tabela</summary><div class="tw"><table class="t"><thead><tr><th>Mês</th>${[...bars, ...lines].map(s => `<th class="n">${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${months.map(m => `<tr><td>${ml(m)}</td>${[...bars, ...lines].map(s => `<td class="n">${s.v[m] == null ? '–' : (opts.fmt || brl)(s.v[m] || 0)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      el.appendChild(t);
    }
  }

  /* ---------------- telas ---------------- */
  const views = {};
  function render() {
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === S.view));
    const main = $('#main'); main.innerHTML = ''; hideTip();
    views[S.view](main);
    $('#src').innerHTML = srcInfo();
  }
  function srcInfo() {
    const r = M.rp, dmin = r.map(x => x.d).sort()[0], dmax = r.map(x => x.d).sort().at(-1);
    return `<span title="Relatório Pagar &amp; Pago">Fluxo: ${r.length} parcelas (${fd(dmin)}–${fd(dmax)})</span><span>${RAW.cur ? esc(RAW.cur.name.replace(/\.xlsx$/i, '')) + ' (competência ' + ml(compM()) + ')' : 'FLUXO-BASE'}: ${Object.values(M.nodes).filter(n => n.lv === 'C' && !n.extra).length} serviços</span><span>Cronograma: ${M.tasks.length} atividades${M.dupTasks.length ? ' (' + M.dupTasks.length + ' duplicadas fora)' : ''}${M.meta.cronoGerado ? ' · gerado ' + fd(M.meta.cronoGerado) : ''}</span><span>Orçamento R${esc(M.meta.orcRev)}${M.meta.orcData ? ' · ' + fd(M.meta.orcData) : ''}</span>`;
  }
  const tile = (lab, val, sub, cls = '', calc = '') => `<div class="tile ${cls}${calc ? ' tcalc' : ''}"${calc ? ` data-calc="${calc}" title="Clique para ver o cálculo"` : ''}><div class="tl">${lab}${calc ? '<span class="vc">ver cálculo ›</span>' : ''}</div><div class="tv">${val}</div>${sub ? `<div class="ts">${sub}</div>` : ''}</div>`;

  /* ===== PAINEL ===== */
  views.painel = function (el) {
    const C = Object.values(M.nodes).filter(n => n.lv === 'C');
    const orc = sum(C, n => n.orc), st = lancStats(M.rp);
    const [a, b] = win3();
    const prev = {}; C.forEach(n => Object.entries(n.prev).forEach(([m, v]) => prev[m] = (prev[m] || 0) + v));
    const cur = {}, curBL = {}; C.forEach(n => { Object.entries(n.cur).forEach(([m, v]) => cur[m] = (cur[m] || 0) + v); Object.entries(n.curBL).forEach(([m, v]) => curBL[m] = (curBL[m] || 0) + v); });
    let prev3 = 0; Object.entries(prev).forEach(([m, v]) => { if (m >= a && m <= b) prev3 += v; });
    const T = M.tasks, conc = T.filter(t => t.rf).length, and = T.filter(t => t.ri && !t.rf).length;
    const devIni = T.filter(t => !t.ri && t.i && t.i < S.ref).length;
    const atr = T.filter(t => t.f && t.bf && t.f > t.bf).length;
    el.innerHTML = `
      <section class="card"><div class="ch"><h2>Orçado × cronograma atual × previsto FLUXO-BASE × gasto — mês a mês</h2><button id="rmtab" class="lnk">Ver tabela</button></div>
        <p class="hint">Mesma base da planilha RESUMO MENSAL: simulação = orçado distribuído pelas datas atuais do cronograma (sem duplicidades); previsto = coluna do mês na ${esc(RAW.cur ? RAW.cur.name.replace(/\.xlsx$/i, '') : 'YAC-FLUXO')}; gasto = Pagar&amp;Pago do relatório. <b>Clique em qualquer mês para abrir a tabela.</b></p>
        <div id="rmch"></div></section>
      <div class="tiles">
        ${tile('Orçado (FLUXO-BASE / Orçamento R' + esc(M.meta.orcRev) + ')', 'R$ ' + brlK(orc), 'M.O. orçada R$ ' + brlK(sum(C, n => n.mo)), '', 'orc')}
        ${tile('Pago no relatório', 'R$ ' + brlK(st.pago), pct(st.pago / orc) + ' do orçado', '', 'pago')}
        ${tile('A pagar — próximos 3 meses', 'R$ ' + brlK(st.j3), ml(a) + ' a ' + ml(b) + ' · previsto FLUXO-BASE R$ ' + brlK(prev3), '', 'j3')}
        ${tile('A pagar vencido', 'R$ ' + brlK(st.venc), 'data anterior a ' + fd(S.ref), st.venc > 0 ? 'crit' : '', 'venc')}
        ${tile('Cronograma', conc + ' concluídas · ' + and + ' em andamento', devIni + ' deveriam ter iniciado · ' + atr + ' com término após a linha de base', '', 'crono')}
      </div>
      <section class="card"><div class="ch"><h2>Desembolso mensal</h2><div class="seg" id="pper">${[[6, '−2 / +3 meses'], [12, '12 meses'], [0, 'Obra toda']].map(([v, l]) => `<button data-v="${v}" class="${S.painelPer === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <p class="hint">Barras: Pagar &amp; Pago do relatório. Linhas: previsto da FLUXO-BASE e o orçado distribuído pelas datas do cronograma.</p>
        <div id="pch"></div></section>
      <section class="card"><div class="ch"><h2>Próximos 3 meses por etapa</h2><span class="hint">clique na etapa para abrir a ficha</span></div><div class="tw" id="ptab"></div></section>
      <section class="card" id="mem"></section>`;
    let months;
    if (S.painelPer === 6) months = mrange(addM(refM(), -2), addM(refM(), 3));
    else if (S.painelPer === 12) months = mrange(addM(refM(), -3), addM(refM(), 8));
    else { const ks = [...Object.keys(prev), ...Object.keys(cur), ...Object.keys(st.mes)].filter(k => Object.values(prev).length).sort(); months = mrange(ks[0], ks.at(-1)); }
    const pg = {}, ap = {}; Object.entries(st.mes).forEach(([m, o]) => { pg[m] = o.pg; ap[m] = o.ap; });
    monthChart($('#pch'), months, [{ name: 'Pago', c: COL.pago, v: pg }, { name: 'A pagar', c: COL.apagar, v: ap }],
      [{ name: 'Previsto FLUXO-BASE', c: COL.prev, v: prev }, { name: 'Orçado × cronograma atual', c: COL.crono, v: cur }, { name: 'Orçado × linha de base', c: COL.base, v: curBL, dash: true }], { refM: refM(), table: true, h: 280, label: 'Desembolso mensal', onPick: m => { S.memM = m; drawMem(); openCalcMonth(m); } });
    el.querySelector('.tiles').onclick = e => { const t = e.target.closest('.tcalc'); if (t) openCalcTile(t.dataset.calc); };
    drawMem();
    drawResumoMensal();
    $('#pper').onclick = e => { const v = e.target.dataset.v; if (v != null) { S.painelPer = +v; render(); } };
    const Bs = Object.values(M.nodes).filter(n => n.lv === 'B');
    const ms = mrange(a, b);
    let rows = '', tot = { p: ms.map(() => 0), a: ms.map(() => 0), v: 0 };
    for (const B of Bs) {
      const ag = nodeAgg(B.id); const p = ms.map(m => B.prev[m] || 0), q = ms.map(m => (ag.st.mes[m] || {}).ap || 0);
      if (!sum(p) && !sum(q) && !ag.st.venc) continue;
      p.forEach((v, i) => tot.p[i] += v); q.forEach((v, i) => tot.a[i] += v); tot.v += ag.st.venc;
      rows += `<tr class="clk" data-n="${B.id}"><td>${esc(B.id)} · ${esc(B.desc)}</td>${ms.map((m, i) => `<td class="n">${brl(p[i])}</td><td class="n sub">${brl(q[i])}</td>`).join('')}<td class="n"><b>${brl(sum(p))}</b></td><td class="n"><b>${brl(sum(q))}</b></td><td class="n ${ag.st.venc ? 'crit' : ''}">${brl(ag.st.venc)}</td></tr>`;
    }
    $('#ptab').innerHTML = `<table class="t"><thead><tr><th rowspan="2">Etapa</th>${ms.map(m => `<th colspan="2" class="c">${ml(m)}</th>`).join('')}<th colspan="2" class="c">3 meses</th><th rowspan="2" class="n">Vencido</th></tr><tr>${ms.map(() => '<th class="n">Previsto</th><th class="n">A pagar</th>').join('')}<th class="n">Previsto</th><th class="n">A pagar</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>Total</td>${ms.map((m, i) => `<td class="n">${brl(tot.p[i])}</td><td class="n">${brl(tot.a[i])}</td>`).join('')}<td class="n">${brl(sum(tot.p))}</td><td class="n">${brl(sum(tot.a))}</td><td class="n">${brl(tot.v)}</td></tr></tfoot></table>`;
    $('#ptab').onclick = e => { const tr = e.target.closest('tr[data-n]'); if (tr) openFicha(tr.dataset.n); };
  };


  const ORIG = { etapa: 'tarefas da etapa', semelhante: 'datas do serviço parecido', prazo: 'sem tarefa — prazo da obra' };
  const origTag = o => ORIG[o] ? ` <span class="sub">(${ORIG[o]})</span>` : '';
  /* ===== MEMÓRIA DE CÁLCULO — orçado × cronograma ===== */
  function diasTarefa(t, ini, fim, m) { // total de dias da tarefa e dias dentro do mês m
    if (!t[ini] || !t[fim]) return [0, 0];
    const a = D(t[ini]), b = D(t[fim]) + 864e5; const tot = (b - a) / 864e5;
    const ms = Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 1), me = Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1);
    return [tot, Math.max(0, (Math.min(b, me) - Math.max(a, ms)) / 864e5)];
  }
  function drawMem() {
    const el = $('#mem'); if (!el) return;
    const all = new Set(); Object.values(M.nodes).forEach(n => { if (n.lv === 'C') { Object.keys(n.cur || {}).forEach(k => all.add(k)); Object.keys(n.prev || {}).forEach(k => all.add(k)); } });
    const meses = [...all].sort(); const m = S.memM || addM(refM(), 1);
    const rows = [];
    for (const n of Object.values(M.nodes)) {
      if (n.lv !== 'C') continue;
      const sc = YM.scope(M, n.id); let tA = 0, mA = 0, tB = 0, mB = 0; const ts = [];
      for (const t of sc.tasks) { const [x, y] = diasTarefa(t, 'i', 'f', m), [u, v] = diasTarefa(t, 'bi', 'bf', m); tA += x; mA += y; tB += u; mB += v; if (y || v) ts.push([t, y, v]); }
      const vA = tA ? n.orc * mA / tA : 0, vB = tB ? n.orc * mB / tB : 0, pv = (n.prev || {})[m] || 0;
      if (vA < 0.5 && vB < 0.5 && pv < 0.5) continue;
      rows.push({ n, nt: sc.tasks.length, herd: sc.herdadas, origem: sc.origem, tA, mA, vA, tB, mB, vB, pv, ts });
    }
    rows.sort((a, b) => b.vA - a.vA || b.pv - a.pv);
    const T = k => sum(rows, r => r[k]);
    const f0 = v => v ? v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '–';
    el.innerHTML = `<div class="ch"><h2>Memória de cálculo — orçado × cronograma</h2>
        <label class="ck">Mês <select id="memm">${meses.map(k => `<option value="${k}" ${k === m ? 'selected' : ''}>${ml(k)}</option>`).join('')}</select></label></div>
      <p class="hint"><b>Valor do mês = orçado do serviço × (dias de tarefa no mês ÷ total de dias de tarefa do serviço)</b>. Os dias somam as tarefas ligadas ao serviço (tarefas em paralelo somam). Sub-etapas sem tarefa própria usam as tarefas da etapa; serviços do orçamento sem nenhuma tarefa usam as datas do serviço mais parecido (lista em Vínculos) — assim o total distribuído é sempre igual ao orçado. "Atual" usa as datas atuais do cronograma; "Linha de base", as datas de base. Clique num serviço para ver as tarefas que caem no mês; clique num mês do gráfico acima para trocar o mês.</p>
      <div class="tw tall" style="max-height:620px"><table class="t"><thead>
        <tr><th rowspan="2">Serviço</th><th rowspan="2" class="n">Orçado</th><th rowspan="2" class="n">Tarefas</th><th colspan="3" class="c">Cronograma atual</th><th colspan="3" class="c">Linha de base</th><th rowspan="2" class="n">Previsto<br>FLUXO-BASE</th></tr>
        <tr><th class="n">Dias de tarefa<br>no total</th><th class="n">Dias em<br>${ml(m)}</th><th class="n">Valor ${ml(m)}</th><th class="n">Dias de tarefa<br>no total</th><th class="n">Dias em<br>${ml(m)}</th><th class="n">Valor ${ml(m)}</th></tr></thead>
        <tbody>${rows.map(r => `<tr class="clk mrow" data-n="${r.n.id}"><td>${S.memOpen.has(r.n.id) ? '▾' : '▸'} ${esc(r.n.id)} · ${esc(r.n.desc)}${origTag(r.origem)}</td><td class="n">${brl(r.n.orc)}</td><td class="n">${r.nt || '–'}</td>
          <td class="n">${f0(r.tA)}</td><td class="n">${f0(r.mA)}</td><td class="n"><b>${brl(r.vA)}</b></td><td class="n">${f0(r.tB)}</td><td class="n">${f0(r.mB)}</td><td class="n">${brl(r.vB)}</td><td class="n">${brl(r.pv)}</td></tr>` +
          (S.memOpen.has(r.n.id) ? r.ts.sort((a, b) => (a[0].i || '').localeCompare(b[0].i || '')).map(([t, y, v]) => `<tr class="sub2"><td style="padding-left:34px">${esc(t.t)} · <span class="sub">${esc(t.l)}</span></td><td></td><td></td><td class="n sub">${fd(t.i)} – ${fd(t.f)}</td><td class="n">${f0(y)}</td><td></td><td class="n sub">${fd(t.bi)} – ${fd(t.bf)}</td><td class="n">${f0(v)}</td><td></td><td></td></tr>`).join('') +
            `<tr class="sub2"><td style="padding-left:34px" colspan="10" class="sub">Conta: ${brl(r.n.orc)} × ${f0(r.mA)} ÷ ${f0(r.tA)} = <b>${brl(r.vA)}</b> (atual) · ${brl(r.n.orc)} × ${f0(r.mB)} ÷ ${f0(r.tB)} = <b>${brl(r.vB)}</b> (linha de base)</td></tr>` : '')).join('')}</tbody>
        <tfoot><tr><td>Total ${ml(m)}</td><td></td><td></td><td></td><td></td><td class="n">${brl(T('vA'))}</td><td></td><td></td><td class="n">${brl(T('vB'))}</td><td class="n">${brl(T('pv'))}</td></tr></tfoot></table></div>`;
    $('#memm').onchange = e => { S.memM = e.target.value; drawMem(); };
    el.querySelector('tbody').onclick = e => { const tr = e.target.closest('tr.mrow'); if (!tr) return; const id = tr.dataset.n; S.memOpen.has(id) ? S.memOpen.delete(id) : S.memOpen.add(id); drawMem(); };
  }



  /* ===== RESUMO MENSAL (gráfico no topo do Painel + tabela ao clicar) ===== */
  function resumoMensal() {
    const C = Object.values(M.nodes).filter(n => n.lv === 'C');
    const sim = {}, prev = {}, gasto = {}, pago = {}, apag = {}, atv = {};
    C.forEach(n => { Object.entries(n.cur || {}).forEach(([m, v]) => sim[m] = (sim[m] || 0) + v); Object.entries(n.prev || {}).forEach(([m, v]) => prev[m] = (prev[m] || 0) + v); });
    M.rp.forEach(x => { const m = x.d.slice(0, 7); gasto[m] = (gasto[m] || 0) + x.pg + x.ap; pago[m] = (pago[m] || 0) + x.pg; apag[m] = (apag[m] || 0) + x.ap; });
    // período = do primeiro mês do cronograma/relatório ao último (o previsto de meses anteriores à obra fica fora, como na planilha)
    const ks = [...new Set([...Object.keys(sim), ...Object.keys(gasto)])].sort();
    const months = ks.length ? mrange(ks[0], ks.at(-1)) : [];
    for (const m of months) { const a = D(m + '-01'), b = Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1); atv[m] = M.tasks.filter(t => t.i && t.f && D(t.i) < b && D(t.f) + 864e5 > a).length; }
    return { months, sim, prev, gasto, pago, apag, atv, orc: sum(C, n => n.orc) };
  }
  function drawResumoMensal() {
    const el = $('#rmch'); if (!el) return; const R = resumoMensal();
    monthChart(el, R.months, [{ name: 'Simulação orçado × cronograma atual', c: COL.crono, v: R.sim }, { name: 'Previsto FLUXO-BASE', c: COL.prev, v: R.prev }, { name: 'Gasto (Pagar&Pago)', c: COL.apagar, v: R.gasto }], [],
      { grouped: true, refM: refM(), h: 300, label: 'Resumo mensal', onPick: m => openResumoMensal(m) });
    $('#rmtab').onclick = () => openResumoMensal(null);
  }
  function openResumoMensal(sel) {
    const R = resumoMensal(); let aS = 0, aP = 0, aG = 0;
    const rows = R.months.map(m => {
      const s = R.sim[m] || 0, p = R.prev[m] || 0, g = R.gasto[m] || 0; aS += s; aP += p; aG += g;
      return `<tr class="clk${m === sel ? ' hlsel' : ''}" data-m="${m}" ${m === sel ? 'id="rmsel"' : ''}><td>${ml(m)}</td><td class="n"><b>${brl(s, 2)}</b></td><td class="n">${brl(p, 2)}</td><td class="n"><b>${brl(g, 2)}</b></td><td class="n ${g - p > 0.005 ? 'crit' : g - p < -0.005 ? 'okv' : ''}"><b>${brl(g - p, 2)}</b></td><td class="n sub">${brl(R.pago[m] || 0, 2)}</td><td class="n sub">${brl(R.apag[m] || 0, 2)}</td><td class="n">${brl(s - p, 2)}</td><td class="n">${brl(aS, 2)}</td><td class="n">${brl(aP, 2)}</td><td class="n">${brl(aG, 2)}</td><td class="n">${pct(R.orc ? aS / R.orc : 0)}</td><td class="n">${R.atv[m] || '–'}</td></tr>`;
    }).join('');
    const T = k => sum(R.months, m => R[k][m] || 0);
    openCalc('Resumo mensal — orçado × cronograma atual × previsto FLUXO-BASE × gasto', `Orçado total (FLUXO-BASE): R$ ${brl(R.orc, 2)} · clique num mês para abrir a memória de cálculo dele`,
      `<p class="hint"><b>Simulação</b> = para cada atividade (datas atuais, sem duplicidades): orçado do serviço ÷ dias de atividade do serviço × dias da atividade no mês. <b>Previsto</b> = coluna do mês na FLUXO-BASE da ${esc(RAW.cur ? RAW.cur.name : 'YAC-FLUXO')}. <b>Gasto</b> = Pagar&amp;Pago do relatório (pago + a pagar) pela data da parcela. <b>Saldo mês</b> = gasto − previsto: <span class="okv">verde</span> quando o gasto ficou abaixo do previsto, <span class="crit">vermelho</span> quando ficou acima.</p>
      <div class="tw" style="max-height:calc(100vh - 200px)"><table class="t" id="rmt"><thead><tr><th>Mês</th><th class="n">Simulação orçado ×<br>cronograma atual</th><th class="n">Previsto<br>FLUXO-BASE</th><th class="n">Gasto<br>(Pagar&amp;Pago)</th><th class="n">Saldo mês<br><span class="sub">(gasto − previsto)</span></th><th class="n">dos quais<br>Pago</th><th class="n">dos quais<br>A pagar</th><th class="n">Simulação −<br>Previsto</th><th class="n">Simulação<br>acumulada</th><th class="n">Previsto<br>acumulado</th><th class="n">Gasto<br>acumulado</th><th class="n">% do orçado<br>(sim. acum.)</th><th class="n">Atividades<br>no mês</th></tr></thead>
      <tbody>${rows}</tbody><tfoot><tr><td>Total</td><td class="n">${brl(T('sim'), 2)}</td><td class="n">${brl(T('prev'), 2)}</td><td class="n">${brl(T('gasto'), 2)}</td><td class="n ${T('gasto') - T('prev') > 0.005 ? 'crit' : 'okv'}">${brl(T('gasto') - T('prev'), 2)}</td><td class="n">${brl(T('pago'), 2)}</td><td class="n">${brl(T('apag'), 2)}</td><td class="n">${brl(T('sim') - T('prev'), 2)}</td><td></td><td></td><td></td><td></td><td></td></tr></tfoot></table></div>`);
    $('#rmt tbody').onclick = e => { const tr = e.target.closest('tr[data-m]'); if (tr) openCalcMonth(tr.dataset.m); };
    const se = $('#rmsel'); if (se) se.scrollIntoView({ block: 'center' });
  }

  /* ===== MEMÓRIA DE CÁLCULO (cards e meses do gráfico) ===== */
  const f0 = v => v ? v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '–';
  function openCalc(title, sub, html) {
    let o = $('#calc'); if (!o) { o = document.createElement('div'); o.id = 'calc'; document.body.appendChild(o); o.addEventListener('click', e => { if (e.target.id === 'calc') closeCalc(); }); }
    o.hidden = false; document.body.classList.add('noscroll');
    o.innerHTML = `<div class="dw"><header><div><div class="sub">Memória de cálculo</div><h2>${title}</h2><div class="sub">${sub || ''}</div></div><div class="dact"><button id="cx" aria-label="Fechar">×</button></div></header>${html}</div>`;
    $('#cx').onclick = closeCalc;
    o.querySelectorAll('.xt').forEach(t => t.addEventListener('click', e => { const tr = e.target.closest('tr[data-x]'); if (!tr) return; const k = tr.dataset.x; const open = tr.classList.toggle('open'); t.querySelectorAll('tr.k' + k).forEach(r => r.hidden = !open); tr.querySelector('.ar').textContent = open ? '▾' : '▸'; }));
  }
  function closeCalc() { const o = $('#calc'); if (o) o.hidden = true; if (S.planOpen) { const pid = S.planOpen; S.planOpen = null; if (!$('#drawer').hidden && S.fichaId) { openFicha(S.fichaId); return; } if (S.view === 'contratos') { const y = scrollY; render(); scrollTo(0, y); } } if ($('#drawer').hidden) document.body.classList.remove('noscroll'); }
  addEventListener('keydown', e => { if (e.key === 'Escape') closeCalc(); });
  let XID = 0;
  /* tabela com linhas que abrem detalhe: rows = [{ c:[células], kids:[[células]], cls }] */
  function xtable(head, rows, foot, nc) {
    let h = `<div class="tw tall" style="max-height:520px"><table class="t xt"><thead><tr>${head.map(x => `<th class="${x[1] || ''}">${x[0]}</th>`).join('')}</tr></thead><tbody>`;
    for (const r of rows) {
      const k = ++XID, has = r.kids && r.kids.length;
      h += `<tr ${has ? `data-x="${k}" class="clk"` : ''}>${r.c.map((v, i) => `<td class="${head[i][1] || ''}">${i === 0 ? `<span class="ar">${has ? '▸' : ''}</span> ` : ''}${v}</td>`).join('')}</tr>`;
      if (has) h += r.kids.map(kc => `<tr class="sub2 k${k}" hidden>${kc.map((v, i) => `<td class="${head[i] ? head[i][1] || '' : ''}"${i === 0 ? ' style="padding-left:30px"' : ''}>${v}</td>`).join('')}</tr>`).join('');
    }
    h += '</tbody>' + (foot ? `<tfoot><tr>${foot.map((v, i) => `<td class="${head[i][1] || ''}">${v}</td>`).join('')}</tr></tfoot>` : '') + '</table></div>';
    return h;
  }
  const sec = (titulo, total, regra, corpo, open) => `<details class="calc" ${open ? 'open' : ''}><summary><span>${titulo}</span><b>R$ ${brl(total, 2)}</b></summary><p class="hint">${regra}</p>${corpo}</details>`;
  const nodeName = id => id && M.nodes[id] ? esc(id + ' · ' + M.nodes[id].desc) : '<span class="crit">sem serviço</span>';
  function lancTable(L, campo, opts = {}) {
    // agrupa por serviço; detalhe = parcelas
    const g = {}; for (const x of L) { const v = x[campo]; if (!v) continue; (g[x.n || ''] || (g[x.n || ''] = [])).push(x); }
    const rows = Object.entries(g).map(([id, xs]) => ({ v: sum(xs, x => x[campo]), id, xs })).sort((a, b) => b.v - a.v);
    const tot = sum(rows, r => r.v);
    return { tot, html: xtable([['Serviço / parcela'], ['Fornecedor'], ['Data', 'c'], ['Parcelas · proc./parc.', 'n'], ['Valor (R$)', 'n']],
      rows.map(r => ({ c: [nodeName(r.id), '', '', r.xs.length, brl(r.v, 2)], kids: r.xs.sort((a, b) => b[campo] - a[campo]).map(x => [esc(x.ins), esc(x.forn), fd(x.d) + (opts.venc && x.d < S.ref ? ' <span class="crit">vencida</span>' : ''), esc(x.proc + '/' + x.parc), brl(x[campo], 2)]) })),
      ['Total', '', '', sum(rows, r => r.xs.length), brl(tot, 2)]) };
  }
  function cronoRows(m, ids, campo) {
    const ini = campo === 'bl' ? 'bi' : 'i', fim = campo === 'bl' ? 'bf' : 'f';
    const rows = [];
    for (const id of ids) {
      const n = M.nodes[id]; if (!n || n.lv !== 'C') continue;
      const sc = YM.scope(M, id); let tt = 0, tm = 0; const ts = [];
      for (const t of sc.tasks) { const [x, y] = diasTarefa(t, ini, fim, m); tt += x; tm += y; if (y) ts.push([t, y]); }
      const v = tt ? n.orc * tm / tt : 0; if (v < 0.5) continue;
      rows.push({ c: [nodeName(id) + origTag(sc.origem), brl(n.orc), f0(tt), f0(tm), `${brl(n.orc)} × ${f0(tm)} ÷ ${f0(tt)}`, '<b>' + brl(v, 2) + '</b>'], v,
        kids: ts.sort((a, b) => (a[0][ini] || '').localeCompare(b[0][ini] || '')).map(([t, y]) => [esc(t.t) + ' · <span class="sub">' + esc(t.l) + '</span>', '', '', f0(y), fd(t[ini]) + ' – ' + fd(t[fim]), '']) });
    }
    rows.sort((a, b) => b.v - a.v);
    const tot = sum(rows, r => r.v);
    return { tot, html: xtable([['Serviço / tarefa'], ['Orçado (R$)', 'n'], ['Dias de tarefa no total', 'n'], ['Dias no mês', 'n'], ['Conta', 'c'], ['Valor (R$)', 'n']], rows, ['Total', '', '', '', '', '<b>' + brl(tot, 2) + '</b>']) };
  }
  function openCalcMonth(m, nodeId) {
    const ids = nodeId ? YM.scope(M, nodeId).ids : Object.values(M.nodes).filter(n => n.lv === 'C').map(n => n.id);
    const idset = new Set(ids);
    const L = M.rp.filter(x => x.d.slice(0, 7) === m && (!nodeId || idset.has(x.n)));
    const pg = lancTable(L, 'pg'), ap = lancTable(L, 'ap', { venc: true });
    // previsto FLUXO-BASE: serviço → insumo
    const pr = [];
    for (const id of ids) {
      const n = M.nodes[id]; const v = (n.prev || {})[m] || 0; if (Math.abs(v) < 0.005) continue;
      const kids = (n.insumos || []).filter(i => (i.prev[m] || 0) !== 0).sort((a, b) => b.prev[m] - a.prev[m]).map(i => [esc(i.cod + ' - ' + i.desc), brl(i.prev[m], 2)]);
      const ki = sum((n.insumos || []), i => i.prev[m] || 0); if (Math.abs(v - ki) > 0.5) kids.push(['<span class="sub">linhas sem insumo (nível E direto)</span>', brl(v - ki, 2)]);
      pr.push({ c: [nodeName(id), '<b>' + brl(v, 2) + '</b>'], v, kids });
    }
    pr.sort((a, b) => b.v - a.v); const prT = sum(pr, r => r.v);
    const prev = xtable([['Serviço / insumo'], ['Valor (R$)', 'n']], pr, ['Total', '<b>' + brl(prT, 2) + '</b>']);
    const at = cronoRows(m, ids, 'atual'), bl = cronoRows(m, ids, 'bl');
    const nm = nodeId ? nodeName(nodeId) : 'Obra toda';
    const op = [pg.tot, ap.tot, prT, at.tot, bl.tot].findIndex(v => Math.abs(v) > 0.005);
    openCalc(`${ml(m)} — de onde vem cada valor`, nm + ' · clique numa linha para abrir o detalhe',
      sec('Pago', pg.tot, `Soma da coluna <b>Pago</b> das parcelas do relatório Pagar &amp; Pago com data de pagamento em ${ml(m)}, agrupadas pelo serviço ligado.`, pg.html, op === 0) +
      sec('A pagar', ap.tot, `Soma da coluna <b>Pagar</b> das parcelas do relatório com data em ${ml(m)}. Parcelas com data anterior a ${fd(S.ref)} aparecem como vencidas.`, ap.html, op === 1) +
      sec('Previsto FLUXO-BASE', prT, `Soma da coluna <b>${m.slice(5, 7)}/${m.slice(0, 4)}</b> da aba FLUXO-BASE da <b>${esc(RAW.cur ? RAW.cur.name : 'YAC-FLUXO')}</b>, nas linhas de insumo (nível E, como o TOTAL da planilha).`, prev, op === 2) +
      sec('Orçado × cronograma atual', at.tot, '<b>Valor = orçado do serviço × (dias de tarefa no mês ÷ total de dias de tarefa do serviço)</b>, com as datas atuais do cronograma. Tarefas em paralelo somam dias; sub-etapas sem tarefa própria usam as tarefas da etapa; serviços sem nenhuma tarefa usam as datas do serviço mais parecido.', at.html, op === 3) +
      sec('Orçado × linha de base', bl.tot, 'Mesma conta, com as datas da <b>linha de base</b> do cronograma.', bl.html, op === 4));
  }
  function openCalcTile(k) {
    const C = Object.values(M.nodes).filter(n => n.lv === 'C'), Bs = Object.values(M.nodes).filter(n => n.lv === 'B');
    const [a, b] = win3();
    if (k === 'orc') {
      const rows = Bs.map(B => { const ks = B.kids.map(i => M.nodes[i]); return { v: B.orc, c: [nodeName(B.id), brl(B.orc, 2), brl(sum(ks, x => x.mat)), brl(sum(ks, x => x.mo)), brl(sum(ks, x => x.ou))], kids: ks.filter(x => x.orc || x.mo).map(x => [nodeName(x.id), brl(x.orc, 2), brl(x.mat), brl(x.mo), brl(x.ou)]) }; }).filter(r => r.v);
      openCalc('Orçado', 'Total da obra por etapa e sub-etapa', `<p class="hint"><b>Orçado</b> = soma da coluna ORÇADO R$ das linhas de insumo (nível E) da FLUXO-BASE. <b>Material / M.O. / Outros</b> = composições do Orçamento R${esc(M.meta.orcRev)} ligadas pelos códigos ORÇ- da FLUXO-BASE (o total das composições bate com o orçado).</p>` +
        xtable([['Etapa / sub-etapa'], ['Orçado (R$)', 'n'], ['Material', 'n'], ['M.O.', 'n'], ['Outros', 'n']], rows, ['Total', brl(sum(C, x => x.orc), 2), brl(sum(C, x => x.mat)), brl(sum(C, x => x.mo)), brl(sum(C, x => x.ou))]));
    } else if (k === 'pago') {
      const ms = [...new Set(M.rp.filter(x => x.pg).map(x => x.d.slice(0, 7)))].sort();
      const orc = sum(C, x => x.orc);
      const rows = ms.map(m => { const L = M.rp.filter(x => x.pg && x.d.slice(0, 7) === m); const g = {}; L.forEach(x => g[x.n] = (g[x.n] || 0) + x.pg); return { c: [ml(m), L.length, brl(sum(L, x => x.pg), 2)], kids: Object.entries(g).sort((p, q) => q[1] - p[1]).map(([id, v]) => [nodeName(id), '', brl(v, 2)]) }; });
      const tot = sum(M.rp, x => x.pg);
      openCalc('Pago no relatório', `${pct(tot / orc)} do orçado = R$ ${brl(tot, 2)} ÷ R$ ${brl(orc, 2)}`, `<p class="hint">Soma da coluna <b>Pago</b> de todas as parcelas do relatório Pagar &amp; Pago importado, por mês de pagamento. Abra o mês para ver por serviço.</p>` +
        xtable([['Mês / serviço'], ['Parcelas', 'n'], ['Pago (R$)', 'n']], rows, ['Total', M.rp.filter(x => x.pg).length, brl(tot, 2)]));
    } else if (k === 'j3') {
      const ms = mrange(a, b);
      const prevM = m => sum(C, n => (n.prev || {})[m] || 0);
      const rows = ms.map(m => { const L = M.rp.filter(x => x.ap && x.d.slice(0, 7) === m && x.d >= S.ref); const g = {}; L.forEach(x => g[x.n] = (g[x.n] || 0) + x.ap); return { c: [ml(m), L.length, brl(sum(L, x => x.ap), 2), brl(prevM(m), 2)], kids: Object.entries(g).sort((p, q) => q[1] - p[1]).map(([id, v]) => [nodeName(id), '', brl(v, 2), brl((M.nodes[id] && M.nodes[id].prev[m]) || 0, 2)]) }; });
      const tot = sum(M.rp.filter(x => x.ap && x.d >= S.ref && x.d.slice(0, 7) >= a && x.d.slice(0, 7) <= b), x => x.ap);
      openCalc('A pagar — próximos 3 meses', `${ml(a)} a ${ml(b)} (meses seguintes à data de referência ${fd(S.ref)})`, `<p class="hint">Soma da coluna <b>Pagar</b> das parcelas do relatório com data em ${ml(a)}, ${ml(addM(a, 1))} ou ${ml(b)}. Ao lado, o previsto da FLUXO-BASE dos mesmos meses. Abra o mês para ver por serviço; para ver parcela por parcela, clique no mês no gráfico.</p>` +
        xtable([['Mês / serviço'], ['Parcelas', 'n'], ['A pagar (R$)', 'n'], ['Previsto FLUXO-BASE (R$)', 'n']], rows, ['Total', '', brl(tot, 2), brl(sum(ms, prevM), 2)]));
    } else if (k === 'venc') {
      const V = M.rp.filter(x => x.ap && x.d < S.ref); const g = {}; V.forEach(x => (g[x.forn] || (g[x.forn] = [])).push(x));
      const rows = Object.entries(g).map(([f, xs]) => ({ v: sum(xs, x => x.ap), c: [esc(f), xs.length, '', brl(sum(xs, x => x.ap), 2)], kids: xs.sort((p, q) => p.d.localeCompare(q.d)).map(x => [esc(x.ins) + ' · <span class="sub">' + nodeName(x.n) + '</span>', esc(x.proc + '/' + x.parc), fd(x.d) + ' · ' + days(x.d, S.ref) + ' dias', brl(x.ap, 2)]) })).sort((p, q) => q.v - p.v);
      openCalc('A pagar vencido', `Parcelas com data anterior a ${fd(S.ref)} ainda marcadas como a pagar`, `<p class="hint">Soma da coluna <b>Pagar</b> das parcelas do relatório com data de pagamento antes da data de referência. Confirme se foram pagas e não baixadas no sistema.</p>` +
        xtable([['Fornecedor / parcela'], ['Parcelas · proc./parc.', 'n'], ['Data', 'c'], ['A pagar (R$)', 'n']], rows, ['Total', V.length, '', brl(sum(V, x => x.ap), 2)]));
    } else if (k === 'crono') {
      const T = M.tasks;
      const grp = (nome, regra, xs, extra) => ({ c: [`<b>${nome}</b> <span class="sub">— ${regra}</span>`, xs.length, '', '', ''], kids: xs.slice().sort((p, q) => (p.i || '').localeCompare(q.i || '')).map(t => [esc(t.t) + ' · <span class="sub">' + esc(t.l) + '</span>', '', fd(t.bi) + ' – ' + fd(t.bf), fd(t.i) + ' – ' + fd(t.f), extra ? extra(t) : (t.ri ? fd(t.ri) + ' – ' + (t.rf ? fd(t.rf) : 'andamento') : '–')]) });
      const rows = [
        grp('Concluídas', 'têm término real', T.filter(t => t.rf)),
        grp('Em andamento', 'têm início real e não têm término real', T.filter(t => t.ri && !t.rf)),
        grp('Deveriam ter iniciado', `sem início real e com início atual antes de ${fd(S.ref)}`, T.filter(t => !t.ri && t.i && t.i < S.ref)),
        grp('Término após a linha de base', 'término atual depois do término da linha de base', T.filter(t => t.f && t.bf && t.f > t.bf), t => '<span class="crit">+' + days(t.bf, t.f) + ' dias</span>')
      ];
      openCalc('Cronograma', `${T.length} atividades do cronograma importado${M.meta.cronoGerado ? ' (gerado ' + fd(M.meta.cronoGerado) + ')' : ''}`, `<p class="hint">Contagem das atividades do cronograma pelas colunas Início real, Término real, Data de Início/Término (atual) e Linha de base. Abra cada grupo para ver as atividades.</p>` +
        xtable([['Grupo / atividade'], ['Qtd.', 'n'], ['Linha de base', 'c'], ['Atual', 'c'], ['Real / desvio', 'c']], rows));
    }
  }

  /* ===== LINHA DE BALANÇO ===== */
  views.lob = function (el) {
    const L = S.lob;
    const node = L.node ? M.nodes[L.node] : null;
    el.innerHTML = `<section class="card"><div class="ch"><h2>Linha de balanço</h2>
        <div class="seg" id="lper">${[['3m', 'Próximos 3 meses'], ['12m', '12 meses'], ['obra', 'Obra toda']].map(([v, l]) => `<button data-v="${v}" class="${L.per === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="filters">
        <div class="chips" id="ldisc">${YM.DISC.map((d, i) => `<button data-i="${i}" class="chip ${L.disc.has(i) ? 'on' : ''}"><i style="background:${DCOL[i]}"></i>${d[0]}</button>`).join('')}</div>
        <label class="ck"><input type="checkbox" id="lbase" ${L.base ? 'checked' : ''}> Linha de base</label>
        <label class="ck"><input type="checkbox" id="latual" ${L.atual ? 'checked' : ''}> Atual</label>
        <label class="ck"><input type="checkbox" id="lreal" ${L.real ? 'checked' : ''}> Real</label>
        <input type="search" id="lq" placeholder="Filtrar tarefa (ex.: Alvenaria)" value="${esc(L.q)}">
        ${node ? `<span class="pill">Serviço: ${esc(node.id)} ${esc(node.desc)} <button id="lnx" title="Limpar">×</button></span>` : ''}
      </div>
      <p class="hint">Faixa colorida = datas atuais do cronograma · contorno tracejado = linha de base · traço escuro = real (início/término real). Passe o mouse para ver datas; clique para abrir a ficha do serviço.</p>
      <div id="lob" class="lobwrap"></div></section>`;
    $('#lper').onclick = e => { if (e.target.dataset.v) { L.per = e.target.dataset.v; render(); } };
    $('#ldisc').onclick = e => { const b = e.target.closest('button'); if (!b) return; const i = +b.dataset.i; L.disc.has(i) ? L.disc.delete(i) : L.disc.add(i); render(); };
    $('#lbase').onchange = e => { L.base = e.target.checked; drawLOB(); };
    $('#latual').onchange = e => { L.atual = e.target.checked; drawLOB(); };
    $('#lreal').onchange = e => { L.real = e.target.checked; drawLOB(); };
    $('#lq').oninput = e => { L.q = e.target.value; clearTimeout(L._t); L._t = setTimeout(drawLOB, 200); };
    if ($('#lnx')) $('#lnx').onclick = () => { L.node = null; render(); };
    drawLOB();
  };
  function drawLOB(el0) {
    const L = S.lob, el = el0 || $('#lob'); L._lx = {};
    let ids = null;
    if (L.node) { const sc = YM.scope(M, L.node); ids = new Set(sc.tasks.map(t => t.k)); }
    const q = L.q.trim().toLowerCase();
    const T = L.only ? M.tasks.filter(t => L.only.has(t.k) && (t.i || t.bi)) : M.tasks.filter(t => L.disc.has(t.g) && (!ids || ids.has(t.k)) && (!q || t.t.toLowerCase().includes(q)) && (t.i || t.bi));
    let t0, t1;
    if (L.only) { const ds = T.flatMap(t => [t.i, t.f, t.bi, t.bf, t.ri, t.rf]).filter(Boolean).sort(); t0 = D(ds[0]) - 15 * 864e5; t1 = D(ds.at(-1)) + 15 * 864e5; }
    else if (L.per === '3m') { t0 = D(S.ref) - 7 * 864e5; t1 = Date.UTC(+S.ref.slice(0, 4), +S.ref.slice(5, 7) + 3, 1); }
    else if (L.per === '12m') { t0 = D(S.ref) - 30 * 864e5; t1 = Date.UTC(+S.ref.slice(0, 4), +S.ref.slice(5, 7) + 11, 1); }
    else { const ds = T.flatMap(t => [t.i, t.f, t.bi, t.bf]).filter(Boolean).sort(); t0 = D(ds[0]) - 15 * 864e5; t1 = D(ds.at(-1)) + 15 * 864e5; }
    const vis = T.filter(t => D(t.f || t.bf) >= t0 && D(t.i || t.bi) <= t1);
    if (!vis.length) { el.innerHTML = '<p class="empty">Nenhuma atividade no período/filtro escolhido.</p>'; return; }
    const lots = M.lots.filter(l => vis.some(t => t.l === l)).reverse(); // de cima (último pav.) para baixo
    const RH = 15, LW = 190, W = Math.max(700, el.clientWidth || 1100), P = { t: 26, b: 8 }, H = P.t + lots.length * RH + P.b;
    const iw = W - LW - (L.lbl ? 90 : 10), X = t => LW + (t - t0) / (t1 - t0) * iw, Y = l => P.t + lots.indexOf(l) * RH;
    let g = '';
    // grade de meses
    const d0 = new Date(t0); let m = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1);
    const span = (t1 - t0) / 864e5, mstep = span > 900 ? 3 : span > 400 ? 2 : 1;
    let mi = 0;
    while (m <= t1) {
      const dd = new Date(m);
      if (m >= t0) {
        g += `<line x1="${X(m)}" x2="${X(m)}" y1="${P.t - 4}" y2="${H - P.b}" class="grid${dd.getUTCMonth() === 0 ? ' yr' : ''}"/>`;
        if (mi % mstep === 0 && Math.abs(X(m) - X(D(S.ref))) > 70) g += `<text x="${X(m) + 3}" y="${P.t - 9}" class="ax">${MES[dd.getUTCMonth()]}/${String(dd.getUTCFullYear()).slice(2)}</text>`;
        mi++;
      }
      m = Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth() + 1, 1);
    }
    lots.forEach((l, i) => { if (i % 2) g += `<rect x="${LW}" y="${P.t + i * RH}" width="${iw}" height="${RH}" class="zebra"/>`; g += `<text x="${LW - 6}" y="${P.t + i * RH + RH / 2 + 4}" class="lotl" text-anchor="end">${esc(l)}</text>`; });
    // faixas da linha de balanço (tarefas repetidas em pavimentos consecutivos)
    const byTask = {}; vis.forEach(t => (byTask[t.t] || (byTask[t.t] = [])).push(t));
    const floorRank = l => { const k = /^Pav (\d+)/.exec(l); return k && !/Fachada/.test(l) ? +k[1] : (/^Pav Térreo$/.test(l) ? 1 : null); };
    for (const [nm, arr] of Object.entries(byTask)) {
      const fl = arr.filter(t => floorRank(t.l) != null && t.i && t.f).sort((a, b) => floorRank(a.l) - floorRank(b.l));
      if (fl.length < 3) continue;
      const c = DCOL[arr[0].g];
      const mid = t => Y(t.l) + RH / 2;
      if (L.atual) {
        const pts = [...fl.map(t => `${X(D(t.i))},${mid(t)}`), ...fl.slice().reverse().map(t => `${X(D(t.f) + 864e5)},${mid(t)}`)].join(' ');
        g += `<polygon points="${pts}" fill="${c}" fill-opacity=".13" stroke="${c}" stroke-opacity=".55" stroke-width="1" class="band" data-t="${esc(nm)}"/>`;
      }
      if (L.base) {
        const fb = arr.filter(t => floorRank(t.l) != null && t.bi && t.bf).sort((a, b) => floorRank(a.l) - floorRank(b.l));
        if (fb.length >= 3) g += `<polyline points="${fb.map(t => `${X(D(t.bi))},${mid(t)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="1" stroke-dasharray="3 3" opacity=".8"/>`;
      }
    }
    // barras por atividade
    for (const t of vis) {
      const c = DCOL[t.g], y = Y(t.l);
      if (L.base && t.bi && t.bf) g += `<rect x="${X(D(t.bi))}" y="${y + 2}" width="${Math.max(2, X(D(t.bf) + 864e5) - X(D(t.bi)))}" height="${RH - 4}" fill="none" stroke="${c}" stroke-dasharray="3 2" rx="2"/>`;
      if (L.atual && t.i && t.f) g += `<rect x="${X(D(t.i))}" y="${y + 3}" width="${Math.max(2, X(D(t.f) + 864e5) - X(D(t.i)))}" height="${RH - 6}" fill="${c}" rx="2" class="act" data-k="${t.k}"/>`;
      if (L.real && t.ri) { const e = t.rf ? D(t.rf) + 864e5 : Math.max(D(t.ri) + 864e5, D(S.ref)); g += `<rect x="${X(D(t.ri))}" y="${y + RH / 2 - 1.5}" width="${Math.max(2, X(e) - X(D(t.ri)))}" height="3" fill="var(--ink)" rx="1.5" pointer-events="none"/>`; }
      if (L.lbl) { const tx = L.lbl(t), lx = X(D(t.f || t.bf) + 864e5) + 4, rx = lx + tx.length * 6.3, rw = L._lx[y] || (L._lx[y] = []); if (tx && !rw.some(([a, b]) => lx < b + 4 && rx > a - 4)) { rw.push([lx, rx]); g += `<text x="${lx}" y="${y + RH / 2 + 4}" class="ax" style="font-size:10.5px;fill:var(--ink)" pointer-events="none">${esc(tx)}</text>`; } }
      g += `<rect x="${X(D(t.i || t.bi)) - 2}" y="${y}" width="${Math.max(8, X(D(t.f || t.bf) + 864e5) - X(D(t.i || t.bi)) + 4)}" height="${RH}" fill="transparent" class="hitk" data-k="${t.k}"/>`;
    }
    const rx = X(D(S.ref)); if (rx > LW && rx < W) g += `<line x1="${rx}" x2="${rx}" y1="${P.t - 4}" y2="${H - P.b}" class="refl"/><text x="${rx + 3}" y="${P.t - 9}" class="ax refx">hoje ${fd(S.ref)}</text>`;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Linha de balanço">${g}</svg>
      <div class="hint">${vis.length} atividades em ${lots.length} locais · ${Object.keys(byTask).length} tarefas</div>`;
    const svg = el.querySelector('svg'), tipX = L.tipX, pick = L.onPick;
    svg.addEventListener('mousemove', ev => {
      const h = ev.target.closest('.hitk'); if (!h) { hideTip(); return; }
      const t = M.tasks[+h.dataset.k]; const n = t.n ? M.nodes[t.n] : null;
      const dv = t.f && t.bf ? days(t.bf, t.f) : null;
      showTip(`<b>${esc(t.t)}</b><div class="sub">${esc(t.l)}</div>
        <div class="tr"><span>Linha de base</span><b>${fd(t.bi)} – ${fd(t.bf)}</b></div>
        <div class="tr"><span>Atual</span><b>${fd(t.i)} – ${fd(t.f)}</b></div>
        <div class="tr"><span>Real</span><b>${t.ri ? fd(t.ri) + ' – ' + (t.rf ? fd(t.rf) : 'em andamento') : 'não iniciada'}</b></div>
        ${dv != null ? `<div class="tr"><span>Desvio do término</span><b class="${dv > 0 ? 'crit' : ''}">${dv > 0 ? '+' : ''}${dv} dias</b></div>` : ''}
        ${tipX ? tipX(t) : ''}<div class="sub">${n ? 'Serviço: ' + esc(n.id) + ' ' + esc(n.desc) : 'Sem serviço vinculado'}</div>`, ev);
    });
    svg.addEventListener('mouseleave', hideTip);
    svg.addEventListener('click', ev => { const h = ev.target.closest('.hitk'); if (!h) return; const t = M.tasks[+h.dataset.k]; if (pick) { pick(t); return; } if (t.n) { S.fichaTask = t.k; openFicha(t.n); } });
  }

  /* ===== LINHA DE BALANÇO — QUANTITATIVO × GASTO ESTIMADO =====
     composição do orçamento → atividades do cronograma (pela planilha de pesos: mesmo item; dentro dele, pelo nome da tarefa)
     → quantidade por pavimento = quantidade orçada × parte da atividade */
  function qtdComp(it) {
    const F = fis(); if (!F || !M.cmp) return null; const o = M.cmp.items[it]; if (!o) return null; const c = o.c;
    RAW.plano.qtdx = RAW.plano.qtdx || {};
    // atividades do item de peso que contém a composição
    const cods = [...new Set(F.T.flatMap(x => x.itens.map(r => r.cod)))].sort((a, b) => b.length - a.length);
    const cod = cods.find(k => it === k || it.startsWith(k + '.')); if (!cod) return { c, o, acts: [], cod: null };
    const acts = []; for (const x of F.T) for (const r of x.itens) if (r.cod === cod) acts.push({ x, pi: r.pi });
    // dentro do item, as tarefas cujo nome mais se parece com a composição (ex.: "Escavação de Estaca Hélice Ø40cm" → "FUN - Estacas 40")
    const tkq = x => new Set([...tk(x), ...(normT(x).match(/\b\d{2,3}\b/g) || [])]); const T = tkq(c.d.replace(/[ØøØ]\s*(\d+)\s*cm/gi, ' $1 ')), byT = {};
    for (const a of acts) { const k = a.x.t.t; (byT[k] || (byT[k] = { t: k, L: [], sc: simT(tkq(k.replace(/^[A-Z]+ - /, '')), T) })).L.push(a); }
    const tops = Object.values(byT).sort((a, b) => b.sc - a.sc);
    let sel, regra;
    const man = RAW.plano.qtdx[it];
    if (man && man.tarefas && man.tarefas.length) { sel = tops.filter(g => man.tarefas.includes(g.t)); regra = 'tarefas escolhidas à mão'; }
    else if (tops[0] && tops[0].sc >= 0.25 && tops[0].sc >= 1.2 * (tops[1] ? tops[1].sc : 0)) { sel = tops.filter(g => g.sc >= tops[0].sc * 0.999); regra = `tarefa com nome parecido (${Math.round(tops[0].sc * 100)}%)`; }
    else { sel = tops; regra = 'todas as atividades do item ' + cod + ' (sem tarefa com nome parecido)'; }
    const L = sel.flatMap(g => g.L), tot = L.reduce((a, b) => a + b.pi, 0) || 1;
    const linhas = L.map(a => { const sh = tot ? a.pi / tot : 1 / L.length; return { x: a.x, t: a.x.t, pi: a.pi, sh, qtd: c.q * sh, v: c.tot * sh, mat: (c.mat || 0) * sh }; });
    return { c, o, cod, regra, linhas, tops, somaPi: tot };
  }
  function contaQtd(R, l, puF, ctIt, fe) {
    const c = R.c, t = l.t, x = l.x, un = esc(c.un), q = c.q ? 1 / c.q : 0;
    const pm = c.q ? (c.mat || 0) / c.q : 0, po = c.q ? (c.mo || 0) / c.q : 0, pu = c.q ? c.tot / c.q : 0;
    const dur = t.i && t.f ? Math.round((D(t.f) - D(t.i)) / 864e5) + 1 : 0, dec = t.ri ? Math.max(0, Math.round((D(S.ref) - D(t.ri)) / 864e5) + 1) : 0;
    const prTxt = t.rf ? `término real em ${fd(t.rf)} → 100%` : t.ri ? `iniciada em ${fd(t.ri)}: ${dec} dias decorridos ÷ ${dur} dias de duração atual = ${pct(dur ? dec / dur : 0)} (limitado a 95% até ter término real) → ${pct(x.pr)}` : `sem início real até ${fd(S.ref)} → 0%`;
    const outras = R.linhas.slice().sort((a, b) => b.pi - a.pi);
    const r = (a, b, cls = '') => `<tr class="${cls}"><td>${a}</td><td class="n">${b}</td></tr>`;
    openCalc(`${esc(t.l)} · ${esc(t.t)}`, `${esc(c.it)} · ${esc(c.d)}`, `
      <h4>1. Parte desta atividade na composição</h4>
      <table class="t"><tbody>
        ${r(`Peso da atividade no item ${esc(R.cod)} (planilha de pesos)`, brl(l.pi, 4) + '%')}
        ${r(`Soma dos pesos das ${R.linhas.length} atividades usadas (${esc(R.regra)})`, brl(R.somaPi, 4) + '%')}
        ${r(`Parte = ${brl(l.pi, 4)} ÷ ${brl(R.somaPi, 4)}`, '<b>' + brl(l.sh * 100, 4) + '%</b>', 'tot')}
      </tbody></table>
      <h4>2. Quantidade</h4>
      <table class="t"><tbody>
        ${r('Quantidade orçada da composição', brl(c.q, 2) + ' ' + un)}
        ${r(`Quantidade = ${brl(c.q, 2)} × ${brl(l.sh * 100, 4)}%`, '<b>' + brl(l.qtd, 2) + ' ' + un + '</b>', 'tot')}
      </tbody></table>
      <h4>3. Valores <span class="sub">— clique em Material, Mão de obra ou Outros para abrir os insumos</span></h4>
      ${(() => {
        const I = c.insD || [], cat = [['Material', 'pm', pm], ['Mão de obra', 'pmo', po], ['Outros', 'pou', pu - pm - po]];
        const sub = (k, ix) => I.filter(i => i[k]).map(i => { const qi = i.coef * l.qtd; return `<tr class="k${ix}" hidden><td style="padding-left:26px">${esc(i.cod)} · ${esc(i.d)} <span class="sub">(${esc(i.cl)}) · coef. ${brl(i.coef, 4)} ${esc(i.un)}/${un} → ${brl(qi, 2)} ${esc(i.un)} × R$ ${brl(i[k], 2)}</span></td><td class="n">${brl(i.coef * i[k], 2)}</td><td class="n">${brl(l.qtd, 2)}</td><td class="n">${brl(qi * i[k], 2)}</td></tr>`; }).join('');
        return `<table class="t xt"><thead><tr><th></th><th class="n">Unitário (R$/${un})</th><th class="n">× Qtd.</th><th class="n">Total (R$)</th></tr></thead><tbody>
          ${cat.map(([nm, k, u], ix) => { const s2 = sub(k, ix); return `<tr ${s2 ? `data-x="${ix}" class="clk"` : ''}><td>${s2 ? '<span class="ar">▸</span> ' : ''}${nm}${s2 ? ` <span class="sub">(${I.filter(i => i[k]).length} insumos)</span>` : ''}</td><td class="n">${brl(u, 2)}</td><td class="n">${brl(l.qtd, 2)}</td><td class="n">${brl(l.qtd * u, 2)}</td></tr>${s2}`; }).join('')}
          <tr class="tot"><td>Valor orçado</td><td class="n">${brl(pu, 2)}</td><td class="n">${brl(l.qtd, 2)}</td><td class="n"><b>${brl(l.v, 2)}</b></td></tr>
          ${puF ? `<tr><td>Fechado (${ctIt ? esc(ctIt.ct + '.' + ctIt.item + ' ' + ctIt.forn) : 'valor informado'})</td><td class="n">${brl(puF, 2)}</td><td class="n">${brl(l.qtd, 2)}</td><td class="n"><b>${brl(l.qtd * puF, 2)}</b></td></tr>` : ''}
        </tbody></table>
        <p class="sub">Unitários = total da composição no orçamento ÷ ${brl(c.q, 2)} ${un} (material R$ ${brl(c.mat || 0, 2)}, M.O. R$ ${brl(c.mo || 0, 2)}, total R$ ${brl(c.tot, 2)}). Em cada insumo: quantidade do insumo = coeficiente × ${brl(l.qtd, 2)} ${un}; total = quantidade do insumo × preço unitário do insumo.${I.length ? '' : ' Este orçamento não traz os insumos desta composição.'}</p>
        ${I.length ? `<h4>Insumos para esta atividade</h4><table class="t"><thead><tr><th>Insumo</th><th>Classe</th><th class="n">Coef.</th><th class="n">Qtd. do insumo</th><th class="n">Preço unit. (R$)</th><th class="n">Total (R$)</th></tr></thead><tbody>${I.map(i => { const p1 = i.pm + i.pmo + i.pou, qi = i.coef * l.qtd; return `<tr><td>${esc(i.cod)} · ${esc(i.d)}</td><td>${esc(i.cl)}</td><td class="n">${brl(i.coef, 4)}</td><td class="n">${brl(qi, 2)} ${esc(i.un)}</td><td class="n">${brl(p1, 2)}</td><td class="n">${brl(qi * p1, 2)}</td></tr>`; }).join('')}</tbody><tfoot><tr><td colspan="5">Total</td><td class="n">${brl(sum(I, i => i.coef * l.qtd * (i.pm + i.pmo + i.pou)), 2)}</td></tr></tfoot></table>` : ''}`;
      })()}
      ${(() => {
        const o = R.o, L2 = (o.lanc || []).filter(z => z.x.pg + z.x.ap);
        if (!L2.length) return '<h4>Gasto real</h4><p class="sub">Nenhuma parcela do Pagar &amp; Pago ligada a esta composição.</p>';
        const g = {}; L2.forEach(z => { const k = z.x.ins || '—'; const a = g[k] || (g[k] = { pg: 0, ap: 0, n: 0, f: new Set() }); a.pg += z.x.pg * z.share; a.ap += z.x.ap * z.share; a.n++; a.f.add(z.x.forn); });
        const G = Object.entries(g).sort((a, b) => (b[1].pg + b[1].ap) - (a[1].pg + a[1].ap)), tg = o.pg + o.ap;
        return `<h4>Gasto real (Pagar &amp; Pago) — parte desta atividade = ${brl(l.sh * 100, 4)}% do gasto da composição</h4><table class="t"><thead><tr><th>Insumo do relatório</th><th>Fornecedor</th><th class="n">Parcelas</th><th class="n">Gasto na composição (R$)</th><th class="n">× parte</th><th class="n">Nesta atividade (R$)</th></tr></thead><tbody>${G.map(([k, a]) => `<tr><td>${esc(k)}</td><td class="sub">${esc([...a.f].slice(0, 2).join(', '))}${a.f.size > 2 ? '…' : ''}</td><td class="n">${a.n}</td><td class="n">${brl(a.pg + a.ap, 2)}</td><td class="n">${brl(l.sh * 100, 4)}%</td><td class="n">${brl((a.pg + a.ap) * l.sh, 2)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="3">Total</td><td class="n">${brl(tg, 2)}</td><td></td><td class="n">${brl(tg * l.sh, 2)}</td></tr></tfoot></table>`;
      })()}
      <h4>4. Executado</h4>
      <table class="t"><tbody>
        ${r('Datas atuais', fd(t.i) + ' → ' + fd(t.f) + ` (${dur} dias)`)}
        ${r('Realizado', prTxt)}
        ${r(`Qtd. executada = ${brl(l.qtd, 2)} × ${pct(x.pr)}`, '<b>' + brl(l.qtd * x.pr, 2) + ' ' + un + '</b>', 'tot')}
      </tbody></table>
      <details><summary>As ${outras.length} atividades que dividem esta composição</summary><div class="tw" style="max-height:300px"><table class="t"><thead><tr><th>Local</th><th>Atividade</th><th class="n">Peso</th><th class="n">Parte</th><th class="n">Qtd. (${un})</th></tr></thead><tbody>${outras.map(o => `<tr${o === l ? ' class="okrow"' : ''}><td>${esc(o.t.l)}</td><td>${esc(o.t.t)}</td><td class="n">${brl(o.pi, 4)}%</td><td class="n">${brl(o.sh * 100, 2)}%</td><td class="n">${brl(o.qtd, 2)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2">Total</td><td class="n">${brl(R.somaPi, 4)}%</td><td class="n">100%</td><td class="n">${brl(c.q, 2)}</td></tr></tfoot></table></div></details>`);
  }
  function lobQtd(el, opt) {
    const F = fis(), redo = () => lobQtd(el, opt);
    if (!F || !M.cmp) { el.innerHTML = '<p class="empty">Precisa da planilha de pesos e do orçamento importados.</p>'; return; }
    RAW.plano.fech = RAW.plano.fech || {};
    const comps = opt.comps.map(c => M.cmp.items[c.it]).filter(o => o && o.c.q > 0 && o.c.tot > 0).sort((a, b) => a.c.it.localeCompare(b.c.it));
    if (!comps.length) { el.innerHTML = '<p class="empty">Este serviço não tem composição do orçamento com quantidade.</p>'; return; }
    if (!opt.it || !comps.some(o => o.c.it === opt.it)) {
      const tk0 = opt.task != null ? comps.map(o => ({ o, r: qtdComp(o.c.it) })).filter(x => x.r && x.r.linhas && x.r.linhas.some(l => l.t.k === opt.task)) : [];
      opt.it = (tk0.sort((a, b) => b.o.c.tot - a.o.c.tot)[0] || { o: comps.slice().sort((a, b) => b.c.tot - a.c.tot)[0] }).o.c.it;
    }
    const R = qtdComp(opt.it), c = R.c, o = R.o; R.linhas = R.linhas || []; R.tops = R.tops || [];
    const fe = RAW.plano.fech[c.it] || {}; const ctIt = fe.key && M.ct ? M.ct.itens.find(i => i.key === fe.key) : null;
    const cts = o.cts || []; const ctLig = cts.length ? cts.map(x => x.it) : [];
    const puF = ctIt ? (ctIt.q ? ctIt.tot / ctIt.q : ctIt.pu) : null;
    const fechado = fe.valor != null && fe.valor !== '' ? +fe.valor : ctIt ? ctIt.tot : sum(ctLig, i => i.tot);
    const gasto = o.pg + o.ap, med = sum(R.linhas, l => l.x.pr * l.qtd);
    const ctSug = M.ct ? M.ct.itens.map(i => ({ i, sc: (cts.some(x => x.it.key === i.key) ? 2 : 0) + simT(tk(i.d + ' ' + i.obj), tk(c.d)) })).sort((a, b) => b.sc - a.sc).slice(0, 25) : [];
    el.innerHTML = `<section><div class="filters"><span class="sub">Composição do orçamento:</span><select id="lqq" style="max-width:640px">${comps.map(x => `<option value="${esc(x.c.it)}" ${x.c.it === c.it ? 'selected' : ''}>${esc(x.c.it + ' · ' + x.c.d + ' — ' + brl(x.c.q, 2) + ' ' + x.c.un)}</option>`).join('')}</select></div>
      <p class="hint">Quantidade por pavimento = quantidade orçada da composição × parte de cada atividade na planilha de pesos (item ${esc(R.cod || '—')}; ${esc(R.regra || '')}). Valores resumidos: orçado (qtd × preço do orçamento), material orçado, fechado (contrato ligado ou valor informado) e gasto real (Pagar &amp; Pago ligado à composição).</p>
      <div class="tiles">${tile('Quantidade orçada', brl(c.q, 2) + ' ' + esc(c.un), 'R$ ' + brl(c.pu, 2) + ' / ' + esc(c.un))}${tile('Orçado', 'R$ ' + brlK(c.tot), 'material R$ ' + brlK(c.mat || 0) + ' · M.O. R$ ' + brlK(c.mo || 0) + ' · outros R$ ' + brlK(c.ou || 0))}${tile('Fechado', fechado ? 'R$ ' + brlK(fechado) : '—', ctIt ? 'contrato ' + esc(ctIt.ct + '.' + ctIt.item + ' ' + ctIt.forn) : fe.valor ? 'valor informado' : ctLig.length ? ctLig.length + ' itens de contrato ligados' : 'sem contrato — vincule abaixo', fechado > c.tot ? 'crit' : '')}${tile('Gasto real', 'R$ ' + brlK(gasto), 'pago R$ ' + brlK(o.pg) + ' · a pagar R$ ' + brlK(o.ap))}${tile('Executado (estimado)', brl(med, 2) + ' ' + esc(c.un), pct(c.q ? med / c.q : 0) + ' da quantidade · pelo avanço das atividades')}${tile('Saldo', 'R$ ' + brlK(c.tot - Math.max(gasto, fechado)), 'orçado − maior(gasto, fechado)', c.tot - Math.max(gasto, fechado) < 0 ? 'crit' : '')}</div>
      ${gasto < 0.005 || !ctLig.length ? `<div class="filters"><span class="sub">Vincular contrato a esta composição:</span><select id="lqct" style="max-width:520px"><option value="">— nenhum —</option>${ctSug.map(({ i }) => `<option value="${esc(i.key)}" ${fe.key === i.key ? 'selected' : ''}>${esc(i.ct + '.' + i.item + ' · ' + i.forn + ' · ' + i.d + ' · ' + brl(i.q, 2) + ' ' + i.un + ' × R$ ' + brl(i.pu, 2) + ' = R$ ' + brl(i.tot, 2))}</option>`).join('')}</select><span class="sub">ou valor fechado (R$):</span><input class="wn" id="lqv" value="${fe.valor != null ? fnum(fe.valor) : ''}" style="width:120px" inputmode="decimal"></div>` : `<p class="sub">Contratos ligados: ${ctLig.map(i => esc(i.ct + '.' + i.item + ' ' + i.forn + ' (R$ ' + brl(i.tot, 2) + ')')).join(' · ')}</p>`}
      <div class="filters"><span class="sub">Tarefas do cronograma usadas:</span>${(R.tops || []).slice(0, 12).map(g => `<label class="ck"><input type="checkbox" class="lqt" value="${esc(g.t)}" ${R.linhas.some(l => l.t.t === g.t) ? 'checked' : ''}> ${esc(g.t)} <span class="sub">(${g.L.length})</span></label>`).join('')}</div>
      <h3>Linha de balanço desta composição</h3><div id="lqlob" class="lobwrap"></div></section>
      <section><h3>Por pavimento — ${esc(c.it)} · ${esc(c.d)}</h3><div class="tw" style="max-height:560px">${(() => {
        const rows = R.linhas.slice().sort((a, b) => (M.lots.indexOf(a.t.l) - M.lots.indexOf(b.t.l)) || (a.t.i || '').localeCompare(b.t.i || ''));
        const st = t => t.rf ? '<span class="okv">concluída</span>' : t.ri ? 'em andamento' : (t.i && t.i < S.ref ? '<span class="crit">atrasada</span>' : 'a iniciar');
        return `<table class="t"><thead><tr><th>Pavimento / lote</th><th>Atividade</th><th>Atual</th><th>Real</th><th>Situação</th><th class="n">Qtd. (${esc(c.un)})</th><th class="n">Valor orçado (R$)</th><th class="n">Material (R$)</th><th class="n">Realizado</th><th class="n">Qtd. executada</th>${puF ? '<th class="n">Fechado (R$)</th>' : ''}</tr></thead><tbody>${rows.map(l => `<tr class="clk lqr" data-k="${l.t.k}" title="Clique para ver a conta"><td>${esc(l.t.l)}</td><td>${esc(l.t.t)}</td><td class="sub">${fd(l.t.i)} → ${fd(l.t.f)}</td><td class="sub">${l.t.ri ? fd(l.t.ri) + ' → ' + (l.t.rf ? fd(l.t.rf) : '…') : '—'}</td><td>${st(l.t)}</td><td class="n"><b>${brl(l.qtd, 2)}</b></td><td class="n">${brl(l.v, 2)}</td><td class="n">${brl(l.mat, 2)}</td><td class="n">${pct(l.x.pr)}</td><td class="n">${brl(l.qtd * l.x.pr, 2)}</td>${puF ? `<td class="n">${brl(l.qtd * puF, 2)}</td>` : ''}</tr>`).join('')}</tbody><tfoot><tr><td colspan="5">Total</td><td class="n">${brl(sum(rows, l => l.qtd), 2)}</td><td class="n">${brl(sum(rows, l => l.v), 2)}</td><td class="n">${brl(sum(rows, l => l.mat), 2)}</td><td class="n">${pct(c.q ? med / c.q : 0)}</td><td class="n">${brl(med, 2)}</td>${puF ? `<td class="n">${brl(sum(rows, l => l.qtd * puF), 2)}</td>` : ''}</tr></tfoot></table>`; })()}</div></section>`;
    // linha de balanço só com as atividades desta composição, com a quantidade em cada barra
    const keys = new Set(R.linhas.map(l => l.t.k)), byK = {}; R.linhas.forEach(l => byK[l.t.k] = l);
    S.lob.only = keys; S.lob.lbl = t => byK[t.k] ? brl(byK[t.k].qtd, 0) + ' ' + c.un : '';
    S.lob.tipX = t => { const l = byK[t.k]; return l ? `<div class="tr"><span>Quantidade</span><b>${brl(l.qtd, 2)} ${esc(c.un)}</b></div><div class="tr"><span>Valor orçado</span><b>R$ ${brl(l.v, 2)}</b></div><div class="tr"><span>Material</span><b>R$ ${brl(l.mat, 2)}</b></div><div class="tr"><span>Realizado</span><b>${pct(l.x.pr)} · ${brl(l.qtd * l.x.pr, 2)} ${esc(c.un)}</b></div>${puF ? `<div class="tr"><span>Fechado</span><b>R$ ${brl(l.qtd * puF, 2)}</b></div>` : ''}` : ''; };
    S.lob.onPick = t => { hideTip(); const l = byK[t.k]; if (l) contaQtd(R, l, puF, ctIt, fe); };
    const sv = { only: null, lbl: null, tipX: null, onPick: null };
    if (keys.size) drawLOB(el.querySelector('#lqlob')); else el.querySelector('#lqlob').innerHTML = '<p class="empty">Nenhuma atividade do cronograma ligada a esta composição pela planilha de pesos.</p>';
    Object.assign(S.lob, sv);
    el.querySelectorAll('tr.lqr').forEach(tr => tr.onclick = () => { const l = byK[tr.dataset.k]; if (l) contaQtd(R, l, puF, ctIt, fe); });
    el.querySelector('#lqq').onchange = e => { opt.it = e.target.value; redo(); };
    const q1 = el.querySelector('#lqct'), q2 = el.querySelector('#lqv');
    if (q1) q1.onchange = e => { RAW.plano.fech[c.it] = Object.assign({}, RAW.plano.fech[c.it], { key: e.target.value || null }); savePlano(); redo(); };
    if (q2) q2.onchange = e => { const v = e.target.value.trim(); RAW.plano.fech[c.it] = Object.assign({}, RAW.plano.fech[c.it], { valor: v ? pnum(v) : null }); savePlano(); redo(); };
    el.querySelectorAll('.lqt').forEach(cb => cb.onchange = () => { RAW.plano.qtdx[c.it] = { tarefas: [...el.querySelectorAll('.lqt:checked')].map(x => x.value) }; savePlano(); redo(); });
  }

  /* ===== MEDIÇÃO CAIXA ===== */
  const cxBusy = async (b, fn) => { const t = b.textContent; b.disabled = true; b.textContent = 'Gerando…'; try { await fn(); } catch (e) { console.error(e); alert(e.message); } b.disabled = false; b.textContent = t; };
  function cxBase() {
    if (!RAW.caixa || typeof YCX === 'undefined') return null;
    if (!M._cx || M._cx.src !== RAW.caixa) {
      const d = Object.assign({}, RAW.caixa, { meds: RAW.caixa.meds.map(m => Object.assign({}, m)) });
      YCX.link(d, M.tasks || [], M.lots || []);
      // peso interno (planilha de pesos) das tarefas de cada Med — tarefa usada em vários Meds divide o peso entre eles
      const F = fis(); if (F) { const W = {}; F.T.forEach(x => W[x.t.t + '|' + x.t.l] = x.w / F.Wt); const uso = {}; d.meds.forEach(md => md.tasks.forEach(t => { const k = t.t + '|' + t.l; uso[k] = (uso[k] || 0) + 1; })); d.meds.forEach(md => md.wi = md.tasks.reduce((s, t) => { const k = t.t + '|' + t.l; return s + (W[k] || 0) / (uso[k] || 1); }, 0)); d.temPeso = true; }
      M._cx = { src: RAW.caixa, d, calc: {} };
    }
    return M._cx;
  }
  const cxSim = () => { RAW.plano.cx = RAW.plano.cx || {}; const c = RAW.plano.cx; c.serv = c.serv || {}; c.med = c.med || {}; if (c.alvo == null) c.alvo = 0.2; if (!c.meta) c.meta = '2027-03'; return c; };
  function cxCalc(sim) {
    const B = cxBase(); if (!B) return null;
    const key = S.ref + '|' + (sim ? JSON.stringify({ s: sim.serv, m: sim.med }) : '');
    if (!B.calc[key]) { if (Object.keys(B.calc).length > 6) B.calc = {}; B.calc[key] = YCX.calc(B.d, S.ref, sim ? { serv: sim.serv, med: sim.med } : null); }
    return B.calc[key];
  }
  const cxName = (sim) => { const n = RAW.caixa.name || 'YAC-FINAN-MEDIÇÃO_CAIXA-R00.xlsx'; const r = /R(\d+)/.exec(n), rv = r ? +r[1] + 1 : 1; const t = todayISO(); const dt = t.slice(8, 10) + '.' + t.slice(5, 7) + '.' + t.slice(2, 4); return n.replace(/R\d+.*$/i, '').replace(/[-_ ]+$/, '') + '-R' + String(rv).padStart(2, '0') + (sim ? '-SIMULACAO' : '') + '-' + dt + '.xlsx'; };
  async function cxBaixar(sim, btn) {
    const B = cxBase(), res = cxCalc(sim ? cxSim() : null);
    const r = await YCX.patch(YX.b64dec(RAW.caixa.b64).buffer, B.d, res, res.refM > B.d.mesMed ? res.refM : null);
    dl(r.bytes, cxName(sim), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (btn) btn.insertAdjacentHTML('afterend', ` <span class="ok">✓ ${r.cells} células de meses gravadas nas linhas Med (de ${ml(B.d.mesMed)} em diante); fórmulas, RESUMO e CURVA ficam como estão e recalculam ao abrir.</span>`);
  }
  /* estratégia estudada em 31/10/26 para 20% em mar/27 (táticas por Med) */
  const CX_EST = [
    [['2.2.8.08'], '1. Blocos periféricos (P1–P17) em 2–3 frentes logo após o Blocão (jan/27)', 'fim'],
    [['2.1.8.01', '2.1.8.02', '8.6.3.03', '7.4.4.03'], '2. Liberado pelos blocos em paralelo: reaterro, instalações enterradas externas e piso de concreto da torre', 'fim'],
    [['4.1.7.02', '4.1.8.02', '6.3.3.01', '7.4.4.07', '7.2.1.02', '7.2.5.04', '7.2.5.05', '5.2.1.01', '8.6.5.02'], '4. Área externa do térreo (não depende da torre): alvenaria, reboco, calçadas, contrapiso, muro/pilares, rede pluvial', 'fim'],
    [['4.1.7.01', '4.1.8.01', '4.1.7.03', '4.1.8.03'], '5. Alvenaria da periferia (fundos) do Térreo e G1 — parcial (35%), estrutura da periferia pronta em dez/jan', 'parc'],
    [['1.2.01'], '6. Canteiro medido pelo executado (NEGOCIAR com a Caixa)', 'fim'],
    [['8.1.10.01', '8.1.11.01'], '7. Contratar e executar entrada de energia + subestação', 'fim'],
    [['9.2.01', '9.2.03', '9.2.02'], '8. Ligações definitivas antecipadas (água, esgoto, energia — concessionárias)', 'fim']];
  function cxTat(d, sim) { const T = {}; CX_EST.forEach(([L, t]) => L.forEach(c => T[c] = t));
    d.meds.forEach(md => { if (T[md.cod]) return; const lv = sim.serv[md.sv]; if (md.sv === '3.1' && lv) T[md.cod] = '3. Torre antecipada ' + (lv.ant || 0) + ' dias' + (lv.ritmo && lv.ritmo !== 1 ? ' e ritmo ' + Math.round(lv.ritmo * 100) + '%' : '') + ' (blocos → reaterro → piso → estrutura da torre)';
      else if (lv) T[md.cod] = 'Serviço ' + md.sv + ' antecipado ' + (lv.ant || 0) + ' dias' + (lv.ritmo && lv.ritmo !== 1 ? ' / ritmo ' + Math.round(lv.ritmo * 100) + '%' : ''); else if (sim.med[md.cod]) T[md.cod] = 'Antecipado na simulação'; });
    return T; }
  async function cxBaixarEst(btn) {
    const B = cxBase(), sim = cxSim(), res = cxCalc(sim), base = cxCalc(null);
    const r = await YCX.patchEstrategia(YX.b64dec(RAW.caixa.b64).buffer, B.d, base, res, cxTat(B.d, sim), sim.meta, sim.alvo);
    dl(r.bytes, cxName(false).replace(/-(\d{2}\.\d{2}\.\d{2})\.xlsx$/, '-ESTRATEGIA' + Math.round(sim.alvo * 100) + '-$1.xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (btn) btn.insertAdjacentHTML('afterend', ` <span class="ok">✓ ${r.cells} células da estratégia em vermelho (${r.meds} Meds) · ${r.amarelas} só atualizadas pelo cronograma em amarelo claro · aba "ESTRATÉGIA" com a lista · ${ml(sim.meta)}: ${pc2(r.G1)}. Importe esta planilha de volta para ela virar a base.</span>`);
  }
  async function cxImport(f) {
    const r = await YP.identify(f); if (r.kind !== 'caixa') throw new Error(f.name + ' não é a planilha de Medição Caixa');
    const u8 = new Uint8Array(await f.arrayBuffer()); RAW.caixa = Object.assign(r.data, { name: f.name, b64: YX.b64enc(u8) }); M._cx = null;
  }
  // curva com linha horizontal (alvo) e marcas de meta
  function cxChart(el, ms, bars, lines, o) {
    monthChart(el, ms, bars, lines, Object.assign({ fmt: v => (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%', h: 300, gaps: true }, o));
    const svg = el.querySelector('svg'); if (!svg || !o.hl) return;
    // eixo: recalcula a escala igual ao monthChart para posicionar a linha do alvo
    const vb = svg.viewBox.baseVal, W = vb.width, H = vb.height, P = { l: 64, r: 12, t: 12, b: 28 }, ih = H - P.t - P.b, iw = W - P.l - P.r, n = ms.length;
    let max = 0; ms.forEach(m => { max = Math.max(max, sum(bars, b => b.v[m] || 0), ...lines.map(l => l.v[m] || 0)); });
    const e = Math.pow(10, Math.floor(Math.log10(max || 1))), f = max / e, nice = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
    const y = v => P.t + ih - v / nice * ih, x = i => P.l + iw / n * i + iw / n / 2;
    let g = '';
    if (o.hl <= nice) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(o.hl)}" y2="${y(o.hl)}" stroke="var(--crit,#c0392b)" stroke-dasharray="6 4" stroke-width="1.5"/><text x="${W - P.r - 4}" y="${y(o.hl) - 5}" class="ax" text-anchor="end" style="fill:var(--crit,#c0392b)">${(o.hl * 100).toLocaleString('pt-BR')}%</text>`;
    (o.vm || []).forEach(([m, lb]) => { const i = ms.indexOf(m); if (i >= 0) g += `<line x1="${x(i)}" x2="${x(i)}" y1="${P.t}" y2="${P.t + ih}" stroke="var(--ink2)" stroke-dasharray="2 3"/><text x="${x(i) + 4}" y="${P.t + 24}" class="ax">${esc(lb)}</text>`; });
    svg.insertAdjacentHTML('beforeend', g);
  }
  const pc2 = v => (v == null || !isFinite(v)) ? '–' : (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  const pc3 = v => (v == null || !isFinite(v)) ? '–' : (Math.abs(v) < 5e-7 ? '–' : (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + '%');
  function cxMetas(d) { const out = []; for (const t of d.metas || []) { const k = /META\s*(\d+)\s+(\w+)/i.exec(t); if (!k) continue; const mi = MES.findIndex(x => x.toLowerCase() === k[2].slice(0, 3).toLowerCase()); if (mi < 0) continue; let y = +S.ref.slice(0, 4); let m = y + '-' + String(mi + 1).padStart(2, '0'); if (m <= S.ref.slice(0, 7)) m = (y + 1) + '-' + String(mi + 1).padStart(2, '0'); out.push({ n: +k[1], m, t: t.replace(/\s+/g, ' ') }); } return out.sort((a, b) => a.m.localeCompare(b.m)); }

  views.caixa = function (el) {
    const B = cxBase();
    if (!B) { el.innerHTML = `<section class="card"><h2>Medição Caixa</h2><p class="empty">Importe a planilha <b>YAC-FINAN-MEDIÇÃO_CAIXA</b> (.xlsx com as abas MEDIÇÃO e CURVA).</p><input type="file" id="cxf" accept=".xlsx"><div id="cxlog" class="sub"></div></section>`;
      $('#cxf').onchange = async e => { try { await cxImport(e.target.files[0]); savePlano(); render(); } catch (er) { $('#cxlog').innerHTML = '<b class="crit">' + esc(er.message) + '</b>'; } }; return; }
    S.cxSub = S.cxSub || 'acomp';
    el.innerHTML = `<div class="seg" id="cxsub" style="margin-bottom:10px">${[['acomp', 'Acompanhamento'], ['sim', 'Simulação — meta de ' + pct(cxSim().alvo)]].map(([v, l]) => `<button data-v="${v}" class="${S.cxSub === v ? 'on' : ''}">${l}</button>`).join('')}</div><div id="cxw"></div>`;
    $('#cxsub').onclick = e => { if (e.target.dataset.v) { S.cxSub = e.target.dataset.v; render(); } };
    (S.cxSub === 'sim' ? cxSimView : cxAcomp)($('#cxw'));
  };

  function cxAcomp(el) {
    const B = cxBase(), d = B.d, R = cxCalc(null), refM = R.refM, M0 = d.mesMed, metas = cxMetas(d);
    const ant = R.G[addM(M0, -1)] || 0, atual = R.G[refM], mesV = atual - (R.G[addM(refM, -1)] || 0);
    const fileAt = R.Gfile[refM], freAt = d.fre[refM] ? d.fre[refM].a : null;
    const manual = d.meds.filter(m => !m.tasks.length), maisArq = Object.values(R.meds).filter(o => o.maisArq > 1e-4), semLote = d.meds.filter(m => m.flag && m.flag !== 'manual');
    S.cxPer = S.cxPer || '2027';
    const ms = S.cxPer === 'obra' ? d.months : d.months.filter(m => m <= S.cxPer + '-12');
    el.innerHTML = `<section class="card"><div class="ch"><h2>Medição Caixa — acompanhamento</h2><div class="filters" style="margin:0"><button class="mini" id="cxdl">⬇ Baixar planilha da Caixa atualizada</button><label class="mini ghost" style="cursor:pointer">Trocar planilha<input type="file" id="cxf" accept=".xlsx" hidden></label></div></div>
      <p class="hint">${esc(RAW.caixa.name)} · mês da medição na planilha: <b>${ml(M0)}</b> · data de referência ${fd(S.ref)}. Pesos = <b>incidência FRE da Caixa</b> de cada Med (soma ${pc2(d.incTot)}), independentes do orçamento e dos pesos internos. O avanço de cada Med vem das tarefas do cronograma escritas na observação da própria planilha, no pavimento/pano do Med, cada tarefa pesando pela duração: término real = 100%, iniciada = dias decorridos ÷ duração (máx. 95%), e o que falta segue as datas atuais. Meses antes de ${ml(M0)} ficam como estão na planilha; quando a planilha já mede mais do que o cronograma mostra, vale o da planilha. ${manual.length} Meds sem atividade no cronograma seguem o que está lançado na planilha (medição manual).</p>
      <div class="tiles">${tile('Medido acumulado ' + ml(refM), pc2(atual), 'anterior ' + pc2(ant) + ' + no mês ' + pc2(mesV))}${tile('Planilha R' + ((/R(\d+)/.exec(RAW.caixa.name) || [])[1] || '') + ' em ' + ml(refM), pc2(fileAt), 'diferença ' + (atual - fileAt >= 0 ? '+' : '') + pc2(atual - fileAt))}${tile('Previsto FRE ' + ml(refM), pc2(freAt), freAt != null ? 'adiantado ' + pc2(atual - freAt) : '')}${tile('Valor medido acumulado', 'R$ ' + brlK(sum(d.meds, md => md.custo * R.meds[md.cod].A[refM])), 'custo do analítico × % de cada Med · total R$ ' + brlK(d.custoTot || 0))}${tile('Chega a ' + pct(cxSim().alvo), R.quando(cxSim().alvo) ? ml(R.quando(cxSim().alvo)) : '—', 'pelo cronograma atual', metas.length && R.quando(cxSim().alvo) > metas.at(-1).m ? 'crit' : '')}${metas.map(mt => tile(mt.t + ' (' + ml(mt.m) + ')', pc2(R.G[mt.m]), 'falta ' + pc2(Math.max(0, cxSim().alvo - R.G[mt.m])) + ' para ' + pct(cxSim().alvo), R.G[mt.m] < cxSim().alvo ? 'crit' : '')).join('')}</div>
      ${maisArq.length || semLote.length ? `<p class="sub">${maisArq.length ? `<b>${maisArq.length} Meds</b> estão mais avançados na planilha do que no cronograma (vale o da planilha — confira se o cronograma está sem a data real): ${maisArq.slice(0, 6).map(o => esc(o.md.cod + ' ' + o.md.d)).join(' · ')}${maisArq.length > 6 ? '…' : ''}. ` : ''}${semLote.length ? `<b>${semLote.length} Meds</b> não acharam a tarefa no pavimento: ${semLote.slice(0, 5).map(m => esc(m.cod + ' ' + m.d)).join(' · ')}.` : ''}</p>` : ''}
      </section>
      <section class="card"><div class="ch"><h3>Curva acumulada — Caixa</h3><div class="seg" id="cxper">${[['2027', 'até dez/27'], ['2028', 'até dez/28'], ['obra', 'obra toda']].map(([v, l]) => `<button data-v="${v}" class="${S.cxPer === v ? 'on' : ''}">${l}</button>`).join('')}</div></div><div id="cxch"></div>
        <p class="sub">Barras = % global medido/previsto no mês pelo cronograma atual. Linha vermelha = meta de ${pct(cxSim().alvo)}. Clique num mês para ver o que entra nele.</p></section>
      <section class="card"><h3>Por etapa — incidência da Caixa × avanço</h3><div id="cxet"></div></section>
      <section class="card"><div class="ch"><h3>Medição por item (Etapa › Sub-Etapa › Serviço › Med)</h3><input type="search" id="cxq" placeholder="Filtrar (ex.: Tipo 05, alvenaria, 3.1)" value="${esc(S.cxQ || '')}" style="min-width:280px"></div>
        <p class="sub">% sobre o próprio item; "global" = incidência × %. Clique numa linha Med para ver a conta.</p><div class="tw" style="max-height:640px" id="cxtab"></div></section>`;
    const lines = [{ name: 'Previsto FRE (acum.)', c: COL.prev, v: Object.fromEntries(ms.map(m => [m, d.fre[m] ? d.fre[m].a : null])), dash: true }, { name: 'Planilha da Caixa (acum.)', c: COL.base, v: Object.fromEntries(ms.map(m => [m, R.Gfile[m]])) }, { name: 'Cronograma atual (acum.)', c: COL.crono, v: R.G }];
    cxChart($('#cxch'), ms, [{ name: 'No mês — medido', c: COL.pago, v: Object.fromEntries(ms.filter(m => m <= refM).map(m => [m, R.Gm[m]])) }, { name: 'No mês — previsto', c: 'var(--s4)', v: Object.fromEntries(ms.filter(m => m > refM).map(m => [m, R.Gm[m]])) }], lines, { refM, hl: cxSim().alvo, vm: metas.map(mt => [mt.m, 'Meta ' + mt.n]), label: 'Curva Caixa', table: true, onPick: m => cxMes(R, m) });
    $('#cxper').onclick = e => { if (e.target.dataset.v) { S.cxPer = e.target.dataset.v; render(); } };
    $('#cxdl').onclick = e => cxBusy(e.target, () => cxBaixar(false, e.target));
    $('#cxf').onchange = async e => { try { await cxImport(e.target.files[0]); render(); } catch (er) { alert(er.message); } };
    // por etapa
    const ets = d.rows.filter(r => r.tipo === 'Etapa');
    const etRows = ets.map(et => { const ms2 = d.meds.filter(md => md.et === et.et); const inc = sum(ms2, md => md.inc); const ac = sum(ms2, md => md.inc * R.meds[md.cod].A[refM]); const wi = sum(ms2, md => md.wi || 0); return { et, inc, ac, wi, mt: metas.map(mt => sum(ms2, md => md.inc * R.meds[md.cod].A[mt.m])) }; }).filter(r => r.inc > 0);
    const mxI = Math.max(...etRows.map(r => Math.max(r.inc, r.wi)));
    $('#cxet').innerHTML = `<div class="tw"><table class="t"><thead><tr><th>Etapa</th><th class="n">Incidência Caixa</th><th style="width:30%">Medido × saldo (na incidência)</th><th class="n">Medido acum.</th><th class="n">% da etapa</th>${metas.map(mt => `<th class="n">Em ${ml(mt.m)}</th>`).join('')}${d.temPeso ? '<th class="n">Peso interno</th><th class="n">Caixa ÷ interno</th>' : ''}</tr></thead><tbody>${etRows.map(r => `<tr><td>${esc(r.et.et + ' · ' + r.et.d)}</td><td class="n">${pc2(r.inc)}</td><td><div style="display:flex;height:12px;border-radius:3px;overflow:hidden;background:var(--line,#e5e5e5);width:${(r.inc / mxI * 100).toFixed(1)}%"><div style="width:${(r.ac / r.inc * 100).toFixed(1)}%;background:var(--s1)"></div></div></td><td class="n">${pc2(r.ac)}</td><td class="n">${pct(r.ac / r.inc)}</td>${r.mt.map(v => `<td class="n">${pc2(v)}</td>`).join('')}${d.temPeso ? `<td class="n">${pc2(r.wi)}</td><td class="n ${r.wi && r.inc / r.wi > 1.2 ? 'okv' : ''}">${r.wi ? (r.inc / r.wi).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '×' : '—'}</td>` : ''}</tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td class="n">${pc2(sum(etRows, r => r.inc))}</td><td></td><td class="n">${pc2(sum(etRows, r => r.ac))}</td><td></td>${metas.map((mt, i) => `<td class="n">${pc2(sum(etRows, r => r.mt[i]))}</td>`).join('')}${d.temPeso ? `<td class="n">${pc2(sum(etRows, r => r.wi))}</td><td></td>` : ''}</tr></tfoot></table></div>${d.temPeso ? '<p class="sub">Peso interno = peso das mesmas tarefas na planilha de pesos do Prevision (custo). <b>Caixa ÷ interno &gt; 1</b> = a Caixa paga mais avanço do que o custo interno dessas tarefas — são as que mais aceleram a medição.</p>' : ''}`;
    cxTable(R, $('#cxtab'), refM, M0);
    $('#cxq').oninput = e => { S.cxQ = e.target.value; cxTable(R, $('#cxtab'), refM, M0); };
  }

  function cxTable(R, box, refM, M0) {
    const d = cxBase().d, q = (S.cxQ || '').toLowerCase().trim(); S.cxOpen = S.cxOpen || new Set();
    const A = (md, m) => R.meds[md.cod].A[m] || 0, pAnt = addM(M0, -1);
    const agg = (L, m) => { const inc = sum(L, md => md.inc); return inc ? sum(L, md => md.inc * A(md, m)) / inc : 0; };
    let h = '';
    const head = `<thead><tr><th>Item</th><th class="c">Un</th><th class="n">Qtd</th><th class="n">Incidência</th><th class="n">Acum. anterior</th><th class="n">No mês (${ml(refM)})</th><th class="n">Acum. atual</th><th class="n">Global acum.</th><th class="n">Saldo (global)</th><th>Término previsto</th><th>Origem</th></tr></thead>`;
    const row = (cls, lbl, L, extra, key, kids) => { const inc = sum(L, md => md.inc), a0 = agg(L, pAnt), a1 = agg(L, refM); return `<tr class="${cls}${key ? ' clk grp' : ''}"${key ? ` data-cxk="${esc(key)}"` : ''}><td>${key ? `<span class="ar">${S.cxOpen.has(key) || q ? '▾' : '▸'}</span> ` : ''}${lbl}</td><td class="c">${extra.un || ''}</td><td class="n">${extra.q != null ? brl(extra.q, 2) : ''}</td><td class="n">${pc3(inc)}</td><td class="n">${pct(a0)}</td><td class="n">${pct(a1 - a0)}</td><td class="n"><b>${pct(a1)}</b></td><td class="n">${pc3(inc * a1)}</td><td class="n">${pc3(inc * (1 - a1))}</td><td>${extra.fim || ''}</td><td class="sub">${extra.orig || ''}</td></tr>`; };
    for (const et of d.rows.filter(r => r.tipo === 'Etapa')) {
      const Le = d.meds.filter(md => md.et === et.et); if (!Le.length || !sum(Le, md => md.inc)) continue;
      const hit = md => !q || (md.cod + ' ' + md.d + ' ' + md.dsv + ' ' + md.dsub + ' ' + md.det).toLowerCase().includes(q);
      if (q && !Le.some(hit)) continue;
      h += row('lvB', `<b>${esc(et.et + ' · ' + et.d)}</b>`, Le, {}, 'E' + et.et);
      if (!S.cxOpen.has('E' + et.et) && !q) continue;
      for (const sb of d.rows.filter(r => r.tipo === 'Sub-Etapa' && r.et === et.et)) {
        const Ls = Le.filter(md => md.sub === sb.sub); if (!Ls.length || !sum(Ls, md => md.inc)) continue; if (q && !Ls.some(hit)) continue;
        h += row('lvC', `<span style="padding-left:14px">${esc(sb.sub + ' · ' + sb.d)}</span>`, Ls, {}, 'S' + sb.sub);
        if (!S.cxOpen.has('S' + sb.sub) && !q) continue;
        for (const sv of d.rows.filter(r => r.tipo === 'Serviço' && r.sub === sb.sub)) {
          const Lv = Ls.filter(md => md.sv === sv.sv); if (!Lv.length) continue; if (q && !Lv.some(hit)) continue;
          const multi = Lv.length > 1 || Lv[0].d !== sv.d;
          if (multi) h += row('lvS', `<span style="padding-left:28px">${esc(sv.sv + ' · ' + sv.d)}</span> <span class="sub">(${Lv.length} meds)</span>`, Lv, { un: esc(sv.un), q: sv.q }, 'V' + sv.sv);
          if (multi && !S.cxOpen.has('V' + sv.sv) && !q) continue;
          for (const md of Lv.filter(hit)) { const o = R.meds[md.cod]; const a0 = A(md, pAnt), a1 = A(md, refM);
            h += `<tr class="clk cxmed" data-cod="${esc(md.cod)}"><td style="padding-left:${multi ? 44 : 30}px">${esc(md.cod)} · ${esc(md.d)}</td><td class="c">${esc(md.un)}</td><td class="n">${md.q != null ? brl(md.q, 2) : ''}</td><td class="n">${pc3(md.inc)}</td><td class="n">${pct(a0)}</td><td class="n">${pct(a1 - a0)}</td><td class="n"><b>${pct(a1)}</b></td><td class="n">${pc3(md.inc * a1)}</td><td class="n">${pc3(md.inc * (1 - a1))}</td><td>${a1 >= 1 - 1e-9 ? '<span class="okv">concluído</span>' : o.fim ? ml(o.fim) : '—'}</td><td class="sub">${o.src === 'estrategia' ? '<b style="color:#e00000">estratégia: ' + esc(md.tatica || '') + '</b>' : o.src === 'manual' ? 'medição manual' : md.tasks.length + ' tarefa' + (md.tasks.length > 1 ? 's' : '') + (o.maisArq > 1e-4 ? ' · <span class="crit">planilha &gt; cronograma</span>' : '')}</td></tr>`; }
        }
      }
    }
    box.innerHTML = `<table class="t">${head}<tbody>${h}</tbody></table>`;
    box.onclick = e => { const g = e.target.closest('tr[data-cxk]'); if (g) { const k = g.dataset.cxk; S.cxOpen.has(k) ? S.cxOpen.delete(k) : S.cxOpen.add(k); cxTable(R, box, refM, M0); return; }
      const r = e.target.closest('tr.cxmed'); if (r) cxConta(R, r.dataset.cod); };
  }

  function cxConta(R, cod) {
    const o = R.meds[cod], md = o.md, refM = R.refM, M0 = R.M0, ms = cxBase().d.months;
    const vis = ms.filter(m => (md.h[m] || 0) > 1e-9 || Math.abs(o.mes[m]) > 1e-9);
    const tl = o.F ? `<h4>Tarefas do cronograma usadas</h4><table class="t"><thead><tr><th>Tarefa</th><th>Local</th><th class="c">Atual</th><th class="c">Real</th><th class="n">Duração (peso)</th><th class="n">Peso no Med</th><th class="n">Realizado em ${fd(S.ref)}</th><th class="c">Previsão</th></tr></thead><tbody>${o.F.map(x => { const W = sum(o.F, y => y.f.dur); return `<tr><td>${esc(x.t.t)}</td><td>${esc(x.t.l)}</td><td class="c">${fd(x.t.i)} → ${fd(x.t.f)}</td><td class="c">${x.t.ri ? fd(x.t.ri) + ' → ' + (x.t.rf ? fd(x.t.rf) : '…') : '—'}</td><td class="n">${brl(x.f.dur, 0)} d</td><td class="n">${pct(x.f.dur / W)}</td><td class="n">${pct(x.f.p0)}</td><td class="c">${x.f.p0 >= 1 ? 'concluída' : fd(x.f.ini) + ' → ' + fd(x.f.fim)}</td></tr>`; }).join('')}</tbody><tfoot><tr><td colspan="6">Realizado do Med = Σ(duração × realizado) ÷ Σ duração</td><td class="n"><b>${pct(o.pr)}</b></td><td></td></tr></tfoot></table>` : (o.src === 'estrategia' ? `<p class="hint" style="color:#e00000"><b>Med da estratégia:</b> ${esc(md.tatica || '')}. Segue o plano gravado na planilha (células em vermelho).</p>` : `<p class="hint">Sem atividade no cronograma — o Med segue o que está lançado na planilha (medição manual). Na simulação você pode antecipar a conclusão dele.</p>`);
    openCalc(`${esc(md.cod)} · ${esc(md.d)}`, `${esc(md.sv + ' ' + md.dsv)} · incidência Caixa ${pc3(md.inc)} · custo R$ ${brl(md.custo, 2)}`, `
      <table class="t"><tbody>
        <tr><td>Peso no serviço (planilha)</td><td class="n">${pct(md.w)}</td></tr>
        <tr><td>Incidência global (FRE)</td><td class="n">${pc3(md.inc)}</td></tr>
        <tr><td>Acumulado até ${ml(addM(M0, -1))} (planilha, já medido)</td><td class="n">${pct(o.ant)}</td></tr>
        <tr><td>Acumulado em ${ml(refM)}</td><td class="n"><b>${pct(o.A[refM])}</b>${o.maisArq > 1e-4 ? ' <span class="sub">(a planilha mede mais que o cronograma: ficou o da planilha)</span>' : ''}</td></tr>
        <tr><td>Contribuição global acumulada = ${pc3(md.inc)} × ${pct(o.A[refM])}</td><td class="n"><b>${pc3(md.inc * o.A[refM])}</b></td></tr>
      </tbody></table>
      ${tl}
      <h4>Mês a mês (% do Med)</h4><div class="tw"><table class="t"><thead><tr><th>Mês</th><th class="n">Planilha</th><th class="n">Atualizado</th><th class="n">Acum. atualizado</th><th class="n">Global no mês</th></tr></thead><tbody>${vis.map(m => `<tr${m === refM ? ' class="okrow"' : ''}><td>${ml(m)}${m < M0 ? ' <span class="sub">medido</span>' : m <= refM ? ' <span class="sub">medição</span>' : ''}</td><td class="n">${pct(md.h[m] || 0)}</td><td class="n">${pct(o.mes[m])}</td><td class="n">${pct(o.A[m])}</td><td class="n">${pc3(md.inc * o.mes[m])}</td></tr>`).join('')}</tbody></table></div>`);
  }

  function cxMes(R, m) {
    const d = cxBase().d; const L = d.meds.map(md => ({ md, v: md.inc * R.meds[md.cod].mes[m] })).filter(x => x.v > 1e-7).sort((a, b) => b.v - a.v);
    const bySv = {}; L.forEach(x => { const k = x.md.sv + ' · ' + x.md.dsv; bySv[k] = (bySv[k] || 0) + x.v; });
    openCalc(`Medição Caixa · ${ml(m)}`, `${m <= R.refM ? 'medido' : 'previsto pelo cronograma'} no mês: ${pc2(R.Gm[m])} · acumulado ${pc2(R.G[m])}`,
      `<h4>Por serviço</h4><table class="t"><tbody>${Object.entries(bySv).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${pc3(v)}</td></tr>`).join('')}</tbody></table>
       <details><summary>${L.length} Meds</summary><table class="t"><thead><tr><th>Med</th><th class="n">% do Med no mês</th><th class="n">Global</th></tr></thead><tbody>${L.map(x => `<tr><td>${esc(x.md.cod + ' · ' + x.md.d)}</td><td class="n">${pct(R.meds[x.md.cod].mes[m])}</td><td class="n">${pc3(x.v)}</td></tr>`).join('')}</tbody></table></details>`);
  }

  /* SIMULAÇÃO: alavancas por serviço (antecipar/ritmo) + antecipar a conclusão de Meds; sugestões para chegar ao alvo na meta */
  function cxSimView(el) {
    const B = cxBase(), d = B.d, sim = cxSim(), R0 = cxCalc(null), R = cxCalc(sim), refM = R.refM, metas = cxMetas(d);
    const alvo = sim.alvo, meta = sim.meta, endMeta = YCX.endOf(meta);
    const q0 = R0.quando(alvo), q1 = R.quando(alvo), falta = Math.max(0, alvo - R.G[meta]);
    // sugestões (sobre a simulação atual): o que falta medir até a meta, do mais fácil (menos antecipação) para o mais difícil
    const cand = d.meds.map(md => { const o = R.meds[md.cod]; const rest = md.inc * (1 - (o.A[meta] || 0)); if (rest < 1e-7) return null;
      const fimT = o.fimD ? D(o.fimD) : o.fim ? YCX.endOf(o.fim) : null; const dias = fimT == null ? 999 : Math.max(0, Math.round((fimT - endMeta) / 864e5));
      const ini = o.ini || null; const iniD = ini ? Math.round((D(ini) - endMeta) / 864e5) : null;
      return { md, o, rest, dias, iniD, ratio: md.wi ? md.inc / md.wi : null }; }).filter(Boolean)
      .sort((a, b) => (a.dias - b.dias) || (b.rest - a.rest));
    let acc = 0; const sug = []; for (const c of cand) { if (acc >= falta - 1e-9) break; acc += c.rest; c.acc = acc; sug.push(c); }
    const ms = d.months.filter(m => m <= (meta > '2027-12' ? '2028-12' : '2027-12'));
    const servs = d.rows.filter(r => r.tipo === 'Serviço');
    el.innerHTML = `<section class="card"><div class="ch"><h2>Simulação — chegar a ${pct(alvo)} o quanto antes</h2><div class="filters" style="margin:0"><span class="sub">Alvo</span><input class="wn" id="cxal" value="${(alvo * 100).toLocaleString('pt-BR')}" style="width:60px">%<span class="sub">até</span><select id="cxmeta">${d.months.filter(m => m > refM && m <= '2028-12').map(m => `<option value="${m}" ${m === meta ? 'selected' : ''}>${ml(m)}${metas.filter(mt => mt.m === m).map(mt => ' — ' + mt.t).join('')}</option>`).join('')}</select><button class="mini" id="cxest" title="Blocos em 2 frentes, torre antecipada 75 dias, área externa do térreo, canteiro pelo executado, entrada de energia/subestação e ligações definitivas de água, esgoto e energia">Carregar estratégia 20% em ${ml(meta)}</button><button class="mini" id="cxsdl">⬇ Baixar planilha com a simulação</button><button class="mini" id="cxedl" style="background:#e00000;color:#fff;border-color:#e00000">⬇ Planilha da estratégia (alterações em vermelho)</button><button class="mini ghost" id="cxclr">Limpar simulação</button></div></div>
      <p class="hint">A simulação mexe só no que ainda não foi feito: <b>antecipar</b> (dias) puxa o início das tarefas do serviço; <b>ritmo</b> (%) comprime o calendário do que falta no serviço a partir de hoje (80% = tudo que falta acontece em 80% do prazo, então os pavimentos seguintes também começam antes); e dá para marcar um Med como <b>concluído até a meta</b>. O medido até ${ml(refM)} não muda. Tudo fica salvo no aplicativo.</p>
      <div class="tiles">${tile('Sem simulação', q0 ? pct(alvo) + ' em ' + ml(q0) : '—', 'em ' + ml(meta) + ': ' + pc2(R0.G[meta]), q0 > meta ? 'crit' : '')}${tile('Com simulação', q1 ? pct(alvo) + ' em ' + ml(q1) : '—', 'em ' + ml(meta) + ': ' + pc2(R.G[meta]) + ' (' + (R.G[meta] - R0.G[meta] >= 0 ? '+' : '') + pc2(R.G[meta] - R0.G[meta]) + ')', q1 && q1 <= meta ? 'ok' : 'crit')}${tile('Falta em ' + ml(meta), falta > 0 ? pc2(falta) : '✓ atingido', falta > 0 ? '≈ R$ ' + brlK(falta * (d.custoTot || 0)) + ' de medição' : 'meta batida na simulação', falta > 0 ? 'crit' : '')}${tile('Ritmo necessário', pc2(Math.max(0, alvo - R.G[refM]) / Math.max(1, d.months.filter(m => m > refM && m <= meta).length)) + ' / mês', 'de ' + ml(addM(refM, 1)) + ' a ' + ml(meta) + ' · previsto hoje ' + pc2((R0.G[meta] - R0.G[refM]) / Math.max(1, d.months.filter(m => m > refM && m <= meta).length)) + ' / mês')}${tile('Alavancas usadas', Object.keys(sim.serv).filter(k => sim.serv[k].ant || (sim.serv[k].ritmo && sim.serv[k].ritmo !== 1)).length + ' serviços', Object.keys(sim.med).length + ' Meds antecipados')}</div></section>
      <section class="card"><h3>Curva — cronograma atual × simulação</h3><div id="cxsch"></div></section>
      <section class="card"><div class="ch"><h3>Caminho sugerido para ${pct(alvo)} em ${ml(meta)}</h3>${sug.length ? '<button class="mini" id="cxapall">Aplicar todas as sugestões</button>' : ''}</div>
        <p class="hint">${falta > 0 ? `Faltam <b>${pc2(falta)}</b> em ${ml(meta)}. Lista do que ainda não estará medido em ${ml(meta)}, do que pede <b>menos antecipação</b> (término previsto mais perto da meta) para o que pede mais; somando até cobrir o que falta. "Aplicar" marca o Med como concluído até ${ml(meta)} na simulação — use como roteiro de frentes a puxar.` : 'Com a simulação atual a meta já é atingida. A lista abaixo mostra o que mais está perto, caso queira folga.'}</p>
        <div class="tw" style="max-height:460px"><table class="t"><thead><tr><th></th><th>Med</th><th>Serviço</th><th class="n">Incidência</th><th class="n">Falta medir em ${ml(meta)}</th><th class="n">Acumulado</th><th>Término previsto</th><th class="n">Antecipar</th>${d.temPeso ? '<th class="n">Caixa ÷ interno</th>' : ''}<th>Origem</th></tr></thead><tbody>${(sug.length ? sug : cand.slice(0, 15)).map(c => `<tr class="${sim.med[c.md.cod] ? 'okrow' : ''}"><td><input type="checkbox" class="cxap" data-cod="${esc(c.md.cod)}" ${sim.med[c.md.cod] ? 'checked' : ''}></td><td>${esc(c.md.cod + ' · ' + c.md.d)}</td><td class="sub">${esc(c.md.sv + ' ' + c.md.dsv)}</td><td class="n">${pc3(c.md.inc)}</td><td class="n">${pc3(c.rest)}</td><td class="n">${c.acc != null ? pc2(c.acc) : ''}</td><td>${c.o.src === 'manual' ? (c.o.fim ? ml(c.o.fim) + ' (planilha)' : 'sem data') : fd(c.o.fimD)}</td><td class="n">${c.dias >= 999 ? '—' : c.dias ? c.dias + ' dias' : 'no prazo'}</td>${d.temPeso ? `<td class="n">${c.ratio ? c.ratio.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '×' : '—'}</td>` : ''}<td class="sub">${c.o.src === 'manual' ? 'medição manual' : c.md.tasks.length + ' tarefa(s)'}</td></tr>`).join('')}</tbody></table></div></section>
      <section class="card"><h3>Alavancas por serviço da Caixa</h3><p class="sub">Ganho = quanto o serviço soma em ${ml(meta)} com a alavanca. Serviços só com medição manual não têm alavanca de cronograma (use a lista acima).</p>
        <div class="tw" style="max-height:560px"><table class="t plan" id="cxlev"><thead><tr><th>Serviço</th><th class="n">Incidência</th><th class="n">Medido ${ml(refM)}</th><th class="n">Em ${ml(meta)} (atual)</th><th class="n">Antecipar (dias)</th><th class="n">Ritmo (% do prazo)</th><th class="n">Em ${ml(meta)} (simulado)</th><th class="n">Ganho</th><th>Término (simulado)</th></tr></thead><tbody>${servs.map(sv => { const L = d.meds.filter(md => md.sv === sv.sv && md.sub === sv.sub); const inc = sum(L, md => md.inc); if (!inc) return ''; const g0 = sum(L, md => md.inc * R0.meds[md.cod].A[meta]), g1 = sum(L, md => md.inc * R.meds[md.cod].A[meta]), gr = sum(L, md => md.inc * R.meds[md.cod].A[refM]); const lv = sim.serv[sv.sv] || {}; const temT = L.some(md => md.tasks.length); const fim = L.reduce((s, md) => { const f = R.meds[md.cod].fimD || (R.meds[md.cod].fim ? R.meds[md.cod].fim + '-28' : null); return f && f > s ? f : s; }, '');
          return `<tr data-sv="${esc(sv.sv)}"${gr >= inc - 1e-9 ? ' class="sub2"' : ''}><td>${esc(sv.sv + ' · ' + sv.d)}</td><td class="n">${pc3(inc)}</td><td class="n">${pct(gr / inc)}</td><td class="n">${pc3(g0)}</td><td>${temT && gr < inc - 1e-9 ? `<input class="wn cxlv" data-f="ant" value="${lv.ant || ''}" inputmode="numeric" style="width:70px">` : ''}</td><td>${temT && gr < inc - 1e-9 ? `<input class="wn cxlv" data-f="ritmo" value="${lv.ritmo && lv.ritmo !== 1 ? Math.round(lv.ritmo * 100) : ''}" placeholder="100" inputmode="numeric" style="width:70px">` : ''}</td><td class="n">${pc3(g1)}</td><td class="n ${g1 - g0 > 1e-7 ? 'okv' : ''}">${g1 - g0 > 1e-7 ? '+' + pc3(g1 - g0) : '–'}</td><td>${fim ? fd(fim.slice(0, 10)) : '—'}</td></tr>`; }).join('')}</tbody></table></div></section>`;
    const lines = [{ name: 'Previsto FRE (acum.)', c: COL.prev, v: Object.fromEntries(ms.map(m => [m, d.fre[m] ? d.fre[m].a : null])), dash: true }, { name: 'Cronograma atual (acum.)', c: COL.crono, v: R0.G }, { name: 'Simulação (acum.)', c: COL.apagar, v: R.G }];
    cxChart($('#cxsch'), ms, [{ name: 'Simulação no mês', c: 'var(--s4)', v: Object.fromEntries(ms.filter(m => m > refM).map(m => [m, R.Gm[m]])) }], lines, { refM, hl: alvo, vm: [[meta, 'Meta']], label: 'Simulação Caixa', table: true, onPick: m => cxMes(R, m) });
    const redo = () => { savePlano(); const y = scrollY; render(); scrollTo(0, y); };
    $('#cxal').onchange = e => { const v = pnum(e.target.value) / 100; if (v > 0 && v <= 1) { sim.alvo = v; redo(); } };
    $('#cxmeta').onchange = e => { sim.meta = e.target.value; redo(); };
    $('#cxclr').onclick = () => { sim.serv = {}; sim.med = {}; redo(); };
    $('#cxest').onclick = () => { // estratégia estudada (31/10/26): frentes que não dependem da torre + caminho crítico da torre + medição/contratação
      sim.serv = { '3.1': { ant: 75 } }; sim.med = {};
      CX_EST.forEach(([L, t, k]) => L.forEach(c => { if (d.meds.some(md => md.cod === c)) sim.med[c] = k === 'parc' ? { parc: { m: meta, p: 0.35 } } : { fim: meta }; })); redo(); };
    $('#cxsdl').onclick = e => cxBusy(e.target, () => cxBaixar(true, e.target));
    $('#cxedl').onclick = e => cxBusy(e.target, () => cxBaixarEst(e.target));
    if ($('#cxapall')) $('#cxapall').onclick = () => { sug.forEach(c => sim.med[c.md.cod] = { fim: meta }); redo(); };
    el.querySelectorAll('.cxap').forEach(cb => cb.onchange = () => { if (cb.checked) sim.med[cb.dataset.cod] = { fim: meta }; else delete sim.med[cb.dataset.cod]; redo(); });
    el.querySelectorAll('.cxlv').forEach(inp => inp.onchange = () => { const k = inp.closest('tr').dataset.sv; const o = sim.serv[k] || (sim.serv[k] = {}); const v = pnum(inp.value); if (inp.dataset.f === 'ant') o.ant = Math.max(0, Math.round(v)) || 0; else o.ritmo = v > 0 ? v / 100 : 1; if (!o.ant && (!o.ritmo || o.ritmo === 1)) delete sim.serv[k]; redo(); });
  }

  /* ===== SERVIÇOS ===== */
  views.servicos = function (el) {
    el.innerHTML = `<section class="card"><div class="ch"><h2>Serviços — orçado × fluxo × cronograma</h2><input type="search" id="sq" placeholder="Buscar serviço" value="${esc(S.svcQ)}"></div>
      <p class="hint">Etapas e sub-etapas da FLUXO-BASE. Orçado e M.O. vêm do Orçamento pelos códigos ORÇ; pago e a pagar do relatório; datas do cronograma. Clique numa etapa para abrir/fechar e no nome para a ficha.</p>
      <div class="tw" id="stab"></div></section>`;
    $('#sq').oninput = e => { S.svcQ = e.target.value; drawSvc(); };
    drawSvc();
  }
  function drawSvc() {
    const q = S.svcQ.trim().toLowerCase();
    const Bs = Object.values(M.nodes).filter(n => n.lv === 'B');
    const [a, b] = win3();
    const row = (id, lvl) => {
      const g = nodeAgg(id), n = g.n, comp = g.st.pago + g.st.ap;
      const bar = n.orc ? Math.min(1, comp / n.orc) : 0;
      return `<tr class="${lvl === 'B' ? 'lvB' : 'lvC'}" data-n="${id}">
        <td>${lvl === 'B' ? `<button class="tg" data-b="${id}">${S.svcOpen.has(id) || q ? '▾' : '▸'}</button>` : ''}<a href="#" class="fic" data-n="${id}">${esc(n.id)} · ${esc(n.desc)}</a></td>
        <td class="n">${brl(n.orc)}</td><td class="n sub">${brl(g.mo)}</td><td class="n">${brl(g.prevTot)}</td>
        <td class="n">${brl(g.st.pago)}</td><td class="n">${brl(g.st.ap)}</td>
        <td class="n"><div class="mbar" title="${pct(comp / n.orc)} do orçado comprometido (pago + a pagar)"><i style="width:${bar * 100}%"></i></div>${n.orc ? pct(comp / n.orc) : '–'}</td>
        <td class="n">${brl(g.prev3)}</td><td class="n">${brl(g.st.j3)}</td><td class="n ${g.st.venc ? 'crit' : ''}">${brl(g.st.venc)}</td>
        <td class="c">${g.ini ? fd(g.ini) + ' – ' + fd(g.fim) : '<span class="sub">sem tarefa</span>'}${g.sc.herdadas ? ' <span class="sub">(' + (g.sc.origem === 'etapa' ? 'etapa' : g.sc.origem === 'prazo' ? 'prazo da obra' : 'serviço parecido') + ')</span>' : ''}</td>
        <td class="n ${g.desv > 0 ? 'crit' : ''}">${g.desv == null ? '–' : (g.desv > 0 ? '+' : '') + g.desv + 'd'}</td>
        <td class="n">${g.sc.tasks.length ? g.conc + '/' + g.sc.tasks.length : '–'}</td></tr>`;
    };
    let h = '';
    for (const B of Bs) {
      const kids = B.kids.map(k => M.nodes[k]);
      const match = n => !q || (n.id + ' ' + n.desc).toLowerCase().includes(q);
      const km = kids.filter(match);
      if (q && !match(B) && !km.length) continue;
      h += row(B.id, 'B');
      if (S.svcOpen.has(B.id) || q) for (const k of (q && !match(B) ? km : kids)) h += row(k.id, 'C');
    }
    $('#stab').innerHTML = `<table class="t svc"><thead><tr><th>Serviço</th><th class="n">Orçado</th><th class="n">M.O. orçada</th><th class="n">Previsto FLUXO-BASE</th><th class="n">Pago</th><th class="n">A pagar</th><th class="n">Comprometido</th><th class="n">Previsto 3m<br><span class="sub">${ml(a)}–${ml(b)}</span></th><th class="n">A pagar 3m</th><th class="n">Vencido</th><th class="c">Cronograma (atual)</th><th class="n">Desvio término</th><th class="n">Concl.</th></tr></thead><tbody>${h}</tbody></table>`;
    $('#stab').onclick = e => {
      const tg = e.target.closest('.tg'); if (tg) { const id = tg.dataset.b; S.svcOpen.has(id) ? S.svcOpen.delete(id) : S.svcOpen.add(id); drawSvc(); return; }
      const a = e.target.closest('.fic'); if (a) { e.preventDefault(); openFicha(a.dataset.n); }
    };
  }

  /* ===== FICHA DO SERVIÇO ===== */
  /* ficha do serviço: mão de obra orçada × contratada × medida × paga (relatório de contratos) */
  function fichaMO(n, g, sc) {
    if (!M.ct) return `<section class="soon"><h3>Mão de obra — contratos e medições</h3><p>Importe o relatório de contratos (.xls) em Atualizar / Exportar para comparar M.O. orçada (R$ ${brl(g.mo)}) × contratada × medida × paga.</p></section>`;
    ctEst(); const ms = M3();
    const ids = new Set(n.lv === 'C' ? [n.id] : n.kids);
    const its = M.ct.itens.filter(i => ids.has(i.pnode));
    const mo = its.filter(i => YC.tipo(i) === 'MO'), eq = its.filter(i => YC.tipo(i) !== 'MO');
    const fc = new Set(its.map(i => i.fcod)), code = s2 => String(s2 || '').split(' - ')[0].trim();
    const lp = sc.lanc.filter(x => fc.has(code(x.forn))), pago = sum(lp, x => x.pg), apag = sum(lp, x => x.ap);
    const ct = sum(mo, i => i.tot), med = sum(mo, i => i.vm), am = sum(mo, i => i.va);
    const plan = RAW.plano.lines.filter(l => ids.has(l.node)), pmo = plan.filter(l => l.tipo === 'MO');
    const ligs = new Set(); mo.forEach(i => i.parts.forEach(([k]) => ligs.add(k))); const oLig = sum([...ligs], k => { const c = M.cmp.items[k].c; return (c.mo || 0) + (c.ou || 0); });
    const cIts = M.cmp ? Object.values(M.cmp.items).filter(o => ids.has(o.node)) : [], cMO = sum(cIts, o => o.c.mo || 0), cOu = sum(cIts, o => o.c.ou || 0);
    const box = (l, v, s3, c) => `<div class="tile ${c || ''}"><div class="tl">${l}</div><div class="tv">${v}</div>${s3 ? `<div class="ts">${s3}</div>` : ''}</div>`;
    const cts = {}; its.forEach(i => (cts[i.ct] || (cts[i.ct] = [])).push(i));
    return `<section><div class="ch"><h3>Mão de obra — contratos e medições</h3>${n.lv === 'C' ? `<button class="mini" id="fplan">Planejar ${ml(ms[0])}–${ml(ms[2])}${plan.length ? ' (' + plan.length + ' linhas)' : ''}</button>` : ''}</div>
      ${its.length ? `<div class="tiles">${box('M.O. + empreitadas orçadas', 'R$ ' + brl(cMO + cOu), 'M.O. R$ ' + brlK(cMO) + ' · outros/empreitadas R$ ' + brlK(cOu))}${box('Contratado (M.O.)', 'R$ ' + brl(ct), mo.length + ' itens · ' + new Set(mo.map(i => i.ct)).size + ' contratos', ct > oLig + 0.5 ? 'crit' : '')}${box('Medido', 'R$ ' + brl(med), pct(ct ? med / ct : 0) + ' do contratado')}${box('Saldo a medir', 'R$ ' + brl(am), 'estimado ' + ms.map(m => ml(m) + ' R$ ' + brlK(sum(mo, i => i.est[m].v))).join(' · '))}${box('Pago no relatório', 'R$ ' + brl(pago), 'a pagar R$ ' + brl(apag) + ' · fornecedores dos contratos')}${box('M.O./empreitada orçada dos itens contratados − contratado', 'R$ ' + brl(oLig - ct), ligs.size + ' itens do orçamento ligados · M.O. + outros R$ ' + brlK(oLig) + ' (sem material)', oLig - ct < -0.5 ? 'crit' : 'okv')}</div>
      <p class="hint"><b>Contratado/medido/saldo a medir</b> vêm do relatório de contratos (itens ligados a este serviço${n.lv === 'C' ? '' : ' e às suas sub-etapas'}; itens de locação/equipamento ficam à parte${eq.length ? `: ${eq.length} itens, contratado R$ ${brl(sum(eq, i => i.tot))}, a medir R$ ${brl(sum(eq, i => i.va))}` : ''}). <b>Pago</b> = parcelas do Pagar &amp; Pago deste serviço dos mesmos fornecedores dos contratos (o relatório começa em ${fd(M.rp.reduce((a, x) => !a || x.d < a ? x.d : a, ''))}). ${pmo.length ? `Planejado de M.O. ${ml(ms[0])}–${ml(ms[2])}: <b>R$ ${brl(sum(pmo, l => sum(ms, m => lineVal(l, m))), 2)}</b>.` : ''}</p>
      ${Object.entries(cts).map(([c, L]) => `<p class="sub" style="margin:8px 0 2px"><b>Contrato ${esc(c)} · ${esc(L[0].forn)}</b> — ${esc(L[0].obj)} · ${esc(L[0].status.replace(/^\d+ - /, ''))}</p>` + ctItemTable(L.map(it => ({ it, sh: 1 })), { est: 1, h: 300, nf: 1 })).join('')}`
      : `<p class="empty">Nenhum item de contrato ligado a ${n.lv === 'C' ? 'este serviço' : 'esta etapa'}. M.O. orçada: R$ ${brl(g.mo)}. Itens sem vínculo podem ganhar um serviço na aba Programação fluxo.</p>`}</section>`;
  }
  function openFicha(id) {
    S.fichaId = id;
    const g = nodeAgg(id), n = g.n, sc = g.sc;
    const B = n.lv === 'C' ? M.nodes[n.b] : null;
    const d = $('#drawer'); d.hidden = false; document.body.classList.add('noscroll');
    const forn = {}; sc.lanc.forEach(x => { const o = forn[x.forn] || (forn[x.forn] = { pg: 0, ap: 0, n: 0, prox: null }); o.pg += x.pg; o.ap += x.ap; o.n++; if (x.ap && x.d >= S.ref && (!o.prox || x.d < o.prox)) o.prox = x.d; });
    const fr = Object.entries(forn).sort((a, b) => (b[1].pg + b[1].ap) - (a[1].pg + a[1].ap));
    const insR = {}; sc.lanc.forEach(x => { const k = x.ins.split(' - ')[0]; const o = insR[k] || (insR[k] = { d: x.ins, pg: 0, ap: 0 }); o.pg += x.pg; o.ap += x.ap; });
    const insP = {}; sc.insumos.forEach(i => { const o = insP[i.cod] || (insP[i.cod] = { d: i.cod + ' - ' + i.desc, prev: 0 }); o.prev += sum(Object.values(i.prev)); });
    const insK = [...new Set([...Object.keys(insR), ...Object.keys(insP)])].sort();
    const tasks = sc.tasks.slice().sort((a, b) => (a.i || '').localeCompare(b.i || '') || M.lots.indexOf(a.l) - M.lots.indexOf(b.l));
    const saldo = n.orc - g.st.pago - g.st.ap;
    d.innerHTML = `<div class="dw"><header><div><div class="sub">${B ? esc(B.id + ' · ' + B.desc) : 'Etapa'}</div><h2>${esc(n.id)} · ${esc(n.desc)}</h2>
        <div class="sub">${n.code ? 'Serviço ' + esc(n.code) + ' · ' : ''}${n.uau ? 'EAP UAU ' + esc(n.uau) : ''}${n.extra ? 'Lançamentos do relatório sem sub-etapa correspondente na FLUXO-BASE' : ''}</div></div>
        <div class="dact">${sc.tasks.length ? '<button id="flob">Ver na linha de balanço</button>' : ''}<button id="fx" aria-label="Fechar">×</button></div></header>
      <div class="tiles">
        ${tile('Orçado', 'R$ ' + brl(n.orc), 'Material ' + brlK(g.mat) + ' · M.O. ' + brlK(g.mo) + ' · Outros ' + brlK(g.ou))}
        ${tile('Previsto FLUXO-BASE', 'R$ ' + brl(g.prevTot), 'próximos 3 meses R$ ' + brl(g.prev3))}
        ${tile('Pago', 'R$ ' + brl(g.st.pago), n.orc ? pct(g.st.pago / n.orc) + ' do orçado' : '')}
        ${tile('A pagar', 'R$ ' + brl(g.st.ap), 'vencido R$ ' + brl(g.st.venc) + ' · 3 meses R$ ' + brl(g.st.j3), g.st.venc ? 'crit' : '')}
        ${tile('Saldo do orçado', 'R$ ' + brl(saldo), 'orçado − pago − a pagar', saldo < 0 ? 'crit' : '')}
        ${tile('Cronograma', g.ini ? fd(g.ini) + ' – ' + fd(g.fim) : 'sem tarefa', g.ini ? `${g.conc} de ${sc.tasks.length} concluídas · desvio ${g.desv > 0 ? '+' : ''}${g.desv ?? 0} dias${sc.herdadas ? ' · ' + (ORIG[sc.origem] || '') : ''}` : '')}
      </div>
      <div class="seg" id="fsub" style="margin:4px 0 10px"><button data-v="geral" class="on">Geral</button><button data-v="ind">Individual — quantitativo × gasto estimado</button></div>
      <div id="find" hidden></div><div id="fgeral">
      <section><h3>Fluxo mensal do serviço</h3><div id="fch"></div></section>
      <section><h3>Cronograma — planejado × real ${sc.origem === 'etapa' ? '<span class="sub">(tarefas da etapa ' + esc(B.id) + ')</span>' : sc.herdadas ? '<span class="sub">(' + ORIG[sc.origem] + ' — só as datas)</span>' : ''}</h3>${tasks.length ? `<div class="tw tall"><table class="t"><thead><tr><th>Tarefa</th><th>Local</th><th class="c">Linha de base</th><th class="c">Atual</th><th class="c">Real</th><th class="n">Desvio</th></tr></thead><tbody>${tasks.map(t => { const dv = t.f && t.bf ? days(t.bf, t.f) : null; return `<tr><td>${esc(t.t)}</td><td>${esc(t.l)}</td><td class="c">${fd(t.bi)} – ${fd(t.bf)}</td><td class="c">${fd(t.i)} – ${fd(t.f)}</td><td class="c">${t.ri ? fd(t.ri) + ' – ' + (t.rf ? fd(t.rf) : '<i>andamento</i>') : '–'}</td><td class="n ${dv > 0 ? 'crit' : ''}">${dv == null ? '–' : (dv > 0 ? '+' : '') + dv + 'd'}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="empty">Nenhuma tarefa do cronograma ligada a este serviço.</p>'}</section>
      <section><h3>Fornecedores</h3>${fr.length ? `<div class="tw tall"><table class="t"><thead><tr><th>Fornecedor</th><th class="n">Pago</th><th class="n">A pagar</th><th class="n">Parcelas</th><th class="c">Próximo venc.</th></tr></thead><tbody>${fr.map(([f, o]) => `<tr><td>${esc(f)}</td><td class="n">${brl(o.pg, 2)}</td><td class="n">${brl(o.ap, 2)}</td><td class="n">${o.n}</td><td class="c">${fd(o.prox)}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td class="n">${brl(g.st.pago, 2)}</td><td class="n">${brl(g.st.ap, 2)}</td><td class="n">${sc.lanc.length}</td><td></td></tr></tfoot></table></div>` : '<p class="empty">Sem lançamentos no relatório Pagar &amp; Pago.</p>'}</section>
      <section><h3>Insumos — previsto FLUXO-BASE × relatório</h3>${insK.length ? `<div class="tw tall"><table class="t"><thead><tr><th>Insumo</th><th class="n">Previsto FLUXO-BASE</th><th class="n">Pago</th><th class="n">A pagar</th></tr></thead><tbody>${insK.map(k => `<tr><td>${esc((insP[k] || insR[k]).d)}</td><td class="n">${brl(insP[k] ? insP[k].prev : 0)}</td><td class="n">${brl(insR[k] ? insR[k].pg : 0)}</td><td class="n">${brl(insR[k] ? insR[k].ap : 0)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Sem insumos.</p>'}</section>
      <section><h3>Composições do orçamento R${esc(M.meta.orcRev)}</h3>${sc.comps.length ? `<div class="tw tall"><table class="t"><thead><tr><th>Item</th><th>Composição</th><th>Un.</th><th class="n">Qtd.</th><th class="n">Unit.</th><th class="n">Material</th><th class="n">M.O.</th><th class="n">Outros</th><th class="n">Total</th><th>Status</th></tr></thead><tbody>${sc.comps.map(c => `<tr><td>${esc(c.it)}</td><td>${esc(c.d)}</td><td>${esc(c.un)}</td><td class="n">${brl(c.q, 2)}</td><td class="n">${brl(c.pu, 2)}</td><td class="n">${brl(c.mat)}</td><td class="n">${brl(c.mo)}</td><td class="n">${brl(c.ou)}</td><td class="n"><b>${brl(c.tot)}</b></td><td class="sub">${esc(c.st)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Sem composições ligadas.</p>'}</section>
${fichaMO(n, g, sc)}
      </div></div>`;
    const fopt = { comps: sc.comps, task: S.fichaTask }; S.fichaTask = null;
    $('#fsub').onclick = e => { const v = e.target.dataset.v; if (!v) return; $('#fsub').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); $('#fgeral').hidden = v !== 'geral'; $('#find').hidden = v === 'geral'; if (v === 'ind') lobQtd($('#find'), fopt); };
    // gráfico
    const pg = {}, ap = {}; Object.entries(g.st.mes).forEach(([m, o]) => { pg[m] = o.pg; ap[m] = o.ap; });
    const ks = [...Object.keys(n.prev || {}), ...Object.keys(n.cur || {}), ...Object.keys(n.curBL || {}), ...Object.keys(g.st.mes)].filter(Boolean).sort();
    if (ks.length) {
      let a = ks[0], b = ks.at(-1); if (refM() < a) a = refM(); if (refM() > b) b = refM();
      monthChart($('#fch'), mrange(a, b), [{ name: 'Pago', c: COL.pago, v: pg }, { name: 'A pagar', c: COL.apagar, v: ap }],
        [{ name: 'Previsto FLUXO-BASE', c: COL.prev, v: n.prev || {} }, { name: 'Orçado × cronograma atual', c: COL.crono, v: n.cur || {} }, { name: 'Orçado × linha de base', c: COL.base, v: n.curBL || {}, dash: true }], { refM: refM(), table: true, h: 240, label: 'Fluxo mensal do serviço', onPick: m => openCalcMonth(m, id) });
    } else $('#fch').innerHTML = '<p class="empty">Sem valores mensais.</p>';
    $('#fx').onclick = closeFicha; if ($('#fplan')) $('#fplan').onclick = () => openPlan(id);
    if ($('#flob')) $('#flob').onclick = () => { S.lob.node = id; S.lob.disc = new Set([0, 1, 2, 3, 4, 5, 6]); S.lob.per = 'obra'; S.view = 'lob'; closeFicha(); render(); };
  }
  function closeFicha() { $('#drawer').hidden = true; document.body.classList.remove('noscroll'); hideTip(); }
  $('#drawer').addEventListener('click', e => { if (e.target.id === 'drawer') closeFicha(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') closeFicha(); });




  /* ===== COMPARATIVO COM O ORÇAMENTO (item por item) ===== */
  function cmpRows() {
    const O = M.cmp; if (!O) return null;
    const Bs = Object.values(M.nodes).filter(n => n.lv === 'B');
    const out = [];
    for (const B of Bs) {
      const sv = [];
      for (const cid of B.kids) {
        const its = Object.values(O.items).filter(o => o.node === cid).sort((a, b) => a.c.it.localeCompare(b.c.it));
        const sem = O.semItem[cid];
        if (!its.length && !sem) continue;
        sv.push({ id: cid, its, sem });
      }
      if (sv.length) out.push({ B, sv });
    }
    return out;
  }
  views.comparativo = function (el) {
    const O = M.cmp;
    if (!O) { el.innerHTML = '<section class="card"><h2>Comparativo com o orçamento</h2><p class="empty">Importe o Orçamento para ver o comparativo.</p></section>'; return; }
    const all = Object.values(O.items), sem = Object.values(O.semItem);
    const orc = sum(all, o => o.c.tot), gasto = sum(all, o => o.pg + o.ap) + sum(sem, o => o.pg + o.ap), gSem = sum(sem, o => o.pg + o.ap);
    const neg = all.filter(o => o.c.tot - o.pg - o.ap < -0.005);
    const via = {}; O.alloc.forEach(a => { const x = M.rp[a.k]; const v = a.via.split(' ')[0]; via[v] = (via[v] || 0) + x.pg + x.ap; });
    S.cmpF = S.cmpF || { q: '', so: 'todos', open: new Set() }; // começa sempre fechado: só as etapas
    el.innerHTML = `<section class="card"><div class="ch"><h2>Comparativo com o orçamento — item por item</h2>
        <div class="filters" style="margin:0"><input type="search" id="cq" placeholder="Buscar item, serviço ou código" value="${esc(S.cmpF.q)}">
        <div class="seg" id="cso">${[['todos', 'Todos'], ['gasto', 'Com gasto'], ['neg', 'Saldo negativo']].map(([v, l]) => `<button data-v="${v}" class="${S.cmpF.so === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="seg" id="clv" title="Níveis, como o agrupamento da planilha">${[['1', '1 · Etapas'], ['2', '2 · Serviços'], ['3', '3 · Itens']].map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div></div></div>
      <p class="hint">Cada parcela do relatório Pagar &amp; Pago é ligada ao item (composição) do Orçamento R${esc(M.meta.orcRev)}: pelo insumo P00xxx da FLUXO-BASE (códigos ORÇ-); quando o insumo tem vários itens, pela descrição do item comprado; se nenhum se destacar, rateio pelo orçado. <b>Saldo = orçado − gasto</b>${M.ct ? '; <b>Saldo após contratos = saldo − valor ainda a medir dos contratos</b> ligados ao item (o já medido entra no relatório Pagar &amp; Pago, por isso só o saldo a medir é abatido)' : ''} (<span class="okv">verde</span> positivo, <span class="crit">vermelho</span> negativo). <b>Qtd. executada</b> = quantidade medida nos contratos ligados ao item (mesma unidade; em verba, % medido em valor × qtd. orçada) — passe o mouse para ver de quais contratos; <b>Saldo qtd.</b> = orçada − executada. Itens sem contrato ficam "a informar" e podem ser preenchidos na planilha exportada; vínculos errados se corrigem em Contratos → trocar item. <b>Clique numa etapa ou serviço para abrir; use 1 · 2 · 3 para mudar o nível.</b></p>
      <div class="tiles">${tile('Orçado (itens)', 'R$ ' + brlK(orc), all.length + ' itens do orçamento')}${tile('Gasto (Pagar&Pago)', 'R$ ' + brlK(gasto), 'pago + a pagar do relatório')}${tile('Saldo', 'R$ ' + brlK(orc - gasto), pct(gasto / orc) + ' consumido', orc - gasto < 0 ? 'crit' : '')}${M.ct ? tile('Contratos — saldo a medir', 'R$ ' + brlK(sum(all, o => o.ct)), 'ligado aos itens' + (M.ct.sem.length ? ' · sem item R$ ' + brlK(sum(M.ct.sem, i => i.va)) : '')) + tile('Saldo após contratos', 'R$ ' + brlK(orc - gasto - sum(all, o => o.ct)), 'orçado − gasto − a medir', orc - gasto - sum(all, o => o.ct) < 0 ? 'crit' : '') : ''}${tile('Itens com saldo negativo', neg.length + ' itens', 'R$ ' + brlK(sum(neg, o => o.c.tot - o.pg - o.ap)) + (M.ct ? ' · após contratos: ' + all.filter(o => o.c.tot - o.pg - o.ap - o.ct < -0.005).length + ' itens' : ''), neg.length ? 'crit' : '')}${tile('Como o gasto foi ligado', 'direto ' + pct((via.direto || 0) / gasto) + ' · texto ' + pct((via.texto || 0) / gasto), 'rateio ' + pct((via.rateio || 0) / gasto) + ' · sem item R$ ' + brlK(gSem))}</div>
      <div class="tw" style="max-height:calc(100vh - 330px)" id="ctab"></div></section>`;
    const draw = () => {
      const q = S.cmpF.q.trim().toLowerCase(), so = S.cmpF.so;
      const ok = o => (so === 'todos' || (so === 'gasto' && o.pg + o.ap > 0.005) || (so === 'neg' && o.c.tot - o.pg - o.ap < -0.005)) && (!q || (o.c.it + ' ' + o.c.d + ' ' + o.c.cod + ' ' + (M.nodes[o.node] ? M.nodes[o.node].desc : '')).toLowerCase().includes(q));
      const cls = v => v > 0.005 ? 'okv' : v < -0.005 ? 'crit' : '';
      const line = (lbl, o, kind, id, n) => { const g = o.pg + o.ap, sd = o.tot - g; const op = abre(id); return `<tr class="${kind} clk grp" data-g="${id}"><td colspan="4"><span class="ar">${op ? '▾' : '▸'}</span> ${lbl}${!op && n ? ` <span class="sub">(${n})</span>` : ''}</td><td class="n">${brl(o.tot, 2)}</td><td class="n">${brl(g, 2)}</td><td class="n sub">${brl(o.pg, 2)}</td><td class="n sub">${brl(o.ap, 2)}</td><td class="n ${cls(sd)}"><b>${brl(sd, 2)}</b></td>${CT ? `<td class="n">${brl(o.ct, 2)}</td><td class="n ${cls(sd - o.ct)}"><b>${brl(sd - o.ct, 2)}</b></td>` : ''}<td class="n">${o.tot ? pct(g / o.tot) : '–'}</td><td></td><td></td><td></td><td></td></tr>`; };
      const CT = !!M.ct;
      const abre = id => q ? true : S.cmpF.open.has(id);
      let h = ''; const TT = { tot: 0, pg: 0, ap: 0, ct: 0 };
      for (const { B, sv } of cmpRows()) {
        const svs = sv.map(x => ({ ...x, its: x.its.filter(ok) })).filter(x => x.its.length || (x.sem && so !== 'neg' && !q));
        if (!svs.length) continue;
        const bt = { tot: 0, pg: 0, ap: 0, ct: 0 }; svs.forEach(x => { x.its.forEach(o => { bt.tot += o.c.tot; bt.pg += o.pg; bt.ap += o.ap; bt.ct += o.ct || 0; }); if (x.sem) { bt.pg += x.sem.pg; bt.ap += x.sem.ap; } });
        TT.tot += bt.tot; TT.pg += bt.pg; TT.ap += bt.ap; TT.ct += bt.ct;
        h += line(`<b>${esc(B.id)} · ${esc(B.desc)}</b>`, bt, 'lvB', B.id, svs.length + ' serviços');
        if (!abre(B.id)) continue;
        for (const x of svs) {
          const st = { tot: 0, pg: 0, ap: 0, ct: 0 }; x.its.forEach(o => { st.tot += o.c.tot; st.pg += o.pg; st.ap += o.ap; st.ct += o.ct || 0; }); if (x.sem) { st.pg += x.sem.pg; st.ap += x.sem.ap; }
          h += line(`<span style="padding-left:12px">${esc(x.id)} · ${esc(M.nodes[x.id].desc)}</span>`, st, 'lvS', x.id, x.its.length + (x.sem ? 1 : 0) + ' itens');
          if (!abre(x.id)) continue;
          for (const o of x.its) {
            const g = o.pg + o.ap, sd = o.c.tot - g; const vias = Object.entries(o.vias).filter(e => !g || e[1] / g >= 0.005).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + (g ? ' ' + Math.round(v / g * 100) + '%' : '')).join(' · ');
            h += `<tr class="clk itrow" data-it="${esc(o.c.it)}"><td style="padding-left:28px">${esc(o.c.it)}</td><td>${esc(o.c.d)}${o.c.st && o.c.st !== 'OK' ? ' <span class="sub">(' + esc(o.c.st) + ')</span>' : ''}</td><td class="c">${esc(o.c.un)}</td><td class="n">${brl(o.c.q, 2)}</td><td class="n">${brl(o.c.tot, 2)}</td><td class="n"><b>${brl(g, 2)}</b></td><td class="n sub">${brl(o.pg, 2)}</td><td class="n sub">${brl(o.ap, 2)}</td><td class="n ${cls(sd)}"><b>${brl(sd, 2)}</b></td>${CT ? `<td class="n">${brl(o.ct, 2)}</td><td class="n ${cls(sd - o.ct)}"><b>${brl(sd - o.ct, 2)}</b></td>` : ''}<td class="n"><div class="mbar" style="width:34px"><i style="width:${Math.min(100, o.c.tot ? g / o.c.tot * 100 : (g ? 100 : 0))}%;background:${sd < -0.005 ? 'var(--crit)' : 'var(--s1)'}"></i></div>${o.c.tot ? pct(g / o.c.tot) : (g ? '∞' : '–')}</td>${o.qx ? `<td class="n" title="${esc(o.qx.regra)} · ${o.qx.L.map(i => 'contrato ' + i.ct + '.' + i.item + ' medido ' + brl(i.qm, 2) + ' ' + i.un).join('; ')}"><b>${brl(o.qex, 2)}</b></td><td class="n ${o.c.q - o.qex < -0.005 ? 'crit' : 'okv'}">${brl(o.c.q - o.qex, 2)}</td>` : `<td class="n sub">a informar</td><td class="n">${brl(o.c.q, 2)}</td>`}<td class="sub">${esc(vias || '—')}</td><td class="n">${o.n || '–'}</td></tr>`;
          }
          if (x.sem && so !== 'neg' && !q) h += `<tr class="clk semrow" data-sem="${esc(x.id)}"><td style="padding-left:28px" colspan="2"><span class="crit">Gasto sem item correspondente no orçamento</span></td><td></td><td></td><td class="n">–</td><td class="n"><b>${brl(x.sem.pg + x.sem.ap, 2)}</b></td><td class="n sub">${brl(x.sem.pg, 2)}</td><td class="n sub">${brl(x.sem.ap, 2)}</td><td class="n crit"><b>${brl(-(x.sem.pg + x.sem.ap), 2)}</b></td>${CT ? `<td></td><td class="n crit">${brl(-(x.sem.pg + x.sem.ap), 2)}</td>` : ''}<td></td><td></td><td></td><td class="sub">sem item</td><td class="n">${x.sem.n}</td></tr>`;
        }
      }
      $('#ctab').innerHTML = `<table class="t cmp"><thead><tr><th>Item</th><th>Composição do orçamento</th><th class="c">Un.</th><th class="n">Qtd. orçada</th><th class="n">Orçado (R$)</th><th class="n">Gasto (R$)</th><th class="n">dos quais<br>pago</th><th class="n">dos quais<br>a pagar</th><th class="n">Saldo (R$)</th>${CT ? '<th class="n">A medir em<br>contratos</th><th class="n">Saldo após<br>contratos</th>' : ''}<th class="n">% consumido</th><th class="n">Qtd. executada</th><th class="n">Saldo qtd.</th><th>Vínculo</th><th class="n">Parcelas</th></tr></thead><tbody>${h}</tbody>
        <tfoot><tr><td colspan="4">Total${q || so !== 'todos' ? ' (filtro)' : ''}</td><td class="n">${brl(TT.tot, 2)}</td><td class="n">${brl(TT.pg + TT.ap, 2)}</td><td class="n">${brl(TT.pg, 2)}</td><td class="n">${brl(TT.ap, 2)}</td><td class="n ${cls(TT.tot - TT.pg - TT.ap)}">${brl(TT.tot - TT.pg - TT.ap, 2)}</td>${CT ? `<td class="n">${brl(TT.ct, 2)}</td><td class="n ${cls(TT.tot - TT.pg - TT.ap - TT.ct)}">${brl(TT.tot - TT.pg - TT.ap - TT.ct, 2)}</td>` : ''}<td class="n">${TT.tot ? pct((TT.pg + TT.ap) / TT.tot) : '–'}</td><td colspan="4"></td></tr></tfoot></table>`;
    };
    draw();
    $('#cq').oninput = e => { S.cmpF.q = e.target.value; clearTimeout(S._ct); S._ct = setTimeout(draw, 200); };
    $('#cso').onclick = e => { const v = e.target.dataset.v; if (v) { S.cmpF.so = v; render(); } };
    $('#clv').onclick = e => {
      const v = e.target.dataset.v; if (!v) return; const O2 = S.cmpF.open; O2.clear();
      if (v >= '2') cmpRows().forEach(({ B, sv }) => { O2.add(B.id); if (v === '3') sv.forEach(x => O2.add(x.id)); });
      draw();
    };
    $('#ctab').onclick = e => {
      const gr = e.target.closest('tr.grp'); if (gr) { const id = gr.dataset.g, O2 = S.cmpF.open; if (O2.has(id)) { O2.delete(id); [...O2].filter(k => k.startsWith(id + '.')).forEach(k => O2.delete(k)); } else O2.add(id); draw(); return; }
      const tr = e.target.closest('tr.itrow, tr.semrow'); if (!tr) return;
      if (tr.dataset.it) { const o = O.items[tr.dataset.it]; openCmpItem(o); }
      else { const x = O.semItem[tr.dataset.sem]; openCalc('Gasto sem item no orçamento', nodeName(tr.dataset.sem), cmpLancTable(x.lanc)); }
    };
  };
  function cmpLancTable(L) {
    const rows = L.slice().sort((a, b) => (b.x.pg + b.x.ap) * b.share - (a.x.pg + a.x.ap) * a.share);
    return `<div class="tw" style="max-height:calc(100vh - 220px)"><table class="t"><thead><tr><th>Data</th><th>Fornecedor</th><th>Insumo</th><th>Item comprado</th><th class="n">Proc./parc.</th><th class="n">Valor da parcela</th><th class="n">Parte no item</th><th class="n">Valor atribuído</th><th>Vínculo</th></tr></thead><tbody>${rows.map(({ x, share, via }) => `<tr><td>${fd(x.d)}</td><td>${esc(x.forn)}</td><td>${esc(x.ins)}</td><td>${esc(x.item)}</td><td class="n">${esc(x.proc + '/' + x.parc)}</td><td class="n">${brl(x.pg + x.ap, 2)}</td><td class="n">${pct(share)}</td><td class="n"><b>${brl((x.pg + x.ap) * share, 2)}</b></td><td class="sub">${esc(via || 'sem item')}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="7">Total</td><td class="n">${brl(sum(rows, r => (r.x.pg + r.x.ap) * r.share), 2)}</td><td></td></tr></tfoot></table></div>`;
  }
  function openCmpItem(o) {
    const g = o.pg + o.ap, sd = o.c.tot - g;
    openCalc(`${esc(o.c.it)} · ${esc(o.c.d)}`, nodeName(o.node) + ` · orçado R$ ${brl(o.c.tot, 2)} · gasto R$ ${brl(g, 2)} · saldo <b class="${sd < 0 ? 'crit' : 'okv'}">R$ ${brl(sd, 2)}</b>`,
      `<p class="hint">Quantidade orçada: ${brl(o.c.q, 2)} ${esc(o.c.un)} × R$ ${brl(o.c.pu, 2)} = R$ ${brl(o.c.tot, 2)} (material ${brl(o.c.mat)} · M.O. ${brl(o.c.mo)} · outros ${brl(o.c.ou)}). Insumos da composição: ${esc((o.c.ins || []).slice(0, 12).join('; ') || '—')}.</p>` + (o.qx ? `<p class="hint"><b>Quantidade executada: ${brl(o.qex, 2)} ${esc(o.c.un)}</b> (${esc(o.qx.regra)}) · saldo da quantidade <b class="${o.c.q - o.qex < 0 ? 'crit' : 'okv'}">${brl(o.c.q - o.qex, 2)}</b> · ${o.qx.L.map(i => `contrato ${esc(i.ct + '.' + i.item)} ${esc(i.d)}: medido ${brl(i.qm, 2)} de ${brl(i.q, 2)} ${esc(i.un)}`).join(' · ')}</p>` : '') + (o.cts && o.cts.length ? `<h3>Contratos ligados — saldo a medir R$ ${brl(o.ct, 2)} · saldo após contratos <span class="${sd - o.ct < 0 ? 'crit' : 'okv'}">R$ ${brl(sd - o.ct, 2)}</span></h3>` + ctItemTable(o.cts.map(c => ({ it: c.it, sh: c.sh }))) : '') + '<h3>Parcelas do relatório</h3>' + cmpLancTable(o.lanc));
  }

  /* ===== CONTRATOS E PLANEJAMENTO DOS PRÓXIMOS 3 MESES ===== */
  const M3 = () => [1, 2, 3].map(k => addM(compM(), k));
  const pnum = s => { s = String(s == null ? '' : s).trim(); if (!s) return 0; if (/,/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); const v = parseFloat(s); return isNaN(v) ? 0 : v; };
  const fnum = v => v ? (+v).toLocaleString('pt-BR', { maximumFractionDigits: 4, useGrouping: false }) : '';
  function ctEst() {
    if (!M.ct) return; RAW.plano.ovr = RAW.plano.ovr || {};
    const k = compM() + '|' + JSON.stringify(RAW.plano.ovr);
    if (M.ct._est === k) return;
    for (const it of M.ct.itens) it.pnode = RAW.plano.ovr[it.key] || it.node;
    YC.estimate(M, M.ct.itens, compM()); M.ct._est = k;
  }
  const lineVal = (l, m) => l.v ? +l.v[m] || 0 : (+l.pu || 0) * (+(l.q || {})[m] || 0); // linhas antigas (qtd × preço) continuam valendo
  const newId = () => 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  /* previsto pelo orçamento × cronograma: cada item do orçamento do serviço, separado em material, mão de obra e equipamento/outros,
     distribuído pelos meses na mesma proporção da curva orçado × cronograma atual do serviço */
  function orcLines(id) {
    const n = M.nodes[id], ms = M3(), out = []; if (!M.cmp || !n) return out;
    const tot = sum(Object.values(n.cur || {})); const fr = m => tot ? (n.cur[m] || 0) / tot : 0;
    for (const o of Object.values(M.cmp.items).filter(o => o.node === id).sort((a, b) => a.c.it.localeCompare(b.c.it)))
      for (const [tipo, k] of [['MAT', 'mat'], ['MO', 'mo'], ['EQ', 'ou']]) {
        const base = +o.c[k] || 0; if (base <= 0.005) continue;
        const v = {}; ms.forEach(m => v[m] = Math.round(base * fr(m) * 100) / 100);
        if (sum(ms, m => v[m]) <= 0.005) continue;
        out.push({ id: newId(), node: id, tipo, d: o.c.it + ' · ' + o.c.d, it: o.c.it, v, src: 'orc:' + o.c.it + ':' + tipo, base, fr: ms.map(fr) });
      }
    return out;
  }
  function pullOrc(id) {
    if (RAW.plano.lines.some(l => l.node === id && String(l.src || '').startsWith('proj:'))) return 0; // serviço já planejado pela projeção
    const ex = new Set(RAW.plano.lines.map(l => l.src)), ctIts = new Set(RAW.plano.lines.filter(l => l.src && !String(l.src).startsWith('orc:') && l.it).map(l => l.it));
    let n = 0; for (const l of orcLines(id)) { if (ex.has(l.src) || (l.tipo !== 'MAT' && ctIts.has(l.it))) continue; delete l.fr; RAW.plano.lines.push(l); n++; }
    RAW.plano.auto = RAW.plano.auto || {}; RAW.plano.auto[id] = compM(); return n;
  }
  const planOf = id => RAW.plano.lines.filter(l => l.node === id);
  const fbPrev = (id, m) => (M.nodes[id] && M.nodes[id].prev[m]) || 0;
  const ctOf = id => M.ct ? M.ct.itens.filter(it => it.pnode === id) : [];
  const ctLink = it => it.parts.length ? (it.parts.length === 1 ? esc(it.parts[0][0]) + ' · ' + esc(M.cmp.items[it.parts[0][0]].c.d) : it.parts.length + ' itens (rateio)') : '<span class="crit">sem item do orçamento</span>';
  function addFromContract(it) {
    if (!it.pnode || RAW.plano.lines.some(l => l.src === it.key)) return false;
    const v = {}; M3().forEach(m => { v[m] = Math.round((it.est[m] ? it.est[m].v : 0) * 100) / 100; });
    const oi = it.parts.length === 1 ? it.parts[0][0] : null;
    // o contrato substitui a mão de obra / equipamento previstos pelo orçamento para o mesmo item (o material continua)
    if (oi) RAW.plano.lines = RAW.plano.lines.filter(l => !(l.src === 'orc:' + oi + ':MO' || l.src === 'orc:' + oi + ':EQ'));
    RAW.plano.lines.push({ id: newId(), node: it.pnode, tipo: YC.tipo(it), d: it.d, v, it: oi, src: it.key, forn: it.forn, ct: it.ct });
    return true;
  }
  function ctItemTable(rows, opts = {}) {
    const ms = M3();
    return `<div class="tw" style="max-height:${opts.h || 420}px"><table class="t"><thead><tr><th>Contrato / item</th>${opts.nf ? '' : '<th>Fornecedor</th>'}<th>Serviço do contrato</th><th class="c">Un.</th><th class="n">Qtd. contratada</th><th class="n">Preço unit.</th><th class="n">Total do item</th><th class="n">Medido</th><th class="n">Qtd. a medir</th><th class="n">A medir (R$)</th>${opts.sh ? '<th class="n">Parte no item</th><th class="n">Atribuído</th>' : ''}${opts.est ? ms.map(m => `<th class="n">Estim. ${ml(m)}</th>`).join('') + '<th>Como estimado</th>' : '<th>Vínculo</th>'}</tr></thead><tbody>${rows.map(({ it, sh }) => `<tr><td>${esc(it.ct + '.' + it.item)}</td>${opts.nf ? '' : `<td>${esc(it.forn)}</td>`}<td>${esc(it.srv)} · ${esc(it.d)}</td><td class="c">${esc(it.un)}</td><td class="n">${brl(it.q, 2)}</td><td class="n">${brl(it.pu, 2)}</td><td class="n">${brl(it.tot, 2)}</td><td class="n">${brl(it.vm, 2)}</td><td class="n">${brl(it.qa, 2)}</td><td class="n"><b>${brl(it.va, 2)}</b></td>${opts.sh ? `<td class="n">${pct(sh)}</td><td class="n"><b>${brl(it.va * sh, 2)}</b></td>` : ''}${opts.est ? ms.map(m => `<td class="n" title="${brl(it.est[m].q, 2)} ${esc(it.un)} × R$ ${brl(it.qa ? it.va / it.qa : it.pu, 2)}">${brl(it.est[m].v, 2)}</td>`).join('') + `<td class="sub">${esc(it.how)}</td>` : `<td class="sub">${esc(it.via)}</td>`}</tr>`).join('')}</tbody></table></div>`;
  }
  views.contratos = function (el) {
    if (!M.ct) { el.innerHTML = '<section class="card"><h2>Programação fluxo</h2><p class="empty">Importe o relatório de contratos (.xls) em <b>Atualizar / Exportar</b>' + (M.cmp ? '' : ' — e o Orçamento') + '.</p></section>'; return; }
    ctEst(); const ms = M3(), its = M.ct.itens;
    const cts = {}; for (const it of its) (cts[it.ct] || (cts[it.ct] = [])).push(it);
    const tot = sum(its, i => i.tot), med = sum(its, i => i.vm), am = sum(its, i => i.va);
    const est3 = sum(its, i => sum(ms, m => i.est[m].v)), L = RAW.plano.lines;
    const plan3 = sum(L, l => sum(ms, m => lineVal(l, m)));
    const C = Object.values(M.nodes).filter(n => n.lv === 'C' && !n.extra);
    const prev3 = sum(C, n => sum(ms, m => fbPrev(n.id, m)));
    S.ctF = S.ctF || { q: '', so: 'saldo', open: new Set(), sopen: new Set(), sso: 'prog' };
    el.innerHTML = `<section class="card"><div class="ch"><h2>Programação fluxo — contratos, saldo a medir e planejamento de ${ml(ms[0])} a ${ml(ms[2])}</h2>
        <div class="filters" style="margin:0"><button id="aplf" class="${(RAW.plano.upd || 0) > (RAW.plano.aplicado || 0) ? 'pri' : 'ghost'}">${(RAW.plano.upd || 0) > (RAW.plano.aplicado || 0) ? '⟳ Atualizar YAC-FLUXO com o planejamento' : '✓ YAC-FLUXO em dia'}</button><button id="orcall" class="ghost">Puxar orçamento × cronograma de todos os serviços</button><button id="ctall" class="pri">Puxar estimativa de todos os contratos</button><button id="ctclr" class="ghost">Limpar planejamento</button></div></div>
      <p class="hint">O relatório de contratos é usado para duas coisas: <b>1)</b> o <b>saldo a medir</b> de cada item de contrato abate o saldo do orçamento (aba Orçamento × gasto — o já medido não entra de novo, porque já está no Pagar &amp; Pago); <b>2)</b> o <b>planejamento dos próximos 3 meses</b> por serviço, em R$, com linhas de <b>mão de obra, equipamento e materiais</b> — vindas do orçamento × cronograma, dos contratos (saldo a medir estimado pelo cronograma) ou lançadas à mão — e, descontado o que já está consolidado no Pagar &amp; Pago, refaz a <b>FLUXO-BASE da YAC-FLUXO</b> nesses meses (botão ⟳, e sempre que importar ou baixar as planilhas). O planejamento fica salvo neste aplicativo e vai junto no "Baixar HTML atualizado".</p>
      <div class="tiles">${tile('Contratos', Object.keys(cts).length + ' contratos', its.length + ' itens' + (M.ct.dup.length ? ' · ' + M.ct.dup.length + ' repetidos fora' : ''))}${tile('Valor contratado', 'R$ ' + brlK(tot), 'medido R$ ' + brlK(med) + ' (' + pct(med / tot) + ')')}${tile('Saldo a medir', 'R$ ' + brlK(am), 'sem item do orçamento: R$ ' + brlK(sum(M.ct.sem, i => i.va)), '', 'ctam')}${tile(`Contratos estimados ${ml(ms[0])}–${ml(ms[2])}`, 'R$ ' + brlK(est3), 'saldo a medir × atividades do cronograma', '', 'ctest')}${tile('FLUXO-BASE 3 meses', 'R$ ' + brlK(prev3), esc(RAW.cur ? RAW.cur.name.replace(/\.xlsx$/i, '') : ''))}${tile('Planejado 3 meses', 'R$ ' + brlK(plan3), L.length + ' linhas em ' + new Set(L.map(l => l.node)).size + ' serviços', L.length && plan3 > prev3 + 0.005 ? 'crit' : '')}</div></section>
      <section class="card"><div class="ch"><h3>Próximos 3 meses por serviço — consolidado + o que falta do planejado = FLUXO-BASE</h3>
        <div class="filters" style="margin:0"><div class="seg" id="sso">${[['prog', 'Com previsto ou contrato'], ['plan', 'Com planejamento'], ['todos', 'Todos']].map(([v, l]) => `<button data-v="${v}" class="${S.ctF.sso === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="seg" id="slv">${[['1', '1 · Etapas'], ['2', '2 · Serviços']].map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div></div></div>
        <p class="hint"><b>Pago / a pagar</b> = parcelas do Pagar &amp; Pago do serviço com vencimento no mês (já comprometido). <b>Planejado</b> = linhas do planejamento em R$ (ao abrir um serviço já vêm material, mão de obra e equipamento do orçamento × cronograma; contratos e linhas manuais completam). <b>FLUXO-BASE</b> = coluna do mês na YAC-FLUXO do aplicativo: nos serviços planejados ela é refeita como <b>consolidado (pago/a pagar) + o que falta do planejado</b> (planejado − consolidado, mínimo 0) e tem que bater (<span class="okv">✓</span>; <span class="crit">≠</span> = falta atualizar a YAC-FLUXO); nos não planejados fica o previsto (sobe só o que o relatório superar). Clique numa etapa para abrir e em <b>Planejar</b> para montar as linhas do serviço.</p>
        <div class="tw" style="max-height:calc(100vh - 260px)" id="stab"></div></section>
      <section class="card"><div class="ch"><h3>Lista de contratos</h3>
        <div class="filters" style="margin:0"><input type="search" id="ctq" placeholder="Buscar contrato, fornecedor, item ou código" value="${esc(S.ctF.q)}">
        <div class="seg" id="cts">${[['saldo', 'Com saldo a medir'], ['sem', 'Sem vínculo'], ['todos', 'Todos']].map(([v, l]) => `<button data-v="${v}" class="${S.ctF.so === v ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>
        <p class="hint">Cada contrato abre nos seus itens. <b>Vínculo com o orçamento</b>: pelo código do serviço do contrato (CCxxxx) nas parcelas do Pagar &amp; Pago; se não aparecer, pelo fornecedor no relatório; se não, pela descrição. Cada item vai para <b>um</b> item do orçamento (mesma unidade e texto mais parecido: estaca em estaca, armação em armação, preparo de cabeça em preparo de cabeça); a <b>quantidade medida</b> vira a quantidade executada do item no comparativo. Em <span class="crit">vermelho</span> os vínculos fracos para conferir — use <b>trocar item</b> para escolher o certo (fica salvo e vale para valor e quantidade).</p>
        <div class="tw" style="max-height:calc(100vh - 260px)" id="ctab2"></div></section>`;
    const cls = v => v > 0.005 ? 'okv' : v < -0.005 ? 'crit' : '';
    const dcls = v => v > 0.005 ? 'crit' : v < -0.005 ? 'okv' : '';
    const drawS = () => {
      const so = S.ctF.sso, rows = [];
      const Bs = Object.values(M.nodes).filter(n => n.lv === 'B');
      const agg = id => { const o = { p: {}, c: {}, l: {}, r: {}, n: planOf(id).length, nc: ctOf(id).length }; for (const m of ms) { o.p[m] = fbPrev(id, m); o.c[m] = sum(ctOf(id), i => i.est[m].v); o.l[m] = sum(planOf(id), l => lineVal(l, m)); o.r[m] = repOf(id, m); } return o; };
      const cells = (o, has, chk = has) => ms.map(m => { const d = o.p[m] - fbAlvo(o.l[m], o.r[m]); return `<td class="n sub">${brl(o.r[m], 2)}</td><td class="n">${has ? '<b>' + brl(o.l[m], 2) + '</b>' : '–'}</td><td class="n ${chk ? (Math.abs(d) < 1 ? 'okv' : 'crit') : ''}" title="${has ? (Math.abs(d) < 1 ? 'bate: FLUXO-BASE = consolidado + (planejado − consolidado)' : 'diferença de R$ ' + brl(d, 2) + ' — atualize a YAC-FLUXO') : 'sem planejamento: FLUXO-BASE mantém o previsto (sobe só o que o relatório superar)'}">${brl(o.p[m], 2)}${chk ? (Math.abs(d) < 1 ? ' ✓' : ' ≠') : ''}</td>`; }).join('') +
        (() => { const R3 = sum(ms, m => o.r[m]), L3 = sum(ms, m => o.l[m]), P3 = sum(ms, m => o.p[m]), A3 = sum(ms, m => fbAlvo(o.l[m], o.r[m])), d = P3 - A3; return `<td class="n">${brl(R3, 2)}</td><td class="n"><b>${has ? brl(L3, 2) : '–'}</b></td><td class="n">${has ? brl(A3, 2) : '–'}</td><td class="n">${brl(P3, 2)}</td><td class="n ${chk ? (Math.abs(d) < 1 ? 'okv' : 'crit') : ''}"><b>${chk ? brl(d, 2) : '–'}</b></td>`; })();
      let h = ''; const T = { p: {}, c: {}, l: {}, r: {} }; ms.forEach(m => { T.p[m] = 0; T.c[m] = 0; T.l[m] = 0; T.r[m] = 0; });
      for (const B of Bs) {
        const sv = B.kids.filter(id => M.nodes[id] && !M.nodes[id].extra).map(id => ({ id, o: agg(id) })).filter(({ o }) => so === 'todos' || (so === 'plan' ? o.n > 0 : (o.n > 0 || sum(ms, m => o.p[m] + o.c[m]) > 0.005)));
        if (!sv.length) continue;
        const ob = { p: {}, c: {}, l: {}, r: {} }; ms.forEach(m => { ob.p[m] = sum(sv, x => x.o.p[m]); ob.c[m] = sum(sv, x => x.o.c[m]); ob.l[m] = sum(sv, x => x.o.l[m]); ob.r[m] = sum(sv, x => x.o.r[m]); T.p[m] += ob.p[m]; T.c[m] += ob.c[m]; T.l[m] += ob.l[m]; T.r[m] += ob.r[m]; });
        const hb = sv.some(x => x.o.n), op = S.ctF.sopen.has(B.id);
        const okN = sv.filter(x => RAW.plano.ok && RAW.plano.ok[x.id]).length, okAll = okN === sv.length;
        h += `<tr class="lvB clk grp${okAll ? ' okrow' : ''}" data-g="${esc(B.id)}"><td><span class="ar">${op ? '▾' : '▸'}</span> <b>${esc(B.id)} · ${esc(B.desc)}</b>${op ? '' : ` <span class="sub">(${sv.length})</span>`}${okN ? ` <span class="okv">✓ ${okN}/${sv.length}</span>` : ''}</td>${cells(ob, hb, sv.every(x => x.o.n))}<td></td></tr>`;
        if (!op) continue;
        for (const { id, o } of sv) h += `<tr class="lvS${RAW.plano.ok && RAW.plano.ok[id] ? ' okrow' : ''}"><td style="padding-left:22px"><label class="okbox" title="Marque quando o planejamento deste serviço estiver feito"><input type="checkbox" class="okck" data-ok="${esc(id)}" ${RAW.plano.ok && RAW.plano.ok[id] ? 'checked' : ''}> ok</label> ${esc(id)} · ${esc(M.nodes[id].desc)}${o.nc ? ` <span class="sub">· ${o.nc} itens de contrato</span>` : ''}</td>${cells(o, o.n > 0)}<td><button class="mini" data-plan="${esc(id)}">${o.n ? 'Editar (' + o.n + ')' : 'Planejar'}</button></td></tr>`;
      }
      const hasL = L.length > 0;
      // etapa: "bate" só faz sentido se todos os serviços estiverem planejados; total geral idem
      $('#stab').innerHTML = `<table class="t cmp"><thead><tr><th rowspan="2">Etapa / serviço</th>${ms.map(m => `<th colspan="3" class="c">${ml(m)}</th>`).join('')}<th colspan="5" class="c">3 meses</th><th rowspan="2"></th></tr><tr>${ms.map(() => '<th class="n">Pago /<br>a pagar</th><th class="n">Planejado</th><th class="n">FLUXO-BASE</th>').join('')}<th class="n">Pago /<br>a pagar</th><th class="n">Planejado</th><th class="n">Vai para a<br>FLUXO-BASE</th><th class="n">FLUXO-BASE</th><th class="n">Diferença</th></tr></thead><tbody>${h}</tbody><tfoot><tr><td>Total</td>${cells(T, L.length > 0, false)}<td></td></tr></tfoot></table>`;
    };
    const drawC = () => {
      const q = S.ctF.q.trim().toLowerCase(), so = S.ctF.so;
      const ok = it => (so === 'todos' || (so === 'saldo' && it.va > 0.005) || (so === 'sem' && !it.parts.length)) && (!q || (it.ct + ' ' + it.forn + ' ' + it.obj + ' ' + it.srv + ' ' + it.d + ' ' + (it.pnode || '')).toLowerCase().includes(q));
      const Cs = Object.values(M.nodes).filter(n => n.lv === 'C' && !n.extra);
      let h = '';
      for (const [ct, L2] of Object.entries(cts).sort((a, b) => +a[0] - +b[0])) {
        const sel = L2.filter(ok); if (!sel.length) continue;
        const f = L2[0], op = q || S.ctF.open.has(ct), am2 = sum(L2, i => i.va), e3 = sum(L2, i => sum(ms, m => i.est[m].v));
        h += `<tr class="lvB clk grp" data-c="${esc(ct)}"><td><span class="ar">${op ? '▾' : '▸'}</span> <b>Contrato ${esc(ct)}</b></td><td colspan="3"><b>${esc(f.forn)}</b> · ${esc(f.obj)} <span class="sub">(${esc(f.status.replace(/^\d+ - /, ''))}${op ? '' : ' · ' + L2.length + ' itens'})</span></td><td class="n">${brl(sum(L2, i => i.tot), 2)}</td><td class="n">${brl(sum(L2, i => i.vm), 2)}</td><td class="n"><b>${brl(am2, 2)}</b></td><td class="n">${pct(sum(L2, i => i.vm) / (sum(L2, i => i.tot) || 1))}</td>${ms.map(m => `<td class="n">${brl(sum(L2, i => i.est[m].v), 2)}</td>`).join('')}<td colspan="2"></td></tr>`;
        if (!op) continue;
        for (const it of sel) {
          const inP = RAW.plano.lines.some(l => l.src === it.key);
          const man = RAW.plano.vinc && RAW.plano.vinc[it.key];
          const svc = (it.node ? nodeName(it.node) : '<span class="crit">sem serviço</span>') + ` <button class="mini" data-vin="${esc(it.key)}">${man ? 'trocar (manual)' : 'trocar item'}</button>${man ? ` <button class="mini" data-vauto="${esc(it.key)}">automático</button>` : ''}`;
          h += `<tr><td style="padding-left:22px">${esc(it.ct + '.' + it.item)} <span class="sub">${esc(it.srv)}</span></td><td>${esc(it.d)}</td><td class="c">${esc(it.un)}</td><td class="n" title="contratado ${brl(it.q, 2)} · medido ${brl(it.qm, 2)}">${brl(it.qa, 2)} <span class="sub">a medir</span></td><td class="n">${brl(it.tot, 2)}</td><td class="n">${brl(it.vm, 2)}</td><td class="n"><b>${brl(it.va, 2)}</b></td><td class="n">${pct(it.tot ? it.vm / it.tot : 0)}</td>${ms.map(m => `<td class="n" title="${esc(it.how)}: ${brl(it.est[m].q, 2)} ${esc(it.un)} (${pct(it.est[m].f)} do saldo)">${brl(it.est[m].v, 2)}</td>`).join('')}<td class="sub">${svc}<br>${ctLink(it)} · <span class="${/conferir|sem item/.test(it.via) ? 'crit' : ''}">${esc(it.via)}</span>${it.qit ? `<br>qtd. medida ${brl(it.qm, 2)} ${esc(it.un)} → qtd. executada do item` : (it.qvia ? '<br>' + esc(it.qvia) : '')}</td><td>${it.va > 0.005 && it.pnode ? (inP ? '<span class="okv">✓ no planejamento</span>' : `<button class="mini" data-add="${esc(it.key)}">→ planejar</button>`) : ''}</td></tr>`;
        }
      }
      $('#ctab2').innerHTML = `<table class="t cmp"><thead><tr><th>Contrato / item</th><th>Descrição</th><th class="c">Un.</th><th class="n">Qtd.</th><th class="n">Total</th><th class="n">Medido</th><th class="n">Saldo a medir</th><th class="n">% medido</th>${ms.map(m => `<th class="n">Estim.<br>${ml(m)}</th>`).join('')}<th>Serviço · item do orçamento · vínculo</th><th></th></tr></thead><tbody>${h || '<tr><td colspan="14" class="empty">Nada com esse filtro.</td></tr>'}</tbody></table>`;
    };
    drawS(); drawC();
    $('#sso').onclick = e => { const v = e.target.dataset.v; if (v) { S.ctF.sso = v; $('#sso').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); drawS(); } };
    $('#slv').onclick = e => { const v = e.target.dataset.v; if (!v) return; S.ctF.sopen.clear(); if (v === '2') Object.values(M.nodes).filter(n => n.lv === 'B').forEach(B => S.ctF.sopen.add(B.id)); drawS(); };
    $('#stab').onclick = e => {
      const okc = e.target.closest('.okck'); if (okc) { RAW.plano.ok = RAW.plano.ok || {}; if (okc.checked) RAW.plano.ok[okc.dataset.ok] = todayISO(); else delete RAW.plano.ok[okc.dataset.ok]; try { localStorage.setItem(LSK, JSON.stringify(RAW.plano)); } catch (er) { } drawS(); return; }
      if (e.target.closest('.okbox')) return;
      const b = e.target.closest('button[data-plan]'); if (b) { openPlan(b.dataset.plan); return; }
      const g = e.target.closest('tr.grp'); if (g) { const id = g.dataset.g; S.ctF.sopen.has(id) ? S.ctF.sopen.delete(id) : S.ctF.sopen.add(id); drawS(); }
    };
    $('#ctq').oninput = e => { S.ctF.q = e.target.value; clearTimeout(S._ctq); S._ctq = setTimeout(drawC, 200); };
    $('#cts').onclick = e => { const v = e.target.dataset.v; if (v) { S.ctF.so = v; $('#cts').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); drawC(); } };
    $('#ctab2').onclick = e => {
      const a = e.target.closest('button[data-add]'); if (a) { const it = its.find(i => i.key === a.dataset.add); if (addFromContract(it)) { savePlano(); openPlan(it.pnode); } return; }
      if (e.target.closest('select, input')) return;
      const vb = e.target.closest('button[data-vin]');
      if (vb) {
        if (!$('#orclist')) { const dl0 = document.createElement('datalist'); dl0.id = 'orclist'; dl0.innerHTML = Object.values(M.cmp.items).map(o => `<option value="${esc(o.c.it + ' · ' + o.c.d + ' (' + o.c.un + ')')}">`).join(''); document.body.appendChild(dl0); }
        const td = vb.closest('td'); td.innerHTML = `<input class="vin" list="orclist" data-k="${esc(vb.dataset.vin)}" placeholder="digite código ou nome do item do orçamento" style="width:100%;font-size:12px;padding:3px 5px">`; td.querySelector('input').focus(); return;
      }
      const va = e.target.closest('button[data-vauto]'); if (va) { delete RAW.plano.vinc[va.dataset.vauto]; savePlano(); rebuild(); render(); return; }
      const g = e.target.closest('tr.grp'); if (g) { const id = g.dataset.c; S.ctF.open.has(id) ? S.ctF.open.delete(id) : S.ctF.open.add(id); drawC(); }
    };
    $('#ctab2').addEventListener('change', e => { const inp = e.target.closest('input.vin'); if (!inp) return; const code = inp.value.split(' · ')[0].trim(); if (!M.cmp.items[code]) { inp.style.borderColor = 'var(--crit)'; return; } RAW.plano.vinc = RAW.plano.vinc || {}; RAW.plano.vinc[inp.dataset.k] = code; savePlano(); const y = scrollY; rebuild(); render(); scrollTo(0, y); });
    $('#ctab2').onchange = e => { const s2 = e.target.closest('select.ovr'); if (!s2) return; if (s2.value) RAW.plano.ovr[s2.dataset.k] = s2.value; else delete RAW.plano.ovr[s2.dataset.k]; RAW.plano.lines.filter(l => l.src === s2.dataset.k).forEach(l => l.node = s2.value || l.node); savePlano(); M.ct._est = null; ctEst(); drawS(); drawC(); };
    $('#ctall').onclick = () => { let n = 0; for (const it of its) if (it.va > 0.005 && sum(ms, m => it.est[m].v) > 0.005 && addFromContract(it)) n++; savePlano(); render(); $('#ctall').textContent = n ? n + ' linhas puxadas dos contratos' : 'Nada novo para puxar'; };
    $('#aplf').onclick = async () => { const b = $('#aplf'); b.disabled = true; b.textContent = 'Atualizando a YAC-FLUXO…'; try { await gerarRevisao(); render(); } catch (e) { b.textContent = e.message; } };
    $('#orcall').onclick = () => { let n = 0; for (const c of Object.values(M.nodes)) if (c.lv === 'C' && !c.extra) n += pullOrc(c.id); savePlano(); render(); $('#orcall').textContent = n ? n + ' linhas do orçamento × cronograma' : 'Nada novo para puxar'; };
    $('#ctclr').onclick = e => { const b = e.target; if (b.dataset.ok) { RAW.plano.lines = []; RAW.plano.auto = {}; savePlano(); render(); } else { b.dataset.ok = 1; b.textContent = 'Clique de novo para apagar ' + L.length + ' linhas'; setTimeout(() => { b.dataset.ok = ''; b.textContent = 'Limpar planejamento'; }, 4000); } };
    el.querySelectorAll('.tile[data-calc]').forEach(t => t.onclick = () => {
      const k = t.dataset.calc; const rows = its.filter(i => i.va > 0.005).sort((a, b) => b.va - a.va).map(it => ({ it, sh: 1 }));
      if (k === 'ctam') openCalc('Saldo a medir dos contratos', `R$ ${brl(am, 2)} = Σ (valor do item − valor já medido) · ${rows.length} itens com saldo`, `<p class="hint">Valor a medir = coluna ValorAAcomp do relatório de contratos (quantidade a medir × preço). O valor já medido (R$ ${brl(med, 2)}) não entra aqui porque já foi lançado no Pagar &amp; Pago.</p>` + ctItemTable(rows, { h: 900 }));
      else openCalc(`Estimativa dos contratos ${ml(ms[0])}–${ml(ms[2])}`, `R$ ${brl(est3, 2)} · ${ms.map(m => ml(m) + ' R$ ' + brl(sum(its, i => i.est[m].v), 2)).join(' · ')}`, `<p class="hint">Para cada item de contrato: saldo a medir × (dias das atividades do serviço dentro do mês ÷ dias das atividades que faltam a partir de ${ml(ms[0])}). Sem atividade futura no cronograma: proporcional ao previsto futuro da FLUXO-BASE; sem nada: partes iguais nos 3 meses. Passe o mouse num valor para ver a quantidade.</p>` + ctItemTable(rows, { est: 1, h: 900 }));
    });
  };
  /* editor do planejamento de um serviço */
  /* ===== MÃO DE OBRA DO SERVIÇO: própria (funcionários do Pagar & Pago) ou terceirizada (contratos) ===== */
  const ENC_RX = /^IF0871[34]|^IF08706|^IF08708/i, BEN_RX = /^IF08992|^IF07875|^IF08712|^IF09158/i, SAL_RX = /\(CLT\)|ESTAGI|AUXILIAR ADMINISTRATIVO|MESTRE DE OBRAS/i;
  const normT = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const STOPW = new Set('DE DA DO DAS DOS E EM NO NA PARA POR COM SEM A O AS OS SERVICO SERVICOS EXECUCAO PRESTACAO CONTRATO OBRA TIPO PAV'.split(' '));
  const tk = s => new Set(normT(s).split(/[^A-Z0-9]+/).filter(w => w.length >= 3 && !STOPW.has(w)).map(w => w.length > 5 ? w.slice(0, 6) : w));
  const simT = (A, B) => { let i = 0; for (const w of A) if (B.has(w)) i++; return A.size && B.size ? i / Math.sqrt(A.size * B.size) : 0; };
  function equipe() {
    if (M._eq) return M._eq;
    const ult = [0, 1, 2].map(k => addM(refM(), -k)), E = {}; let sal = 0, enc = 0;
    for (const x of M.rp) {
      const m = x.d.slice(0, 7); if (m > refM()) continue; const v = x.pg + x.ap;
      if (ENC_RX.test(x.item) || BEN_RX.test(x.item)) { enc += v; continue; }
      if (!SAL_RX.test(x.item)) continue; sal += v;
      const e = E[x.forn] || (E[x.forn] = { forn: x.forn, nome: x.forn.replace(/^\d+\s*-\s*/, ''), func: x.item.replace(/^\S+\s*-\s*/, ''), mes: {}, nos: {}, tot: 0 });
      e.mes[m] = (e.mes[m] || 0) + v; e.tot += v; if (x.n) e.nos[x.n] = (e.nos[x.n] || 0) + v;
    }
    for (const e of Object.values(E)) { const ms = ult.filter(m => e.mes[m]); e.med = ms.length ? ms.reduce((a, m) => a + e.mes[m], 0) / ms.length : 0; e.mesesUlt = ms; }
    return (M._eq = { lista: Object.values(E), enc: sal ? enc / sal : 0, sal, encV: enc });
  }
  function moSug(id) {
    const nd = M.nodes[id], ctx = [nd.desc, ...(M.cmp ? Object.values(M.cmp.items).filter(o => o.node === id).map(o => o.c.d) : []), ...YM.scope(M, id).tasks.map(t => t.t.replace(/^[A-Z]+ - /, ''))].join(' '), T = tk(ctx);
    const cts = (M.ct ? M.ct.itens : []).filter(i => i.va > 0.005 || i.pnode === id).map(i => ({ i, sc: (i.pnode === id ? 1 : 0) + simT(tk(i.d + ' ' + i.d + ' ' + i.obj), T) })).sort((a, b) => b.sc - a.sc);
    const eq = equipe().lista.map(e => ({ e, sc: (e.tot ? (e.nos[id] || 0) / e.tot : 0) + 0.5 * simT(tk(e.func), T) })).sort((a, b) => b.sc - a.sc || b.e.med - a.e.med);
    return { cts, eq };
  }
  function moApply(id) {
    const ms = M3(), cfg = RAW.plano.mo[id]; const pref = 'mo:' + id + ':';
    RAW.plano.lines = RAW.plano.lines.filter(l => !String(l.src || '').startsWith(pref));
    if (!cfg || !cfg.tipo) return;
    let n = 0;
    if (cfg.tipo !== 'prop') { const ks = new Set((cfg.ct || []).map(c => c.key)); RAW.plano.lines = RAW.plano.lines.filter(l => !ks.has(l.src)); }
    if (cfg.tipo !== 'prop') for (const c of cfg.ct || []) { const it = M.ct && M.ct.itens.find(i => i.key === c.key); if (!it) continue; const pu = it.qa ? it.va / it.qa : it.pu; const v = {}; ms.forEach(m => v[m] = Math.round((+(c.q || {})[m] || 0) * pu * 100) / 100);
      RAW.plano.lines.push({ id: newId(), node: id, tipo: 'MO', d: `Terceirizada · contrato ${it.ct}.${it.item} ${it.forn} · ${it.d}`, v, src: pref + 'ct:' + c.key, it: it.parts.length === 1 ? it.parts[0][0] : null, forn: it.forn, ct: it.ct }); n++; }
    if (cfg.emp && cfg.emp.length) { RAW.plano.aloc = RAW.plano.aloc || {}; for (const f of cfg.emp) RAW.plano.aloc[f.forn] = { modo: 'aqui', node: id, de: id, p: f.aloc || {} }; delete cfg.emp; } // formato antigo
    alocApply();
    if (cfg.tipo !== 'terc') { const enc = encUsado();
      for (const [j, f] of (cfg.novas || []).entries()) { const v = {}; ms.forEach(m => v[m] = Math.round((+f.sal || 0) * (1 + enc) * (+(f.n || {})[m] || 0) * 100) / 100);
        RAW.plano.lines.push({ id: newId(), node: id, tipo: 'MO', d: `Própria · ${f.func || 'nova função'} (a contratar)`, v, src: pref + 'nova:' + j }); n++; } }
    // a mão de obra escolhida soma às linhas que já existem (nada é tirado)
  }
  const encUsado = () => RAW.plano.enc != null ? RAW.plano.enc : equipe().enc;
  /* funcionários próprios: alocação prevista (global — cada funcionário está numa frente só por vez)
     manter = continua dividido como já foi lançado no Pagar & Pago; aqui/outra = vai para o serviço escolhido */
  function alocApply() {
    const ms = M3(), A = RAW.plano.aloc || {}, enc = encUsado(), dest = new Set();
    RAW.plano.lines = RAW.plano.lines.filter(l => !String(l.src || '').startsWith('aloc:'));
    for (const [forn, a] of Object.entries(A)) {
      const e = equipe().lista.find(x => x.forn === forn); if (!e || !a.modo) continue;
      const pm = m => (a.p && a.p[m] != null ? a.p[m] : 100) / 100;
      const alvo = a.modo === 'hist' ? Object.entries(e.nos).filter(([n]) => M.nodes[n] && !M.nodes[n].extra).map(([n, v]) => [n, v / e.tot]) : [[a.modo === 'outra' ? a.node : a.de, 1]];
      for (const [node, sh] of alvo) { if (!node || !M.nodes[node]) continue; const v = {}; ms.forEach(m => v[m] = Math.round(e.med * (1 + enc) * pm(m) * sh * 100) / 100);
        RAW.plano.lines.push({ id: newId(), node, tipo: 'MO', d: `Própria · ${e.nome} (${e.func})${a.modo === 'hist' ? ' · ' + Math.round(sh * 100) + '% como já lançado' : ''}`, v, src: 'aloc:' + forn + ':' + node }); dest.add(node); }
    }
    // os funcionários alocados somam às linhas que já existem no serviço (nada é tirado)
  }
  function moSection(id) {
    const ms = M3(); RAW.plano.mo = RAW.plano.mo || {}; const cfg = RAW.plano.mo[id] || {}; const S2 = moSug(id), EQ = equipe();
    const opt = [['prop', 'Própria'], ['terc', 'Terceirizada'], ['ambas', 'As duas']];
    let h = `<section id="mosec"><h3>Mão de obra deste serviço</h3><p class="hint">Este serviço é feito com mão de obra <b>própria</b> ou <b>terceirizada</b>? Escolha e marque quem faz: o aplicativo sugere os contratos e os funcionários que mais se relacionam com o serviço (pelo nome do serviço, das composições e das atividades do cronograma, e por onde cada um já foi lançado no Pagar &amp; Pago). As linhas de mão de obra entram no planejamento acima <b>somando</b> às linhas que já estão lá (nada é retirado — se alguma linha do orçamento ficar repetida, apague-a com ✕).</p>
      <div class="seg" id="motipo">${opt.map(([v, l]) => `<button data-v="${v}" class="${cfg.tipo === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    if (cfg.tipo && cfg.tipo !== 'prop') {
      const sel = new Map((cfg.ct || []).map(c => [c.key, c])); const q = (cfg.qct || '').toLowerCase();
      const L = S2.cts.filter(o => sel.has(o.i.key) || (!q ? o.sc > 0.05 : (o.i.forn + ' ' + o.i.d + ' ' + o.i.obj + ' ' + o.i.ct).toLowerCase().includes(q))).slice(0, q ? 40 : 12);
      h += `<h4 style="margin:12px 0 4px">Terceirizada — contratos</h4><input type="search" id="moq" placeholder="Buscar outro contrato / fornecedor / serviço" value="${esc(cfg.qct || '')}" style="margin-bottom:6px">
        <div class="tw"><table class="t plan"><thead><tr><th></th><th>Contrato / item</th><th>Fornecedor</th><th class="c">Un.</th><th class="n">Preço</th><th class="n">Saldo a medir (qtd)</th>${ms.map(m => `<th class="n">Qtd. ${ml(m)}</th>`).join('')}<th class="n">Total (R$)</th><th class="n">Relação</th></tr></thead><tbody>${L.map(({ i, sc }) => { const c = sel.get(i.key); const pu = i.qa ? i.va / i.qa : i.pu; return `<tr data-ck="${esc(i.key)}"><td><input type="checkbox" class="mock" ${c ? 'checked' : ''}></td><td>${esc(i.ct + '.' + i.item)} · ${esc(i.d)}</td><td>${esc(i.forn)}</td><td class="c">${esc(i.un)}</td><td class="n">${brl(pu, 2)}</td><td class="n">${brl(i.qa, 2)}</td>${ms.map(m => `<td><input class="wn moq" data-m="${m}" value="${c ? fnum((c.q || {})[m]) : ''}" ${c ? '' : 'disabled'} inputmode="decimal"></td>`).join('')}<td class="n">${c ? brl(ms.reduce((a, m) => a + (+(c.q || {})[m] || 0) * pu, 0), 2) : '–'}</td><td class="n sub">${i.pnode === id ? 'ligado ao serviço' : Math.round(sc * 100) + '%'}</td></tr>`; }).join('') || '<tr><td colspan="12" class="empty">Nenhum contrato parecido — busque pelo nome.</td></tr>'}</tbody></table></div>
        <p class="sub">Ao marcar, a quantidade de cada mês vem da estimativa do saldo a medir pelo cronograma; ajuste à vontade. Valor = quantidade × preço do contrato.</p>`;
    }
    if (cfg.tipo && cfg.tipo !== 'terc') {
      const A = RAW.plano.aloc || {}; const enc = encUsado();
      const L = S2.eq.slice(0, 16).concat(S2.eq.slice(16).filter(o => A[o.e.forn]));
      const Cs = Object.values(M.nodes).filter(n => n.lv === 'C' && !n.extra);
      const nmN = n => M.nodes[n] ? n + ' ' + M.nodes[n].desc : n;
      h += `<h4 style="margin:12px 0 4px">Própria — funcionários</h4><p class="sub">Salário = média paga nos últimos 3 meses no Pagar &amp; Pago (itens CLT/estágio). Encargos e benefícios (GPS, FGTS, rescisões, vale-transporte, benefício social, contribuição, exames) = R$ ${brl(EQ.encV, 2)} ÷ salários R$ ${brl(EQ.sal, 2)} = <b>${pct(EQ.enc)}</b> — usado: <input class="wn" id="moenc" value="${fnum(Math.round(enc * 1000) / 10)}" style="width:60px">%.
        Para cada funcionário escolha a <b>alocação prevista</b>: <b>manter onde já foi lançado</b> (continua dividido entre as frentes como no Pagar &amp; Pago), <b>neste serviço</b> ou <b>outra frente</b>. A alocação vale para a obra toda (o funcionário fica numa frente por vez) e vai automática para o planejamento de cada serviço. Valor do mês = salário × (1 + encargos) × % do mês × parte da frente.</p>
        <div class="tw"><table class="t plan"><thead><tr><th>Funcionário</th><th>Função</th><th class="n">Salário médio</th><th>Onde já foi lançado</th><th>Alocação prevista</th>${ms.map(m => `<th class="n">% ${ml(m)}</th>`).join('')}<th class="n">Total (R$)</th></tr></thead><tbody>${L.map(({ e }) => { const a = A[e.forn]; const onde = Object.entries(e.nos).sort((x, y) => y[1] - x[1]).map(([n, v]) => (M.nodes[n] ? M.nodes[n].desc : n) + ' ' + Math.round(v / e.tot * 100) + '%').join(' · ');
          const modo = a ? a.modo : ''; const tot = a ? ms.reduce((s3, m) => s3 + e.med * (1 + enc) * (a.p && a.p[m] != null ? a.p[m] : 100) / 100, 0) : 0;
          const aqui = a && ((a.modo === 'aqui' && a.de === id) || (a.modo === 'outra' && a.node === id) || (a.modo === 'hist' && e.nos[id]));
          return `<tr data-ek="${esc(e.forn)}" class="${aqui ? 'hlsel' : ''}"><td>${esc(e.nome)}</td><td>${esc(e.func)}</td><td class="n">${brl(e.med, 2)}</td><td class="sub">${esc(onde)}</td>
            <td><select class="moal"><option value="">— não alocar —</option><option value="hist" ${modo === 'hist' ? 'selected' : ''}>Manter onde já foi lançado</option><option value="aqui" ${modo === 'aqui' && a.de === id ? 'selected' : ''}>Neste serviço (${esc(id)})</option><option value="outra" ${modo === 'outra' || (modo === 'aqui' && a.de !== id) ? 'selected' : ''}>Outra frente…</option></select>
            ${modo === 'outra' || (modo === 'aqui' && a.de !== id) ? `<select class="mofr" style="max-width:220px">${Cs.map(n => `<option value="${esc(n.id)}" ${(a.node || a.de) === n.id ? 'selected' : ''}>${esc(n.id + ' · ' + n.desc)}</option>`).join('')}</select>` : ''}
            ${a && a.modo === 'hist' ? `<div class="sub">→ ${esc(Object.entries(e.nos).sort((x, y) => y[1] - x[1]).map(([n, v]) => nmN(n) + ' ' + Math.round(v / e.tot * 100) + '%').join(' · '))}</div>` : ''}</td>
            ${ms.map(m => `<td><input class="wn moa" data-m="${m}" value="${a ? fnum(a.p && a.p[m] != null ? a.p[m] : 100) : ''}" ${a ? '' : 'disabled'} inputmode="decimal"></td>`).join('')}<td class="n">${a ? brl(tot, 2) : '–'}</td></tr>`; }).join('')}</tbody></table></div>
        <h4 style="margin:10px 0 4px">Funções a contratar</h4><div class="tw"><table class="t plan"><thead><tr><th>Função</th><th class="n">Salário (R$)</th>${ms.map(m => `<th class="n">Pessoas ${ml(m)}</th>`).join('')}<th class="n">Total (R$)</th><th></th></tr></thead><tbody>${(cfg.novas || []).map((f, j) => `<tr data-nj="${j}"><td><input class="wd mof" data-f="func" value="${esc(f.func || '')}" style="width:220px"></td><td><input class="wn mof" data-f="sal" value="${fnum(f.sal)}"></td>${ms.map(m => `<td><input class="wn mon" data-m="${m}" value="${fnum((f.n || {})[m])}"></td>`).join('')}<td class="n">${brl(ms.reduce((a, m) => a + (+f.sal || 0) * (1 + enc) * (+(f.n || {})[m] || 0), 0), 2)}</td><td><button class="mini monx">✕</button></td></tr>`).join('')}</tbody></table></div><button class="mini" id="monova">+ Função a contratar</button>`;
    }
    return h + '</section>';
  }
  function moBind(id, redraw) {
    const ms = M3(); const cfg = () => (RAW.plano.mo[id] = RAW.plano.mo[id] || {});
    const save = (full) => { moApply(id); savePlano(); if (full) redraw(); }; // digitando só salva; redesenha ao sair do campo
    const sec = $('#mosec'); if (!sec) return;
    sec.onclick = e => {
      const b = e.target.closest('#motipo button'); if (b) { cfg().tipo = b.dataset.v; save(true); return; }
      if (e.target.closest('#monova')) { (cfg().novas = cfg().novas || []).push({ func: '', sal: 0, n: {} }); save(true); return; }
      const x = e.target.closest('.monx'); if (x) { cfg().novas.splice(+x.closest('tr').dataset.nj, 1); save(true); }
    };
    sec.onchange = e => {
      const ck = e.target.closest('.mock'); if (ck && ck.closest('tr')) { const key = ck.closest('tr').dataset.ck, c = cfg(); c.ct = (c.ct || []).filter(z => z.key !== key);
        if (ck.checked) { const it = M.ct.itens.find(i => i.key === key); const q = {}; ms.forEach(m => q[m] = Math.round(((it.est && it.est[m]) ? it.est[m].q : 0) * 100) / 100); c.ct.push({ key, q }); } save(true); return; }
      const al = e.target.closest('.moal'); if (al && al.closest('tr')) { const forn = al.closest('tr').dataset.ek; RAW.plano.aloc = RAW.plano.aloc || {}; const old = RAW.plano.aloc[forn];
        if (!al.value) delete RAW.plano.aloc[forn]; else RAW.plano.aloc[forn] = { modo: al.value, de: id, node: al.value === 'outra' ? (old && old.node) || id : id, p: (old && old.p) || {} }; save(true); return; }
      const fr = e.target.closest('.mofr'); if (fr && fr.closest('tr')) { const a = RAW.plano.aloc[fr.closest('tr').dataset.ek]; if (a) { a.modo = 'outra'; a.node = fr.value; } save(true); return; }
      if (e.target.id === 'moenc') { RAW.plano.enc = pnum(e.target.value) / 100; save(true); return; }
      if (e.target.matches('.moq, .moa, .mon, .mof')) setTimeout(() => { const ae = document.activeElement; if (!(ae && ae.closest && ae.closest('#mosec') && ae.tagName === 'INPUT')) redraw(); }, 60); // só redesenha quando sai da tabela (não rouba o foco do próximo campo)
    };
    sec.oninput = e => {
      const t = e.target;
      if (t.id === 'moq') { cfg().qct = t.value; clearTimeout(S._mq); S._mq = setTimeout(redraw, 400); return; }
      const tr0 = t.closest('tr'); if (!tr0) return;
      if (t.classList.contains('moq')) { const c = (cfg().ct || []).find(z => z.key === tr0.dataset.ck); if (!c) return; c.q[t.dataset.m] = pnum(t.value); save(); return; }
      if (t.classList.contains('moa')) { const a = (RAW.plano.aloc || {})[tr0.dataset.ek]; if (!a) return; (a.p = a.p || {})[t.dataset.m] = pnum(t.value); save(); return; }
      const nj = t.closest('tr[data-nj]'); if (nj) { const f = cfg().novas[+nj.dataset.nj]; if (t.classList.contains('mon')) (f.n = f.n || {})[t.dataset.m] = pnum(t.value); else if (t.dataset.f === 'sal') f.sal = pnum(t.value); else f.func = t.value; save(); }
    };
  }

  function consMes(id, m) {
    const L = M.rp.filter(x => x.n === id && x.d.slice(0, 7) === m).sort((a, b) => a.d.localeCompare(b.d) || (b.pg + b.ap) - (a.pg + a.ap));
    if (!L.length) return `<section><div class="ch"><h3>Consolidado de ${ml(m)}</h3><button class="mini" id="pconsx">fechar ×</button></div><p class="empty">Nenhuma parcela no Pagar &amp; Pago neste serviço em ${ml(m)}.</p></section>`;
    const g = {}; L.forEach(x => { const k = x.ins || '—'; const a = g[k] || (g[k] = 0); g[k] = a + x.pg + x.ap; });
    return `<section><div class="ch"><h3>Consolidado de ${ml(m)} — ${L.length} parcelas · R$ ${brl(sum(L, x => x.pg + x.ap), 2)}</h3><button class="mini" id="pconsx">fechar ×</button></div>
      <p class="sub">Parcelas do Pagar &amp; Pago deste serviço com data em ${ml(m)} (pago + a pagar). Por insumo: ${Object.entries(g).sort((a, b) => b[1] - a[1]).map(([k, v]) => esc(k) + ' R$ ' + brl(v, 2)).join(' · ')}</p>
      <div class="tw" style="max-height:360px"><table class="t"><thead><tr><th>Data</th><th>Fornecedor</th><th>Insumo</th><th>Item comprado</th><th class="n">Proc./parc.</th><th class="n">Pago</th><th class="n">A pagar</th><th class="n">Total</th></tr></thead><tbody>${L.map(x => `<tr><td>${fd(x.d)}</td><td>${esc(x.forn)}</td><td>${esc(x.ins)}</td><td>${esc(x.item || '')}</td><td class="n">${esc((x.proc || '') + '/' + (x.parc || ''))}</td><td class="n">${brl(x.pg, 2)}</td><td class="n ${x.ap ? 'crit' : ''}">${brl(x.ap, 2)}</td><td class="n"><b>${brl(x.pg + x.ap, 2)}</b></td></tr>`).join('')}</tbody><tfoot><tr><td colspan="5">Total</td><td class="n">${brl(sum(L, x => x.pg), 2)}</td><td class="n">${brl(sum(L, x => x.ap), 2)}</td><td class="n">${brl(sum(L, x => x.pg + x.ap), 2)}</td></tr></tfoot></table></div></section>`;
  }
  function openPlan(id) {
    ctEst(); const ms = M3(), nd = M.nodes[id], PM = [addM(ms[0], -2), addM(ms[0], -1)];
    const pc = (v, b) => PM.map(() => `<td class="n past">${v == null ? '' : b ? '<b>' + v + '</b>' : v}</td>`).join(''), pv = (f, b) => PM.map(m => `<td class="n past">${b ? '<b>' : ''}${brl(f(m), 2)}${b ? '</b>' : ''}</td>`).join('');
    if (!(RAW.plano.auto && RAW.plano.auto[id])) { pullOrc(id); savePlano(); } // traz o orçamento × cronograma mesmo que já tenha mão de obra alocada
    if (!(RAW.plano.moSoma || {})[id] && RAW.plano.lines.some(l => l.node === id && /^(aloc|mo):/.test(String(l.src || '')))) { // versões antigas tiravam a M.O. do orçamento ao alocar: devolve
      const ex = new Set(RAW.plano.lines.map(l => l.src)); if (!RAW.plano.lines.some(l => l.node === id && String(l.src || '').startsWith('proj:'))) for (const l of orcLines(id)) if (l.tipo === 'MO' && !ex.has(l.src)) { delete l.fr; RAW.plano.lines.push(l); }
      (RAW.plano.moSoma = RAW.plano.moSoma || {})[id] = 1; savePlano(); }
    openCalc(`Planejamento ${ml(ms[0])}–${ml(ms[2])} · ${esc(id)} · ${esc(nd.desc)}`, `Previsto na FLUXO-BASE: ${ms.map(m => ml(m) + ' R$ ' + brl(fbPrev(id, m), 2)).join(' · ')} · orçado × cronograma: ${ms.map(m => ml(m) + ' R$ ' + brl((nd.cur || {})[m] || 0, 2)).join(' · ')}`, '<div id="pled"></div>');
    $('#calc .dw header .sub').textContent = 'Planejamento dos próximos 3 meses';
    const ed = $('#pled');
    const orig = l => !l.src ? 'manual' : String(l.src).startsWith('aloc:') ? 'funcionário próprio (alocação)' : String(l.src).startsWith('mo:') ? 'mão de obra (escolhida abaixo)' : String(l.src).startsWith('proj:') ? 'projeção (cronograma)' : String(l.src).startsWith('orc:') ? 'orçamento × cronograma' : 'contrato ' + esc(l.ct || '') + (l.forn ? ' · ' + esc(l.forn) : '');
    const draw = () => {
      const L = planOf(id).slice().sort((a, b) => (a.it || 'zz').localeCompare(b.it || 'zz') || (a.tipo || '').localeCompare(b.tipo || '')), cl = ctOf(id).filter(i => i.va > 0.005), livres = cl.filter(i => !RAW.plano.lines.some(l => l.src === i.key));
      const faltaOrc = RAW.plano.lines.some(l => l.node === id && String(l.src || '').startsWith('proj:')) ? 0 : orcLines(id).filter(l => !RAW.plano.lines.some(x => x.src === l.src)).length;
      const row = l => `<tr data-l="${l.id}"><td><select data-f="tipo">${Object.entries(YC.TIPOS).map(([k, v]) => `<option value="${k}" ${l.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td><td><input data-f="d" value="${esc(l.d)}" class="wd"></td><td class="sub">${orig(l)}</td>${pc()}${ms.map(m => `<td><input data-f="v" data-m="${m}" value="${fnum(Math.round(lineVal(l, m) * 100) / 100)}" class="wn" inputmode="decimal"></td>`).join('')}<td class="n" data-v="tot"><b>${brl(sum(ms, m => lineVal(l, m)), 2)}</b></td><td><button class="mini del" title="Apagar linha">✕</button></td></tr>`;
      const foot = () => { const pl = m => sum(planOf(id), l => lineVal(l, m)); const cor = d => d < -0.005 ? 'crit' : d > 0.005 ? 'okv' : '';
        return `<tr><td colspan="3">Planejado</td>${pc()}${ms.map(m => `<td class="n"><b>${brl(pl(m), 2)}</b></td>`).join('')}<td class="n"><b>${brl(sum(ms, pl), 2)}</b></td><td></td></tr>` +
          Object.keys(YC.TIPOS).map(k => { const v = m => sum(planOf(id).filter(l => l.tipo === k), l => lineVal(l, m)); return sum(ms, v) > 0.005 ? `<tr class="sub2"><td colspan="3" style="padding-left:22px">${YC.TIPOS[k]}</td>${pc()}${ms.map(m => `<td class="n">${brl(v(m), 2)}</td>`).join('')}<td class="n">${brl(sum(ms, v), 2)}</td><td></td></tr>` : ''; }).join('') +
          `<tr><td colspan="3">Já consolidado no Pagar &amp; Pago (pago + a pagar do mês) <span class="sub">— clique no valor para ver o que está incluso</span></td>${PM.map(m => `<td class="n past clk cons" data-cm="${m}" title="Ver parcelas"><b><u>${brl(repOf(id, m), 2)}</u></b></td>`).join('')}${ms.map(m => `<td class="n clk cons" data-cm="${m}" title="Ver parcelas"><u>${brl(repOf(id, m), 2)}</u></td>`).join('')}<td class="n">${brl(sum(ms, m => repOf(id, m)), 2)}</td><td></td></tr>` +
          `<tr><td colspan="3">A acrescentar = planejado − consolidado (mínimo 0)</td>${pc()}${ms.map(m => `<td class="n">${brl(Math.max(pl(m) - repOf(id, m), 0), 2)}</td>`).join('')}<td class="n">${brl(sum(ms, m => Math.max(pl(m) - repOf(id, m), 0)), 2)}</td><td></td></tr>` +
          `<tr><td colspan="3"><b>Vai para a FLUXO-BASE = consolidado + a acrescentar</b></td>${pc()}${ms.map(m => `<td class="n"><b>${brl(fbAlvo(pl(m), repOf(id, m)), 2)}</b></td>`).join('')}<td class="n"><b>${brl(sum(ms, m => fbAlvo(pl(m), repOf(id, m))), 2)}</b></td><td></td></tr>` +
          `<tr><td colspan="3">FLUXO-BASE atual (YAC-FLUXO do aplicativo)</td>${pv(m => fbPrev(id, m))}${ms.map(m => `<td class="n">${brl(fbPrev(id, m), 2)}</td>`).join('')}<td class="n">${brl(sum(ms, m => fbPrev(id, m)), 2)}</td><td></td></tr>` +
          `<tr><td colspan="3">Diferença</td>${pc()}${ms.map(m => { const d = fbPrev(id, m) - fbAlvo(pl(m), repOf(id, m)); return `<td class="n ${Math.abs(d) < 1 ? 'okv' : 'crit'}"><b>${Math.abs(d) < 1 ? '✓ bate' : brl(d, 2)}</b></td>`; }).join('')}${(() => { const d = sum(ms, m => fbPrev(id, m) - fbAlvo(pl(m), repOf(id, m))); return `<td class="n ${Math.abs(d) < 1 ? 'okv' : 'crit'}"><b>${Math.abs(d) < 1 ? '✓ bate' : brl(d, 2)}</b></td>`; })()}<td></td></tr>`; };
      ed.innerHTML = `<section><h3>Linhas do planejamento (R$)</h3><p class="hint">Ao abrir, cada item do orçamento deste serviço entra separado em <b>material, mão de obra e equipamento/outros</b>, com o valor do mês = valor orçado da parte × fração do cronograma atual no mês (a mesma curva do "orçado × cronograma"). Quando você puxa um <b>contrato</b> ligado a um item, ele substitui a mão de obra/equipamento previstos desse item (o material fica). Os valores são em R$ — altere à vontade; tudo salva sozinho. <b>O planejado é o total esperado do mês</b>: o que já está consolidado no Pagar &amp; Pago sai dele, e a FLUXO-BASE deste serviço passa a ser <b>consolidado + (planejado − consolidado)</b>, ou seja, o maior dos dois, quando a YAC-FLUXO é atualizada (botão no topo da aba Programação fluxo ou em qualquer download).</p>
        <div class="tw" style="max-height:calc(100vh - 380px)"><table class="t plan" id="ptab"><thead><tr><th>Tipo</th><th>Descrição</th><th>Origem</th>${PM.map(m => `<th class="n past" title="Mês já passado — só consolidado, para comparar">${ml(m)}<br><span class="sub">consolidado</span></th>`).join('')}${ms.map(m => `<th class="n" data-mh="${m}" style="cursor:help" title="">R$ ${ml(m)} ⓘ</th>`).join('')}<th class="n">Total</th><th></th></tr></thead><tbody>${L.map(row).join('') || `<tr><td colspan="${7 + ms.length}" class="empty">Nenhuma linha — este serviço não tem orçado no cronograma destes meses. Puxe dos contratos ou adicione à mão.</td></tr>`}</tbody><tfoot id="pfoot">${foot()}</tfoot></table></div><div id="pcons"></div>
        <div class="imp-actions"><button class="mini" data-new="MO">+ Mão de obra</button><button class="mini" data-new="EQ">+ Equipamento</button><button class="mini" data-new="MAT">+ Materiais</button>${faltaOrc ? `<button class="mini" id="porc">Puxar orçamento × cronograma (${faltaOrc})</button>` : ''}${livres.length ? `<button class="pri" id="pull">Puxar ${livres.length} ${livres.length > 1 ? 'itens' : 'item'} de contrato deste serviço</button>` : ''}</div></section>
        ${moSection(id)}
        ${cpSection(id)}
        <section><h3>Contratos deste serviço — saldo a medir R$ ${brl(sum(cl, i => i.va), 2)}</h3>${cl.length ? ctItemTable(cl.map(it => ({ it, sh: 1 })), { est: 1 }) : '<p class="empty">Nenhum contrato ligado a este serviço.</p>'}</section>`;
      // passar o mouse no mês: atividades do serviço no cronograma atual nesse mês (até que dia)
      const tipMes = m => { const a0 = D(m + '-01'), b0 = D(addM(m, 1) + '-01') - 864e5; const sc = YM.scope(M, id);
        const L = sc.tasks.filter(t => t.i && t.f && D(t.i) <= b0 && D(t.f) >= a0).sort((p, q) => p.i.localeCompare(q.i));
        if (!L.length) return `<b>${ml(m)}</b><div class="sub">Nenhuma atividade deste serviço programada no mês (cronograma atual).</div>`;
        const ate = L.reduce((a, t) => D(t.f) > a ? D(t.f) : a, 0), fimM = Math.min(ate, b0), iniM = Math.max(L.reduce((a, t) => Math.min(a, D(t.i)), 9e15), a0);
        return `<b>${ml(m)} — atividades programadas (cronograma atual)</b>${sc.origem && sc.origem !== 'próprias' ? `<div class="sub">datas ${esc(ORIG ? (ORIG[sc.origem] || sc.origem) : sc.origem)}</div>` : ''}<div style="margin:4px 0">No mês: de <b>${fd(new Date(iniM).toISOString().slice(0, 10))}</b> até <b>${fd(new Date(fimM).toISOString().slice(0, 10))}</b></div>` +
          L.slice(0, 14).map(t => { const di = Math.max(D(t.i), a0), df = Math.min(D(t.f), b0); return `<div class="tr"><span>${esc(t.t)} · ${esc(t.l)}</span><b>${fd(new Date(di).toISOString().slice(0, 10))} → ${fd(new Date(df).toISOString().slice(0, 10))} (${Math.round((df - di) / 864e5) + 1} d)</b></div>`; }).join('') + (L.length > 14 ? `<div class="sub">+ ${L.length - 14} atividades</div>` : '') + `<div class="sub">${L.filter(t => t.ri && !t.rf).length} em andamento · ${L.filter(t => t.rf).length} concluídas · ${L.filter(t => !t.ri).length} a iniciar</div>`; };
      ed.onmouseover = e => { const h = e.target.closest('th[data-mh], input[data-m]'); if (!h || !ed.contains(h)) return; showTip(tipMes(h.dataset.mh || h.dataset.m), e); };
      ed.onmousemove = e => { if (e.target.closest('th[data-mh], input[data-m]')) moveTip(e); };
      ed.onmouseout = e => { if (e.target.closest('th[data-mh], input[data-m]')) hideTip(); };
      moBind(id, () => { const y = $('#calc .dw').scrollTop; draw(); $('#calc .dw').scrollTop = y; });
      ed.oninput = e => {
        const inp = e.target.closest('input[data-f]'); if (!inp || !inp.closest('tr[data-l]')) return; const tr = inp.closest('tr[data-l]'); const l = RAW.plano.lines.find(x => x.id === tr.dataset.l); const f = inp.dataset.f;
        if (f === 'v') { if (!l.v) { l.v = {}; ms.forEach(m => l.v[m] = lineVal(l, m)); delete l.q; delete l.pu; } l.v[inp.dataset.m] = pnum(inp.value); } else l[f] = inp.value;
        tr.querySelector('td[data-v="tot"]').innerHTML = '<b>' + brl(sum(ms, m => lineVal(l, m)), 2) + '</b>';
        $('#pfoot').innerHTML = foot(); clearTimeout(S._ps); S._ps = setTimeout(savePlano, 300);
      };
      ed.onchange = e => { const s2 = e.target.closest('select[data-f]'); if (!s2) return; const l = RAW.plano.lines.find(x => x.id === s2.closest('tr').dataset.l); l.tipo = s2.value; savePlano(); $('#pfoot').innerHTML = foot(); };
      ed.onclick = e => {
        const cs = e.target.closest('td.cons'); if (cs) { const box = ed.querySelector('#pcons'); if (box.dataset.m === cs.dataset.cm) { box.innerHTML = ''; box.dataset.m = ''; return; } box.dataset.m = cs.dataset.cm; box.innerHTML = consMes(id, cs.dataset.cm); box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
        if (e.target.closest('#pconsx')) { const box = ed.querySelector('#pcons'); box.innerHTML = ''; box.dataset.m = ''; return; }
        const nw = e.target.closest('button[data-new]'); if (nw) { const v = {}; ms.forEach(m => v[m] = 0); RAW.plano.lines.push({ id: newId(), node: id, tipo: nw.dataset.new, d: '', v, src: null }); savePlano(); draw(); const ins = ed.querySelectorAll('#ptab tbody tr:last-child input[data-f="d"]'); if (ins.length) ins[0].focus(); return; }
        if (e.target.closest('#pull')) { livres.forEach(addFromContract); savePlano(); draw(); return; }
        if (e.target.closest('#porc')) { pullOrc(id); savePlano(); draw(); return; }
        const dl2 = e.target.closest('button.del'); if (dl2) { const k = dl2.closest('tr').dataset.l; RAW.plano.lines = RAW.plano.lines.filter(x => x.id !== k); savePlano(); draw(); }
      };
    };
    draw();
    S.planOpen = id;
  }

  /* ===== CRONOGRAMA (gráficos) + AVANÇO FÍSICO PELO PESO DAS ATIVIDADES ===== */
  const pctF = v => v == null ? '–' : (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  const pp = v => (v >= 0 ? '+' : '') + (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' p.p.';
  const discNome = k => (YF.DISC[k] ? k + ' · ' + YF.DISC[k] : k);
  function fis() {
    if (!RAW.peso || !M.tasks || !M.tasks.length) return null;
    if (!M._fis || M._fis.ref !== S.ref) { M._fis = YF.build(M.tasks, RAW.peso, S.ref, M.rp); M._fis.ref = S.ref; realAtiv(M._fis); }
    return M._fis;
  }
  /* custo real por atividade: parcela do Pagar & Pago → item do orçamento (mesmo vínculo do comparativo) → item da planilha de pesos
     (código mais longo que é prefixo) → atividades desse item, na proporção do custo programado de cada uma até o mês da parcela */
  function realAtiv(F) {
    const endOf = m => D(addM(m, 1) + '-01') - 864e5;
    const byCod = {}; for (const x of F.T) { x.real = {}; x.parc = []; for (const r of x.itens) (byCod[r.cod] || (byCod[r.cod] = [])).push({ x, part: r.custo * r.pi / 100 }); }
    const cods = Object.keys(byCod).sort((a, b) => b.length - a.length);
    const codOf = it => cods.find(c => it === c || it.startsWith(c + '.')) || null;
    F.realMes = {}; F.semAtiv = {}; F.semL = []; F.fator = 1; F.fatRR = 0; F.fatPR = 0;
    const add = (o, m, v) => o[m] = (o[m] || 0) + v;
    if (!M.cmp) return;
    for (const a of M.cmp.alloc) {
      const p = M.rp[a.k], v = p.pg + p.ap, m = p.d.slice(0, 7); if (!v) continue;
      add(F.realMes, m, v);
      const parts = a.its.length ? a.its : [[null, 1]];
      for (const [it, sh] of parts) {
        const cod = it ? codOf(it) : null, L = cod ? byCod[cod] : null;
        if (!L) { add(F.semAtiv, m, v * sh); F.semL.push({ p, v: v * sh, it, motivo: it ? 'item ' + it + ' sem atividade na planilha de pesos' : 'parcela sem item do orçamento' }); continue; }
        const ws = L.map(o => o.part), tot = ws.reduce((a2, b) => a2 + b, 0) || 1; // rateio pela parte de cada atividade no custo do item
        L.forEach((o, i) => { const val = v * sh * ws[i] / tot; if (val < 0.005) return; add(o.x.real, m, val); o.x.parc.push({ p, it, cod, val, sh: sh * ws[i] / tot, shIt: sh, part: ws[i], tot, m }); });
      }
    }
    // fator de previsão: real ÷ programado, nos meses até a referência
    const ini = m => D(m + '-01') - 864e5;
    let rr = 0, pr = 0; for (const m of Object.keys(F.realMes)) { if (m > F.refM) continue; rr += F.realMes[m]; pr += F.T.reduce((a2, x) => a2 + x.custo * (x.atual(endOf(m)) - x.atual(ini(m))), 0); }
    F.fator = pr ? rr / pr : 1; F.fatRR = rr; F.fatPR = pr;
    projAtiv(F, byCod, codOf);
  }
  /* projeção por atividade nos próximos 12 meses:
     comprometido = parcelas a pagar já lançadas no mês (mesmo caminho do real);
     recorrente (atividades IND: salários, equipe, equipamentos, canteiro…) = média do real dos últimos 3 meses;
     contratos = saldo a medir dos contratos ligados ao item, distribuído pelo cronograma do serviço (mesmo caminho);
     cronograma = custo da atividade × fração do cronograma atual no mês.
     Projeção = comprometido, ou o maior entre recorrente (IND) / contratos / cronograma — são estimativas do mesmo trabalho, não se somam. */
  function projAtiv(F, byCod, codOf) {
    const endOf = m => D(addM(m, 1) + '-01') - 864e5, iniD = m => D(m + '-01') - 864e5;
    F.pm = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(k => addM(F.refM, k));
    const ult = [0, 1, 2].map(k => addM(F.refM, -k));
    for (const x of F.T) { x.ctp = {}; x.ctL = []; }
    if (M.ct) { const cache = {};
      for (const it of M.ct.itens) { if (it.va <= 0.005 || !it.parts.length) continue; const sh = YC.shape(M, it.pnode || it.node, F.refM, cache);
        for (const [oi, s2] of it.parts) { const cod = codOf(oi), L = cod ? byCod[cod] : null; if (!L) continue; const tot = L.reduce((a, o) => a + o.part, 0) || 1;
          for (const o of L) { const f = s2 * o.part / tot; for (const m of F.pm) { const v = it.va * (sh.w[m] || 0) * f; if (v > 0.005) o.x.ctp[m] = (o.x.ctp[m] || 0) + v; } o.x.ctL.push({ it, f, how: sh.how }); } } } }
    F.proj = {}; F.projC = { comp: {}, rec: {}, ct: {}, cr: {} };
    for (const x of F.T) {
      x.media = x.disc === 'IND' ? ult.reduce((a, m) => a + (x.real[m] || 0), 0) / 3 : 0;
      x.proj = {}; x.pc = {};
      for (const m of F.pm) {
        const comp = x.real[m] || 0, cron = x.custo * (x.atual(endOf(m)) - x.atual(iniD(m))), ct = x.ctp[m] || 0, rec = x.disc === 'IND' ? x.media : 0;
        const cand = x.disc === 'IND' ? [['recorrente (média 3 meses)', rec], ['contratos', ct]] : [['contratos', ct], ['cronograma × orçamento', cron]];
        const best = cand.reduce((a, b) => b[1] > a[1] ? b : a, ['—', 0]);
        const v = Math.max(comp, best[1]); const base = comp >= best[1] && comp > 0 ? 'comprometido' : best[0];
        x.proj[m] = v; x.pc[m] = { comp, cron, ct, rec, base };
        F.proj[m] = (F.proj[m] || 0) + v; const key = base === 'comprometido' ? 'comp' : base.startsWith('recorrente') ? 'rec' : base === 'contratos' ? 'ct' : 'cr'; F.projC[key][m] = (F.projC[key][m] || 0) + v;
      }
    }
  }
  function gantt(el, groups, refISO) {
    const rows = groups.filter(g => g.ini || g.iniA);
    let a = null, b = null; for (const g of rows) for (const s of [g.ini, g.iniA, g.iniR]) if (s && (!a || s < a)) a = s; for (const g of rows) for (const s of [g.fim, g.fimA, g.fimR]) if (s && (!b || s > b)) b = s;
    if (!a) { el.innerHTML = '<p class="empty">Sem datas.</p>'; return; }
    const W = Math.max(600, el.clientWidth || 1000), LW = 230, rh = 26, H = rows.length * rh + 34, t0 = D(a.slice(0, 7) + '-01'), t1 = D(b) + 31 * 864e5;
    const X = t => LW + (t - t0) / (t1 - t0) * (W - LW - 10);
    let g = '';
    for (let m = a.slice(0, 7); D(m + '-01') < t1; m = addM(m, 1)) { const xx = X(D(m + '-01')); if (+m.slice(5, 7) % 3 === 1 || rows.length < 8) g += `<line x1="${xx}" x2="${xx}" y1="18" y2="${H}" class="grid"/><text x="${xx + 2}" y="12" class="ax">${ml(m)}</text>`; }
    rows.forEach((r, i) => {
      const y = 22 + i * rh;
      g += `<text x="4" y="${y + 13}" class="ax" style="font-size:11px">${esc(r.lbl || r.k)} · ${pctF(r.pr)}</text>`;
      if (r.ini) g += `<rect x="${X(D(r.ini))}" y="${y + 2}" width="${Math.max(2, X(D(r.fim) + 864e5) - X(D(r.ini)))}" height="6" rx="2" fill="var(--line)"><title>Linha de base ${fd(r.ini)} → ${fd(r.fim)}</title></rect>`;
      if (r.iniA) g += `<rect x="${X(D(r.iniA))}" y="${y + 9}" width="${Math.max(2, X(D(r.fimA) + 864e5) - X(D(r.iniA)))}" height="10" rx="3" fill="var(--s1)" opacity=".55"><title>Atual ${fd(r.iniA)} → ${fd(r.fimA)}</title></rect>`;
      if (r.iniR) { const x0 = X(D(r.iniA || r.iniR)), x1 = X(D(r.fimA || r.fimR) + 864e5); g += `<rect x="${x0}" y="${y + 9}" width="${Math.max(2, (x1 - x0) * r.pr)}" height="10" rx="3" fill="var(--s3)"><title>Realizado ${pctF(r.pr)} (início real ${fd(r.iniR)})</title></rect>`; }
    });
    const rx = X(D(refISO)); g += `<line x1="${rx}" x2="${rx}" y1="16" y2="${H}" class="refl"/><text x="${rx + 3}" y="${H - 4}" class="ax">hoje</text>`;
    el.innerHTML = `<div class="legend"><span><i style="background:var(--line)"></i>Linha de base</span><span><i style="background:var(--s1);opacity:.55"></i>Cronograma atual</span><span><i style="background:var(--s3)"></i>Realizado (% físico sobre a barra atual)</span></div><svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${g}</svg>`;
  }
  views.cronograma = function (el) {
    const F = fis();
    const T = M.tasks || [];
    S.crF = S.crF || { per: 'obra', grp: 'disc' };
    if (!T.length) { el.innerHTML = '<section class="card"><h2>Cronograma</h2><p class="empty">Importe o cronograma.</p></section>'; return; }
    const sem = !F;
    const n = { tot: T.length, conc: T.filter(t => t.rf).length, and: T.filter(t => t.ri && !t.rf).length, atrIni: T.filter(t => !t.ri && t.i && t.i < S.ref).length, atrFim: T.filter(t => !t.rf && t.f && t.f < S.ref).length };
    el.innerHTML = `<section class="card"><div class="ch"><h2>Cronograma — avanço físico${sem ? '' : ' ponderado pelo peso das atividades'}</h2>
        <div class="seg" id="crper">${[['obra', 'Obra toda'], ['12', '12 meses'], ['6', '6 meses']].map(([v, l]) => `<button data-v="${v}" class="${S.crF.per === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      ${sem ? '<p class="crit">Importe a planilha de <b>pesos das atividades</b> (PESO_CRONOGRAMA do Prevision) em Atualizar / Exportar para ver o avanço físico ponderado. Abaixo, só o que sai do cronograma.</p>' : `<p class="hint">Cada atividade do cronograma (tarefa × lote) recebe o <b>peso</b> da planilha do Prevision (soma ${brl(F.Wt, 2)}%; ${F.T.length} atividades com peso, ${F.semPeso.length} sem peso ficam fora). <b>Previsto</b> = peso × fração da duração já decorrida (linha de base ou cronograma atual). <b>Realizado</b> = peso × 100% se tem término real; iniciada sem término = tempo desde o início real ÷ duração atual (máx. 95% — o cronograma não traz % concluído). Data de referência: <b>${fd(S.ref)}</b>.</p>`}
      <div class="tiles">${sem ? '' : tile('Previsto (linha de base)', pctF(F.now.base), 'acumulado até ' + fd(S.ref), '', 'cr_base') + tile('Previsto (cronograma atual)', pctF(F.now.atual), 'acumulado até ' + fd(S.ref)) + tile('Realizado', pctF(F.now.real), 'desvio ' + pp(F.now.real - F.now.base) + ' da linha de base', F.now.real < F.now.base - 0.0005 ? 'crit' : '', 'cr_real') + tile('IDP físico', (F.now.base ? F.now.real / F.now.base : 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 }), 'realizado ÷ previsto (1 = no prazo)', F.now.real / (F.now.base || 1) < 0.98 ? 'crit' : '') + tile('Peso em atraso', pctF(sum(F.T, x => x.w * x.atraso) / F.Wt), F.T.filter(x => x.atraso > 0.01).length + ' atividades abaixo da linha de base', '', 'cr_atr') + tile('Valor agregado × gasto', 'R$ ' + brlK(F.now.va), 'gasto R$ ' + brlK(F.now.cr) + ' · previsto R$ ' + brlK(F.now.vp), '', 'cr_va')}
        ${tile('Atividades', n.tot + '', n.conc + ' concluídas · ' + n.and + ' em andamento')}${tile('Atrasadas no cronograma atual', (n.atrIni + n.atrFim) + '', n.atrIni + ' sem início · ' + n.atrFim + ' sem término', n.atrIni + n.atrFim ? 'crit' : '')}</div></section>
      ${sem ? '' : `<section class="card"><h3>Curva S — avanço físico acumulado</h3><div id="crS"></div></section>
      <section class="card"><h3>Avanço no mês — previsto × medido (realizado)</h3><p class="hint">Quanto da obra (em % do peso total) estava previsto para cada mês e quanto foi realizado. <b>Clique num mês</b> para ver as atividades medidas e previstas nele.</p><div id="crM"></div></section>
      <section class="card"><h3>Valor agregado — R$ acumulado</h3><p class="hint"><b>Valor planejado</b> = custo das atividades (custo do item do orçamento × peso % no item) × previsto. <b>Valor agregado</b> = o mesmo custo × realizado. <b>Gasto</b> = Pagar &amp; Pago (pago + a pagar) com data até o mês. IDC = agregado ÷ gasto; IDP = agregado ÷ planejado.</p><div class="tiles">${tile('Valor planejado (LB)', 'R$ ' + brlK(F.now.vp))}${tile('Valor agregado', 'R$ ' + brlK(F.now.va))}${tile('Gasto (Pagar & Pago)', 'R$ ' + brlK(F.now.cr), 'o relatório começa em ' + fd(M.rp.reduce((a, x) => !a || x.d < a ? x.d : a, '')))}${tile('IDC', (F.now.cr ? F.now.va / F.now.cr : 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 }), 'agregado ÷ gasto (>1 = gastou menos que agregou)')}${tile('IDP (R$)', (F.now.vp ? F.now.va / F.now.vp : 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 }), 'agregado ÷ planejado')}</div><div id="crV"></div></section>`}
      <section class="card"><div class="ch"><h3>Gantt resumido</h3><div class="seg" id="crgrp">${[['disc', 'Por disciplina'], ['lote', 'Por pavimento']].map(([v, l]) => `<button data-v="${v}" class="${S.crF.grp === v ? 'on' : ''}">${l}</button>`).join('')}</div></div><div id="crG"></div></section>
      ${sem ? '' : `<section class="card"><h3>Avanço por item do orçamento</h3><p class="hint">Cada item do orçamento com o peso que a planilha do Prevision distribui pelas atividades e pavimentos dele (ex.: <b>02.06.01 Instalações elétricas</b> soma enterradas + eletrocalha/busway de cada pavimento). É aqui que se vê o avanço do serviço inteiro. Clique para ver as atividades.</p><div id="crI"></div></section>
      <section class="card"><h3>Avanço por disciplina do cronograma e por pavimento</h3><p class="hint">Disciplina = prefixo da tarefa no cronograma (ex.: <b>INS</b> são só as instalações enterradas; as dos pavimentos estão em ELE, HID, INC…). O % é sobre o peso da própria disciplina.</p><div class="grid2"><div id="crD"></div><div id="crL"></div></div></section>
      <section class="card"><h3>Atividades em atraso ponderado (realizado abaixo da linha de base)</h3><div id="crA"></div></section>`}
      ${sem ? '' : `<section class="card"><h3>Peso das atividades por mês (cronograma atual)</h3><p class="hint">Quanto do peso da obra está programado para cair em cada mês (peso da atividade × fração da duração dentro do mês). É o mesmo "Previsto no mês" do total da lista. <b>Clique num mês</b> para ver as atividades.</p><div id="crW"></div></section>
      <section class="card"><h3>Custo das atividades por mês (cronograma atual)</h3><p class="hint">Custo de cada atividade (custo do item do orçamento × peso % da atividade no item, da planilha do Prevision) × fração da duração dentro do mês. Mostra quanto de obra, em R$, está programado para cada mês, ao lado do <b>custo real</b> (Pagar &amp; Pago, pago + a pagar pela data da parcela) e da <b>previsão</b> para os próximos meses. <b>Clique num mês</b> para ver as atividades, com o custo real de cada uma.</p><p class="hint" id="crCf"></p><div id="crC"></div></section>`}
      <section class="card"><h3>Atividades em andamento por mês (cronograma atual)</h3><p class="hint"><b>Clique num mês</b> para ver as atividades programadas nele.</p><div id="crH"></div></section>`;
    // período
    const allM = F ? F.months : [...new Set(T.flatMap(t => [t.i, t.f].filter(Boolean).map(s => s.slice(0, 7))))].sort();
    const per = S.crF.per, rm = refM();
    const mesesP = per === 'obra' ? mrange(allM[0], allM.at(-1)) : mrange(addM(rm, -Math.floor(+per / 3)), addM(rm, +per - Math.floor(+per / 3) - 1));
    const fmtP = v => (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
    if (F) {
      monthChart($('#crS'), mesesP, [], [{ name: 'Previsto — linha de base', c: COL.base, v: F.cum.base, dash: true }, { name: 'Previsto — cronograma atual', c: COL.pago, v: F.cum.atual }, { name: 'Realizado', c: 'var(--s3)', v: F.cum.real }], { refM: rm, h: 300, fmt: fmtP, table: true, gaps: true, label: 'Curva S', onPick: m => openMesFis(m) });
      const mb = {}, ma = {}, mr = {}; for (const m of mesesP) { if (!F.mes[m]) continue; mb[m] = F.mes[m].base; ma[m] = F.mes[m].atual; if (F.mes[m].real != null) mr[m] = F.mes[m].real; }
      monthChart($('#crM'), mesesP, [{ name: 'Previsto LB', c: COL.base, v: mb }, { name: 'Previsto atual', c: COL.pago, v: ma }, { name: 'Medido (realizado)', c: 'var(--s3)', v: mr }], [], { grouped: true, refM: rm, h: 280, fmt: fmtP, table: true, label: 'Avanço mensal', onPick: m => openMesFis(m) });
      monthChart($('#crV'), mesesP, [], [{ name: 'Valor planejado (LB)', c: COL.base, v: F.cum.vp, dash: true }, { name: 'Valor planejado (atual)', c: COL.pago, v: F.cum.vpA, dash: true }, { name: 'Valor agregado', c: 'var(--s3)', v: F.cum.va }, { name: 'Gasto (Pagar & Pago)', c: COL.apagar, v: F.cum.cr }], { refM: rm, h: 280, table: true, gaps: true, label: 'Valor agregado', onPick: m => openMesFis(m) });
      const tab = (gs, lbl, by) => `<div class="tw" style="max-height:520px"><table class="t"><thead><tr><th>${lbl}</th><th class="n">Peso na obra</th><th class="n">Previsto LB</th><th class="n">Previsto atual</th><th class="n">Realizado</th><th class="n">Desvio</th></tr></thead><tbody>${gs.sort((a, b) => by(a, b)).map(g => `<tr class="clk" data-g="${esc(g.k)}"><td>${esc(lbl === 'Disciplina' ? discNome(g.k) : g.k)}</td><td class="n">${pctF(g.w / F.Wt)}</td><td class="n">${pctF(g.pb)}</td><td class="n">${pctF(g.pa)}</td><td class="n"><div class="mbar" style="width:46px"><i style="width:${g.pr * 100}%;background:var(--s3)"></i></div>${pctF(g.pr)}</td><td class="n ${g.pr - g.pb < -0.0005 ? 'crit' : g.pr - g.pb > 0.0005 ? 'okv' : ''}">${pp(g.pr - g.pb)}</td></tr>`).join('')}</tbody></table></div>`;
      $('#crI').innerHTML = tab(F.porItem.slice(), 'Item do orçamento', () => 0).replace(/<td>([0-9.]+)<\/td>/g, '<td>$1</td>');
      $('#crI').querySelectorAll('tr[data-g]').forEach(tr => { const g = F.porItem.find(x => x.k === tr.dataset.g); tr.firstElementChild.textContent = g.lbl; });
      $('#crI').onclick = e => { const tr = e.target.closest('tr[data-g]'); if (tr) { const g = F.porItem.find(x => x.k === tr.dataset.g); openGrpFis(g, g.lbl); } };
      $('#crD').innerHTML = '<h4>Por disciplina</h4>' + tab(F.porDisc.slice(), 'Disciplina', (a, b) => b.w - a.w);
      const lord = l => (M.lots && M.lots.indexOf(l) >= 0 ? M.lots.indexOf(l) : 999);
      $('#crL').innerHTML = '<h4>Por pavimento</h4>' + tab(F.porLote.slice(), 'Pavimento / lote', (a, b) => lord(a.k) - lord(b.k));
      $('#crD').onclick = e => { const tr = e.target.closest('tr[data-g]'); if (tr) openGrpFis(F.porDisc.find(g => g.k === tr.dataset.g), discNome(tr.dataset.g)); };
      $('#crL').onclick = e => { const tr = e.target.closest('tr[data-g]'); if (tr) openGrpFis(F.porLote.find(g => g.k === tr.dataset.g), tr.dataset.g); };
      const atr = F.T.filter(x => x.atraso > 0.005).sort((a, b) => b.w * b.atraso - a.w * a.atraso);
      $('#crA').innerHTML = atr.length ? fisTable(atr.slice(0, 60), true) : '<p class="empty">Nenhuma atividade abaixo da linha de base.</p>';
      el.querySelectorAll('.tile[data-calc]').forEach(t => t.onclick = () => {
        const k = t.dataset.calc;
        if (k === 'cr_atr') openCalc('Peso em atraso', `${pctF(sum(F.T, x => x.w * x.atraso) / F.Wt)} da obra · data ${fd(S.ref)}`, '<p class="hint">Para cada atividade: peso × (previsto na linha de base − realizado), quando positivo.</p>' + fisTable(atr, true, 900));
        else openCalc(k === 'cr_va' ? 'Valor agregado' : 'Avanço físico na data', `Previsto LB ${pctF(F.now.base)} · atual ${pctF(F.now.atual)} · realizado ${pctF(F.now.real)} · VA R$ ${brl(F.now.va, 2)} · gasto R$ ${brl(F.now.cr, 2)}`, '<p class="hint">Todas as atividades com peso, na data de referência. Peso relativo = peso da atividade ÷ soma dos pesos (' + brl(F.Wt, 3) + ').</p>' + fisTable(F.T.slice().sort((a, b) => b.w - a.w), false, 900));
      });
    }
    // gantt
    const G2 = F ? (S.crF.grp === 'disc' ? F.porDisc.map(g => Object.assign({ lbl: discNome(g.k) }, g)).sort((a, b) => (a.iniA || '').localeCompare(b.iniA || '')) : F.porLote.slice().sort((a, b) => (M.lots.indexOf(a.k)) - (M.lots.indexOf(b.k)))) : (() => {
      const o = {}; for (const t of T) { const k = S.crF.grp === 'disc' ? t.pre : t.l; const g = o[k] || (o[k] = { k, lbl: S.crF.grp === 'disc' ? discNome(k) : k, pr: 0, n: 0, c: 0 }); g.n++; if (t.rf) g.c++; for (const [p, v, f] of [['ini', t.bi, 'min'], ['fim', t.bf, 'max'], ['iniA', t.i, 'min'], ['fimA', t.f, 'max'], ['iniR', t.ri, 'min'], ['fimR', t.rf || (t.ri ? S.ref : null), 'max']]) if (v && (!g[p] || (f === 'min' ? v < g[p] : v > g[p]))) g[p] = v; }
      return Object.values(o).map(g => Object.assign(g, { pr: g.c / g.n })); })();
    gantt($('#crG'), G2, S.ref);
    // histograma
    const hm = {}; for (const m of mesesP) { const a0 = m + '-01', b0 = m + '-31'; hm[m] = T.filter(t => t.i && t.f && t.i <= b0 && t.f >= a0).length; }
    monthChart($('#crH'), mesesP, [{ name: 'Atividades em andamento', c: COL.crono, v: hm }], [], { refM: rm, h: 220, fmt: v => Math.round(v) + '', label: 'Atividades por mês', onPick: m => openAtivMes(m) });
    if (F) {
      const ini = m => D(m + '-01') - 864e5, fim = m => D(addM(m, 1) + '-01') - 864e5;
      const ser = [{ name: 'Peso programado no mês', c: COL.crono, v: {} }];
      for (const m of mesesP) for (const x of F.T) { const v = x.w * (x.atual(fim(m)) - x.atual(ini(m))) / F.Wt; if (v > 0) ser[0].v[m] = (ser[0].v[m] || 0) + v; }
      const cs = { name: 'Custo programado (cronograma)', c: COL.pago, v: {} }, cr = { name: 'Custo real (Pagar & Pago)', c: COL.apagar, v: {} }, pv = { name: 'Projeção (comprometido / recorrentes / contratos / cronograma)', c: 'var(--s7)', v: {}, dash: true };
      for (const m of mesesP) { for (const x of F.T) { const v = x.custo * (x.atual(fim(m)) - x.atual(ini(m))); if (v > 0) cs.v[m] = (cs.v[m] || 0) + v; } if (F.realMes[m]) cr.v[m] = F.realMes[m]; if (m > F.refM && F.proj[m] != null) pv.v[m] = F.proj[m]; }
      monthChart($('#crC'), mesesP, [cs, cr], [pv], { grouped: true, gaps: true, refM: rm, h: 280, table: true, label: 'Custo por mês', onPick: m => openAtivMes(m) });
      $('#crCf').innerHTML = `<b>Projeção</b> (próximos 12 meses), atividade por atividade: o maior entre o <b>comprometido</b> (a pagar já lançado no mês), a <b>recorrência</b> das atividades indiretas (média do real dos últimos 3 meses — salários, equipe, equipamentos, canteiro), os <b>contratos</b> (saldo a medir distribuído pelo cronograma do serviço) e o <b>cronograma × orçamento</b>. São estimativas do mesmo trabalho, por isso valem pelo maior e não se somam. Clique num mês e numa atividade para ver a conta. Nos meses futuros a barra laranja é o comprometido. <button class="mini" id="projPl">Levar a projeção de ${ml(M3()[0])}–${ml(M3()[2])} para o planejamento (FLUXO-BASE)</button> Parcelas sem atividade na planilha de pesos: R$ ${brl(sum(Object.values(F.semAtiv)), 2)} (entram no real do mês, mas não numa atividade).`;
      $('#projPl').onclick = () => { const n = projParaPlano(F); render(); setTimeout(() => alertaPlano(n), 50); };
      monthChart($('#crW'), mesesP, ser, [], { refM: rm, h: 260, fmt: v => (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%', table: true, label: 'Peso por mês', onPick: m => openAtivMes(m) });
    }
    $('#crper').onclick = e => { const v = e.target.dataset.v; if (v) { S.crF.per = v; render(); } };
    $('#crgrp').onclick = e => { const v = e.target.dataset.v; if (v) { S.crF.grp = v; render(); } };
  };
  function fisTable(xs, atr, h) {
    const F = fis();
    return `<div class="tw" style="max-height:${h || 460}px"><table class="t"><thead><tr><th>Atividade</th><th>Lote</th><th class="n">Peso</th><th>Linha de base</th><th>Atual</th><th>Real</th><th class="n">Previsto LB</th><th class="n">Realizado</th>${atr ? '<th class="n">Peso em atraso</th>' : '<th class="n">Custo (R$)</th>'}</tr></thead><tbody>${xs.map(x => `<tr><td>${esc(x.t.t)}</td><td>${esc(x.t.l)}</td><td class="n">${pctF(x.w / F.Wt)}</td><td class="sub">${fd(x.t.bi)} → ${fd(x.t.bf)}</td><td class="sub">${fd(x.t.i)} → ${fd(x.t.f)}</td><td class="sub">${x.t.ri ? fd(x.t.ri) + ' → ' + (x.t.rf ? fd(x.t.rf) : '…') : '—'}</td><td class="n">${pctF(x.pb)}</td><td class="n ${x.pr < x.pb - 0.005 ? 'crit' : ''}">${pctF(x.pr)}</td>${atr ? `<td class="n crit">${pctF(x.w * x.atraso / F.Wt)}</td>` : `<td class="n">${brl(x.custo, 2)}</td>`}</tr>`).join('')}</tbody></table></div>`;
  }
  function openAtivMes(m) {
    const a0 = m + '-01', b0 = m + '-31', F = fis();
    const wk = {}; if (F) for (const x of F.T) wk[x.t.t + '|' + x.t.l] = x;
    const L = (M.tasks || []).filter(t => t.i && t.f && t.i <= b0 && t.f >= a0).sort((p, q) => p.i.localeCompare(q.i) || (M.lots.indexOf(p.l) - M.lots.indexOf(q.l)));
    const st = t => t.rf ? '<span class="okv">concluída</span>' : t.ri ? 'em andamento' : (t.i < S.ref ? '<span class="crit">atrasada (não iniciou)</span>' : 'a iniciar');
    const dias = t => { const A = Math.max(D(t.i), D(a0)), B = Math.min(D(t.f), D(b0.slice(0, 7) + '-01') + 31 * 864e5 - 864e5, D(addM(m, 1) + '-01') - 864e5); return Math.max(0, Math.round((B - A) / 864e5) + 1); };
    const porD = {}; L.forEach(t => porD[t.pre] = (porD[t.pre] || 0) + 1);
    openCalc(`Atividades programadas em ${ml(m)}`, `${L.length} atividades no cronograma atual · ${Object.entries(porD).sort((a, b) => b[1] - a[1]).map(([k, v]) => esc(k) + ' ' + v).join(' · ')}`,
      `<p class="hint"><b>Clique numa atividade com peso</b> para ver a conta do custo estimado. Atividades cujo período no cronograma atual (início → término) cruza ${ml(m)}. "Dias no mês" = dias corridos da atividade dentro do mês.${F ? ' Peso = peso da atividade na obra (planilha do Prevision). Custo = custo do item do orçamento × peso % da atividade no item; custo no mês = custo × fração da duração dentro do mês.' : ''}</p><div class="tw" style="max-height:calc(100vh - 210px)"><table class="t"><thead><tr><th>Atividade</th><th>Pavimento / lote</th><th>Atual</th><th class="n">Dias no mês</th><th>Linha de base</th><th>Real</th><th>Situação</th>${F ? '<th class="n">Peso</th><th class="n">Previsto no mês</th><th class="n">Custo da atividade (R$)</th><th class="n">Custo no mês (R$)</th><th class="n">Custo real no mês (R$)</th>' : ''}</tr></thead><tbody>${L.map(t => { const x = wk[t.t + '|' + t.l]; const pm = x ? x.w * (x.atual(D(addM(m, 1) + '-01') - 864e5) - x.atual(D(m + '-01') - 864e5)) / F.Wt : 0; return `<tr class="${x ? 'clk' : ''}" data-ai="${x ? L.indexOf(t) : ''}"><td>${x ? '<span class="ar">▸</span> ' : ''}${esc(t.t)}</td><td>${esc(t.l)}</td><td class="sub">${fd(t.i)} → ${fd(t.f)}</td><td class="n">${dias(t)}</td><td class="sub">${fd(t.bi)} → ${fd(t.bf)}</td><td class="sub">${t.ri ? fd(t.ri) + ' → ' + (t.rf ? fd(t.rf) : '…') : '—'}</td><td>${st(t)}</td>${F ? `<td class="n">${x ? pctF(x.w / F.Wt) : '<span class="sub">sem peso</span>'}</td><td class="n">${x ? pctF(pm) : '–'}</td><td class="n">${x ? brl(x.custo, 2) : '–'}</td><td class="n">${x ? brl(x.custo * (x.atual(D(addM(m, 1) + '-01') - 864e5) - x.atual(D(m + '-01') - 864e5)), 2) : '–'}</td><td class="n">${x && x.real[m] ? '<b>' + brl(x.real[m], 2) + '</b>' : '–'}</td>` : ''}</tr>`; }).join('')}</tbody>${F ? (() => { let w = 0, p2 = 0, n = 0, c1 = 0, c2 = 0, c3 = 0; for (const t of L) { const x = wk[t.t + '|' + t.l]; if (!x) continue; n++; const fr = x.atual(D(addM(m, 1) + '-01') - 864e5) - x.atual(D(m + '-01') - 864e5); w += x.w / F.Wt; p2 += x.w * fr / F.Wt; c1 += x.custo; c2 += x.custo * fr; c3 += x.real[m] || 0; } return `<tfoot><tr><td colspan="7">Total — ${n} atividades com peso de ${L.length}</td><td class="n">${pctF(w)}</td><td class="n">${pctF(p2)}</td><td class="n">${brl(c1, 2)}</td><td class="n">${brl(c2, 2)}</td><td class="n">${brl(c3, 2)}</td></tr>${F.realMes[m] ? `<tr><td colspan="11">Custo real do mês no Pagar &amp; Pago (todas as parcelas, inclusive de atividades fora desta lista e sem atividade)</td><td class="n">${brl(F.realMes[m], 2)}</td></tr>` : ''}</tfoot>`; })() : ''}</table></div>`);
    const cols = F ? 12 : 7;
    $('#calc .dw').addEventListener('click', e => {
      const tr = e.target.closest('tr[data-ai]'); if (!tr || tr.dataset.ai === '') return;
      const nx = tr.nextElementSibling;
      if (nx && nx.classList.contains('det')) { nx.remove(); tr.querySelector('.ar').textContent = '▸'; return; }
      const t = L[+tr.dataset.ai], x = wk[t.t + '|' + t.l];
      tr.insertAdjacentHTML('afterend', `<tr class="det"><td colspan="${cols}">${contaAtiv(x, m)}</td></tr>`); tr.querySelector('.ar').textContent = '▾';
    });
  }
  /* memória do custo estimado de uma atividade num mês */
  function projConta(x) {
    const F = fis(), ms = F.pm.slice(0, 6), ult = [2, 1, 0].map(k => addM(F.refM, -k));
    return `<br><b>5) Projeção dos próximos meses</b> — o maior entre as estimativas (não se somam):${x.disc === 'IND' ? ` recorrência = média do real de ${ult.map(ml).join(', ')} = (${ult.map(m => brl(x.real[m] || 0, 2)).join(' + ')}) ÷ 3 = <b>R$ ${brl(x.media, 2)}</b>/mês.` : ''}${x.ctL.length ? ' Contratos ligados: ' + [...new Set(x.ctL.map(c => 'contrato ' + c.it.ct + '.' + c.it.item + ' ' + c.it.forn + ' (saldo a medir R$ ' + brl(c.it.va, 2) + ' × ' + pct(c.f) + ', ' + c.how + ')'))].map(esc).join('; ') + '.' : ''}
      <table class="t"><thead><tr><th>Mês</th><th class="n">Comprometido (a pagar)</th>${x.disc === 'IND' ? '<th class="n">Recorrente</th>' : ''}<th class="n">Contratos</th><th class="n">Cronograma × orçamento</th><th class="n">Projeção</th><th>Base</th></tr></thead><tbody>${ms.map(m => { const c = x.pc[m]; return `<tr><td>${ml(m)}</td><td class="n">${brl(c.comp, 2)}</td>${x.disc === 'IND' ? `<td class="n">${brl(c.rec, 2)}</td>` : ''}<td class="n">${brl(c.ct, 2)}</td><td class="n">${brl(c.cron, 2)}</td><td class="n"><b>${brl(x.proj[m], 2)}</b></td><td class="sub">${esc(c.base)}</td></tr>`; }).join('')}</tbody></table>`;
  }
  /* projeção → linhas do planejamento (vai para a FLUXO-BASE): atividade → itens do orçamento do código de peso → serviço da FLUXO-BASE,
     na proporção do orçado de cada item; separado em material / M.O. / outros pela composição */
  function projParaPlano(F) {
    const ms = M3(), out = {};
    for (const x of F.T) for (const r of x.itens) {
      const its = Object.values(M.cmp.items).filter(o => o.node && (o.c.it === r.cod || o.c.it.startsWith(r.cod + '.')));
      const tot = its.reduce((a, o) => a + (o.c.tot || 0), 0); if (!tot) continue;
      const fr = (r.custo * r.pi / 100) / (x.custo || 1);
      for (const o of its) { const f = fr * (o.c.tot || 0) / tot; if (!f) continue;
        const t3 = (o.c.mat || 0) + (o.c.mo || 0) + (o.c.ou || 0) || 1;
        for (const [tipo, k] of [['MAT', 'mat'], ['MO', 'mo'], ['EQ', 'ou']]) { const ft = (o.c[k] || 0) / t3; if (!ft) continue;
          const key = o.node + '|' + o.c.it + '|' + tipo, L = out[key] || (out[key] = { node: o.node, it: o.c.it, d: o.c.it + ' · ' + o.c.d, tipo, v: {} });
          for (const m of ms) L.v[m] = (L.v[m] || 0) + (x.proj[m] || 0) * f * ft; } }
    }
    const nodes = new Set(Object.values(out).map(l => l.node));
    // nos serviços projetados, a projeção substitui as linhas do orçamento × cronograma e dos contratos (já estão dentro dela); as manuais ficam
    RAW.plano.lines = RAW.plano.lines.filter(l => !(nodes.has(l.node) && l.src && !String(l.src).startsWith('mo:')));
    let n = 0; const usados = new Set(); for (const l of Object.values(out)) { if (l.tipo === 'MO' && RAW.plano.mo && RAW.plano.mo[l.node] && RAW.plano.mo[l.node].tipo) continue; // M.O. já definida (própria/terceirizada)
 ms.forEach(m => l.v[m] = Math.round((l.v[m] || 0) * 100) / 100); if (ms.every(m => !l.v[m])) continue; RAW.plano.lines.push({ id: newId(), node: l.node, tipo: l.tipo, d: l.d, it: l.it, v: l.v, src: 'proj:' + l.it + ':' + l.tipo }); n++; usados.add(l.node); }
    savePlano(); return { n, s: usados.size };
  }
  function alertaPlano(r) { const el = $('#crCf'); if (el) el.insertAdjacentHTML('beforeend', ` <b class="ok">✓ ${r.n} linhas em ${r.s} serviços levadas ao planejamento — confira na aba Programação fluxo e atualize a YAC-FLUXO (⟳).</b>`); }
  function contaAtiv(x, m) {
    const F = fis(), t = x.t, ini = D(m + '-01'), fim = D(addM(m, 1) + '-01') - 864e5;
    const dur = t.i && t.f ? Math.round((D(t.f) - D(t.i)) / 864e5) + 1 : 0;
    const dm = t.i && t.f ? Math.max(0, Math.round((Math.min(D(t.f), fim) - Math.max(D(t.i), ini)) / 864e5) + 1) : 0;
    const fr = x.atual(fim) - x.atual(ini - 864e5);
    const linhas = x.itens.map(r => `<tr><td>${esc(r.cod)}</td><td>${esc(r.d)}</td><td class="n">${brl(r.custo, 2)}</td><td class="n">${brl(r.pi, 4)}%</td><td class="n"><b>${brl(r.custo * r.pi / 100, 2)}</b></td><td class="n">${brl(r.w, 4)}%</td></tr>`).join('');
    return `<div class="conta"><b>1) Custo da atividade</b> = Σ (custo do item do orçamento × peso % da atividade no item), da planilha de pesos:
      <table class="t"><thead><tr><th>Item</th><th>Descrição do item</th><th class="n">Custo do item (R$)</th><th class="n">Peso % no item</th><th class="n">Parte desta atividade (R$)</th><th class="n">Peso na obra</th></tr></thead><tbody>${linhas}</tbody><tfoot><tr><td colspan="4">Custo da atividade</td><td class="n">${brl(x.custo, 2)}</td><td class="n">${brl(x.w, 4)}% → ${pctF(x.w / F.Wt)} da obra (÷ ${brl(F.Wt, 2)})</td></tr></tfoot></table>
      <b>2) Fração no mês</b> = dias da atividade dentro de ${ml(m)} ÷ duração no cronograma atual = ${dm} ÷ ${dur} dias (${fd(t.i)} → ${fd(t.f)}) = <b>${pct(fr)}</b><br>
      <b>3) Custo no mês</b> = R$ ${brl(x.custo, 2)} × ${pct(fr)} = <b>R$ ${brl(x.custo * fr, 2)}</b> · <b>Previsto no mês</b> = ${pctF(x.w / F.Wt)} × ${pct(fr)} = <b>${pctF(x.w * fr / F.Wt)}</b>
      ${(() => { const P = x.parc.filter(o => o.m === m).sort((a, b) => b.val - a.val); return `<br><b>4) Custo real no mês</b> = Σ parcelas do Pagar &amp; Pago com data em ${ml(m)} ligadas aos itens desta atividade × parte da atividade no item (parte = custo desta atividade no item ÷ custo de todas as atividades do item na planilha de pesos) = <b>R$ ${brl(sum(P, o => o.val), 2)}</b>${m > F.refM ? ' <span class="sub">(mês futuro: é o a pagar já comprometido)</span>' : ''}` + (P.length ? `<table class="t"><thead><tr><th>Data</th><th>Fornecedor</th><th>Insumo</th><th>Item comprado</th><th>Item do orçamento</th><th class="n">Valor da parcela</th><th class="n">Parte no item do orçamento</th><th class="n">Parte da atividade no item de peso</th><th class="n">Valor (R$)</th></tr></thead><tbody>${P.map(o => `<tr><td>${fd(o.p.d)}</td><td>${esc(o.p.forn)}</td><td>${esc(o.p.ins)}</td><td>${esc(o.p.item)}</td><td>${esc(o.it)} → ${esc(o.cod)}</td><td class="n">${brl(o.p.pg + o.p.ap, 2)}</td><td class="n">${pct(o.shIt)}</td><td class="n" title="R$ ${brl(o.part, 2)} ÷ R$ ${brl(o.tot, 2)}">${pct(o.part / o.tot)}</td><td class="n"><b>${brl(o.val, 2)}</b></td></tr>`).join('')}</tbody><tfoot><tr><td colspan="8">Custo real da atividade no mês</td><td class="n">${brl(sum(P, o => o.val), 2)}</td></tr></tfoot></table>` : ' <span class="sub">(nenhuma parcela no mês)</span>') + projConta(x); })()}</div>`;
  }
  function openGrpFis(g, nome) { const F = fis(); openCalc(esc(nome), `peso ${pctF(g.w / F.Wt)} da obra · previsto LB ${pctF(g.pb)} · atual ${pctF(g.pa)} · realizado ${pctF(g.pr)} · custo R$ ${brl(g.custo, 2)}`, fisTable(g.xs.slice().sort((a, b) => (a.t.i || '').localeCompare(b.t.i || '')), false, 900)); }
  function openMesFis(m) {
    const F = fis(); if (!F) return; const L = F.noMes(m).sort((a, b) => b.x.w * Math.max(b.r, b.b) - a.x.w * Math.max(a.r, a.b));
    const sR = sum(L, o => o.x.w * o.r) / F.Wt, sB = sum(L, o => o.x.w * o.b) / F.Wt, sA = sum(L, o => o.x.w * o.a) / F.Wt;
    openCalc(`Avanço em ${ml(m)}`, `previsto LB ${pctF(sB)} · previsto atual ${pctF(sA)} · medido ${m <= F.refM ? pctF(sR) : '— (mês futuro)'} · valor medido R$ ${brl(sum(L, o => o.x.custo * o.r), 2)}`,
      `<p class="hint">Medido no mês = peso × (realizado no fim do mês − realizado no fim do mês anterior)${m === F.refM ? ', com o mês corrente até ' + fd(S.ref) : ''}. Previsto = peso × fração da duração que cai no mês. Valor = custo da atividade × a mesma fração.</p><div class="tw" style="max-height:calc(100vh - 220px)"><table class="t"><thead><tr><th>Atividade</th><th>Lote</th><th class="n">Peso</th><th>Atual</th><th>Real</th><th class="n">Previsto LB no mês</th><th class="n">Previsto atual no mês</th><th class="n">Medido no mês</th><th class="n">Valor medido (R$)</th></tr></thead><tbody>${L.map(o => `<tr><td>${esc(o.x.t.t)}</td><td>${esc(o.x.t.l)}</td><td class="n">${pctF(o.x.w / F.Wt)}</td><td class="sub">${fd(o.x.t.i)} → ${fd(o.x.t.f)}</td><td class="sub">${o.x.t.ri ? fd(o.x.t.ri) + ' → ' + (o.x.t.rf ? fd(o.x.t.rf) : '…') : '—'}</td><td class="n">${pctF(o.x.w * o.b / F.Wt)}</td><td class="n">${pctF(o.x.w * o.a / F.Wt)}</td><td class="n"><b>${o.r ? pctF(o.x.w * o.r / F.Wt) : '–'}</b></td><td class="n">${brl(o.x.custo * o.r, 2)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="5">Total</td><td class="n">${pctF(sB)}</td><td class="n">${pctF(sA)}</td><td class="n">${pctF(sR)}</td><td class="n">${brl(sum(L, o => o.x.custo * o.r), 2)}</td></tr></tfoot></table></div>`);
  }

  /* ---- gráficos simples reutilizáveis: barras horizontais e colunas por categoria (com dica ao passar o mouse e clique) ---- */
  function hbar(el, rows, opts = {}) {
    const W = Math.max(360, el.clientWidth || 700), LW = opts.lw || 260, VW = rows.some(r => r.extra) ? 150 : 90, rh = 24, H = rows.length * rh + 8, mc = Math.floor((LW - 14) / 7.4);
    const max = Math.max(...rows.map(r => Math.abs(r.v)), 1e-9), neg = rows.some(r => r.v < 0);
    const x0 = neg ? LW + VW + (W - LW - 2 * VW) / 2 : LW, sc = (neg ? (W - LW - 2 * VW) / 2 : (W - LW - VW)) / max;
    let g = neg ? `<line x1="${x0}" x2="${x0}" y1="0" y2="${H}" class="grid"/>` : '';
    rows.forEach((r, i) => { const y = 4 + i * rh, w = Math.max(2, Math.abs(r.v) * sc), xx = r.v < 0 ? x0 - w : x0;
      g += `<g class="hb" data-i="${i}" style="cursor:${opts.onPick ? 'pointer' : 'default'}"><rect x="0" y="${y}" width="${W}" height="${rh}" fill="transparent"/><text x="${LW - 8}" y="${y + 16}" class="ax" text-anchor="end" style="font-size:11.5px;fill:var(--ink)">${esc(r.label.length > mc ? r.label.slice(0, mc - 1) + '…' : r.label)}</text>
      <rect x="${xx}" y="${y + 5}" width="${w}" height="${rh - 10}" rx="3" fill="${r.c || opts.c || 'var(--s1)'}"/><text x="${r.v < 0 ? xx - 6 : xx + w + 6}" y="${y + 16}" class="ax" text-anchor="${r.v < 0 ? 'end' : 'start'}" style="fill:var(--ink2)">${esc((opts.fmt || brlK)(r.v))}${r.extra ? ' · ' + esc(r.extra) : ''}</text></g>`; });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(opts.label || '')}">${g}</svg>`;
    el.querySelectorAll('g.hb').forEach(n => { const r = rows[+n.dataset.i];
      n.addEventListener('mousemove', ev => showTip(`<b>${esc(r.label)}</b>${r.tip || `<div class="tr"><span>${esc(opts.name || 'Valor')}</span><b>${(opts.fmtT || opts.fmt || brl)(r.v)}</b></div>`}${opts.onPick ? '<div class="sub tipclk">Clique para ver os pedidos</div>' : ''}`, ev));
      n.addEventListener('mouseleave', hideTip); if (opts.onPick) n.addEventListener('click', () => { hideTip(); opts.onPick(r); }); });
  }
  function colChart(el, cats, vals, opts = {}) {
    const W = Math.max(320, el.clientWidth || 800), H = opts.h || 220, P = { l: 60, r: 10, t: 14, b: 30 }, iw = W - P.l - P.r, ih = H - P.t - P.b, n = cats.length;
    const max = Math.max(...vals, 1e-9), nice = (() => { const e = Math.pow(10, Math.floor(Math.log10(max))); const f = max / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; })();
    const y = v => P.t + ih - v / nice * ih, bw = iw / n, bW = Math.max(4, Math.min(38, bw * 0.66));
    let g = ''; for (let i = 0; i <= 4; i++) { const v = nice * i / 4; g += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${P.l - 8}" y="${y(v) + 4}" class="ax" text-anchor="end">${(opts.fmtA || opts.fmt || brlK)(v)}</text>`; }
    const step = Math.ceil(n / Math.max(1, Math.floor(iw / 58)));
    cats.forEach((c, i) => { const x = P.l + bw * i + bw / 2, v = vals[i] || 0, yy = y(v), h = Math.max(v > 0 ? 1 : 0, y(0) - yy), r = Math.min(4, bW / 2, h);
      if (v > 0) g += `<path d="M${x - bW / 2},${yy + h}V${yy + r}Q${x - bW / 2},${yy} ${x - bW / 2 + r},${yy}H${x + bW / 2 - r}Q${x + bW / 2},${yy} ${x + bW / 2},${yy + r}V${yy + h}Z" fill="${(opts.cs && opts.cs[i]) || opts.c || 'var(--s1)'}"/>`;
      if (i % step === 0) g += `<text x="${x}" y="${H - 9}" class="ax" text-anchor="middle">${esc(c)}</text>`;
      g += `<rect class="cb" data-i="${i}" x="${P.l + bw * i}" y="${P.t}" width="${bw}" height="${ih}" fill="transparent" style="cursor:${opts.onPick ? 'pointer' : 'default'}"/>`; });
    el.innerHTML = `${opts.legend ? `<div class="legend">${opts.legend}</div>` : ''}<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(opts.label || '')}">${g}</svg>`;
    el.querySelectorAll('rect.cb').forEach(n => { const i = +n.dataset.i;
      n.addEventListener('mousemove', ev => showTip(`<b>${esc(opts.tipT ? opts.tipT(i) : cats[i])}</b><div class="tr"><span>${esc(opts.name || 'Valor')}</span><b>${(opts.fmt || brl)(vals[i] || 0)}</b></div>${opts.tipX ? opts.tipX(i) : ''}${opts.onPick ? '<div class="sub tipclk">Clique para ver os pedidos</div>' : ''}`, ev));
      n.addEventListener('mouseleave', hideTip); if (opts.onPick) n.addEventListener('click', () => { hideTip(); opts.onPick(i); }); });
  }
  /* evolução do preço de um insumo: um ponto por pedido */
  function priceLine(L) {
    const P = L.filter(r => r.pu > 0 && r.dPed); if (P.length < 2) return '';
    const W = 900, H = 200, pd = { l: 60, r: 14, t: 14, b: 28 }, t0 = D(P[0].dPed), t1 = Math.max(D(P[P.length - 1].dPed), t0 + 864e5);
    const mn = Math.min(...P.map(r => r.pu)), mx = Math.max(...P.map(r => r.pu)), pad = Math.max((mx - mn) * 0.25, mx * 0.05), lo = Math.max(0, mn - pad), hi = mx + pad; // escala mínima de ±5% para não exagerar diferenças de centavos
    const X = t => pd.l + (t - t0) / (t1 - t0) * (W - pd.l - pd.r), Y = v => pd.t + (hi - v) / (hi - lo) * (H - pd.t - pd.b);
    let g = ''; for (let i = 0; i <= 3; i++) { const v = lo + (hi - lo) * i / 3; g += `<line x1="${pd.l}" x2="${W - pd.r}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${pd.l - 8}" y="${Y(v) + 4}" class="ax" text-anchor="end">${brl(v, 2)}</text>`; }
    g += `<polyline points="${P.map(r => X(D(r.dPed)) + ',' + Y(r.pu)).join(' ')}" fill="none" stroke="var(--s1)" stroke-width="2"/>`;
    P.forEach(r => g += `<circle cx="${X(D(r.dPed))}" cy="${Y(r.pu)}" r="4.5" fill="var(--s1)" stroke="var(--surf)" stroke-width="2"><title>${fd(r.dPed)} · pedido ${r.ped} · R$ ${brl(r.pu, 2)} · ${brl(r.qtd, 2)} un.</title></circle>`);
    g += `<text x="${pd.l}" y="${H - 8}" class="ax">${fd(P[0].dPed)}</text><text x="${W - pd.r}" y="${H - 8}" class="ax" text-anchor="end">${fd(P[P.length - 1].dPed)}</text>`;
    return `<h3>Evolução do preço unitário</h3><svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${g}</svg>`;
  }

  /* ===== COMPRAS (Relação de Pedidos de Compras do UAU) ===== */
  function compras() {
    if (!RAW.compras || !RAW.compras.itens) return null;
    if (M._cp) return M._cp;
    const I = RAW.compras.itens, by = {};
    // insumo do pedido → serviços onde o mesmo código já foi lançado no Pagar & Pago
    const pp = {}; for (const x of M.rp) { const c = (x.item || '').split(' - ')[0].trim(); const o = pp[c] || (pp[c] = { v: 0, nos: {} }); o.v += x.pg + x.ap; if (x.n) o.nos[x.n] = (o.nos[x.n] || 0) + x.pg + x.ap; }
    for (const r of I) { const g = by[r.cod] || (by[r.cod] = { cod: r.cod, ins: r.ins, L: [], qtd: 0, v: 0 }); g.L.push(r); g.qtd += r.qtd; g.v += r.v; }
    for (const g of Object.values(by)) { g.L.sort((a, b) => (a.dPed || '').localeCompare(b.dPed || ''));
      const P = g.L.filter(r => r.pu > 0); // pedidos ainda sem preço (criados) não entram na estatística de preço
      const u = P[P.length - 1] || g.L[g.L.length - 1]; g.ult = u.pu; g.dUlt = u.dPed; const qP = P.reduce((a, r) => a + r.qtd, 0);
      g.med = qP ? P.reduce((a, r) => a + r.v, 0) / qP : u.pu; g.min = P.length ? Math.min(...P.map(r => r.pu)) : 0; g.max = P.length ? Math.max(...P.map(r => r.pu)) : 0; g.var = P.length > 1 && P[0].pu ? u.pu / P[0].pu - 1 : 0; g.nP = P.length; g.semPreco = g.L.length - P.length; g.pp = pp[g.cod] || null; }
    const lt = (k) => { const v = I.filter(r => r[k] != null && r.est.startsWith('5')).map(r => r[k]); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    return (M._cp = { I, by, ins: Object.values(by), ltPC: lt('ltPC'), ltCE: lt('ltCE'), aberto: I.filter(r => !r.est.startsWith('5')), pp });
  }
  views.compras = function (el) {
    const C = compras();
    if (!C) { el.innerHTML = '<section class="card"><h2>Compras</h2><p class="empty">Importe a Relação de Pedidos de Compras do UAU em Atualizar / Exportar.</p></section>'; return; }
    S.cpF = S.cpF || { q: '', so: 'v' };
    const tot = sum(C.I, r => r.v), ped = new Set(C.I.map(r => r.ped)).size, ach = C.ins.filter(g => g.pp).length;
    const vA = sum(C.aberto, r => r.v);
    el.innerHTML = `<section class="card"><h2>Compras — pedidos, preços praticados e prazos</h2>
      <p class="hint">Da Relação de Pedidos de Compras do UAU (${C.I.length} itens, ${RAW.compras.excluidos || 0} excluídos fora). Valor = quantidade × preço do pedido. O insumo do pedido (código IF…) é ligado aos serviços onde o mesmo código já foi lançado no Pagar &amp; Pago — ${ach} de ${C.ins.length} insumos encontrados.</p>
      <div class="tiles">${tile('Pedidos', ped + '', C.I.length + ' itens · ' + C.ins.length + ' insumos')}${tile('Valor dos pedidos', 'R$ ' + brlK(tot), fd(C.I.reduce((a, r) => !a || (r.dPed && r.dPed < a) ? r.dPed : a, '')) + ' a ' + fd(C.I.reduce((a, r) => r.dPed && r.dPed > a ? r.dPed : a, '')))}${tile('Em aberto (criados / simulados)', C.aberto.length + ' itens', (vA ? 'R$ ' + brlK(vA) : 'ainda sem preço') + ' · ' + new Set(C.aberto.map(r => r.ped)).size + ' pedidos não confirmados', C.aberto.length ? 'crit' : '')}${tile('Prazo pedido → compra', C.ltPC == null ? '–' : brl(C.ltPC, 1) + ' dias', 'média dos confirmados')}${tile('Prazo compra → entrega', C.ltCE == null ? '–' : brl(C.ltCE, 1) + ' dias', 'média dos confirmados')}${tile('Do pedido à entrega', C.ltPC == null || C.ltCE == null ? '–' : brl(C.ltPC + C.ltCE, 1) + ' dias', 'para programar com antecedência')}</div></section>
      <section class="card"><h3>Valor pedido por semana</h3><p class="hint">Soma dos itens pela data do pedido (semana de segunda a domingo). Passe o mouse para ver a semana e clique para abrir os pedidos.</p><div id="cpW"></div><details class="tview"><summary>Por mês: pedido × entrega prevista</summary><div id="cpM"></div></details></section>
      <div class="grid2"><section class="card"><h3>Onde o dinheiro está — maiores insumos (curva ABC)</h3><p class="hint" id="cpAbcH"></p><div id="cpAbc"></div></section>
        <section class="card"><h3>Pedidos por serviço da obra</h3><p class="hint">Valor dos pedidos distribuído pelos serviços onde o mesmo insumo foi lançado no Pagar &amp; Pago. "Sem lançamento" = insumo ainda não lançado.</p><div id="cpSv"></div></section></div>
      <div class="grid2"><section class="card"><h3>Prazo do pedido até a entrega</h3><p class="hint" id="cpLtH"></p><div id="cpLt"></div></section>
        <section class="card"><h3>Variação de preço — impacto em R$</h3><p class="hint">Quanto a mais (ou a menos) foi pago nos pedidos seguintes porque o preço mudou em relação ao primeiro pedido do mesmo insumo: Σ (preço do pedido − primeiro preço) × quantidade. Ao lado, a variação % do último preço. <span class="crit">Subiu</span> / <span class="okv">caiu</span>.</p><div id="cpVar"></div></section></div>
      <section class="card"><div class="ch"><h3>Preços praticados por insumo</h3><div class="filters" style="margin:0"><input type="search" id="cpq" placeholder="Buscar insumo ou código" value="${esc(S.cpF.q)}"><div class="seg" id="cpso">${[['v', 'Maior valor'], ['var', 'Maior variação'], ['n', 'Mais pedidos']].map(([v, l]) => `<button data-v="${v}" class="${S.cpF.so === v ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>
        <p class="hint"><b>Último preço</b> = preço do pedido mais recente; <b>médio</b> = valor ÷ quantidade de todos os pedidos; <b>variação</b> = último ÷ primeiro − 1. Clique para ver o histórico de pedidos do insumo.</p><div class="tw" style="max-height:600px" id="cpT"></div></section>
      ${C.aberto.length ? `<section class="card"><h3>Pedidos em aberto (ainda não confirmados)</h3><div class="tw">${cpTab(C.aberto)}</div></section>` : ''}`;
    const mv = {}, me = {}; for (const r of C.I) { if (r.dPed) mv[r.dPed.slice(0, 7)] = (mv[r.dPed.slice(0, 7)] || 0) + r.v; if (r.dEnt) me[r.dEnt.slice(0, 7)] = (me[r.dEnt.slice(0, 7)] || 0) + r.v; }
    const ks = [...Object.keys(mv), ...Object.keys(me)].sort();
    // semanas
    const wk = d => { const t = D(d), dw = (new Date(t).getUTCDay() + 6) % 7; return new Date(t - dw * 864e5).toISOString().slice(0, 10); };
    const W0 = {}, WL = {}; for (const r of C.I) { if (!r.dPed) continue; const k = wk(r.dPed); W0[k] = (W0[k] || 0) + r.v; (WL[k] || (WL[k] = [])).push(r); }
    const wks = []; if (Object.keys(W0).length) { let t = D(Object.keys(W0).sort()[0]); const tEnd = D(Object.keys(W0).sort().pop()); while (t <= tEnd) { wks.push(new Date(t).toISOString().slice(0, 10)); t += 7 * 864e5; } }
    colChart($('#cpW'), wks.map(k => fd(k).slice(0, 5)), wks.map(k => W0[k] || 0), { h: 240, name: 'Valor pedido', label: 'Pedidos por semana', tipT: i => 'Semana de ' + fd(wks[i]) + ' a ' + fd(new Date(D(wks[i]) + 6 * 864e5).toISOString().slice(0, 10)), tipX: i => `<div class="tr"><span>Itens</span><b>${(WL[wks[i]] || []).length}</b></div><div class="tr"><span>Pedidos</span><b>${new Set((WL[wks[i]] || []).map(r => r.ped)).size}</b></div>`, onPick: i => { const L = WL[wks[i]] || []; openCalc('Pedidos da semana de ' + fd(wks[i]), `${L.length} itens · R$ ${brl(sum(L, r => r.v), 2)}`, `<div class="tw">${cpTab(L)}</div>`); } });
    // curva ABC
    const ins = C.ins.slice().sort((a, b) => b.v - a.v); let ac = 0; const abc = ins.map(g => { ac += g.v; return { g, ac: ac / (tot || 1) }; });
    const nA = abc.findIndex(o => o.ac >= 0.8) + 1;
    $('#cpAbcH').innerHTML = `<b>${nA} insumos</b> (${pct(nA / (ins.length || 1))} dos ${ins.length}) concentram <b>80%</b> do valor pedido. Abaixo os 15 maiores, com o % acumulado.`;
    hbar($('#cpAbc'), abc.slice(0, 15).map(o => ({ label: o.g.ins, v: o.g.v, extra: pct(o.ac) + ' acum.', g: o.g, c: o.ac <= 0.8 ? 'var(--s1)' : 'var(--s3)', tip: `<div class="tr"><span>Valor</span><b>R$ ${brl(o.g.v, 2)}</b></div><div class="tr"><span>Qtd.</span><b>${brl(o.g.qtd, 2)}</b></div><div class="tr"><span>Último preço</span><b>R$ ${brl(o.g.ult, 2)}</b></div><div class="tr"><span>% acumulado</span><b>${pct(o.ac)}</b></div>` })), { lw: 280, label: 'Curva ABC', onPick: r => openIns(r.g) });
    // por serviço
    const sv = {}; for (const r of C.I) { const g = C.by[r.cod], P2 = g.pp; if (!P2 || !P2.v) { sv['—'] = (sv['—'] || 0) + r.v; continue; } for (const [n, v] of Object.entries(P2.nos)) sv[n] = (sv[n] || 0) + r.v * v / P2.v; const sem = 1 - Object.values(P2.nos).reduce((a, b) => a + b, 0) / P2.v; if (sem > 0.001) sv['—'] = (sv['—'] || 0) + r.v * sem; }
    hbar($('#cpSv'), Object.entries(sv).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([n, v]) => ({ label: n === '—' ? 'Sem lançamento no Pagar & Pago' : (M.nodes[n] ? n + ' · ' + M.nodes[n].desc : n), v, extra: pct(v / (tot || 1)), c: n === '—' ? 'var(--ink3)' : 'var(--s1)' })), { lw: 280, label: 'Pedidos por serviço' });
    // prazos
    const LT = C.I.filter(r => r.ltPC != null && r.ltCE != null && r.est.startsWith('5')).map(r => r.ltPC + r.ltCE);
    const bins = [[0, 3, '0–3'], [4, 7, '4–7'], [8, 14, '8–14'], [15, 21, '15–21'], [22, 30, '22–30'], [31, 1e9, '31+']], cnt = bins.map(b => LT.filter(v => v >= b[0] && v <= b[1]).length);
    const sorted = LT.slice().sort((a, b) => a - b), med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0, p80 = sorted.length ? sorted[Math.floor(sorted.length * 0.8)] : 0;
    $('#cpLtH').innerHTML = `Dias corridos do pedido até a entrega, por item confirmado (${LT.length}). <b>Mediana ${med} dias</b>; 80% dos itens chegam em até <b>${p80} dias</b> — use esse prazo para programar os pedidos antes da atividade.`;
    colChart($('#cpLt'), bins.map(b => b[2] + ' d'), cnt, { h: 220, c: 'var(--s3)', name: 'Itens', fmt: v => Math.round(v) + '', fmtA: v => Math.round(v) + '', label: 'Prazo' });
    // variações
    const V = C.ins.filter(g => g.nP > 1 && Math.abs(g.var) > 0.0005).map(g => { const P = g.L.filter(r => r.pu > 0), p0 = P[0].pu; g.imp = P.slice(1).reduce((a, r) => a + (r.pu - p0) * r.qtd, 0); return g; }).filter(g => Math.abs(g.imp) >= 1).sort((a, b) => Math.abs(b.imp) - Math.abs(a.imp)).slice(0, 14).sort((a, b) => b.imp - a.imp);
    if (V.length) hbar($('#cpVar'), V.map(g => ({ label: g.ins, v: g.imp, extra: (g.var > 0 ? '+' : '') + pct(g.var), g, c: g.imp > 0 ? 'var(--s2)' : 'var(--s3)', tip: `<div class="tr"><span>Primeiro preço</span><b>R$ ${brl(g.L.filter(r => r.pu > 0)[0].pu, 2)}</b></div><div class="tr"><span>Último preço</span><b>R$ ${brl(g.ult, 2)}</b></div><div class="tr"><span>Variação</span><b>${pct(g.var)}</b></div><div class="tr"><span>Impacto nos pedidos seguintes</span><b>R$ ${brl(g.imp, 2)}</b></div>` })), { lw: 260, fmt: v => (v > 0 ? '+' : '−') + 'R$ ' + brlK(Math.abs(v)), label: 'Impacto da variação de preço', onPick: r => openIns(r.g) });
    else $('#cpVar').innerHTML = '<p class="empty">Nenhum insumo com variação.</p>';
    monthChart($('#cpM'), mrange(ks[0], ks[ks.length - 1]), [{ name: 'Pedido (data do pedido)', c: COL.pago, v: mv }, { name: 'Entrega prevista', c: COL.crono, v: me }], [], { grouped: true, refM: refM(), h: 240, table: true, label: 'Pedidos por mês' });
    const draw = () => {
      const q = S.cpF.q.trim().toLowerCase(), so = S.cpF.so;
      const L = C.ins.filter(g => !q || (g.cod + ' ' + g.ins).toLowerCase().includes(q)).sort((a, b) => so === 'var' ? Math.abs(b.var) - Math.abs(a.var) : so === 'n' ? b.L.length - a.L.length : b.v - a.v).slice(0, 300);
      $('#cpT').innerHTML = `<table class="t"><thead><tr><th>Código</th><th>Insumo</th><th class="n">Pedidos</th><th class="n">Qtd. total</th><th class="n">Valor (R$)</th><th class="n">Último preço</th><th>Data</th><th class="n">Preço médio</th><th class="n">Mín. / máx.</th><th class="n">Variação</th><th>Onde foi lançado (Pagar &amp; Pago)</th></tr></thead><tbody>${L.map(g => `<tr class="clk" data-cod="${esc(g.cod)}"><td>${esc(g.cod)}</td><td>${esc(g.ins)}</td><td class="n">${g.L.length}</td><td class="n">${brl(g.qtd, 2)}</td><td class="n">${brl(g.v, 2)}</td><td class="n"><b>${brl(g.ult, 2)}</b></td><td class="sub">${fd(g.dUlt)}</td><td class="n">${brl(g.med, 2)}</td><td class="n sub">${brl(g.min, 2)} / ${brl(g.max, 2)}</td><td class="n ${g.var > 0.005 ? 'crit' : g.var < -0.005 ? 'okv' : ''}">${g.nP > 1 ? pct(g.var) : '–'}</td><td class="sub">${g.pp ? Object.entries(g.pp.nos).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n, v]) => esc((M.nodes[n] ? M.nodes[n].desc : n) + ' ' + Math.round(v / g.pp.v * 100) + '%')).join(' · ') : '<span class="sub">não lançado</span>'}</td></tr>`).join('')}</tbody></table>`;
    };
    draw();
    $('#cpq').oninput = e => { S.cpF.q = e.target.value; clearTimeout(S._cpq); S._cpq = setTimeout(draw, 200); };
    $('#cpso').onclick = e => { const v = e.target.dataset.v; if (v) { S.cpF.so = v; $('#cpso').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); draw(); } };
    $('#cpT').onclick = e => { const tr = e.target.closest('tr[data-cod]'); if (!tr) return; openIns(C.by[tr.dataset.cod]); };
  };
  function openIns(g) { openCalc(esc(g.cod + ' · ' + g.ins), `${g.L.length} pedidos · ${brl(g.qtd, 2)} un. · R$ ${brl(g.v, 2)} · último R$ ${brl(g.ult, 2)} · médio R$ ${brl(g.med, 2)}`, priceLine(g.L) + `<h3>Pedidos</h3><div class="tw">${cpTab(g.L)}</div>`); }
  function cpTab(L) { return `<table class="t"><thead><tr><th>Pedido</th><th>Insumo</th><th class="n">Qtd.</th><th class="n">Preço</th><th class="n">Valor (R$)</th><th>Estágio</th><th>Pedido em</th><th>Compra</th><th>Entrega</th><th class="n">Dias ped.→compra</th><th class="n">Dias compra→entrega</th></tr></thead><tbody>${L.map(r => `<tr><td>${esc(r.ped)}</td><td>${esc(r.cod)} · ${esc(r.ins)}</td><td class="n">${brl(r.qtd, 2)}</td><td class="n">${brl(r.pu, 2)}</td><td class="n">${brl(r.v, 2)}</td><td class="sub">${esc(r.est)}</td><td>${fd(r.dPed)}</td><td>${fd(r.dCompra)}</td><td>${fd(r.dEnt)}</td><td class="n">${r.ltPC == null ? '–' : r.ltPC}</td><td class="n">${r.ltCE == null ? '–' : r.ltCE}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="4">Total</td><td class="n">${brl(sum(L, r => r.v), 2)}</td><td colspan="6"></td></tr></tfoot></table>`; }
  /* no planejamento do serviço: materiais já comprados para ele, com o último preço praticado */
  function cpSection(id) {
    const C = compras(); if (!C) return '';
    const L = C.ins.filter(g => g.pp && g.pp.nos[id]).map(g => ({ g, sh: g.pp.nos[id] / g.pp.v })).sort((a, b) => b.g.v * b.sh - a.g.v * a.sh).slice(0, 25);
    if (!L.length) return `<section><h3>Compras deste serviço</h3><p class="empty">Nenhum insumo dos pedidos foi lançado neste serviço no Pagar &amp; Pago.</p></section>`;
    return `<section><h3>Compras deste serviço — preços praticados</h3><p class="hint">Insumos dos pedidos que já foram lançados neste serviço no Pagar &amp; Pago (parte = quanto do insumo foi lançado aqui). Use o <b>último preço</b> para estimar os materiais dos próximos meses; prazo médio do pedido à entrega: <b>${C.ltPC == null || C.ltCE == null ? '–' : brl(C.ltPC + C.ltCE, 1) + ' dias'}</b>.</p>
      <div class="tw" style="max-height:340px"><table class="t"><thead><tr><th>Insumo</th><th class="n">Qtd. pedida</th><th class="n">Último preço</th><th>Data</th><th class="n">Preço médio</th><th class="n">Variação</th><th class="n">Parte neste serviço</th><th class="n">Valor pedido (parte)</th></tr></thead><tbody>${L.map(({ g, sh }) => `<tr><td>${esc(g.cod)} · ${esc(g.ins)}</td><td class="n">${brl(g.qtd, 2)}</td><td class="n"><b>${brl(g.ult, 2)}</b></td><td class="sub">${fd(g.dUlt)}</td><td class="n">${brl(g.med, 2)}</td><td class="n">${g.nP > 1 ? pct(g.var) : '–'}</td><td class="n">${pct(sh)}</td><td class="n">${brl(g.v * sh, 2)}</td></tr>`).join('')}</tbody></table></div></section>`;
  }

  /* ===== FLUXO ===== */
  views.fluxo = function (el) {
    const Bs = Object.values(M.nodes).filter(n => n.lv === 'B');
    const L = S.fluxoB ? YM.scope(M, S.fluxoB).lanc : M.rp;
    const st = lancStats(L), [a, b] = win3();
    el.innerHTML = `<section class="card"><div class="ch"><h2>Fluxo de desembolso — Pagar &amp; Pago</h2>
      <select id="fb"><option value="">Obra toda</option>${Bs.map(B => `<option value="${B.id}" ${S.fluxoB === B.id ? 'selected' : ''}>${esc(B.id)} · ${esc(B.desc)}</option>`).join('')}</select></div>
      <div class="tiles">${tile('Total do relatório', 'R$ ' + brl(st.pago + st.ap))}${tile('Pago', 'R$ ' + brl(st.pago))}${tile('A pagar', 'R$ ' + brl(st.ap))}${tile('Vencido', 'R$ ' + brl(st.venc), 'antes de ' + fd(S.ref), st.venc ? 'crit' : '')}${tile('Próximos 3 meses', 'R$ ' + brl(st.j3), ml(a) + ' a ' + ml(b))}${tile('Após a janela', 'R$ ' + brl(st.apos))}</div>
      <div class="grid2"><div><h3>Por mês</h3><div class="tw" id="fm"></div></div><div><h3>Semanal — janela de 3 meses</h3><div class="tw" id="fw"></div></div></div>
      <h3>Por fornecedor</h3><input type="search" id="ffq" placeholder="Buscar fornecedor"><div class="tw tall" id="ff"></div>
      <h3>Por insumo</h3><div class="tw tall" id="fi"></div>
      <h3>Vencidos</h3><div class="tw tall" id="fv"></div></section>`;
    $('#fb').onchange = e => { S.fluxoB = e.target.value; render(); };
    // mês
    const ms = Object.keys(st.mes).sort();
    $('#fm').innerHTML = `<table class="t"><thead><tr><th>Mês</th><th class="n">Pago</th><th class="n">A pagar</th><th class="n">Total</th><th class="n">Previsto FLUXO-BASE</th></tr></thead><tbody>${ms.map(m => { const p = S.fluxoB ? (M.nodes[S.fluxoB].prev[m] || 0) : sum(Object.values(M.nodes).filter(n => n.lv === 'C'), n => n.prev[m] || 0); const o = st.mes[m]; return `<tr class="${m >= a && m <= b ? 'hl' : ''}"><td>${ml(m)}</td><td class="n">${brl(o.pg, 2)}</td><td class="n">${brl(o.ap, 2)}</td><td class="n">${brl(o.pg + o.ap, 2)}</td><td class="n sub">${brl(p)}</td></tr>`; }).join('')}</tbody><tfoot><tr><td>Total</td><td class="n">${brl(st.pago, 2)}</td><td class="n">${brl(st.ap, 2)}</td><td class="n">${brl(st.pago + st.ap, 2)}</td><td></td></tr></tfoot></table>`;
    // semanal
    const r = new Date(D(S.ref)); const dow = (r.getUTCDay() + 6) % 7; const w0 = D(S.ref) - dow * 864e5; const fimJ = Date.UTC(+b.slice(0, 4), +b.slice(5, 7), 0);
    let wr = '', acc = 0;
    for (let w = w0; w <= fimJ; w += 7 * 864e5) {
      const lo = Math.max(w, D(S.ref)), hi = Math.min(w + 6 * 864e5, fimJ);
      const xs = L.filter(x => x.ap && D(x.d) >= lo && D(x.d) <= hi); const v = sum(xs, x => x.ap); acc += v;
      wr += `<tr><td>${fd(new Date(w).toISOString().slice(0, 10))} – ${fd(new Date(w + 6 * 864e5).toISOString().slice(0, 10))}</td><td class="n">${brl(v, 2)}</td><td class="n">${xs.length || '–'}</td><td class="n sub">${brl(acc, 2)}</td></tr>`;
    }
    $('#fw').innerHTML = `<table class="t"><thead><tr><th>Semana</th><th class="n">A pagar</th><th class="n">Parcelas</th><th class="n">Acumulado</th></tr></thead><tbody>${wr}</tbody></table>`;
    // fornecedor
    const grp = (key) => { const o = {}; for (const x of L) { const k = key(x); const z = o[k] || (o[k] = { pg: 0, ap: 0, v: 0, j: 0 }); z.pg += x.pg; z.ap += x.ap; if (x.ap) { const mk = x.d.slice(0, 7); if (x.d < S.ref) z.v += x.ap; else if (mk <= b) z.j += x.ap; } } return Object.entries(o).sort((p, q) => q[1].j - p[1].j || q[1].ap - p[1].ap || q[1].pg - p[1].pg); };
    const gt = (rows, q) => `<table class="t"><thead><tr><th>Nome</th><th class="n">Pago</th><th class="n">A pagar</th><th class="n">Vencido</th><th class="n">A pagar até ${ml(b)}</th></tr></thead><tbody>${rows.filter(([k]) => !q || k.toLowerCase().includes(q)).map(([k, z]) => `<tr><td>${esc(k)}</td><td class="n">${brl(z.pg, 2)}</td><td class="n">${brl(z.ap, 2)}</td><td class="n ${z.v ? 'crit' : ''}">${brl(z.v, 2)}</td><td class="n"><b>${brl(z.j, 2)}</b></td></tr>`).join('')}</tbody></table>`;
    const FR = grp(x => x.forn); $('#ff').innerHTML = gt(FR, '');
    $('#ffq').oninput = e => { $('#ff').innerHTML = gt(FR, e.target.value.toLowerCase()); };
    $('#fi').innerHTML = gt(grp(x => x.ins), '');
    const V = L.filter(x => x.ap && x.d < S.ref).sort((p, q) => p.d.localeCompare(q.d));
    $('#fv').innerHTML = V.length ? `<table class="t"><thead><tr><th>Data</th><th class="n">Dias</th><th>Fornecedor</th><th>Insumo</th><th>Proc./Parc.</th><th class="n">A pagar</th></tr></thead><tbody>${V.map(x => `<tr><td>${fd(x.d)}</td><td class="n crit">${days(x.d, S.ref)}</td><td>${esc(x.forn)}</td><td>${esc(x.ins)}</td><td>${esc(x.proc)}/${esc(x.parc)}</td><td class="n">${brl(x.ap, 2)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="5">Total</td><td class="n">${brl(sum(V, x => x.ap), 2)}</td></tr></tfoot></table>` : '<p class="empty">Nenhum vencido.</p>';
  };

  /* ===== VÍNCULOS ===== */
  views.vinculos = function (el) {
    const C = Object.values(M.nodes).filter(n => n.lv === 'C' && !n.extra);
    const semTaskSvc = C.filter(n => !YM.scope(M, n.id).tasks.length && n.orc > 0);
    const herd = C.filter(n => n.herd && n.origem === 'etapa');
    const empr = C.filter(n => n.origem === 'semelhante' || n.origem === 'prazo');
    const extra = Object.values(M.nodes).filter(n => n.extra);
    const viaEtapa = M.rp.filter(x => x.via === 'etapa');
    const tsem = [...new Set(M.semTask.map(k => M.tasks[k].t))];
    const rules = {}; M.tasks.forEach(t => { const k = t.t; if (!rules[k]) rules[k] = { n: t.n, c: 0 }; rules[k].c++; });
    el.innerHTML = `<section class="card"><h2>Vínculos entre os arquivos</h2>
      <div class="tiles">${tile('Orçamento → FLUXO-BASE', (M.comps.length - M.semOrc.length) + ' de ' + M.comps.length + ' composições', 'pelos códigos ORÇ- das linhas da FLUXO-BASE')}
        ${tile('Relatório → serviço', (M.rp.length - viaEtapa.length) + ' de ' + M.rp.length + ' parcelas', viaEtapa.length + ' ligadas só pela etapa (R$ ' + brl(sum(viaEtapa, x => x.pg + x.ap)) + ')')}
        ${tile('Cronograma → serviço', (M.tasks.length - M.semTask.length) + ' de ' + M.tasks.length + ' atividades', M.semTask.length + ' sem serviço (' + tsem.join(', ') + ')')}</div>
      <h3>Como cada arquivo se liga</h3>
      <ul class="how"><li><b>Relatório Pagar &amp; Pago → serviço:</b> código do serviço (C00xxx) da FLUXO-BASE; senão Item EAP = ID UAU; senão código do insumo (P00xxx); senão a etapa.</li>
      <li><b>Orçamento → serviço:</b> item da composição (ex.: 01.01.02.01) = código ORÇ- na linha da FLUXO-BASE.</li>
      <li><b>Cronograma → serviço:</b> tabela de-para pelo nome da tarefa (abaixo). Sub-etapas sem tarefa própria usam as datas da etapa.</li></ul>
      ${extra.length ? `<h3>Lançamentos ligados só pela etapa</h3><div class="tw"><table class="t"><thead><tr><th>Serviço no relatório</th><th>Item EAP</th><th>Ficou em</th><th class="n">Valor</th></tr></thead><tbody>${Object.entries(viaEtapa.reduce((o, x) => { const k = x.srv + '|' + x.eap + '|' + x.n; o[k] = (o[k] || 0) + x.pg + x.ap; return o; }, {})).map(([k, v]) => { const [s, e, n] = k.split('|'); return `<tr><td>${esc(s)}</td><td>${esc(e)}</td><td>${esc(M.nodes[n].desc)}</td><td class="n">${brl(v, 2)}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
      <h3>Linhas desconsideradas por duplicidade (${M.dupTasks.length + M.dupRep.length})</h3>
      <p class="hint">A cada importação os dados são substituídos e, antes de qualquer conta, o aplicativo tira o que contaria duas vezes: no cronograma, linhas com a coluna Serviço que repetem uma atividade própria, a linha-resumo delas, linhas idênticas e IDs repetidos; no relatório, linhas repetidas (mesma Chave1, parcela, item e valores).</p>
      ${M.dupTasks.length ? `<div class="tw"><table class="t"><thead><tr><th>ID</th><th>Tarefa</th><th>Serviço (coluna do cronograma)</th><th>Local</th><th class="c">Atual</th><th>Motivo</th></tr></thead><tbody>${M.dupTasks.map(t => `<tr><td>${esc(t.id)}</td><td>${esc(t.t)}</td><td>${esc(t.srv || '—')}</td><td>${esc(t.l)}</td><td class="c">${fd(t.i)} – ${fd(t.f)}</td><td class="sub">${esc(t.motivo)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Nenhuma duplicidade no cronograma.</p>'}
      ${M.dupRep.length ? `<p class="crit">${M.dupRep.length} parcelas repetidas do relatório desconsideradas (R$ ${brl(sum(M.dupRep, x => x.pg + x.ap), 2)}).</p>` : '<p class="hint">Nenhuma parcela repetida no relatório.</p>'}
      <h3>Serviços com orçamento e sem tarefa no cronograma (${semTaskSvc.length})</h3><p class="hint">${semTaskSvc.map(n => esc(n.id + ' ' + n.desc)).join(' · ') || '—'}</p>
      <h3>Serviços do orçamento sem tarefa no cronograma — datas emprestadas (${empr.length})</h3>
      <p class="hint">Para o orçado inteiro entrar na conta mês a mês, estes serviços usam as datas das tarefas do serviço mais parecido (a tarefa continua ligada ao serviço dela). Se aparecer um serviço novo sem tarefa, ele é distribuído no prazo da obra.</p>
      ${empr.length ? `<div class="tw"><table class="t"><thead><tr><th>Serviço</th><th class="n">Orçado</th><th>Usa as datas de</th><th class="n">Tarefas</th><th class="c">Período</th></tr></thead><tbody>${empr.map(n => { const sc = YM.scope(M, n.id); const nm = [...new Set(sc.tasks.map(t => t.t))]; return `<tr><td>${esc(n.id + ' · ' + n.desc)}</td><td class="n">${brl(n.orc)}</td><td>${esc(nm.slice(0, 3).join(', ') + (nm.length > 3 ? '…' : ''))}${n.origem === 'prazo' ? ' <span class="crit">(sem tarefa parecida)</span>' : ''}</td><td class="n">${sc.tasks.length}</td><td class="c">${fd(sc.tasks.map(t => t.i).sort()[0])} – ${fd(sc.tasks.map(t => t.f).sort().at(-1))}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
      <h3>Sub-etapas usando as datas da etapa (${herd.length})</h3><p class="hint">${herd.map(n => esc(n.id + ' ' + n.desc)).join(' · ') || '—'}</p>
      <h3>De-para cronograma → serviço</h3><div class="tw tall"><table class="t"><thead><tr><th>Tarefa do cronograma</th><th class="n">Atividades</th><th>Serviço da FLUXO-BASE</th></tr></thead><tbody>${Object.entries(rules).sort().map(([t, o]) => `<tr><td>${esc(t)}</td><td class="n">${o.c}</td><td>${o.n ? esc(o.n + ' · ' + M.nodes[o.n].desc) : '<span class="crit">sem vínculo</span>'}</td></tr>`).join('')}</tbody></table></div>
      <p class="hint">Para mudar um vínculo do de-para, peça o ajuste — a tabela fica dentro do aplicativo.</p></section>`;
  };

  /* ===== IMPORTAR / EXPORTAR ===== */
  /* Revisão = ciclo do mês-alvo (mês seguinte à data de referência).
     Mesmo mês-alvo → mesma revisão (R10 baixada em 29/10 continua R10 se baixar de novo em 30/10, com a data nova no nome).
     Mês-alvo seguinte → R11, e assim por diante. Cada download é gerado na hora com os dados do aplicativo. */
  const LOGO = () => ($('header.top img').getAttribute('src') || '').split(',')[1] || '';
  const kindName = { caixa: 'Medição Caixa (FRE)', compras: 'Relação de Pedidos de Compras (UAU)', peso: 'Pesos das atividades (Prevision)', contratos: 'Relatório de contratos', report: 'Relatório Pagar & Pago', fluxobase: 'YAC-FLUXO (FLUXO-BASE)', crono: 'Cronograma', orc: 'Orçamento' };
  function dl(data, name, type) { const blob = data instanceof Blob ? data : new Blob([data], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000); }
  function revPlan() {
    const C = RAW.cur; if (!C) return null;
    // a revisão só avança quando o mês é fechado (botão "Fechar o mês"); até lá tudo atualiza a mesma revisão
    return { T: addM(compM(), 1), d: 0, rev: C.rev, keep: true, ok: true };
  }
  async function fecharMes(log) {
    const fin = await gerarRevisao(log); // revisão final da competência, com os dados de agora
    dl(YX.b64dec(fin.b64), fin.name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    RAW.fechadas = (RAW.fechadas || []).concat([{ rev: fin.rev, mes: compM(), name: fin.name, em: todayISO() }]);
    const nm = addM(compM(), 1);
    // planejamento: linhas do orçamento × cronograma e dos contratos são refeitas para a nova janela; as manuais ficam
    RAW.plano.lines = RAW.plano.lines.filter(l => !l.src); RAW.plano.auto = {}; RAW.plano.ok = {}; savePlano(); // os ok recomeçam no mês novo
    RAW.cur = { name: YX.fluxoName(fin.rev + 1, todayISO()), b64: fin.b64, base: fin.b64, rev: fin.rev + 1, mes: nm, target: addM(nm, 1), ref: S.ref, alter: null };
    rebuild(); alocApply(); savePlano(); // funcionários alocados seguem para a nova janela
    const nova = await gerarRevisao(log);
    if (log) log(`<b class="ok">Mês de ${ml(addM(nm, -1))} fechado.</b> ${esc(fin.name)} baixada como revisão final; agora o aplicativo trabalha na <b>R${String(nova.rev).padStart(2, '0')}</b> (competência ${ml(nm)} → fluxo ${ml(addM(nm, 1))} a ${ml(addM(nm, 3))}), partindo da R${String(fin.rev).padStart(2, '0')}.`);
    return nova;
  }
  /* alvos do planejamento: para cada serviço com linhas, FLUXO-BASE do mês = pago/a pagar do relatório + planejado, por insumo (D) */
  function planTargets() {
    const ms = M3(), planC = [...new Set(RAW.plano.lines.filter(l => M.nodes[l.node]).map(l => l.node))], set = new Set(planC), T = {}, oi = (RAW.fluxobase && RAW.fluxobase.orcIns) || {};
    const add = (k, m, v) => { if (!v) return; const o = T[k] || (T[k] = {}); o[m] = (o[m] || 0) + v; };
    for (const x of M.rp) { const m = x.d.slice(0, 7); if (!set.has(x.n) || !ms.includes(m)) continue; add(x.n + '|' + (x.ins || '').split(' - ')[0].trim(), m, x.pg + x.ap); }
    // o planejado é o total esperado do mês; o que já está no Pagar & Pago (consolidado) sai dele: entra só o que falta (planejado − consolidado, mínimo 0)
    const fat = {}; for (const id of planC) for (const m of ms) { const G = sum(planOf(id), l => lineVal(l, m)), Cc = repOf(id, m); fat[id + m] = G > 0 ? Math.max(G - Cc, 0) / G : 0; }
    for (const l of RAW.plano.lines) { if (!set.has(l.node)) continue; const k = l.it && oi[l.it] && oi[l.it].startsWith(l.node + '|') ? oi[l.it] : l.node + '|*'; for (const m of ms) add(k, m, lineVal(l, m) * fat[l.node + m]); }
    return { planC, targets: T };
  }
  const repOf = (id, m) => sum(M.rp.filter(x => x.n === id && x.d.slice(0, 7) === m), x => x.pg + x.ap);
  const fbAlvo = (G, Cc) => Cc + Math.max(G - Cc, 0); // consolidado + o que falta do planejado
  async function gerarRevisao(log) {
    const C = RAW.cur; if (!C) throw new Error('Importe a YAC-FLUXO para gerar a revisão.');
    const P = revPlan();
    // sempre parte da planilha do início do ciclo (revisão anterior): a revisão é refeita inteira com os dados atuais, sem acumular nada duas vezes
    const base = P.keep ? C.base : C.b64, fromBase = !!base;
    const PT = planTargets();
    const r = await YX.patchFluxo(YX.b64dec(fromBase ? base : C.b64).buffer, RAW.report, compM() + '-01', C.name, { keepMarks: fromBase ? false : P.keep, targets: PT.targets, planC: PT.planC });
    const x = await YP.openXlsx(r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength));
    const fm = {}; const R = await x.rows('FLUXO-BASE', 70, fm); RAW.fluxobase = YP.parseFluxoBase(R, fm);
    const lbl = 'R' + String(P.rev).padStart(2, '0');
    const novas = r.changes.map(c => ({ cod: c.cod, desc: c.desc, c: c.c, mes: c.mes, celula: c.celula, leaf: c.leaf, prev: c.prev, rep: c.rep, delta: c.delta, old: c.old, novo: c.novo, origem: c.origem || 'piso do relatório' }));
    let ch;
    if (fromBase) ch = novas;
    else { ch = P.keep && C.alter ? C.alter.changes.map(c => Object.assign({}, c)) : []; for (const n of novas) { const o = ch.find(c => c.celula === n.celula); if (o) { o.rep = n.rep; o.delta = +(o.delta + n.delta).toFixed(2); o.novo = n.novo; } else ch.push(n); } }
    RAW.cur = { name: YX.fluxoName(P.rev, todayISO()), b64: YX.b64enc(r.bytes), base: fromBase ? base : (P.keep ? null : C.b64), rev: P.rev, mes: compM(), target: P.T, ref: S.ref,
      alter: { revLabel: lbl, ref: S.ref, changes: ch, missing: r.missing, skipped: r.skipped, planC: PT.planC, realoc: r.realoc } };
    if (!RAW.cur.base) delete RAW.cur.base;
    RAW.reportHash = YX.hashReport(RAW.report); RAW.plano.aplicado = RAW.plano.upd || 0; try { localStorage.setItem(LSK, JSON.stringify(RAW.plano)); } catch (e) { }
    rebuild(); $('#src').innerHTML = srcInfo();
    if (log) log(`<b class="ok">✓</b> ${esc(RAW.cur.name)} ${P.keep ? 'atualizada' : 'gerada (nova revisão)'} com os dados do aplicativo: ${ch.length} células alteradas na revisão (${PT.planC.length ? PT.planC.length + ' serviços planejados = pago/a pagar + planejado; ' : ''}demais serviços: sobe só o que o relatório superar)${r.missing.length ? ` · ${r.missing.length} lançamentos sem linha na FLUXO-BASE` : ''}.`);
    return RAW.cur;
  }
  views.importar = function (el) {
    const C = RAW.cur, P = revPlan(), A = C && C.alter;
    const rl = P ? 'R' + String(P.rev).padStart(2, '0') : '';
    const hoje = todayISO(); const nomeF = P ? YX.fluxoName(P.rev, hoje) : 'YAC-FLUXO', nomeA = YX.analiseName(P ? P.rev : 0, hoje);
    const byM = {}; (A ? A.changes : []).forEach(c => byM[c.mes] = (byM[c.mes] || 0) + c.delta);
    el.innerHTML = `<section class="card"><h2>Atualizar dados</h2>
      <p>Arraste aqui os arquivos novos — de uma vez ou aos poucos. O aplicativo reconhece cada um pelo conteúdo e monta a lista abaixo; <b>a atualização só é aplicada quando as 4 obrigatórias estiverem lidas</b>: <b>Relatório Pagar &amp; Pago</b> (.xls), <b>Relatório de contratos</b> (.xls), <b>Cronograma</b> e <b>Orçamento</b>. Opcionais: <b>Pedidos de Compras</b>, <b>Pesos das atividades</b> e a YAC-FLUXO. A <b>YAC-FLUXO</b> é opcional: o aplicativo já guarda e gera a revisão.</p>
      <label class="drop" id="drop"><input type="file" id="fin" multiple accept=".xls,.xlsx,.xlsm"><span>Soltar arquivos aqui ou <u>escolher</u></span></label>
      <div id="stage"></div><div id="ilog"></div></section>
      <section class="card"><h2>Exportar planilhas</h2>
      <p class="hint">As planilhas são <b>geradas na hora do download</b> com os dados que estão no aplicativo. O <b>nome leva o dia do download</b> (hoje: <b>${fd(todayISO())}</b>); vencidos e semanas usam a data de referência do topo (<b>${fd(S.ref)}</b>). <b>Revisão atual: ${rl || '–'}</b> — competência <b>${C ? ml(compM()) : '–'}</b> (fluxo de ${C ? ml(addM(compM(), 1)) + ' a ' + ml(addM(compM(), 3)) : '–'}). Ela só muda quando vocês <b>fecham o mês</b> (quadro abaixo); até lá, toda atualização refaz a mesma revisão e só a data do nome muda.</p>
      ${P && !P.ok ? `<p class="crit">A data de referência é anterior ao ciclo da revisão atual (${esc(C.name)}). Ajuste a data no topo.</p>` : ''}
      <div class="exgrid">
        <div class="exbox"><h3>${esc(nomeF)}</h3>
          <p class="hint">Planilha de entrega com a aba FLUXO-BASE refeita com os dados atuais: nos serviços planejados (aba Programação fluxo) cada mês = <b>consolidado no Pagar &amp; Pago + o que falta do planejado</b>; nos demais o previsto fica e sobe só o que o relatório superar. As alterações da revisão ficam em vermelho e o resto do arquivo não é mexido.</p>
          <p class="sub">Revisão atual no aplicativo: <b>${esc(C ? C.name : '—')}</b>${A ? ` · ${A.changes.length} células alteradas no ciclo (${Object.entries(byM).sort().map(([m, v]) => ml(m) + ' +' + brl(v)).join(' · ') || 'sem acréscimo'})` : ''}${A && A.missing.length ? ` · <span class="crit">sem linha na FLUXO-BASE: ${[...new Set(A.missing.map(m => m.cod))].join(', ')}</span>` : ''}</p>
          <button id="xf" class="pri" ${C && P.ok ? '' : 'disabled'}>Baixar ${esc(nomeF)}</button></div>
        <div class="exbox"><h3>${esc(YX.cmpName(P ? P.rev : 0, hoje))}</h3>
          <p class="hint">Comparativo com o orçamento item por item: orçado, gasto ligado (pago e a pagar), saldo positivo/negativo, quantidade orçada e a coluna de quantidade executada para preencher (o saldo da quantidade se abate sozinho). Inclui a lista parcela × item com a regra de vínculo.</p>
          <button id="xc" class="pri" ${M.cmp ? '' : 'disabled'}>Baixar comparativo</button></div>
        <div class="exbox"><h3>${esc(YX.planoName(P ? P.rev : 0, hoje))}</h3>
          <p class="hint">Planejamento dos próximos 3 meses por serviço em R$ (materiais, mão de obra, equipamento): resumo pago/a pagar + planejado × FLUXO-BASE (tem que bater), as linhas e a lista de contratos com o saldo a medir estimado por mês. ${RAW.plano.lines.length} linhas no aplicativo.</p>
          <button id="xp" class="pri">Baixar planejamento</button></div>
        <div class="exbox"><h3>${esc(nomeA)}</h3>
          <p class="hint">Análise do fluxo: resumo, por mês, resumo por insumo, por insumo, por fornecedor, por serviço, semanal, vencidos, maiores parcelas, alterações da ${esc(rl)} e a base — fórmulas ligadas à data de referência.</p>
          <button id="xa" class="pri" ${C && P.ok ? '' : 'disabled'}>Baixar ${esc(nomeA)}</button></div>
      </div>
      ${C ? `<div class="exbox" style="margin-top:12px;border-color:#c9a227"><h3>Fechar o mês de ${ml(compM())} (${rl})</h3>
        <p class="hint">Use quando o mês estiver fechado. O aplicativo atualiza a <b>${rl}</b> com os dados de agora e baixa como <b>revisão final de ${ml(compM())}</b>; em seguida abre a <b>R${String(C.rev + 1).padStart(2, '0')}</b> (competência ${ml(addM(compM(), 1))} → fluxo ${ml(addM(compM(), 2))} a ${ml(addM(compM(), 4))}), partindo da ${rl}: os destaques em vermelho recomeçam e o planejamento é refeito para a nova janela (linhas do orçamento × cronograma e dos contratos voltam a ser puxadas; as manuais ficam).${RAW.fechadas && RAW.fechadas.length ? ' Já fechados: ' + RAW.fechadas.map(f => 'R' + String(f.rev).padStart(2, '0') + ' (' + ml(f.mes) + ', em ' + fd(f.em) + ')').join(' · ') + '.' : ''}</p>
        <button id="xfm" class="pri">Fechar ${ml(compM())} e abrir a R${String(C.rev + 1).padStart(2, '0')}</button></div>` : ''}
      <div class="imp-actions"><button id="dl">Baixar HTML atualizado</button><span class="hint">Cópia deste aplicativo com os dados e a revisão atuais — leve para outro computador e continue de onde parou.</span></div>
      <p class="hint">Tudo é feito aqui no navegador; nada é enviado para a internet.</p></section>`;
    const log = $('#ilog'); const L = h => { const d = document.createElement('div'); d.className = 'lg'; d.innerHTML = h; log.appendChild(d); return d; };
    const refresh = () => { const keep = log.innerHTML; views.importar(el); $('#ilog').innerHTML = keep; };
    /* importação em duas etapas: os arquivos ficam na lista e só entram no painel quando todos os obrigatórios estiverem lidos */
    S.stage = S.stage || {};
    const REQ = [['report', 'Relatório Pagar & Pago', '.xls do UAU'], ['contratos', 'Relatório de contratos', '.xls do UAU'], ['crono', 'Cronograma', '.xlsx (aba por período)'], ['orc', 'Orçamento', '.xlsx (aba Orçamento)']];
    const OPT = [['compras', 'Relação de Pedidos de Compras (UAU)', '.xls PEDIDO_####_A_#### — linhas quebradas são remontadas e itens excluídos ficam fora' + (RAW.compras ? ' (atual: ' + RAW.compras.itens.length + ' itens)' : '')], ['peso', 'Pesos das atividades (Prevision)', '.xlsx PESO_CRONOGRAMA — fica guardado; reimporte quando os pesos mudarem' + (RAW.peso ? ' (atual: ' + RAW.peso.rows.length + ' linhas)' : '')], ['caixa', 'Medição Caixa (YAC-FINAN-MEDIÇÃO_CAIXA)', '.xlsx com as abas MEDIÇÃO e CURVA — pesos da Caixa (FRE)' + (RAW.caixa ? ' (atual: ' + RAW.caixa.name + ')' : '')], ['fluxobase', 'YAC-FLUXO (FLUXO-BASE)', 'só se a planilha de entrega foi mudada fora do aplicativo — o aplicativo já guarda a revisão ' + (RAW.cur ? RAW.cur.name : '') ]];
    const drawStage = () => {
      const st = S.stage, falta = REQ.filter(([k]) => !st[k]);
      const li = ([k, n, d], req) => { const r = st[k]; return `<tr><td>${r ? '<b class="ok">✓</b>' : req ? '<b class="crit">○</b>' : '<span class="sub">○</span>'}</td><td><b>${n}</b> ${req ? '' : '<span class="sub">(opcional)</span>'}<br><span class="sub">${esc(d)}</span></td><td>${r ? esc(r.file.name) + ' <span class="sub">· ' + esc(r.info) + '</span>' : (req ? '<span class="crit">falta importar</span>' : '<span class="sub">—</span>')}</td><td>${r ? `<button class="mini" data-rm="${k}">tirar</button>` : ''}</td></tr>`; };
      $('#stage').innerHTML = `<h3 style="margin:14px 0 6px">Planilhas desta atualização</h3><div class="tw"><table class="t"><thead><tr><th></th><th>Planilha</th><th>Arquivo lido</th><th></th></tr></thead><tbody>${REQ.map(x => li(x, true)).join('')}${OPT.map(x => li(x, false)).join('')}</tbody></table></div>
        <div class="imp-actions"><button class="pri" id="apply" ${falta.length ? 'disabled' : ''}>Aplicar atualização</button><span class="hint">${falta.length ? `Faltam ${falta.length}: <b>${falta.map(x => x[1]).join(', ')}</b>. Nada muda no painel até todas estarem aqui.` : 'Todas as obrigatórias lidas. Ao aplicar, os dados antigos são <b>substituídos</b> (nada soma em cima do que já havia).'}</span>${Object.keys(st).length ? '<button class="ghost" id="stclr">Limpar lista</button>' : ''}</div>`;
    };
    const info = r => r.kind === 'report' ? r.data.length + ' parcelas' : r.kind === 'contratos' ? new Set(r.data.itens.map(i => i.ct)).size + ' contratos · ' + r.data.itens.length + ' itens' : r.kind === 'crono' ? r.data.tasks.length + ' atividades' : r.kind === 'orc' ? r.data.comps.length + ' itens' : r.kind === 'fluxobase' ? Object.values(r.data.nodes).filter(n => n.lv === 'C').length + ' serviços' : r.kind === 'peso' ? r.data.rows.length + ' linhas de peso' : r.kind === 'caixa' ? r.data.meds.length + ' Meds · medição ' + (r.data.mesMed || '') : r.kind === 'compras' ? r.data.itens.length + ' itens de pedido' + (r.data.excluidos ? ' · ' + r.data.excluidos + ' excluídos fora' : '') + (r.data.ambiguas ? ' · ' + r.data.ambiguas + ' nomes a conferir' : '') : '';
    async function handle(files) {
      for (const f of files) {
        const row = L('Lendo ' + esc(f.name) + '…');
        try { const r = await YP.identify(f); r.file = f; r.info = info(r); const tr = S.stage[r.kind]; S.stage[r.kind] = r; row.innerHTML = `<b class="ok">✓</b> ${esc(f.name)} → ${kindName[r.kind]}${tr ? ' (substitui ' + esc(tr.file.name) + ')' : ''}`; }
        catch (e) { row.innerHTML = `<b class="crit">✗</b> ${esc(f.name)}: ${esc(e.message)}`; }
      }
      drawStage();
    }
    async function apply() {
      const got = Object.values(S.stage);
      const order = { fluxobase: 0, orc: 1, crono: 2, report: 3, contratos: 4, peso: 5, compras: 6, caixa: 7 }; got.sort((a, b) => order[a.kind] - order[b.kind]);
      try {
        for (const r of got) {
          if (r.kind === 'fluxobase') {
            const u8 = new Uint8Array(await r.file.arrayBuffer());
            const dt = YX.dateOf(r.file.name) || S.ref;
            RAW.cur = { name: r.file.name, b64: YX.b64enc(u8), base: YX.b64enc(u8), rev: YX.revOf(r.file.name) || 0, mes: dt.slice(0, 7), target: addM(dt.slice(0, 7), 1), ref: dt, alter: null };
            RAW.fluxobase = r.data;
          } else if (r.kind === 'caixa') { const u8 = new Uint8Array(await r.file.arrayBuffer()); RAW.caixa = Object.assign(r.data, { name: r.file.name, b64: YX.b64enc(u8) }); }
          else RAW[r.kind] = r.data;
        }
        S.stage = {};
        rebuild(); $('#src').innerHTML = srcInfo();
        if (RAW.cur) { L('Atualizando a YAC-FLUXO com o relatório, os contratos e o planejamento…'); await gerarRevisao(L); }
        L('<b class="ok">Painel atualizado com ' + got.length + ' planilhas.</b> Os downloads abaixo saem com estes dados.');
        setTimeout(refresh, 50);
      } catch (e) { console.error(e); L('<b class="crit">Erro: ' + esc(e.message) + '</b>'); }
    }
    drawStage();
    $('#stage').onclick = e => {
      if (e.target.closest('#apply')) { e.target.disabled = true; apply(); return; }
      if (e.target.closest('#stclr')) { S.stage = {}; drawStage(); return; }
      const b = e.target.closest('button[data-rm]'); if (b) { delete S.stage[b.dataset.rm]; drawStage(); }
    };
    $('#fin').onchange = e => handle([...e.target.files]);
    const dr = $('#drop');
    dr.ondragover = e => { e.preventDefault(); dr.classList.add('over'); };
    dr.ondragleave = () => dr.classList.remove('over');
    dr.ondrop = e => { e.preventDefault(); dr.classList.remove('over'); handle([...e.dataTransfer.files]); };
    const busy = async (b, fn) => { const t = b.textContent; b.disabled = true; b.textContent = 'Gerando…'; try { await fn(); } catch (e) { console.error(e); L('<b class="crit">' + esc(e.message) + '</b>'); } b.disabled = false; b.textContent = t; };
    $('#xf').onclick = () => busy($('#xf'), async () => { const c = await gerarRevisao(L); dl(YX.b64dec(c.b64), c.name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); setTimeout(refresh, 50); });
    $('#xa').onclick = () => busy($('#xa'), async () => {
      const c = await gerarRevisao(L);
      const blob = await YX.buildAnalise(RAW.report, S.ref, { logo: LOGO(), alter: c.alter });
      dl(blob, YX.analiseName(c.rev, todayISO())); setTimeout(refresh, 50);
    });
    $('#xc').onclick = () => busy($('#xc'), async () => {
      const c = RAW.cur ? await gerarRevisao(L) : null; const rev = c ? c.rev : 0;
      const blob = await YX.buildComparativo(M, cmpRows(), S.ref, { logo: LOGO(), rev, fluxo: RAW.cur ? RAW.cur.name : '' });
      dl(blob, YX.cmpName(rev, todayISO()));
    });
    if ($('#xfm')) $('#xfm').onclick = e => { const b = e.target; if (!b.dataset.ok) { b.dataset.ok = 1; b.textContent = 'Confirmar: fechar ' + ml(compM()) + '? (clique de novo)'; setTimeout(() => { if (b.isConnected) { b.dataset.ok = ''; b.textContent = 'Fechar ' + ml(compM()) + ' e abrir a R' + String(RAW.cur.rev + 1).padStart(2, '0'); } }, 5000); return; } busy(b, async () => { await fecharMes(L); setTimeout(refresh, 50); }); };
    $('#xp').onclick = () => busy($('#xp'), async () => {
      ctEst(); const rev = RAW.cur ? revPlan().rev : 0;
      const blob = await YX.buildPlano(M, RAW.plano, S.ref, { comp: compM(), logo: LOGO(), fluxo: RAW.cur ? RAW.cur.name : '' });
      dl(blob, YX.planoName(rev, todayISO()));
    });
    $('#dl').onclick = () => {
      const clean = JSON.stringify(RAW, (k, v) => (k === 'k' || k === 'n' || k === 'via' || k === 'g') ? undefined : v).replace(/</g, '\\u003c');
      const html = PRISTINE.replace(/(<script id="raw-data" type="application\/json">)[\s\S]*?(<\/script>)/, (m, a, b) => a + clean + b);
      dl(new Blob([html], { type: 'text/html' }), 'Obra_YACHT_painel_' + (RAW.cur ? RAW.cur.name.replace(/\.xlsx$/i, '').replace('YAC-FLUXO-', '') : todayISO()) + '.html');
    };
  };

  /* ---------------- início ---------------- */
  $('#ref').value = S.ref;
  $('#ref').onchange = e => { if (e.target.value) { S.ref = e.target.value; render(); } };
  document.querySelector('nav').onclick = e => { const b = e.target.closest('button[data-v]'); if (b) { S.view = b.dataset.v; if (S.view === 'comparativo' && S.cmpF) S.cmpF.open.clear(); render(); } };
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (S.view !== 'importar') render(); }, 250); });
  try { loadPlano(); rebuild(); render(); } catch (e) { $('#main').innerHTML = '<p class="crit">Erro ao carregar: ' + esc(e.message) + '</p>'; console.error(e); }
  window.__app = { get M() { return M; }, S, render, openFicha };
})();
