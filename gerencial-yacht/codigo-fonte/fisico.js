/* Avanço físico pelo peso das atividades (planilha "PESO_CRONOGRAMA" do Prevision) × cronograma */
(function (G) {
  const YF = {};
  const num = v => typeof v === 'number' ? v : (parseFloat(String(v || '').replace(',', '.')) || 0);
  YF.is = R => R && R.slice(0, 6).some(r => r && r.some(v => /PESO POR ATIVIDADE/i.test(String(v || ''))));
  /* uma linha por (item do orçamento × tarefa × lote): peso % dentro do item e peso da atividade na obra */
  YF.parse = function (R) {
    const hr = R.findIndex(r => r && r.some(v => /PESO POR ATIVIDADE/i.test(String(v || ''))));
    if (hr < 0) throw new Error('Planilha de pesos: cabeçalho não encontrado');
    const H = R[hr].map(v => String(v || '').trim()); const f = p => H.findIndex(h => h.toUpperCase().startsWith(p.toUpperCase()));
    const c = { n: f('Nível'), cod: f('Código'), d: f('Descrição'), custo: f('Custo'), t: f('Pacote de trabalho'), s: f('Serviço'), l: f('Lote'), pi: f('Peso (%'), w: f('PESO POR ATIVIDADE') };
    const rows = [], seen = new Set();
    for (const x of R.slice(hr + 1)) {
      if (!x || !x[c.cod] || !x[c.t]) continue;
      const r = { niv: String(x[c.n] || ''), cod: String(x[c.cod]).trim(), d: String(x[c.d] || '').trim(), custo: num(x[c.custo]), t: String(x[c.t]).trim(), l: String(x[c.l] || '').trim(), pi: num(x[c.pi]), w: num(x[c.w]) };
      const k = [r.cod, r.t, r.l, r.pi, r.w].join('|'); if (seen.has(k)) continue; seen.add(k); // linha repetida conta uma vez
      rows.push(r);
    }
    return { rows };
  };

  const D = s => s ? new Date(s + 'T00:00:00Z').getTime() : null, DAY = 864e5;
  const addM = (k, n) => { let y = +k.slice(0, 4), m = +k.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + String(m + 1).padStart(2, '0'); };
  const endOf = k => Date.UTC(+k.slice(0, 4), +k.slice(5, 7), 1) - DAY; // último dia do mês
  // fração linear por dias corridos (início e término inclusive) até o fim do dia t
  const frac = (a, b, t) => { if (a == null || b == null) return 0; const A = D(a), B = D(b) + DAY; if (t + DAY <= A) return 0; if (t + DAY >= B) return 1; return (t + DAY - A) / (B - A); };
  YF.DISC = { IND: 'Indiretos', INF: 'Infraestrutura', FUN: 'Fundação', EST: 'Estrutura', VED: 'Vedação', IMP: 'Impermeabilização', HID: 'Hidrossanitário', ELE: 'Elétrica', INS: 'Instalações enterradas', ARC: 'Ar-condicionado', REV: 'Revestimentos', PIS: 'Pisos', PIN: 'Pintura', ESQ: 'Esquadrias', FOR: 'Forros', LOU: 'Louças e metais', FAC: 'Fachada', COB: 'Cobertura', ELV: 'Elevadores', PAI: 'Paisagismo', LIM: 'Limpeza', GAS: 'Gás', INC: 'Incêndio', MAR: 'Marcenaria', SER: 'Serralheria', VID: 'Vidros', ACA: 'Acabamentos', REB: 'Reboco', CLI: 'Climatização', MOB: 'Mobiliário' };

  /* tasks: tarefas do cronograma já sem duplicidade; refISO: data de referência (o realizado vai até ela) */
  YF.build = function (tasks, peso, refISO, rp) {
    const key = (t, l) => t + '|' + l;
    const W = {};
    for (const r of peso.rows) { const o = W[key(r.t, r.l)] || (W[key(r.t, r.l)] = { w: 0, custo: 0, itens: [] }); o.w += r.w; o.custo += r.custo * r.pi / 100; o.itens.push(r); }
    const ref = D(refISO);
    const T = []; const usados = new Set();
    for (const t of tasks) {
      const k = key(t.t, t.l), o = W[k]; if (!o || usados.has(k)) continue; usados.add(k); // a mesma tarefa/lote pesa uma vez
      const durA = t.i && t.f ? (D(t.f) - D(t.i)) / DAY + 1 : null;
      // realizado (o cronograma não traz % concluído): término real = 100%; iniciada sem término = tempo decorrido ÷ duração atual (máx. 95%)
      const prog = tt => { if (!t.ri || D(t.ri) > tt) return 0; if (t.rf && D(t.rf) <= tt) return 1; if (t.rf) return frac(t.ri, t.rf, tt); if (!durA) return 0.5; return Math.min(0.95, ((tt - D(t.ri)) / DAY + 1) / durA); };
      T.push({ t, w: o.w, custo: o.custo, itens: o.itens, disc: t.pre, prog,
        base: tt => frac(t.bi, t.bf, tt), atual: tt => frac(t.i, t.f, tt) });
    }
    const Wt = T.reduce((a, x) => a + x.w, 0) || 1, Ct = T.reduce((a, x) => a + x.custo, 0);
    const semPeso = tasks.filter(t => !W[key(t.t, t.l)]);
    // meses do gráfico: do primeiro início ao último término
    let a = null, b = null; for (const x of T) for (const s of [x.t.bi, x.t.i, x.t.ri]) if (s && (!a || s < a)) a = s; for (const x of T) for (const s of [x.t.bf, x.t.f, x.t.rf]) if (s && (!b || s > b)) b = s;
    const months = []; for (let m = a.slice(0, 7); m <= b.slice(0, 7); m = addM(m, 1)) months.push(m);
    const refM = refISO.slice(0, 7);
    const at = (tt, f) => T.reduce((s, x) => s + x.w * f(x, tt), 0) / Wt;
    const atC = (tt, f) => T.reduce((s, x) => s + x.custo * f(x, tt), 0);
    const cum = { base: {}, atual: {}, real: {}, vp: {}, va: {}, vpA: {}, cr: {} };
    for (const m of months) {
      const e = endOf(m), er = Math.min(e, ref);
      cum.base[m] = at(e, (x, tt) => x.base(tt)); cum.atual[m] = at(e, (x, tt) => x.atual(tt));
      cum.vp[m] = atC(e, (x, tt) => x.base(tt)); cum.vpA[m] = atC(e, (x, tt) => x.atual(tt));
      if (m <= refM) { cum.real[m] = at(er, (x, tt) => x.prog(tt)); cum.va[m] = atC(er, (x, tt) => x.prog(tt)); }
    }
    // custo real acumulado (Pagar & Pago com data até o fim do mês / até a referência)
    if (rp) { const byM = {}; for (const x of rp) { const m = x.d.slice(0, 7); if (x.d > refISO) continue; byM[m] = (byM[m] || 0) + x.pg + x.ap; } let s = 0; for (const m of months) { s += byM[m] || 0; if (m <= refM) cum.cr[m] = s; } }
    const mes = {}; months.forEach((m, i) => { const p = i ? months[i - 1] : null; mes[m] = { base: cum.base[m] - (p ? cum.base[p] : 0), atual: cum.atual[m] - (p ? cum.atual[p] : 0), real: m <= refM ? cum.real[m] - (p ? cum.real[p] || 0 : 0) : null }; });
    const now = { base: at(ref, (x, tt) => x.base(tt)), atual: at(ref, (x, tt) => x.atual(tt)), real: at(ref, (x, tt) => x.prog(tt)), vp: atC(ref, (x, tt) => x.base(tt)), va: atC(ref, (x, tt) => x.prog(tt)), cr: rp ? rp.filter(x => x.d <= refISO).reduce((s, x) => s + x.pg + x.ap, 0) : 0 };
    // detalhe por tarefa na data de referência
    for (const x of T) { x.pb = x.base(ref); x.pa = x.atual(ref); x.pr = x.prog(ref); x.atraso = Math.max(0, x.pb - x.pr); }
    // contribuição de cada tarefa num mês (medido no mês = diferença do realizado entre o fim do mês anterior e o fim do mês)
    const noMes = m => { const e = Math.min(endOf(m), ref), s = endOf(addM(m, -1)); return T.map(x => ({ x, r: m <= refM ? Math.max(0, x.prog(e) - x.prog(s)) : 0, b: x.base(endOf(m)) - x.base(s), a: x.atual(endOf(m)) - x.atual(s) })).filter(o => o.r > 1e-6 || o.b > 1e-6 || o.a > 1e-6); };
    const grp = f => { const o = {}; for (const x of T) { const k = f(x); const g = o[k] || (o[k] = { k, w: 0, custo: 0, b: 0, a: 0, r: 0, n: 0, ini: null, fim: null, iniA: null, fimA: null, iniR: null, fimR: null, xs: [] });
      g.w += x.w; g.custo += x.custo; g.b += x.w * x.pb; g.a += x.w * x.pa; g.r += x.w * x.pr; g.n++; g.xs.push(x);
      const mn = (p, v) => v && (!g[p] || v < g[p]) ? v : g[p], mx = (p, v) => v && (!g[p] || v > g[p]) ? v : g[p];
      g.ini = mn('ini', x.t.bi); g.fim = mx('fim', x.t.bf); g.iniA = mn('iniA', x.t.i); g.fimA = mx('fimA', x.t.f); g.iniR = mn('iniR', x.t.ri); g.fimR = mx('fimR', x.t.rf || (x.t.ri ? refISO : null)); }
      return Object.values(o).map(g => Object.assign(g, { pb: g.b / (g.w || 1), pa: g.a / (g.w || 1), pr: g.r / (g.w || 1) })); };
    // por item do orçamento (como na planilha de pesos): cada linha de peso conta com o avanço da sua atividade
    const porItem = (() => { const o = {}; for (const x of T) for (const r of x.itens) { const g = o[r.cod] || (o[r.cod] = { k: r.cod, lbl: r.cod + ' · ' + r.d, w: 0, b: 0, a: 0, r: 0, custo: 0, xs: new Set() }); g.w += r.w; g.b += r.w * x.pb; g.a += r.w * x.pa; g.r += r.w * x.pr; g.custo += r.custo * r.pi / 100; g.xs.add(x); }
      return Object.values(o).map(g => Object.assign(g, { xs: [...g.xs], pb: g.b / (g.w || 1), pa: g.a / (g.w || 1), pr: g.r / (g.w || 1) })).sort((a, b) => a.k.localeCompare(b.k, undefined, { numeric: true })); })();
    return { T, Wt, Ct, months, cum, mes, now, semPeso, refM, noMes, porItem, porDisc: grp(x => x.disc), porLote: grp(x => x.t.l), grp, linhas: peso.rows.length };
  };
  G.YF = YF;
})(typeof globalThis !== 'undefined' ? globalThis : window);
