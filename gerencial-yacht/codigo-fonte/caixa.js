/* MEDIÇÃO CAIXA — planilha "YAC-FINAN-MEDIÇÃO_CAIXA" (EAP FRE: Etapa › Sub-Etapa › Serviço › Med)
   Os pesos são os da Caixa (incidência FRE de cada Med), independentes do orçamento e dos pesos internos.
   O avanço de cada Med vem das tarefas do cronograma listadas na observação da própria planilha ("Cronograma: ..."),
   filtradas pelo pavimento/pano do Med; dentro do Med cada tarefa pesa pela duração. */
(function (G) {
  const YCX = {};
  const DAY = 864e5;
  const D = s => s ? new Date(s + 'T00:00:00Z').getTime() : null;
  const ISO = t => new Date(t).toISOString().slice(0, 10);
  const addM = (k, n) => { let y = +k.slice(0, 4), m = +k.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + String(m + 1).padStart(2, '0'); };
  const endOf = k => Date.UTC(+k.slice(0, 4), +k.slice(5, 7), 1) - DAY;
  const frac = (A, B, t) => { if (A == null || B == null) return 0; if (t + DAY <= A) return 0; if (t + DAY >= B + DAY) return 1; return (t + DAY - A) / (B + DAY - A); };
  const colName = i => { let s = ''; i++; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
  const serialISO = v => typeof v === 'number' ? ISO(Date.UTC(1899, 11, 30) + Math.round(v) * DAY) : null;
  const isoSerial = s => Math.round((D(s) - Date.UTC(1899, 11, 30)) / DAY);

  YCX.is = names => names.includes('MEDIÇÃO') && names.includes('CURVA');

  YCX.parse = async function (x) {
    const R = await x.rows('MEDIÇÃO');
    const hr = R.findIndex(r => r && r[0] === 'Tipo' && r.includes('Incidência FRE'));
    if (hr < 0) throw new Error('Medição Caixa: cabeçalho (Tipo … Incidência FRE) não encontrado');
    const H = R[hr].map(v => String(v == null ? '' : v));
    const ix = n => H.indexOf(n);
    const c = { tp: 0, et: ix('Etapa'), det: ix('Desc. Etapa'), sub: ix('Sub-Etapa'), dsub: ix('Desc. Sub-Etapa'), sv: ix('Serviço'), dsv: ix('Desc. Serviço'), cod: ix('Cód.'), d: ix('Descrição'), un: ix('Un'), q: ix('Qtd'), custo: ix('Custo (R$)'), w: ix('Peso no nível superior'), inc: ix('Incidência FRE'), obs: ix('Observação / origem') };
    const mc = []; H.forEach((h, i) => { const k = /^(\d{2})\/(\d{4})$/.exec(h); if (k) mc.push([i, k[2] + '-' + k[1]]); });
    if (!mc.length) throw new Error('Medição Caixa: colunas de meses (MM/AAAA) não encontradas');
    // mês da medição: célula com nome MesMedicao (L4) — procura a data na linha "Mês da medição atual"
    let mesMed = null, custoTot = null, metas = [];
    for (let r = 0; r < hr; r++) { const x2 = R[r] || []; x2.forEach((v, j) => {
      if (/Mês da medição atual/i.test(String(v || ''))) { for (let k = j + 1; k < x2.length; k++) if (typeof x2[k] === 'number') { mesMed = serialISO(x2[k]).slice(0, 7); break; } }
      if (/Custo total/i.test(String(v || ''))) { for (let k = j + 1; k < x2.length; k++) if (typeof x2[k] === 'number') { custoTot = x2[k]; break; } }
      if (/^\s*META\b/i.test(String(v || ''))) metas.push(String(v).trim());
    }); }
    const rows = [], meds = [];
    for (let r = hr + 1; r < R.length; r++) {
      const x2 = R[r]; if (!x2 || !x2[c.tp]) continue;
      const o = { row: r + 1, tipo: x2[c.tp], et: String(x2[c.et] || ''), det: x2[c.det] || '', sub: String(x2[c.sub] || ''), dsub: x2[c.dsub] || '', sv: String(x2[c.sv] || ''), dsv: x2[c.dsv] || '', cod: String(x2[c.cod] || ''), d: String(x2[c.d] || '').trim(), un: x2[c.un] || '', q: typeof x2[c.q] === 'number' ? x2[c.q] : null, custo: +x2[c.custo] || 0, w: +x2[c.w] || 0, inc: +x2[c.inc] || 0, obs: String(x2[c.obs] || '') };
      if (o.tipo === 'Med') { o.h = {}; for (const [i, m] of mc) if (typeof x2[i] === 'number' && x2[i]) o.h[m] = x2[i]; meds.push(o); }
      rows.push(o);
    }
    // curva prevista FRE
    const fre = {}; const C = await x.rows('CURVA');
    if (C) for (const r of C) { if (!r) continue; const n = r.findIndex(v => typeof v === 'number' && v > 40000 && v < 60000); if (n < 0) continue; const m = serialISO(r[n]).slice(0, 7); const p = r[n + 1], a = r[n + 2]; if (typeof p === 'number' && typeof a === 'number') fre[m] = { p, a }; }
    return { mesMed, custoTot, metas, months: mc.map(x2 => x2[1]), mcol: Object.fromEntries(mc.map(([i, m]) => [m, colName(i)])), rows, meds, fre, incTot: meds.reduce((s, m) => s + m.inc, 0) };
  };

  /* pavimento / pano do Med → lote do cronograma */
  YCX.lotOf = function (d, lots) {
    const L = new Set(lots); const ok = s => L.has(s) ? s : null; let k;
    if ((k = /^Pav\. (\d+) – (.+)$/.exec(d))) {
      const n = +k[1], rest = k[2];
      if (n === 1) return ok(/externa/i.test(rest) ? 'Pav Térreo Externo' : 'Pav Térreo');
      if (n === 2) return ok('Pav 02 - G1'); if (n === 3) return ok('Pav 03 - G2');
      if (n >= 4 && n <= 34) return ok('Pav ' + String(n).padStart(2, '0') + ' - Tipo');
      if (n === 35) return ok('Pav 35 - Rooftop / Piscina'); if (n === 36) return ok('Pav 36 - Barrilete'); if (n === 37) return ok('Pav 37 - Reservatório');
      return null;
    }
    if (/^Subsolo técnico$/i.test(d)) return ok('Subsolo Técnico');
    if ((k = /^Poço elevador Social (\d+)/i.exec(d))) return ok('Elev. Social ' + String(+k[1]).padStart(2, '0'));
    if (/^Poço elevador Emerg/i.test(d)) return ok('Elev. Emerg.');
    if (/^Cremalheira \(fechamento\)/i.test(d)) return ok('Cremalheira');
    if (/faixa da cremalheira/i.test(d)) return ok('Fachada Cremalheira');
    if ((k = /^Fachada (Norte|Sul|Leste|Oeste) – Pav\. (.+)$/i.exec(d))) {
      const tok = /Térreo/i.test(k[2]) ? 'Térreo' : /^04/.test(k[2]) ? '04' : /^16/.test(k[2]) ? '16' : null;
      return lots.find(l => l.includes('Fachada ' + k[1]) && tok && l.includes(tok)) || null;
    }
    return undefined; // Med sem pavimento: vale para todos os lotes
  };

  /* liga cada Med às tarefas do cronograma (nome da observação, com o lote do pavimento) */
  YCX.link = function (data, tasks, lots) {
    const byName = {}; for (const t of tasks) (byName[t.t] || (byName[t.t] = [])).push(t);
    const names = Object.keys(byName);
    // nomes citados em qualquer Med (para o fallback não pegar tarefa que já é de outro Med)
    const citados = new Set(); for (const md of data.meds) { const ob = (md.obs || '').replace(/^▶ ESTRATÉGIA[^|]*\|?\s*/, ''); if (/^Cronograma:/i.test(ob)) ob.replace(/^Cronograma:\s*/i, '').split(';').forEach(n => { n = n.trim(); names.filter(x => x === n || x.startsWith(n.replace(/\)$/, ''))).forEach(x => citados.add(x)); }); }
    for (const md of data.meds) {
      md.tasks = []; md.nomes = []; md.lot = null; md.flag = '';
      md.est = /^▶ ESTRATÉGIA/.test(md.obs || ''); if (md.est) { const k = /^▶ ESTRATÉGIA[^:]*:\s*([^|]*)\|?\s*(.*)$/.exec(md.obs); md.tatica = k ? k[1].trim() : ''; }
      const o = (md.obs || '').replace(/^▶ ESTRATÉGIA[^|]*\|?\s*/, ''); if (!/^Cronograma:/i.test(o)) { md.flag = 'manual'; continue; }
      md.nomes = o.replace(/^Cronograma:\s*/i, '').split(';').map(s => s.trim()).filter(Boolean);
      const lot = YCX.lotOf(md.d, lots); md.lot = lot === undefined ? null : lot;
      if (lot === null) { md.flag = 'pavimento não encontrado no cronograma'; }
      for (const n of md.nomes) {
        let nm = byName[n] ? [n] : names.filter(x => x.startsWith(n.replace(/\)$/, '')));
        if (!nm.length) { // pacote resumo que o cronograma não traz (ex.: "FUN - Blocão"): usa as tarefas da mesma disciplina com o mesmo termo que nenhum outro Med usa
          const k = /^([A-Z]+) - (.+)$/.exec(n); if (k) { const re = new RegExp('(^|\\s)' + k[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$|\\))', 'i'); nm = names.filter(x => x.startsWith(k[1] + ' - ') && re.test(x.slice(k[1].length + 3)) && !citados.has(x)); if (nm.length) md.fallback = nm; } }
        for (const k of nm) for (const t of byName[k]) if (lot === undefined || t.l === lot) md.tasks.push(t);
      }
      md.tasks = [...new Set(md.tasks)];
      if (!md.tasks.length && !md.flag) md.flag = 'tarefa não encontrada no cronograma';
    }
  };

  /* avanço de uma tarefa: realizado até a referência (como no físico: término real = 100%, iniciada = decorrido ÷ duração, máx. 95%)
     e previsão depois dela (linear por dias corridos até o término; atrasada recomeça no dia seguinte à referência).
     lev: { ant: dias de antecipação, ritmo: fator do calendário restante (0,8 = tudo que falta em 80% do prazo) } — só mexe no que ainda não foi feito */
  YCX.taskFn = function (t, ref, lev) {
    const i = D(t.i || t.bi), f = D(t.f || t.bf), dur = i != null && f != null ? (f - i) / DAY + 1 : 1;
    const real = tt => { if (!t.ri || D(t.ri) > tt) return 0; if (t.rf && D(t.rf) <= tt) return 1; if (t.rf) return frac(D(t.ri), D(t.rf), tt); return Math.min(0.95, ((tt - D(t.ri)) / DAY + 1) / dur); };
    const p0 = real(ref); if (p0 >= 1) return { p0, fut: () => 1, fim: t.rf, dur, ini: t.ri };
    const ant = lev && lev.ant ? lev.ant : 0, rt = lev && lev.ritmo ? lev.ritmo : 1;
    let a, b;
    if (p0 > 0) { const restante = Math.max(1, f != null && f > ref ? (f - ref) / DAY : Math.ceil(dur * (1 - p0))); a = ref + DAY; b = Math.max(a, ref + Math.round(restante * rt - ant) * DAY); }
    else if (i != null && i > ref) { // ritmo comprime o calendário restante a partir da referência (as frentes seguintes também começam antes)
      const sq = tt => ref + Math.round((tt - ref) / DAY * rt) * DAY - ant * DAY;
      a = Math.max(ref + DAY, sq(i)); b = Math.max(a, sq(f)); }
    else { const d2 = Math.max(1, Math.round(dur * rt)); a = ref + DAY; b = a + (d2 - 1) * DAY; }
    return { p0, fut: tt => tt <= ref ? p0 : p0 + (1 - p0) * frac(a, b, tt), fim: ISO(b), ini: p0 > 0 ? t.ri : ISO(a), dur };
  };

  /* calcula a medição: meses antes do mês da medição do arquivo ficam como estão (já medidos);
     do mês da medição até a referência = realizado do cronograma; depois = previsão.
     sim: { serv: {codServiço: {ant, ritmo}}, med: {codMed: {fim:'AAAA-MM'}} } */
  YCX.calc = function (data, refISO, sim) {
    const ref = D(refISO), refM = refISO.slice(0, 7), M0 = data.mesMed || refM, months = data.months;
    const out = { meds: {}, G: {}, Gm: {}, Gfile: {}, refM, M0 };
    let accF = 0; months.forEach(m => { accF += data.meds.reduce((s, md) => s + md.inc * (md.h[m] || 0), 0); out.Gfile[m] = accF; });
    for (const md of data.meds) {
      const ant = months.filter(m => m < M0).reduce((s, m) => s + (md.h[m] || 0), 0);
      const A = {}; let prev = 0; months.forEach(m => { if (m < M0) { prev += md.h[m] || 0; A[m] = prev; } });
      const ovr = sim && sim.med && sim.med[md.cod];
      let info;
      if (!md.tasks || !md.tasks.length || (md.est && !(sim && sim.ignEst))) { // manual ou plano de estratégia gravado na planilha: segue o que está na planilha
        let s = 0; months.forEach(m => { s += md.h[m] || 0; if (m >= M0) A[m] = Math.min(1, s); });
        const last = months.filter(m => md.h[m]).pop() || null; info = { src: md.est ? 'estrategia' : 'manual', fim: last, tatica: md.tatica };
      } else {
        const lev = sim && sim.serv && sim.serv[md.sv];
        const F = md.tasks.map(t => ({ t, f: YCX.taskFn(t, ref, lev) })); const W = F.reduce((s, x) => s + x.f.dur, 0) || 1;
        const C = tt => F.reduce((s, x) => s + x.f.dur * x.f.fut(tt), 0) / W;
        const cR = C(ref);
        let a0 = ant, fileAc = ant, maisArq = 0, aR = null;
        for (const m of months) { if (m < M0) continue;
          if (m <= refM) { fileAc += md.h[m] || 0; const cr = C(Math.min(endOf(m), ref)); if (fileAc > cr + 1e-6) maisArq = Math.max(maisArq, fileAc - cr); a0 = Math.max(a0, cr, fileAc); A[m] = Math.min(1, a0); }
          else { if (aR == null) aR = a0; const c2 = C(endOf(m)); A[m] = Math.min(1, Math.max(a0, cR >= 1 ? 1 : aR + (c2 - cR) / (1 - cR) * (1 - aR))); a0 = A[m]; }
        }
        const fim = F.reduce((s, x) => x.f.fim && (!s || x.f.fim > s) ? x.f.fim : s, null), ini = F.reduce((s, x) => x.f.ini && (!s || x.f.ini < s) ? x.f.ini : s, null);
        info = { src: 'crono', fim: fim ? fim.slice(0, 7) : null, fimD: fim, ini, F, pr: cR, maisArq };
      }
      if (ovr && ovr.fim) { for (const m of months) if (m >= M0 && m >= ovr.fim) A[m] = 1; info.ovr = ovr.fim; }
      if (ovr && ovr.parc) { for (const m of months) if (m >= M0 && m >= ovr.parc.m) A[m] = Math.max(A[m] || 0, ovr.parc.p); info.parc = ovr.parc; }
      // nunca desce e fecha em 100% no último mês da planilha
      let mx = 0; months.forEach(m => { if (A[m] == null) A[m] = mx; mx = Math.max(mx, A[m]); A[m] = mx; });
      const mes = {}; months.forEach((m, i) => mes[m] = A[m] - (i ? A[months[i - 1]] : 0));
      out.meds[md.cod] = Object.assign(info, { A, mes, ant, md });
    }
    months.forEach(m => { out.G[m] = data.meds.reduce((s, md) => s + md.inc * out.meds[md.cod].A[m], 0); });
    months.forEach((m, i) => out.Gm[m] = out.G[m] - (i ? out.G[months[i - 1]] : 0));
    out.quando = alvo => months.find(m => out.G[m] >= alvo - 1e-9) || null;
    return out;
  };

  /* grava a medição na planilha: só as células dos meses nas linhas Med (a partir do mês da medição) e o mês da medição (L4).
     O resto (fórmulas, RESUMO, CURVA, formatação) fica como está; o Excel recalcula ao abrir. */
  YCX.patch = async function (buf, data, res, mesNovo) {
    const zip = await G.JSZip.loadAsync(buf);
    const wb = await zip.file('xl/workbook.xml').async('string');
    const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    const rid = /<sheet [^>]*name="MEDIÇÃO"[^>]*r:id="([^"]+)"/.exec(wb) || /<sheet [^>]*name="MEDI&#199;&#195;O"[^>]*r:id="([^"]+)"/.exec(wb);
    const tgt = new RegExp('<Relationship [^>]*Id="' + rid[1] + '"[^>]*Target="([^"]+)"').exec(rels) || new RegExp('<Relationship [^>]*Target="([^"]+)"[^>]*Id="' + rid[1] + '"').exec(rels);
    const path = 'xl/' + tgt[1].replace(/^\/?xl\//, '');
    let s = await zip.file(path).async('string');
    const M0 = data.mesMed, cols = {}; for (const m of data.months) if (m >= M0) cols[data.mcol[m]] = m;
    const byRow = {}; for (const md of data.meds) byRow[md.row] = res.meds[md.cod];
    let n = 0;
    s = s.replace(/<row r="(\d+)"([^>]*?)(\/>|>[\s\S]*?<\/row>)/g, (row, rn, at, body) => {
      const r = byRow[rn]; if (!r || body === '/>') return row;
      return row.replace(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (cel, col, rr, attrs) => {
        const m = cols[col]; if (!m) return cel;
        const v = r.mes[m]; const a = attrs.replace(/\s+t="[^"]*"/, ''); n++;
        return Math.abs(v) > 1e-12 ? `<c r="${col}${rr}"${a}><v>${+v.toPrecision(15)}</v></c>` : `<c r="${col}${rr}"${a}/>`;
      });
    });
    if (mesNovo) s = s.replace(/(<c r="L4"[^>]*>)<v>[^<]*<\/v>/, `$1<v>${isoSerial(mesNovo + '-01')}</v>`);
    zip.file(path, s);
    let wbx = wb.replace(/<calcPr([^>]*?)\/>/, (m, a) => /fullCalcOnLoad/.test(a) ? m : `<calcPr${a} fullCalcOnLoad="1"/>`);
    zip.file('xl/workbook.xml', wbx);
    if (zip.file('xl/calcChain.xml')) {
      zip.remove('xl/calcChain.xml');
      zip.file('xl/_rels/workbook.xml.rels', rels.replace(/<Relationship [^>]*Target="[^"]*calcChain.xml"\/>/, ''));
      let ct = await zip.file('[Content_Types].xml').async('string'); zip.file('[Content_Types].xml', ct.replace(/<Override PartName="\/xl\/calcChain.xml"[^>]*\/>/, ''));
    }
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    return { bytes, cells: n };
  };
  /* planilha com a ESTRATÉGIA: só os Meds que a estratégia muda são regravados (os demais ficam idênticos ao arquivo);
     cada célula alterada vai em vermelho forte (fundo vermelho, letra branca em negrito), o código/descrição do Med também,
     a observação ganha a tática, e entra uma aba "ESTRATÉGIA 20%" com a lista de alterações. */
  YCX.patchEstrategia = async function (buf, data, base, sim, tat, meta, alvo) {
    const zip = await G.JSZip.loadAsync(buf);
    const wb = await zip.file('xl/workbook.xml').async('string');
    let rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    const rid = /<sheet [^>]*name="MEDIÇÃO"[^>]*r:id="([^"]+)"/.exec(wb);
    const tgt = new RegExp('<Relationship [^>]*Id="' + rid[1] + '"[^>]*Target="([^"]+)"').exec(rels) || new RegExp('<Relationship [^>]*Target="([^"]+)"[^>]*Id="' + rid[1] + '"').exec(rels);
    const path = 'xl/' + tgt[1].replace(/^\/?xl\//, '');
    const refM = sim.refM, M0 = data.mesMed, months = data.months;
    // Meds alterados: overrides explícitos + os que a alavanca de serviço moveu
    const muda = new Set(); for (const md of data.meds) { const a = base.meds[md.cod].A, b = sim.meds[md.cod].A; if (months.some(m => m > refM && Math.abs(a[m] - b[m]) > 1e-7)) muda.add(md.cod); }
    // todos os Meds saem com a medição atualizada (cronograma atual + estratégia); vermelho = estratégia, amarelo claro = só atualização do cronograma
    // estilos: cria um xf vermelho para cada estilo usado nas células alteradas
    let st = await zip.file('xl/styles.xml').async('string');
    st = st.replace(/<fills count="(\d+)">([\s\S]*?)<\/fills>/, (m0, n, b) => `<fills count="${+n + 1}">${b}<fill><patternFill patternType="solid"><fgColor rgb="FFE00000"/><bgColor indexed="64"/></patternFill></fill></fills>`);
    const fillId = +/<fills count="(\d+)">/.exec(st)[1] - 1;
    st = st.replace(/<fills count="(\d+)">([\s\S]*?)<\/fills>/, (m0, n, b) => `<fills count="${+n + 1}">${b}<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill></fills>`);
    const fillY = fillId + 1;
    st = st.replace(/<fonts count="(\d+)"([^>]*)>([\s\S]*?)<\/fonts>/, (m0, n, at, b) => `<fonts count="${+n + 1}"${at}>${b}<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font></fonts>`);
    const fontId = +/<fonts count="(\d+)"/.exec(st)[1] - 1;
    const xfs = /<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/.exec(st); const xfList = xfs[2].match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g);
    const red = {}, yel = {}; let nx = xfList.length; const add = [];
    const yelOf = sId => { sId = +sId || 0; if (yel[sId] != null) return yel[sId]; let x = xfList[sId] || xfList[0]; x = x.replace(/ fillId="\d+"/, ` fillId="${fillY}"`); if (!/applyFill/.test(x)) x = x.replace('<xf ', '<xf applyFill="1" '); add.push(x); yel[sId] = nx++; return yel[sId]; };
    const redOf = sId => { sId = +sId || 0; if (red[sId] != null) return red[sId]; let x = xfList[sId] || xfList[0];
      x = x.replace(/ fillId="\d+"/, ` fillId="${fillId}"`).replace(/ fontId="\d+"/, ` fontId="${fontId}"`); if (!/applyFill/.test(x)) x = x.replace('<xf ', '<xf applyFill="1" '); if (!/applyFont/.test(x)) x = x.replace('<xf ', '<xf applyFont="1" ');
      add.push(x); red[sId] = nx++; return red[sId]; };
    const cols = {}; for (const m of months) if (m >= M0) cols[data.mcol[m]] = m;
    const byRow = {}; for (const md of data.meds) byRow[md.row] = md;
    let s = await zip.file(path).async('string'); let nCel = 0, nY = 0;
    const xe = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    s = s.replace(/<row r="(\d+)"([^>]*?)(\/>|>[\s\S]*?<\/row>)/g, (row, rn, at, body) => {
      const md = byRow[rn]; if (!md || body === '/>') return row; const o = sim.meds[md.cod].mes, est = muda.has(md.cod);
      return row.replace(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (cel, col, rr, attrs, inner) => {
        const sId = (/ s="(\d+)"/.exec(attrs) || [])[1] || 0;
        const a2 = attrs.replace(/\s+t="[^"]*"/, '').replace(/ s="\d+"/, '') + ` s="${redOf(sId)}"`, a3 = attrs.replace(/\s+t="[^"]*"/, '').replace(/ s="\d+"/, '') + ` s="${yelOf(sId)}"`, a0 = attrs.replace(/\s+t="[^"]*"/, '');
        if (!est && !cols[col]) return cel;
        if (col === 'H' || col === 'I') return cel.replace(/ s="\d+"/, ` s="${redOf(sId)}"`);
        if (col === 'T') { const old = (md.obs || '').trim(); return `<c r="${col}${rr}"${a2} t="inlineStr"><is><t xml:space="preserve">${xe('▶ ESTRATÉGIA ' + Math.round(alvo * 100) + '% ' + meta + ': ' + (tat[md.cod] || 'antecipado') + (old ? ' | ' + old : ''))}</t></is></c>`; }
        const m = cols[col]; if (!m) return cel;
        const v = o[m], ov = md.h[m] || 0; if (Math.abs(v - ov) < 1e-9) return cel;
        const ehEst = est && Math.abs(v - base.meds[md.cod].mes[m]) > 1e-9; const aa = ehEst ? a2 : a3; ehEst ? nCel++ : nY++;
        return Math.abs(v) > 1e-12 ? `<c r="${col}${rr}"${aa}><v>${+v.toPrecision(15)}</v></c>` : `<c r="${col}${rr}"${aa}/>`;
      });
    });
    st = st.replace(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/, (m0, n, b) => `<cellXfs count="${nx}">${b}${add.join('')}</cellXfs>`);
    zip.file('xl/styles.xml', st); zip.file(path, s);
    // aba ESTRATÉGIA 20%
    const lin = []; const G0 = base.G[meta], G1 = sim.G[meta];
    const ganhos = data.meds.filter(md => muda.has(md.cod)).map(md => ({ md, g: md.inc * (sim.meds[md.cod].A[meta] - base.meds[md.cod].A[meta]), fA: (() => { let a = 0, f = null; for (const m of months) { a += md.h[m] || 0; if (a >= 1 - 1e-6) { f = m; break; } } return f; })(), fN: (() => { for (const m of months) if (sim.meds[md.cod].A[m] >= 1 - 1e-6) return m; return null; })() })).sort((x, y) => (tat[x.md.cod] || '').localeCompare(tat[y.md.cod] || '') || y.g - x.g);
    const porT = {}; ganhos.forEach(x => { const k = tat[x.md.cod] || 'antecipado'; porT[k] = (porT[k] || 0) + x.g; });
    const cS = (r, c, v, sId) => { const ref = colName(c) + r; if (v == null || v === '') return `<c r="${ref}"${sId ? ` s="${sId}"` : ''}/>`; return typeof v === 'number' ? `<c r="${ref}"${sId ? ` s="${sId}"` : ''}><v>${v}</v></c>` : `<c r="${ref}"${sId ? ` s="${sId}"` : ''} t="inlineStr"><is><t xml:space="preserve">${xe(v)}</t></is></c>`; };
    const R2 = []; const push = (k, pcCols, ...vals) => R2.push({ k, pcCols, vals });
    push('t', [], 'ESTRATÉGIA PARA ' + Math.round(alvo * 100) + '% DE MEDIÇÃO CAIXA EM ' + meta.slice(5) + '/' + meta.slice(0, 4));
    push('', [1], 'Medição acumulada em ' + meta + ' — planilha original (revisão anterior)', sim.Gfile[meta]);
    push('', [1], 'Medição acumulada em ' + meta + ' — cronograma atual, sem estratégia', G0);
    push('t', [1], 'Medição acumulada em ' + meta + ' — COM A ESTRATÉGIA', G1);
    push('', [], 'Células da ESTRATÉGIA (vermelho na aba MEDIÇÃO)', nCel); push('', [], 'Células só atualizadas pelo cronograma (amarelo claro)', nY); push('', [], 'Meds alterados pela estratégia', muda.size); push('', []);
    push('t', [], 'TÁTICA', 'Ganho em ' + meta); Object.entries(porT).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => push('', [1], k, v)); push('', []);
    push('t', [], 'Cód.', 'Med', 'Serviço', 'Incidência FRE', 'Tática', 'Conclusão na planilha original', 'Conclusão com a estratégia', 'Acum. em ' + meta + ' sem estratégia', 'Acum. em ' + meta + ' com estratégia', 'Ganho global em ' + meta);
    ganhos.forEach(x => push('', [3, 7, 8, 9], x.md.cod, x.md.d, x.md.sv + ' ' + x.md.dsv, x.md.inc, tat[x.md.cod] || 'antecipado', x.fA || '—', x.fN || '—', base.meds[x.md.cod].A[meta], sim.meds[x.md.cod].A[meta], x.g));
    // estilos simples: % (numFmtId 10) e negrito vermelho para títulos
    st = await zip.file('xl/styles.xml').async('string');
    const xfs2 = /<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/.exec(st); let n2 = +xfs2[1];
    const tit = n2++, pc = n2++, pcr = n2++;
    st = st.replace(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/, (m0, n, b) => `<cellXfs count="${n2}">${b}<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="${fontId}" fillId="${fillId}" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/></cellXfs>`);
    zip.file('xl/styles.xml', st);
    const rowsX = R2.map((o, i) => { const r = i + 1; return `<row r="${r}">${o.vals.map((v, j) => { const isPct = typeof v === 'number' && o.pcCols.includes(j); return cS(r, j, v, o.k === 't' ? (isPct ? pcr : tit) : isPct ? pc : 0); }).join('')}</row>`; }).join('');
    const sx = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols><col min="1" max="1" width="14" customWidth="1"/><col min="2" max="2" width="46" customWidth="1"/><col min="3" max="3" width="40" customWidth="1"/><col min="4" max="4" width="14" customWidth="1"/><col min="5" max="5" width="60" customWidth="1"/><col min="6" max="10" width="18" customWidth="1"/></cols><sheetData>${rowsX}</sheetData></worksheet>`;
    let k = 1; while (zip.file('xl/worksheets/sheet' + k + '.xml')) k++;
    zip.file('xl/worksheets/sheet' + k + '.xml', sx);
    const ids = [...rels.matchAll(/Id="rId(\d+)"/g)].map(m => +m[1]); const nr = 'rId' + (Math.max(...ids) + 1);
    rels = rels.replace('</Relationships>', `<Relationship Id="${nr}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${k}.xml"/></Relationships>`);
    const sids = [...wb.matchAll(/sheetId="(\d+)"/g)].map(m => +m[1]);
    let wbx = wb.replace('</sheets>', `<sheet name="ESTRATÉGIA ${Math.round(alvo * 100)}%" sheetId="${Math.max(...sids) + 1}" r:id="${nr}"/></sheets>`);
    wbx = wbx.replace(/<calcPr([^>]*?)\/>/, (m0, a) => /fullCalcOnLoad/.test(a) ? m0 : `<calcPr${a} fullCalcOnLoad="1"/>`);
    let ct = await zip.file('[Content_Types].xml').async('string');
    ct = ct.replace('</Types>', `<Override PartName="/xl/worksheets/sheet${k}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
    if (zip.file('xl/calcChain.xml')) { zip.remove('xl/calcChain.xml'); rels = rels.replace(/<Relationship [^>]*Target="[^"]*calcChain.xml"\/>/, ''); ct = ct.replace(/<Override PartName="\/xl\/calcChain.xml"[^>]*\/>/, ''); }
    // docProps/app.xml lista os nomes das abas; se existir, deixa como está (o Excel aceita)
    zip.file('xl/workbook.xml', wbx); zip.file('xl/_rels/workbook.xml.rels', rels); zip.file('[Content_Types].xml', ct);
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    return { bytes, cells: nCel, amarelas: nY, meds: muda.size, G0, G1, porT };
  };
  YCX.endOf = endOf; YCX.addM = addM;
  G.YCX = YCX;
})(typeof globalThis !== 'undefined' ? globalThis : window);
