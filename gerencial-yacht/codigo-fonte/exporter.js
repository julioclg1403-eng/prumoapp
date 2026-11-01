/* Exportações: (1) YAC-FLUXO próxima revisão  (2) Fluxo_Desembolso — análise
   Funciona no navegador e no node (JSZip global). */
(function (G) {
  const YX = {};
  const xesc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const colL = n => { let s = ''; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const colN = s => { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  YX.colL = colL;
  const addM = (k, n) => { let y = +k.slice(0, 4), m = +k.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + String(m + 1).padStart(2, '0'); };
  const num = v => { v = +v; if (!isFinite(v)) return '0'; let t = v.toPrecision(15); if (/e/i.test(t)) t = String(v); else if (t.includes('.')) t = t.replace(/0+$/, '').replace(/\.$/, ''); return t === '-0' ? '0' : t; };
  const r2 = v => Math.round(v * 100) / 100;

  /* ============ base64 ============ */
  YX.b64enc = function (u8) { let s = ''; const C = 0x8000; for (let i = 0; i < u8.length; i += C) s += String.fromCharCode.apply(null, u8.subarray(i, i + C)); return btoa(s); };
  YX.b64dec = function (b) { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };

  /* ============ assinatura do relatório (detecta relatório novo) ============ */
  YX.hashReport = function (rep) {
    let h = 5381; const s = rep.map(x => [x.d, x.ins, x.forn, x.proc, x.parc, (+x.ap).toFixed(2), (+x.pg).toFixed(2)].join('|')).sort().join('\n');
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16) + '-' + rep.length;
  };

  /* ============ nome da próxima revisão ============ */
  YX.nextName = function (name, refISO) {
    const m = /R(\d+)/i.exec(name || ''); const n = m ? +m[1] + 1 : 1;
    return { rev: n, name: `YAC-FLUXO-R${String(n).padStart(2, '0')}-${refISO.slice(2, 4)}.${refISO.slice(5, 7)}.${refISO.slice(8, 10)}.xlsx` };
  };
  YX.revOf = name => { const m = /R(\d+)/i.exec(name || ''); return m ? +m[1] : null; };
  YX.dateOf = name => { const m = /(\d{2})\.(\d{2})\.(\d{2})(?!\d)/.exec(name || ''); return m ? `20${m[1]}-${m[2]}-${m[3]}` : null; };
  YX.target = iso => addM(iso.slice(0, 7), 1);           // mês-alvo do fluxo = mês seguinte à data
  YX.mdiff = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
  YX.fluxoName = (rev, iso) => `YAC-FLUXO-R${String(rev).padStart(2, '0')}-${iso.slice(2, 4)}.${iso.slice(5, 7)}.${iso.slice(8, 10)}.xlsx`;
  YX.cmpName = (rev, iso) => `Comparativo_Orcamento_x_Gasto_R${String(rev).padStart(2, '0')}_${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}.xlsx`;
  YX.analiseName = (rev, iso) => `Fluxo_Desembolso_YACHT_R${String(rev).padStart(2, '0')}_${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}.xlsx`;

  /* Mapeamento de destaques da R10 (gerada antes do app): xf vermelho → xf original */
  const XFMAP_R10 = { 247: 205, 248: 185, 249: 181, 250: 180, 251: 203, 252: 182, 253: 222, 254: 183, 255: 208, 256: 211, 257: 184, 258: 186 };

  /* =====================================================================
     1) Atualizar a YAC-FLUXO — critério "piso do comprometido"
     Para cada insumo (linha D) e mês M+1..M+3: se Pagar&Pago do relatório > previsto,
     soma a diferença numa linha folha e marca em vermelho. Destaques da revisão anterior
     voltam ao estilo original — só o que mudou agora fica vermelho.
     ===================================================================== */
  YX.patchFluxo = async function (bytes, report, refISO, srcName, opt = {}) {
    const x = await G.YP.openXlsx(bytes);
    const zip = x.zip, path = x.paths['FLUXO-BASE'];
    if (!path) throw new Error('Arquivo sem aba FLUXO-BASE');
    const FM = {}; const R = await x.rows('FLUXO-BASE', 70, FM);
    const hr = R.findIndex(r => r && r.includes('NÍVEL') && r.includes('DESCRIÇÃO')); const H = R[hr];
    const cN = H.indexOf('NÍVEL'), cCod = H.indexOf('COD'), cD = H.indexOf('DESCRIÇÃO'), cID = H.indexOf('ID');
    const ref = refISO.slice(0, 7), months = [addM(ref, 1), addM(ref, 2), addM(ref, 3)];
    const mcol = {}; H.forEach((h, c) => { const k = /^(\d{2})\/(\d{4})$/.exec(String(h || '')); if (k) mcol[`${k[2]}-${k[1]}`] = c; });
    for (const m of months) if (mcol[m] == null) throw new Error('FLUXO-BASE sem coluna para ' + m);
    // relatório por insumo × mês (Pagar&Pago)
    const rep = {};
    for (const l of report) { const mk = l.d.slice(0, 7); if (!months.includes(mk)) continue; const cod = (l.ins || '').split(' - ')[0].trim(); const k = cod + '|' + mk; rep[k] = (rep[k] || 0) + l.pg + l.ap; }
    // estrutura: linhas D e seus E/F
    const lv = r => R[r] && R[r][cN] != null ? String(R[r][cN]) : '';
    const Ds = {}, DsC = {}; let curC = null, cDesc = '';
    for (let r = hr + 1; r < R.length; r++) {
      const L = lv(r); if (!L) continue;
      if (L === 'C') { curC = String(R[r][cID]); cDesc = R[r][cD]; }
      if (L !== 'D' || !R[r][cCod]) continue;
      const cod = String(R[r][cCod]);
      const E = []; let j = r + 1;
      while (j < R.length && (lv(j) === 'E' || lv(j) === 'F' || !lv(j))) {
        if (lv(j) === 'E') { const kids = []; let k = j + 1; while (k < R.length && (lv(k) === 'F' || !lv(k))) { if (lv(k) === 'F') kids.push(k); k++; } E.push({ r: j, kids }); j = k; } else j++;
      }
      const dobj = { r, cod, desc: R[r][cD], c: curC, cdesc: cDesc, E };
      if (!Ds[cod]) Ds[cod] = dobj; if (!DsC[curC + '|' + cod]) DsC[curC + '|' + cod] = dobj;
    }
    const val = (r, c) => typeof (R[r] || [])[c] === 'number' ? R[r][c] : 0;
    const isF = (r, c) => !!(FM[r] && FM[r][c]);
    const eVal = (e, c) => (e.kids.length && isF(e.r, c)) ? e.kids.reduce((a, k) => a + val(k, c), 0) : val(e.r, c);
    const plan = [], missing = [], constE = new Set(); // linhas E digitadas que têm F embaixo: continuam número (fórmula viraria soma dos F)
    const codes = new Set(Object.keys(rep).map(k => k.split('|')[0]));
    for (const cod of codes) {
      const D = Ds[cod];
      for (const m of months) {
        const v = r2(rep[cod + '|' + m] || 0); if (!v) continue;
        if (!D) { missing.push({ cod, mes: m, v, desc: (report.find(l => (l.ins || '').startsWith(cod + ' ')) || {}).ins || cod }); continue; }
        const c = mcol[m]; const prev = D.E.reduce((a, e) => a + eVal(e, c), 0);
        if (v - prev < 0.5) continue; // ignora diferenças de centavos
        const delta = r2(v - prev);
        const leaves = [];
        for (const e of D.E) { if (!e.kids.length || !isF(e.r, c)) { leaves.push(e.r); if (e.kids.length) constE.add(e.r + 1); } else leaves.push(...e.kids); }
        if (!leaves.length) { missing.push({ cod, mes: m, v, desc: D.desc + ' (sem linha folha)' }); continue; }
        const withV = leaves.filter(r => val(r, c) > 0);
        const tgt = withV.length ? withV.reduce((a, b) => val(b, c) > val(a, c) ? b : a) : leaves[0];
        plan.push({ cod, desc: D.desc, c: D.c, cdesc: D.cdesc, mes: m, prev, rep: v, delta, row: tgt + 1, drow: D.r + 1, col: colL(c), leaf: R[tgt][cD] || '', old: val(tgt, c) });
      }
    }
    // ---- serviços planejados: FLUXO-BASE do mês = pago/a pagar do relatório + planejado (bate exatamente, para cima ou para baixo) ----
    const realoc = [];
    if (opt.targets) {
      const planC = new Set(opt.planC || []);
      for (let i = plan.length - 1; i >= 0; i--) if (planC.has(plan[i].c)) plan.splice(i, 1);
      const dPrev = D => months.reduce((a, m) => a + D.E.reduce((b, e) => b + eVal(e, mcol[m]), 0), 0);
      const T = {};
      for (const [k, mv] of Object.entries(opt.targets)) {
        let key = k;
        if (!DsC[key]) {
          const c = k.split('|')[0]; const cand = Object.entries(DsC).filter(([kk, d]) => d.c === c);
          if (!cand.length) { missing.push({ cod: k, mes: '', v: Object.values(mv).reduce((a, x) => a + x, 0), desc: 'serviço ' + c + ' sem linha de insumo na FLUXO-BASE' }); continue; }
          cand.sort((a, b) => dPrev(b[1]) - dPrev(a[1])); key = cand[0][0];
          realoc.push({ de: k, para: key });
        }
        const o = T[key] || (T[key] = {}); for (const [m, v] of Object.entries(mv)) o[m] = (o[m] || 0) + v;
      }
      for (const [key, D] of Object.entries(DsC)) {
        if (!planC.has(D.c)) continue;
        for (const m of months) {
          const c = mcol[m], target = r2((T[key] || {})[m] || 0), prev = D.E.reduce((a, e) => a + eVal(e, c), 0), delta = r2(target - prev);
          if (Math.abs(delta) < 0.5) continue;
          const leaves = []; for (const e of D.E) { if (!e.kids.length || !isF(e.r, c)) { leaves.push(e.r); if (e.kids.length) constE.add(e.r + 1); } else leaves.push(...e.kids); }
          if (!leaves.length) { missing.push({ cod: key, mes: m, v: target, desc: D.desc + ' (sem linha folha)' }); continue; }
          const base = { cod: D.cod, desc: D.desc, c: D.c, cdesc: D.cdesc, mes: m, prev, rep: target, drow: D.r + 1, col: colL(c), origem: 'consolidado + planejado líquido' };
          if (delta > 0) {
            const withV = leaves.filter(r => val(r, c) > 0); const tgt = withV.length ? withV.reduce((a, b) => val(b, c) > val(a, c) ? b : a) : leaves[0];
            plan.push(Object.assign({}, base, { delta, row: tgt + 1, leaf: R[tgt][cD] || '', old: val(tgt, c) }));
          } else {
            let rest = -delta;
            for (const lr of leaves.filter(r => val(r, c) > 0).sort((a, b) => val(b, c) - val(a, c))) { const take = r2(Math.min(val(lr, c), rest)); if (take < 0.005) continue; plan.push(Object.assign({}, base, { delta: -take, row: lr + 1, leaf: R[lr][cD] || '', old: val(lr, c) })); rest = r2(rest - take); if (rest < 0.005) break; }
          }
        }
      }
    }
    // ---- XML ----
    let st = await x.txt('xl/styles.xml');
    let wbx = await x.txt('xl/workbook.xml');
    let s = await x.txt(path);
    // xf map existente (destaques anteriores)
    let xfmap = {};
    const dn = /<definedName name="_GG_XFMAP"[^>]*>"?([^<"]*)"?<\/definedName>/.exec(wbx);
    const cxf = /<cellXfs count="(\d+)"[^>]*>([\s\S]*?)<\/cellXfs>/.exec(st);
    let xfs = cxf[2].match(/<xf [^>]*?\/>|<xf [^>]*?>[\s\S]*?<\/xf>/g);
    const fillsM = /<fills count="(\d+)"[^>]*>([\s\S]*?)<\/fills>/.exec(st);
    let fills = fillsM[2].match(/<fill>[\s\S]*?<\/fill>|<fill\/>/g);
    const fontsM = /<fonts count="(\d+)"([^>]*)>([\s\S]*?)<\/fonts>/.exec(st);
    let fonts = fontsM[3].match(/<font>[\s\S]*?<\/font>|<font\/>/g);
    if (dn) dn[1].split(',').filter(Boolean).forEach(p => { const [a, b] = p.split(':'); xfmap[a] = +b; });
    else if (xfs.length === 259 && /FFFFC7CE/.test(fills[15] || '')) xfmap = Object.assign({}, XFMAP_R10);
    // reverter destaques antigos
    const redSet = new Set(Object.keys(xfmap).map(Number));
    let reverted = 0;
    if (redSet.size && !opt.keepMarks) s = s.replace(/(<c r="[A-Z]+\d+") s="(\d+)"/g, (m, a, sid) => { if (redSet.has(+sid)) { reverted++; return `${a} s="${xfmap[sid]}"`; } return m; });
    // estilos vermelhos
    let fillId = fills.findIndex(f => /FFFFC7CE/.test(f));
    if (fillId < 0) { fills.push('<fill><patternFill patternType="solid"><fgColor rgb="FFFFC7CE"/><bgColor indexed="64"/></patternFill></fill>'); fillId = fills.length - 1; }
    const red = {}; for (const [a, b] of Object.entries(xfmap)) red[b] = +a;
    const fontMap = {};
    function redFont(fid) {
      if (fid in fontMap) return fontMap[fid];
      let f = fonts[fid] || '<font/>';
      f = f.replace(/<color [^>]*\/>/g, '').replace(/<b\/>/g, '');
      f = f === '<font/>' ? '<font><b/><color rgb="FFFF0000"/></font>' : f.replace('<font>', '<font><b/>');
      if (!/FFFF0000/.test(f)) f = /<sz [^>]*\/>/.test(f) ? f.replace(/(<sz [^>]*\/>)/, '$1<color rgb="FFFF0000"/>') : f.replace('<b/>', '<b/><color rgb="FFFF0000"/>');
      fonts.push(f); fontMap[fid] = fonts.length - 1; return fontMap[fid];
    }
    function redXf(sid) {
      sid = +sid; if (redSet.has(sid)) sid = xfmap[sid];
      if (red[sid] != null) return red[sid];
      let xf = xfs[sid] || xfs[0];
      const fid = +(/fontId="(\d+)"/.exec(xf) || [0, 0])[1];
      xf = xf.replace(/fontId="\d+"/, `fontId="${redFont(fid)}"`).replace(/fillId="\d+"/, `fillId="${fillId}"`);
      for (const a of ['applyFont', 'applyFill']) xf = new RegExp(a + '="').test(xf) ? xf.replace(new RegExp(a + '="\\d"'), a + '="1"') : xf.replace('<xf ', `<xf ${a}="1" `);
      xfs.push(xf); const id = xfs.length - 1; red[sid] = id; xfmap[id] = sid; return id;
    }
    // localizar / substituir célula
    function cellAt(ref) {
      const i = s.indexOf(`<c r="${ref}"`); if (i < 0) return null;
      const re = /<c r="[A-Z]+\d+"(?: [^>]*?)?(?:\/>|>[\s\S]*?<\/c>)/y; re.lastIndex = i; const m = re.exec(s);
      return m ? { i, xml: m[0] } : null;
    }
    function insertCell(ref, xml) {
      const rn = /\d+/.exec(ref)[0], cn = colN(/[A-Z]+/.exec(ref)[0]);
      const ri = s.indexOf(`<row r="${rn}"`); if (ri < 0) throw new Error('linha ' + rn + ' não encontrada');
      const rEnd = s.indexOf('</row>', ri); const rowOpenEnd = s.indexOf('>', ri);
      if (s[rowOpenEnd - 1] === '/') { s = s.slice(0, rowOpenEnd - 1) + '>' + xml + '</row>' + s.slice(rowOpenEnd + 1); return; }
      const seg = s.slice(rowOpenEnd + 1, rEnd); const re = /<c r="([A-Z]+)\d+"/g; let m, at = rEnd;
      while ((m = re.exec(seg))) if (colN(m[1]) > cn) { at = rowOpenEnd + 1 + m.index; break; }
      s = s.slice(0, at) + xml + s.slice(at);
    }
    const changes = [], skipped = [];
    for (const p of plan) {
      const ref = p.col + p.row; const cur = cellAt(ref);
      const sid = cur ? +((/ s="(\d+)"/.exec(cur.xml) || [0, 0])[1]) : 0;
      const fm = cur ? /<f([^>]*)>([\s\S]*?)<\/f>|<f([^>]*)\/>/.exec(cur.xml) : null;
      const fattr = fm ? (fm[1] || fm[3] || '') : '';
      if (/t="shared"/.test(fattr) && /ref=/.test(fattr)) { skipped.push(Object.assign({ motivo: 'fórmula compartilhada' }, p)); continue; }
      const generic = fm && /IFERROR\(IF\(Fluxo/.test(fm[2] || '');
      const ns = redXf(sid); let xml, novo;
      if (constE.has(p.row) && !fm) { const nv = r2(p.old + p.delta); xml = `<c r="${ref}" s="${ns}"><v>${num(nv)}</v></c>`; novo = num(nv); }
      else if ((!fm || generic || !fm[2]) && Math.abs(p.old) < 1e-9) { xml = `<c r="${ref}" s="${ns}"><v>${num(p.delta)}</v></c>`; novo = num(p.delta); }
      else if (!fm) { const sg = p.delta < 0 ? '-' + num(-p.delta) : '+' + num(p.delta); xml = `<c r="${ref}" s="${ns}"><f>${num(p.old)}${sg}</f><v>${num(p.old + p.delta)}</v></c>`; novo = '=' + num(p.old) + sg; }
      else if (!generic && fm[2]) { const sg = p.delta < 0 ? '-' + num(-p.delta) : '+' + num(p.delta); xml = `<c r="${ref}" s="${ns}"><f>${fm[2]}${sg}</f><v>${num(p.old + p.delta)}</v></c>`; novo = '=' + G.YP.dec(fm[2]) + sg; }
      else { skipped.push(Object.assign({ motivo: 'célula com fórmula do fluxo e valor' }, p)); continue; }
      if (cur) s = s.slice(0, cur.i) + xml + s.slice(cur.i + cur.xml.length); else insertCell(ref, xml);
      changes.push(Object.assign({ novo, celula: ref }, p));
    }
    // destacar a linha do insumo (só estilo)
    for (const p of changes) {
      const ref = p.col + p.drow; const cur = cellAt(ref); if (!cur) continue;
      const sm = / s="(\d+)"/.exec(cur.xml); const sid = sm ? +sm[1] : 0;
      if (Object.prototype.hasOwnProperty.call(xfmap, sid)) continue;
      const ns = redXf(sid);
      const nx = sm ? cur.xml.replace(/ s="\d+"/, ` s="${ns}"`) : cur.xml.replace(`<c r="${ref}"`, `<c r="${ref}" s="${ns}"`);
      s = s.slice(0, cur.i) + nx + s.slice(cur.i + cur.xml.length);
    }
    // gravar estilos
    st = st.replace(fontsM[0], `<fonts count="${fonts.length}"${fontsM[2].replace(/ count="\d+"/, '')}>${fonts.join('')}</fonts>`);
    st = st.replace(/<fills count="\d+"([^>]*)>[\s\S]*?<\/fills>/, (m, a) => `<fills count="${fills.length}"${a}>${fills.join('')}</fills>`);
    st = st.replace(/<cellXfs count="\d+"([^>]*)>[\s\S]*?<\/cellXfs>/, (m, a) => `<cellXfs count="${xfs.length}"${a}>${xfs.join('')}</cellXfs>`);
    // workbook: recálculo ao abrir + mapa de destaques (nome oculto)
    wbx = wbx.replace(/<calcPr([^>]*?)\/>/, (m, a) => /fullCalcOnLoad/.test(a) ? m : `<calcPr${a} fullCalcOnLoad="1"/>`);
    const mapStr = Object.entries(xfmap).map(([a, b]) => a + ':' + b).join(',');
    const dnx = `<definedName name="_GG_XFMAP" hidden="1">"${mapStr}"</definedName>`;
    if (dn) wbx = wbx.replace(/<definedName name="_GG_XFMAP"[^>]*>[\s\S]*?<\/definedName>/, dnx);
    else if (/<\/definedNames>/.test(wbx)) wbx = wbx.replace('</definedNames>', dnx + '</definedNames>');
    else wbx = wbx.replace('</sheets>', '</sheets><definedNames>' + dnx + '</definedNames>');
    zip.file(path, s, { createFolders: false }); zip.file('xl/styles.xml', st, { createFolders: false }); zip.file('xl/workbook.xml', wbx, { createFolders: false });
    // data de modificação do arquivo = momento do download
    if (zip.file('docProps/core.xml')) {
      const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      let core = await zip.file('docProps/core.xml').async('string');
      core = /<dcterms:modified[^>]*>[^<]*<\/dcterms:modified>/.test(core) ? core.replace(/(<dcterms:modified[^>]*>)[^<]*(<\/dcterms:modified>)/, `$1${now}$2`) : core.replace('</cp:coreProperties>', `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
      zip.file('docProps/core.xml', core, { createFolders: false });
    }
    // calcChain fora (o Excel recria)
    if (zip.file('xl/calcChain.xml')) {
      zip.remove('xl/calcChain.xml');
      let rel = await x.txt('xl/_rels/workbook.xml.rels'); rel = rel.replace(/<Relationship [^>]*Target="[^"]*calcChain.xml"\/>/, ''); zip.file('xl/_rels/workbook.xml.rels', rel, { createFolders: false });
      let ct = await zip.file('[Content_Types].xml').async('string'); ct = ct.replace(/<Override PartName="\/xl\/calcChain.xml"[^>]*\/>/, ''); zip.file('[Content_Types].xml', ct, { createFolders: false });
    }
    const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    return { bytes: out, changes, skipped, missing, reverted, months, realoc };
  };

  /* =====================================================================
     2) Escritor XLSX mínimo (estilos, fórmulas com valor em cache, logo)
     ===================================================================== */
  const MON = '#,##0.00;(#,##0.00);"-"', PCT = '0.0%;(0.0%);"-"', DT = 'dd/mm/yyyy', MY = 'mmm/yy';
  const STY = {
    def: {}, th: { b: 1, fill: 'D6D8DB', bd: 1, h: 'center', wrap: 1 }, txt: { bd: 1 }, mon: { bd: 1, nf: MON }, pct: { bd: 1, nf: PCT }, dt: { bd: 1, nf: DT },
    int: { bd: 1, nf: '0' }, my: { bd: 1, nf: MY }, ttxt: { b: 1, fill: 'EDEEEF', bd: 1 }, tmon: { b: 1, fill: 'EDEEEF', bd: 1, nf: MON }, tpct: { b: 1, fill: 'EDEEEF', bd: 1, nf: PCT },
    tint: { b: 1, fill: 'EDEEEF', bd: 1, nf: '0' }, title: { b: 1, sz: 14 }, subt: { i: 1, color: '6A6B6C' }, brand: { b: 1, color: '6A6B6C' }, inp: { b: 1, sz: 10, color: '0000FF', fill: 'FFFF00', bd: 1, nf: DT },
    rmon: { b: 1, color: 'C00000', bd: 1, nf: MON }, band: { b: 1, sz: 10, color: 'FFFFFF', fill: '6A6B6C' }, note: { i: 1, sz: 8, color: '6A6B6C' }, rnote: { i: 1, sz: 8, color: 'C00000' },
    m1: { b: 1, fill: 'D6D8DB', bd: 1, h: 'center', wrap: 1, nf: '"M+1 · "mmm/yy' }, m2: { b: 1, fill: 'D6D8DB', bd: 1, h: 'center', wrap: 1, nf: '"M+2 · "mmm/yy' }, m3: { b: 1, fill: 'D6D8DB', bd: 1, h: 'center', wrap: 1, nf: '"M+3 · "mmm/yy' },
    kmon: { b: 1, bd: 1, nf: MON }, kint: { b: 1, bd: 1, nf: '0' }, kpct: { b: 1, bd: 1, nf: PCT }, kdt: { b: 1, bd: 1, nf: DT }, ktxt: { b: 1, bd: 1 }, kmy: { bd: 1, nf: '"M+"0' },
    wrap: { wrap: 1, v: 'top' }, gtxt: { color: '008000', bd: 1 }, gmon: { color: '008000', bd: 1, nf: MON }, ctr: { bd: 1, h: 'center' }, dtplain: { nf: DT }, lbl: { b: 1 },
    inpq: { color: '0000FF', fill: 'FFF2CC', bd: 1, nf: '#,##0.00;(#,##0.00);""' }, pctb: { bd: 1, nf: '0.0%;(0.0%);"-"' }, mon4: { bd: 1, nf: '#,##0.0000;(#,##0.0000);"-"' },
    mlong1: { nf: '"M+1  ·  "mmmm/yyyy' }, mlong2: { nf: '"M+2  ·  "mmmm/yyyy' }, mlong3: { nf: '"M+3  ·  "mmmm/yyyy' }, rtxt: { b: 1, color: 'C00000', bd: 1 }
  };
  function stylesXml() {
    const fonts = [], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'], nfs = [], xfs = [], idx = {};
    const fontKey = {}, fillKey = {}, nfKey = {};
    const F = sp => { const k = [sp.b, sp.i, sp.sz || 9, sp.color || '000000'].join('|'); if (!(k in fontKey)) { fontKey[k] = fonts.length; fonts.push(`<font>${sp.b ? '<b/>' : ''}${sp.i ? '<i/>' : ''}<sz val="${sp.sz || 9}"/><color rgb="FF${sp.color || '000000'}"/><name val="Arial"/><family val="2"/></font>`); } return fontKey[k]; };
    const FL = c => { if (!c) return 0; if (!(c in fillKey)) { fillKey[c] = fills.length; fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`); } return fillKey[c]; };
    const NF = f => { if (!f) return 0; if (f === '0') return 1; if (!(f in nfKey)) { nfKey[f] = 164 + nfs.length; nfs.push(`<numFmt numFmtId="${nfKey[f]}" formatCode="${xesc(f)}"/>`); } return nfKey[f]; };
    F({});
    for (const [k, sp] of Object.entries(STY)) {
      const al = (sp.h || sp.wrap || sp.v) ? `<alignment${sp.h ? ` horizontal="${sp.h}"` : ''}${sp.v ? ` vertical="${sp.v}"` : ' vertical="center"'}${sp.wrap ? ' wrapText="1"' : ''}/>` : '';
      idx[k] = xfs.length;
      xfs.push(`<xf numFmtId="${NF(sp.nf)}" fontId="${F(sp)}" fillId="${FL(sp.fill)}" borderId="${sp.bd ? 1 : 0}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"${al ? ' applyAlignment="1">' + al + '</xf>' : '/>'}`);
    }
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${nfs.length ? `<numFmts count="${nfs.length}">${nfs.join('')}</numFmts>` : ''}<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="2"><dxf><font><b/><color rgb="FFC00000"/></font></dxf><dxf><font><b/><color rgb="FF0A8A0A"/></font></dxf></dxfs></styleSheet>`;
    return { xml, idx };
  }
  YX.Book = function () {
    const sheets = [], names = [];
    const book = {
      name(n, ref) { names.push([n, ref]); },
      sheet(title, o = {}) {
        const ws = { title, o, cells: {}, merges: [], heights: {}, maxR: 0, maxC: 0 };
        ws.set = (r, c, v, st = 'def') => { if (v === undefined) return; (ws.cells[r] || (ws.cells[r] = {}))[c] = [v, st]; ws.maxR = Math.max(ws.maxR, r); ws.maxC = Math.max(ws.maxC, c); };
        ws.row = (r, c0, arr, st) => arr.forEach((v, i) => ws.set(r, c0 + i, v, Array.isArray(st) ? st[i] : st));
        ws.merge = ref => ws.merges.push(ref); ws.h = (r, h) => ws.heights[r] = h; ws.lvl = {}; ws.outline = (r, l, hide) => { ws.lvl[r] = [l, hide]; };
        sheets.push(ws); return ws;
      },
      async blob(logoB64, asU8) {
        const zip = new G.JSZip(); const S = stylesXml();
        const sheetXml = ws => {
          const o = ws.o; let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
          x += `<sheetPr>${o.tab ? `<tabColor rgb="FF${o.tab}"/>` : ''}${Object.keys(ws.lvl).length ? '<outlinePr summaryBelow="0"/>' : ''}<pageSetUpPr fitToPage="1"/></sheetPr>`;
          x += `<sheetViews><sheetView workbookViewId="0" showGridLines="${o.grid ? 1 : 0}"${o.first ? ' tabSelected="1"' : ''}>`;
          if (o.freeze) { const m = /([A-Z]+)(\d+)/.exec(o.freeze); const xs = colN(m[1]), ys = +m[2] - 1; x += `<pane${xs ? ` xSplit="${xs}"` : ''}${ys ? ` ySplit="${ys}"` : ''} topLeftCell="${o.freeze}" activePane="${xs && ys ? 'bottomRight' : ys ? 'bottomLeft' : 'topRight'}" state="frozen"/>`; }
          const ol = Math.max(0, ...Object.values(ws.lvl).map(v => v[0])); x += `</sheetView></sheetViews><sheetFormatPr defaultRowHeight="12"${ol ? ` outlineLevelRow="${ol}"` : ''}/>`;
          if (o.cols) x += '<cols>' + o.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
          x += '<sheetData>';
          const rows = Object.keys(ws.cells).map(Number).sort((a, b) => a - b);
          for (const r of rows) {
            const hh = ws.heights[r], lv = ws.lvl[r], nx = ws.lvl[r + 1]; x += `<row r="${r}"${hh ? ` ht="${hh}" customHeight="1"` : ''}${lv && lv[0] ? ` outlineLevel="${lv[0]}"` : ''}${lv && lv[1] ? ' hidden="1"' : ''}${lv && nx && nx[0] > lv[0] && nx[1] ? ' collapsed="1"' : ''}>`;
            const cs = Object.keys(ws.cells[r]).map(Number).sort((a, b) => a - b);
            for (const c of cs) {
              const [v, stn] = ws.cells[r][c]; const ref = colL(c) + r; const sidx = S.idx[stn] != null ? S.idx[stn] : 0;
              if (v === null || v === '') { x += `<c r="${ref}" s="${sidx}"/>`; continue; }
              if (typeof v === 'number') { x += `<c r="${ref}" s="${sidx}"><v>${isFinite(v) ? num(v) : 0}</v></c>`; continue; }
              if (typeof v === 'object') {
                const cv = v.v; const isS = typeof cv === 'string';
                x += `<c r="${ref}" s="${sidx}"${isS ? ' t="str"' : ''}><f>${xesc(v.f.replace(/^=/, ''))}</f>${cv == null ? '' : `<v>${isS ? xesc(cv) : num(cv)}</v>`}</c>`; continue;
              }
              x += `<c r="${ref}" s="${sidx}" t="inlineStr"><is><t xml:space="preserve">${xesc(v)}</t></is></c>`;
            }
            x += '</row>';
          }
          x += '</sheetData>';
          if (o.filter) x += `<autoFilter ref="${o.filter}"/>`;
          if (ws.merges.length) x += `<mergeCells count="${ws.merges.length}">${ws.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`;
          if (o.cf) { let pr = 1; for (const ref of o.cf) x += `<conditionalFormatting sqref="${ref}"><cfRule type="cellIs" dxfId="0" priority="${pr++}" operator="lessThan"><formula>-0.005</formula></cfRule><cfRule type="cellIs" dxfId="1" priority="${pr++}" operator="greaterThan"><formula>0.005</formula></cfRule></conditionalFormatting>`; }
          x += '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>';
          x += '<headerFooter><oddFooter>&amp;LGellen &amp;&amp; Guimarães&amp;RPágina &amp;P de &amp;N</oddFooter></headerFooter>';
          if (logoB64 && o.logo != null) x += '<drawing r:id="rId1"/>';
          return x + '</worksheet>';
        };
        let ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
        let wrel = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
        let sh = '';
        sheets.forEach((ws, i) => {
          const n = i + 1; zip.file(`xl/worksheets/sheet${n}.xml`, sheetXml(ws), { createFolders: false });
          ct += `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
          wrel += `<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`;
          sh += `<sheet name="${xesc(ws.title)}" sheetId="${n}" r:id="rId${n}"/>`;
          if (logoB64 && ws.o.logo != null) {
            const cx = 55 * 9525, cy = 55 * 9525;
            zip.file(`xl/worksheets/_rels/sheet${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${n}.xml"/></Relationships>`, { createFolders: false });
            zip.file(`xl/drawings/drawing${n}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:oneCellAnchor><xdr:from><xdr:col>${ws.o.logo}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`, { createFolders: false });
            zip.file(`xl/drawings/_rels/drawing${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.png"/></Relationships>`, { createFolders: false });
            ct += `<Override PartName="/xl/drawings/drawing${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`;
          }
        });
        if (logoB64) zip.file('xl/media/logo.png', YX.b64dec(logoB64), { createFolders: false });
        const k = sheets.length + 1;
        wrel += `<Relationship Id="rId${k}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
        zip.file('[Content_Types].xml', ct + '</Types>', { createFolders: false });
        zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>', { createFolders: false });
        zip.file('xl/_rels/workbook.xml.rels', wrel, { createFolders: false });
        zip.file('xl/styles.xml', S.xml, { createFolders: false });
        zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sh}</sheets>${names.length ? '<definedNames>' + names.map(([n, r]) => `<definedName name="${n}">${xesc(r)}</definedName>`).join('') + '</definedNames>' : ''}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`, { createFolders: false });
        return zip.generateAsync({ type: asU8 ? 'uint8array' : 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      }
    };
    return book;
  };

  /* =====================================================================
     3) Planilha de análise Fluxo_Desembolso (mesma estrutura da versão de 29/10)
     ===================================================================== */
  const serial = iso => Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5);
  const isoAdd = (iso, d) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + d * 864e5).toISOString().slice(0, 10);
  const eom = (iso, k) => { const y = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1 + k + 1; return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
  const brl = v => 'R$ ' + (Math.round(v * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tail = s => String(s || '').includes(' - ') ? String(s).split(' - ').slice(1).join(' - ') : String(s || '');

  YX.buildAnalise = async function (report, refISO, opts = {}) {
    const L = report.slice().sort((a, b) => a.d.localeCompare(b.d) || String(a.forn).localeCompare(String(b.forn)));
    const N = 6000, B = c => `BASE!$${c}$2:$${c}$${N}`;
    const DTr = B('A'), MESr = B('B'), STr = B('C'), FORr = B('D'), INSr = B('E'), SERr = B('F'), PGr = B('K'), APr = B('L'), TOTr = B('M');
    const ref = refISO, fimJ = eom(ref, 3), m1 = isoAdd(eom(ref, 0), 1), m2 = isoAdd(eom(ref, 1), 1), m3 = isoAdd(eom(ref, 2), 1);
    const st = x => x.ap > 0 ? (x.d < ref ? 'VENCIDO' : 'A PAGAR') : 'PAGO';
    const W = YX.Book();
    const brand = (ws, title, sub, lastc) => { ws.set(1, 0, 'GELLEN & GUIMARÃES', 'brand'); ws.set(2, 0, title, 'title'); ws.set(3, 0, sub, 'subt'); ws.h(2, 20); };
    const hdr = (ws, r, labs, sts) => { labs.forEach((t, i) => ws.set(r, i, t, (sts && sts[i]) || 'th')); ws.h(r, 32); };
    // ---------- RESUMO (posições fixas usadas pelos nomes) ----------
    const R = W.sheet('RESUMO', { cols: [54, 2, 16, 12, 56, 2, 16, 12, 12, 12], logo: 9, tab: '6A6B6C', first: true });
    W.name('DataRef', 'RESUMO!$C$6'); W.name('FimJanela', 'RESUMO!$C$7');
    // ---------- grupos ----------
    function agg(keyf) {
      const o = {};
      for (const x of L) {
        const k = keyf(x); const z = o[k] || (o[k] = { pg: 0, ap: 0, v: 0, rm: 0, m1: 0, m2: 0, m3: 0, apos: 0, n: 0, prox: null, wj: 0, tot: 0 });
        z.pg += x.pg; z.ap += x.ap; z.tot += x.pg + x.ap;
        if (x.ap > 0) {
          if (x.d < ref) z.v += x.ap;
          else {
            z.n++; if (!z.prox || x.d < z.prox) z.prox = x.d;
            if (x.d <= eom(ref, 0)) z.rm += x.ap; else if (x.d <= eom(ref, 1)) z.m1 += x.ap; else if (x.d <= eom(ref, 2)) z.m2 += x.ap; else if (x.d <= fimJ) z.m3 += x.ap; else z.apos += x.ap;
          }
        }
      }
      for (const z of Object.values(o)) z.wj = z.rm + z.m1 + z.m2 + z.m3;
      return Object.entries(o).sort((a, b) => b[1].wj - a[1].wj || b[1].ap - a[1].ap || b[1].tot - a[1].tot);
    }
    function groupSheet(name, title, rng, keyname, keyf, forn) {
      const s = W.sheet(name, { cols: [48, 14, 14, 14, 9, 13, 12, 13, 13, 13, 14, 13, 9, 9].concat(forn ? [10, 11] : []), freeze: 'B7', logo: forn ? 15 : 13, tab: 'D6D8DB' });
      brand(s, title, 'Valores em R$ · Pago e A Pagar por item · A Pagar distribuído no tempo a partir da data de referência (RESUMO!C6)');
      const labs = [keyname, 'Pago (R$)', 'A Pagar (R$)', 'Total (R$)', '% do A Pagar', 'Vencido\n(antes da data ref.)', 'Restante do mês ref.', null, null, null, 'Janela 3 meses\n(ref. → M+3)', 'Após M+3', '% acum. janela', 'Curva ABC\n(janela)'].concat(forn ? ['Nº parcelas\na pagar', 'Próximo\nvencimento'] : []);
      hdr(s, 6, labs);
      s.set(6, 7, { f: 'EOMONTH(DataRef,0)+1', v: serial(m1) }, 'm1'); s.set(6, 8, { f: 'EOMONTH(DataRef,1)+1', v: serial(m2) }, 'm2'); s.set(6, 9, { f: 'EOMONTH(DataRef,2)+1', v: serial(m3) }, 'm3');
      const rows = agg(keyf); const r0 = 7, rN = r0 + rows.length - 1, tr = rN + 1;
      const T = rows.reduce((a, [, z]) => { for (const k in z) if (typeof z[k] === 'number') a[k] = (a[k] || 0) + z[k]; return a; }, {});
      let acc = 0;
      rows.forEach(([k, z], i) => {
        const r = r0 + i, K = `$A${r}`; acc += z.wj;
        const ac = T.wj ? acc / T.wj : 0;
        s.row(r, 0, [k,
          { f: `SUMIFS(${PGr},${rng},${K})`, v: z.pg }, { f: `SUMIFS(${APr},${rng},${K})`, v: z.ap }, { f: `B${r}+C${r}`, v: z.pg + z.ap },
          { f: `IF($C$${tr}=0,0,C${r}/$C$${tr})`, v: T.ap ? z.ap / T.ap : 0 },
          { f: `SUMIFS(${APr},${rng},${K},${DTr},"<"&DataRef)`, v: z.v },
          { f: `SUMIFS(${APr},${rng},${K},${DTr},">="&DataRef,${DTr},"<="&EOMONTH(DataRef,0))`, v: z.rm },
          { f: `SUMIFS(${APr},${rng},${K},${DTr},">="&H$6,${DTr},"<="&EOMONTH(H$6,0))`, v: z.m1 },
          { f: `SUMIFS(${APr},${rng},${K},${DTr},">="&I$6,${DTr},"<="&EOMONTH(I$6,0))`, v: z.m2 },
          { f: `SUMIFS(${APr},${rng},${K},${DTr},">="&J$6,${DTr},"<="&EOMONTH(J$6,0))`, v: z.m3 },
          { f: `SUM(G${r}:J${r})`, v: z.wj }, { f: `SUMIFS(${APr},${rng},${K},${DTr},">"&FimJanela)`, v: z.apos },
          { f: `IF($K$${tr}=0,0,SUM($K$${r0}:K${r})/$K$${tr})`, v: ac },
          { f: `IF(K${r}=0,"-",IF(M${r}<=0.8,"A",IF(M${r}<=0.95,"B","C")))`, v: z.wj ? (ac <= 0.8 ? 'A' : ac <= 0.95 ? 'B' : 'C') : '-' }],
          ['txt', 'mon', 'mon', 'mon', 'pct', z.v > 0 ? 'rmon' : 'mon', 'mon', 'mon', 'mon', 'mon', 'mon', 'mon', 'pct', 'ctr']);
        if (forn) { s.set(r, 14, { f: `COUNTIFS(${rng},${K},${APr},">0",${DTr},">="&DataRef)`, v: z.n }, 'int'); s.set(r, 15, { f: `IF(O${r}=0,"-",_xlfn.MINIFS(${DTr},${rng},${K},${APr},">0",${DTr},">="&DataRef))`, v: z.prox ? serial(z.prox) : '-' }, 'dt'); }
      });
      s.set(tr, 0, 'TOTAL', 'ttxt');
      ['pg', 'ap', 'tot'].forEach((k, i) => s.set(tr, 1 + i, { f: `SUM(${colL(1 + i)}${r0}:${colL(1 + i)}${rN})`, v: T[k] }, 'tmon'));
      s.set(tr, 4, { f: `SUM(E${r0}:E${rN})`, v: 1 }, 'tpct');
      ['v', 'rm', 'm1', 'm2', 'm3', 'wj', 'apos'].forEach((k, i) => s.set(tr, 5 + i, { f: `SUM(${colL(5 + i)}${r0}:${colL(5 + i)}${rN})`, v: T[k] }, 'tmon'));
      s.set(tr, 12, '', 'ttxt'); s.set(tr, 13, '', 'ttxt');
      if (forn) { s.set(tr, 14, { f: `SUM(O${r0}:O${rN})`, v: T.n }, 'tint'); s.set(tr, 15, '', 'ttxt'); }
      s.set(tr + 1, 0, 'Conferência: Vencido + Janela + Após = A Pagar (deve ser 0)', 'note'); s.set(tr + 1, 2, { f: `ROUND(F${tr}+K${tr}+L${tr}-C${tr},2)`, v: 0 }, 'mon');
      s.set(tr + 2, 0, `Curva ABC sobre a janela de 3 meses: A = até 80% acumulado, B = 80–95%, C = restante. Ordem das linhas gerada em ${fdBR(ref)} pelo valor da janela.`, 'note');
      s.o.filter = `A6:${colL(labs.length - 1)}${rN}`;
      return { s, r0, rN, tr, rows, T };
    }
    const fdBR = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);

    // ---------- POR MÊS ----------
    const PM = W.sheet('POR MÊS', { cols: [12, 15, 15, 14, 15, 10, 17, 10, 10], freeze: 'B7', logo: 9, tab: 'D6D8DB' });
    brand(PM, 'FLUXO POR MÊS — PAGO × A PAGAR', 'Mês da data de pagamento · Vencido = a pagar com data anterior à data de referência');
    hdr(PM, 6, ['Mês', 'Pago (R$)', 'A Pagar (R$)', 'dos quais\nVencido (R$)', 'Total (R$)', '% do total', 'Total acumulado (R$)', 'Nº parcelas', 'Na janela\n3 meses?']);
    const mks = [...new Set(L.map(x => x.d.slice(0, 7)))].sort(); const allM = []; for (let k = mks[0]; k <= mks.at(-1); k = addM(k, 1)) allM.push(k);
    const bym = {}; for (const x of L) { const k = x.d.slice(0, 7); const z = bym[k] || (bym[k] = { pg: 0, ap: 0, v: 0, n: 0 }); z.pg += x.pg; z.ap += x.ap; z.n++; if (x.ap > 0 && x.d < ref) z.v += x.ap; }
    const GT = L.reduce((a, x) => a + x.pg + x.ap, 0); const mT = 7 + allM.length; let accm = 0;
    allM.forEach((k, i) => {
      const r = 7 + i, z = bym[k] || { pg: 0, ap: 0, v: 0, n: 0 }; accm += z.pg + z.ap; const ini = k + '-01';
      const inW = eom(ini, 0) >= ref && ini <= fimJ;
      PM.row(r, 0, [serial(ini), { f: `SUMIFS(${PGr},${MESr},$A${r})`, v: z.pg }, { f: `SUMIFS(${APr},${MESr},$A${r})`, v: z.ap }, { f: `SUMIFS(${APr},${MESr},$A${r},${STr},"VENCIDO")`, v: z.v },
        { f: `B${r}+C${r}`, v: z.pg + z.ap }, { f: `IF($E$${mT}=0,0,E${r}/$E$${mT})`, v: GT ? (z.pg + z.ap) / GT : 0 }, { f: `SUM($E$7:E${r})`, v: accm }, { f: `COUNTIFS(${MESr},$A${r})`, v: z.n },
        { f: `IF(AND(EOMONTH(A${r},0)>=DataRef,A${r}<=FimJanela),"SIM","")`, v: inW ? 'SIM' : '' }], ['my', 'mon', 'mon', 'mon', 'mon', 'pct', 'mon', 'int', 'ctr']);
    });
    PM.set(mT, 0, 'TOTAL', 'ttxt');
    [[1, 'pg'], [2, 'ap'], [3, 'v'], [4, null], [5, null], [7, 'n']].forEach(([c, k]) => PM.set(mT, c, { f: `SUM(${colL(c)}7:${colL(c)}${mT - 1})`, v: k ? L.reduce((a, x) => a + (k === 'n' ? 1 : k === 'v' ? (x.ap > 0 && x.d < ref ? x.ap : 0) : x[k]), 0) : (c === 4 ? GT : 1) }, c === 5 ? 'tpct' : c === 7 ? 'tint' : 'tmon'));
    PM.set(mT, 6, '', 'ttxt'); PM.set(mT, 8, '', 'ttxt');
    const prov = L.filter(x => x.d >= '2027-12-31' && x.d.endsWith('-12-31'));
    if (prov.length) PM.set(mT + 1, 0, `Obs.: ${prov.length} parcelas (${brl(prov.reduce((a, x) => a + x.ap + x.pg, 0))}) estão lançadas em 31/12 — data aparentemente provisória; confirmar vencimento real com Compras.`, 'rnote');

    // ---------- RESUMO INSUMO ----------
    const RI = W.sheet('RESUMO INSUMO', { cols: [70, 15, 15, 15, 16, 9, 13, 14, 15], freeze: 'B7', logo: 9, tab: 'D6D8DB' });
    brand(RI, 'RESUMO POR INSUMO — PRÓXIMOS 3 MESES', 'Mesmo critério da tabela dinâmica: soma de Pagar&Pago por insumo, mês a mês, ordenado por código · vencidos à parte');
    hdr(RI, 6, ['Insumo', null, null, null, 'Total 3 meses\n(Pagar&Pago)', '% dos\n3 meses', 'dos quais\nPago', 'dos quais\nA Pagar', 'Vencido\n(antes da data ref.)']);
    RI.set(6, 1, { f: 'EOMONTH(DataRef,0)+1', v: serial(m1) }, 'm1'); RI.set(6, 2, { f: 'EOMONTH(DataRef,1)+1', v: serial(m2) }, 'm2'); RI.set(6, 3, { f: 'EOMONTH(DataRef,2)+1', v: serial(m3) }, 'm3');
    const riK = [...new Set(L.filter(x => (x.d >= m1 && x.d <= fimJ) || (x.ap > 0 && x.d < ref)).map(x => x.ins))].sort();
    const riV = k => { const o = { a: 0, b: 0, c: 0, pg: 0, ap: 0, v: 0 }; for (const x of L) if (x.ins === k) { if (x.d >= m1 && x.d <= eom(m1, 0)) o.a += x.pg + x.ap; else if (x.d >= m2 && x.d <= eom(m2, 0)) o.b += x.pg + x.ap; else if (x.d >= m3 && x.d <= fimJ) o.c += x.pg + x.ap; if (x.d >= m1 && x.d <= fimJ) { o.pg += x.pg; o.ap += x.ap; } if (x.ap > 0 && x.d < ref) o.v += x.ap; } return o; };
    const riRows = riK.map(k => [k, riV(k)]); const riT = riRows.reduce((a, [, o]) => a + o.a + o.b + o.c, 0); const qT = 7 + riRows.length;
    riRows.forEach(([k, o], i) => {
      const r = 7 + i, K = `$A${r}`;
      RI.row(r, 0, [k, ...['B', 'C', 'D'].map((c, j) => ({ f: `SUMIFS(${TOTr},${INSr},${K},${DTr},">="&${c}$6,${DTr},"<="&EOMONTH(${c}$6,0))`, v: [o.a, o.b, o.c][j] })),
        { f: `SUM(B${r}:D${r})`, v: o.a + o.b + o.c }, { f: `IF($E$${qT}=0,0,E${r}/$E$${qT})`, v: riT ? (o.a + o.b + o.c) / riT : 0 },
        { f: `SUMIFS(${PGr},${INSr},${K},${DTr},">="&$B$6,${DTr},"<="&FimJanela)`, v: o.pg }, { f: `SUMIFS(${APr},${INSr},${K},${DTr},">="&$B$6,${DTr},"<="&FimJanela)`, v: o.ap },
        { f: `SUMIFS(${APr},${INSr},${K},${DTr},"<"&DataRef)`, v: o.v }], ['txt', 'mon', 'mon', 'mon', 'mon', 'pct', 'mon', 'mon', o.v > 0 ? 'rmon' : 'mon']);
    });
    RI.set(qT, 0, 'TOTAL GERAL', 'ttxt');
    ['a', 'b', 'c', null, null, 'pg', 'ap', 'v'].forEach((k, j) => { const c = 1 + j; RI.set(qT, c, { f: `SUM(${colL(c)}7:${colL(c)}${qT - 1})`, v: k ? riRows.reduce((a, [, o]) => a + o[k], 0) : (c === 4 ? riT : 1) }, c === 5 ? 'tpct' : 'tmon'); });
    RI.o.filter = `A6:I${qT - 1}`;

    const gi = groupSheet('POR INSUMO', 'FLUXO POR INSUMO — PAGO × A PAGAR', INSr, 'Insumo', x => x.ins);
    const gf = groupSheet('POR FORNECEDOR', 'FLUXO POR FORNECEDOR — PAGO × A PAGAR', FORr, 'Fornecedor', x => x.forn, true);
    const gs = groupSheet('POR SERVIÇO', 'FLUXO POR SERVIÇO (COMPOSIÇÃO) — PAGO × A PAGAR', SERr, 'Serviço', x => x.srv);
    RI.set(qT + 1, 0, 'Conferência com a aba POR INSUMO (Janela M+1 a M+3 − Total 3 meses; deve ser 0)', 'note');
    RI.set(qT + 1, 4, { f: `ROUND(SUM('POR INSUMO'!H${gi.tr}:J${gi.tr})+G${qT}-E${qT},2)`, v: 0 }, 'mon');

    // ---------- SEMANAL ----------
    const SW = W.sheet('SEMANAL', { cols: [13, 13, 20, 11, 17, 11], logo: 6, tab: 'D6D8DB' });
    brand(SW, 'PROGRAMAÇÃO SEMANAL DE DESEMBOLSO — JANELA DE 3 MESES', 'Somente A Pagar com data ≥ data de referência e ≤ fim de M+3 · vencidos ficam na aba VENCIDOS');
    hdr(SW, 6, ['Semana (seg)', 'até (dom)', 'A Pagar na semana (R$)', 'Nº parcelas', 'Acumulado (R$)', '% da janela']);
    const dow = (new Date(ref + 'T00:00:00Z').getUTCDay() + 6) % 7; const w0 = isoAdd(ref, -dow);
    const wk = []; for (let w = w0; w <= fimJ; w = isoAdd(w, 7)) wk.push(w);
    const wv = wk.map(w => { const lo = w < ref ? ref : w, hi = isoAdd(w, 6) > fimJ ? fimJ : isoAdd(w, 6); const xs = L.filter(x => x.ap > 0 && x.d >= lo && x.d <= hi); return [xs.reduce((a, x) => a + x.ap, 0), xs.length]; });
    const wT = 7 + wk.length, wsum = wv.reduce((a, x) => a + x[0], 0); let wacc = 0;
    wk.forEach((w, i) => {
      const r = 7 + i; wacc += wv[i][0];
      SW.row(r, 0, [i === 0 ? { f: 'DataRef-WEEKDAY(DataRef,3)', v: serial(w) } : { f: `A${r - 1}+7`, v: serial(w) }, { f: `A${r}+6`, v: serial(isoAdd(w, 6)) },
        { f: `IF(A${r}>FimJanela,0,SUMIFS(${APr},${DTr},">="&MAX(A${r},DataRef),${DTr},"<="&MIN(B${r},FimJanela)))`, v: wv[i][0] },
        { f: `IF(A${r}>FimJanela,0,COUNTIFS(${APr},">0",${DTr},">="&MAX(A${r},DataRef),${DTr},"<="&MIN(B${r},FimJanela)))`, v: wv[i][1] },
        { f: `SUM($C$7:C${r})`, v: wacc }, { f: `IF($C$${wT}=0,0,C${r}/$C$${wT})`, v: wsum ? wv[i][0] / wsum : 0 }], ['dt', 'dt', 'mon', 'int', 'mon', 'pct']);
    });
    SW.set(wT, 0, 'TOTAL JANELA', 'ttxt'); SW.set(wT, 1, '', 'ttxt'); SW.set(wT, 2, { f: `SUM(C7:C${wT - 1})`, v: wsum }, 'tmon'); SW.set(wT, 3, { f: `SUM(D7:D${wT - 1})`, v: wv.reduce((a, x) => a + x[1], 0) }, 'tint'); SW.set(wT, 4, '', 'ttxt'); SW.set(wT, 5, { f: `SUM(F7:F${wT - 1})`, v: 1 }, 'tpct');

    // ---------- listas ----------
    function listSheet(name, title, sub, data, venc) {
      const s = W.sheet(name, { cols: [11, 10, 42, 38, 38, 9, 7, 38, 14], freeze: 'A7', logo: 9, tab: 'D6D8DB' });
      brand(s, title, sub);
      hdr(s, 6, ['Data Pgto', venc ? 'Dias em atraso' : 'Dias p/ vencer', 'Fornecedor', 'Insumo', 'Serviço', 'Processo', 'Parcela', 'Item do processo', 'A Pagar (R$)']);
      data.forEach((x, i) => { const r = 7 + i; s.row(r, 0, [serial(x.d), { f: venc ? `DataRef-A${r}` : `A${r}-DataRef`, v: venc ? serial(ref) - serial(x.d) : serial(x.d) - serial(ref) }, x.forn, x.ins, x.srv, +x.proc || x.proc, +x.parc || x.parc, x.item, r2(x.ap)], ['dt', 'int', 'txt', 'txt', 'txt', 'txt', 'txt', 'txt', 'mon']); });
      const t = 7 + data.length; s.set(t, 0, 'TOTAL', 'ttxt'); for (let c = 1; c < 8; c++) s.set(t, c, '', 'ttxt'); s.set(t, 8, { f: `SUM(I7:I${t - 1})`, v: data.reduce((a, x) => a + r2(x.ap), 0) }, 'tmon');
      s.set(t + 1, 0, `Lista extraída do relatório com data de referência ${fdBR(ref)} (valores, não fórmulas) — refeita a cada exportação.`, 'note');
      if (data.length) s.o.filter = `A6:I${t - 1}`;
      return t;
    }
    const venc = L.filter(x => x.ap > 0 && x.d < ref).sort((a, b) => a.d.localeCompare(b.d) || b.ap - a.ap);
    listSheet('VENCIDOS', 'A PAGAR VENCIDO (DATA ANTERIOR À DATA DE REFERÊNCIA)', 'Parcelas ainda marcadas como A Pagar com data já passada — confirmar se foram pagas e não baixadas, ou se estão em atraso', venc, true);
    const big = L.filter(x => x.ap > 0 && x.d >= ref && x.d <= fimJ).sort((a, b) => b.ap - a.ap).slice(0, 40).sort((a, b) => a.d.localeCompare(b.d));
    listSheet('MAIORES PARCELAS', '40 MAIORES PARCELAS A PAGAR NA JANELA DE 3 MESES', 'Ordenadas por data · base para negociação de prazos e programação de caixa', big, false);

    // ---------- ALTERAÇÕES (quando a YAC-FLUXO foi atualizada) ----------
    if (opts.alter) {
      const A = opts.alter, s = W.sheet('ALTERAÇÕES ' + A.revLabel, { cols: [10, 48, 8, 11, 44, 15, 15, 14, 16, 20, 26], freeze: 'A6', logo: 11, tab: 'C00000' });
      brand(s, `${A.revLabel} (${fdBR(ref)}) — alterações na aba FLUXO-BASE`, 'Critério: serviços planejados no aplicativo → FLUXO-BASE do mês = consolidado no Pagar&Pago + (planejado − consolidado, mínimo 0) (sobe ou desce); demais serviços → piso do comprometido (sobe só onde o Pagar&Pago supera o previsto)');
      hdr(s, 5, ['Insumo', 'Descrição', 'Mês', 'Célula alterada', 'Linha (descrição)', 'Previsto anterior do insumo no mês (R$)', 'Alvo do insumo no mês (R$)', 'Ajuste na célula (R$)', 'Valor anterior da célula', 'Novo valor da célula', 'Critério']);
      const ch = A.changes.slice().sort((a, b) => a.cod.localeCompare(b.cod) || a.mes.localeCompare(b.mes));
      ch.forEach((p, i) => { const r = 6 + i; s.row(r, 0, [p.cod, p.desc, serial(p.mes + '-01'), p.celula, p.leaf || '(linha sem descrição)', p.prev, p.rep, p.delta, p.old, p.novo, p.origem || 'piso do relatório'], ['txt', 'txt', 'my', 'ctr', 'txt', 'mon', 'mon', 'rmon', 'mon', 'txt', 'txt']); });
      const t = 6 + Math.max(ch.length, 1); if (ch.length) s.set(t, 0, 'TOTAL', 'ttxt'); if (ch.length) s.set(t, 7, { f: `SUM(H6:H${t - 1})`, v: ch.reduce((a, p) => a + p.delta, 0) }, 'tmon');
      let n = t + 2;
      if (!ch.length) { s.set(6, 0, 'Nenhuma célula precisou ser alterada: o previsto já cobre o comprometido nos 3 meses.', 'lbl'); }
      if (A.missing.length) {
        s.set(n, 0, 'INSUMOS DO RELATÓRIO SEM LINHA NA FLUXO-BASE (não alterados — incluir manualmente se for o caso)', 'rtxt'); n++;
        A.missing.forEach(m => { s.row(n, 0, [m.cod, tail(m.desc), m.mes ? serial(m.mes + '-01') : ''], ['txt', 'txt', 'my']); s.set(n, 6, m.v, 'mon'); n++; });
      }
      if (A.skipped && A.skipped.length) { n++; s.set(n, 0, 'Células não alteradas (verificar manualmente):', 'rtxt'); n++; A.skipped.forEach(p => { s.row(n, 0, [p.cod, p.desc, serial(p.mes + '-01'), p.col + p.row, p.motivo], ['txt', 'txt', 'my', 'ctr', 'txt']); s.set(n, 7, p.delta, 'mon'); n++; }); }
    }


    // ---------- BASE ----------
    const BS = W.sheet('BASE', { cols: [11, 9, 10, 42, 40, 40, 11, 9, 7, 40, 13, 13, 13, 10], freeze: 'A2', tab: '6A6B6C' });
    hdr(BS, 1, ['Data Pgto', 'Mês', 'Status', 'Fornecedor', 'Insumo', 'Serviço', 'Item EAP', 'Processo', 'Parcela', 'Item do processo', 'Pago (R$)', 'A Pagar (R$)', 'Total (R$)', 'Chave']);
    L.forEach((x, i) => {
      const r = i + 2;
      BS.row(r, 0, [serial(x.d), { f: `DATE(YEAR(A${r}),MONTH(A${r}),1)`, v: serial(x.d.slice(0, 7) + '-01') }, { f: `IF(L${r}>0,IF(A${r}<DataRef,"VENCIDO","A PAGAR"),"PAGO")`, v: st(x) },
        x.forn, x.ins, x.srv, x.eap, +x.proc || x.proc, +x.parc || x.parc, x.item, x.pg, x.ap, { f: `K${r}+L${r}`, v: x.pg + x.ap }, i + 1],
        ['dtplain', 'my', st(x) === 'VENCIDO' ? 'rtxt' : 'def', 'def', 'def', 'def', 'def', 'def', 'def', 'def', 'mon', 'mon', 'mon', 'def']);
    });
    BS.o.filter = `A1:N${L.length + 1}`;

    // ---------- RESUMO (corpo) ----------
    const Tall = gf.T, pagoT = L.reduce((a, x) => a + x.pg, 0), apT = L.reduce((a, x) => a + x.ap, 0);
    brand(R, 'FLUXO DE DESEMBOLSO — OBRA YACHT FAMA ECCORP (OBCEN)', `Relatório Pagar & Pago · data de referência ${fdBR(ref)} · janela de análise: data de referência + 3 meses`);
    R.set(6, 0, 'Data de referência', 'lbl'); R.set(6, 2, serial(ref), 'inp'); R.set(6, 3, '← altere para a data do novo relatório; tudo recalcula (status Vencido, meses M+1…M+3, semanas)', 'note');
    R.set(7, 0, 'Fim da janela (M+3)', 'lbl'); R.set(7, 2, { f: 'EOMONTH(DataRef,3)', v: serial(fimJ) }, 'dtplain');
    const band = (r, t, c1, c2) => { R.set(r, c1, t, 'band'); for (let c = c1 + 1; c <= c2; c++) R.set(r, c, '', 'band'); };
    band(9, 'POSIÇÃO GERAL DO RELATÓRIO', 0, 3);
    const k = (r, lab, f, v, stl = 'mon', c = 0, vc = 2) => { R.set(r, c, lab, stl.startsWith('k') ? 'lbl' : 'def'); R.set(r, vc, { f, v }, stl === 'mon' ? 'mon' : stl); };
    k(10, 'Total do relatório (Pago + A Pagar)', `SUM(${PGr})+SUM(${APr})`, pagoT + apT, 'kmon');
    k(11, 'Pago', `SUM(${PGr})`, pagoT); R.set(11, 3, { f: 'IF(C10=0,0,C11/C10)', v: pagoT / (pagoT + apT) }, 'pct');
    k(12, 'A Pagar', `SUM(${APr})`, apT); R.set(12, 3, { f: 'IF(C10=0,0,C12/C10)', v: apT / (pagoT + apT) }, 'pct');
    k(13, '   dos quais VENCIDO (data < referência)', `SUMIFS(${APr},${STr},"VENCIDO")`, Tall.v, 'rmon'); R.set(13, 3, { f: 'IF(C12=0,0,C13/C12)', v: apT ? Tall.v / apT : 0 }, 'pct');
    k(14, '   nº de parcelas vencidas', `COUNTIFS(${STr},"VENCIDO")`, venc.length, 'int');
    R.set(15, 0, 'Fornecedores / Insumos / Serviços'); R.set(15, 2, `${gf.rows.length} / ${gi.rows.length} / ${gs.rows.length}`, 'txt');
    band(9, 'DESEMBOLSO PREVISTO — PRÓXIMOS 3 MESES', 4, 7);
    R.set(10, 4, 'Restante do mês de referência'); R.set(10, 6, { f: `'POR FORNECEDOR'!G${gf.tr}`, v: Tall.rm }, 'gmon');
    [['H', Tall.m1, m1], ['I', Tall.m2, m2], ['J', Tall.m3, m3]].forEach(([c, v, mm], i) => {
      const r = 11 + i; R.set(r, 4, { f: `EOMONTH(DataRef,${i})+1`, v: serial(mm) }, 'mlong' + (i + 1));
      R.set(r, 6, { f: `'POR FORNECEDOR'!${c}${gf.tr}`, v }, 'gmon'); R.set(r, 7, { f: `IF($G$14=0,0,G${r}/$G$14)`, v: Tall.wj ? v / Tall.wj : 0 }, 'pct');
    });
    R.set(10, 7, { f: 'IF($G$14=0,0,G10/$G$14)', v: Tall.wj ? Tall.rm / Tall.wj : 0 }, 'pct');
    R.set(14, 4, 'TOTAL JANELA 3 MESES', 'lbl'); R.set(14, 6, { f: 'SUM(G10:G13)', v: Tall.wj }, 'kmon');
    R.set(15, 4, 'Após a janela'); R.set(15, 6, { f: `'POR FORNECEDOR'!L${gf.tr}`, v: Tall.apos }, 'gmon');
    R.set(16, 4, 'Média mensal da janela (M+1 a M+3)'); R.set(16, 6, { f: 'AVERAGE(G11:G13)', v: (Tall.m1 + Tall.m2 + Tall.m3) / 3 }, 'mon');
    R.set(17, 4, 'Caixa necessário: janela + vencidos', 'lbl'); R.set(17, 6, { f: 'G14+C13', v: Tall.wj + Tall.v }, 'kmon');
    band(19, 'CONCENTRAÇÃO (JANELA 3 MESES)', 0, 3);
    const top5 = gf.rows.slice(0, 5).reduce((a, [, z]) => a + z.wj, 0);
    k(20, 'Top 1 fornecedor — % da janela', `IF($G$14=0,0,'POR FORNECEDOR'!K${gf.r0}/$G$14)`, Tall.wj ? gf.rows[0][1].wj / Tall.wj : 0, 'pct');
    k(21, 'Top 5 fornecedores — % da janela', `IF($G$14=0,0,SUM('POR FORNECEDOR'!K${gf.r0}:K${gf.r0 + 4})/$G$14)`, Tall.wj ? top5 / Tall.wj : 0, 'pct');
    k(22, 'Top 1 insumo — % da janela', `IF($G$14=0,0,'POR INSUMO'!K${gi.r0}/$G$14)`, Tall.wj ? gi.rows[0][1].wj / Tall.wj : 0, 'pct');
    let accA = 0, nA = 0; for (const [, z] of gf.rows) { if (!z.wj) break; accA += z.wj; if (accA / Tall.wj <= 0.8) nA++; }
    k(23, 'Fornecedores classe A (80% da janela)', `COUNTIF('POR FORNECEDOR'!N${gf.r0}:N${gf.rN},"A")`, nA, 'int');
    const wmax = wv.reduce((a, x, i) => x[0] > wv[a][0] ? i : a, 0);
    k(24, 'Semana de maior desembolso', `INDEX(SEMANAL!A7:A${wT - 1},MATCH(MAX(SEMANAL!C7:C${wT - 1}),SEMANAL!C7:C${wT - 1},0))`, wk.length ? serial(wk[wmax]) : 0, 'dt');
    k(25, '   valor dessa semana', `MAX(SEMANAL!C7:C${wT - 1})`, wv.length ? wv[wmax][0] : 0);
    const top = (r, title, sh, g, cn, cv, cp) => {
      R.set(r, cn, title, 'band'); for (let c = cn + 1; c <= cp; c++) R.set(r, c, '', 'band');
      R.set(r + 1, cn, 'Nome', 'th'); R.set(r + 1, cv, 'Janela 3m (R$)', 'th'); R.set(r + 1, cp, '% janela', 'th');
      for (let i = 0; i < 10 && i < g.rows.length; i++) { const rr = r + 2 + i, src = g.r0 + i; R.set(rr, cn, { f: `'${sh}'!A${src}`, v: g.rows[i][0] }, 'gtxt'); R.set(rr, cv, { f: `'${sh}'!K${src}`, v: g.rows[i][1].wj }, 'gmon'); R.set(rr, cp, { f: `IF($G$14=0,0,${colL(cv)}${rr}/$G$14)`, v: Tall.wj ? g.rows[i][1].wj / Tall.wj : 0 }, 'pct'); }
    };
    top(27, 'TOP 10 FORNECEDORES — JANELA 3 MESES', 'POR FORNECEDOR', gf, 0, 2, 3);
    top(27, 'TOP 10 INSUMOS — JANELA 3 MESES', 'POR INSUMO', gi, 4, 6, 7);
    // análise
    const mT1 = Tall.m1, wTot = Tall.wj;
    const wkv = wv.slice(0, 3).reduce((a, x) => a + x[0], 0);
    const vF = agg(x => x.forn).filter(([, z]) => z.v > 0).sort((a, b) => b[1].v - a[1].v);
    const notes = [
      `1. Janela de 3 meses (${fdBR(ref)} a ${fdBR(fimJ)}): ${brl(wTot)} a pagar — M+1 concentra ${brl(mT1)} (${wTot ? Math.round(mT1 / wTot * 100) : 0}%), M+2 ${brl(Tall.m2)} e M+3 ${brl(Tall.m3)}.`,
      `2. As três primeiras semanas da janela somam ${brl(wkv)} (${wTot ? Math.round(wkv / wTot * 100) : 0}% da janela).`,
      gf.rows[0] ? `3. Concentração: ${tail(gf.rows[0][0])} responde por ${brl(gf.rows[0][1].wj)} (${wTot ? Math.round(gf.rows[0][1].wj / wTot * 100) : 0}% da janela); os 5 maiores fornecedores somam ${wTot ? Math.round(top5 / wTot * 100) : 0}%.` : '',
      gi.rows[0] ? `4. Por insumo, ${tail(gi.rows[0][0])} é o maior item (${brl(gi.rows[0][1].wj)}, ${wTot ? Math.round(gi.rows[0][1].wj / wTot * 100) : 0}%).` : '',
      `5. Vencidos: ${venc.length} parcelas / ${brl(Tall.v)} com data anterior a ${fdBR(ref)} ainda como A Pagar${vF[0] ? `. Maior: ${tail(vF[0][0])} (${brl(vF[0][1].v)})` : ''}. Confirmar se foram pagas e não baixadas.`,
      prov.length ? `6. Lançamentos com data 31/12: ${prov.length} parcelas / ${brl(prov.reduce((a, x) => a + x.ap + x.pg, 0))} — data provavelmente provisória; podem cair dentro da janela.` : '',
      `7. Pago no relatório: ${brl(pagoT)}.`
    ].filter(Boolean);
    band(40, `ANÁLISE DO ORÇAMENTISTA — LEITURA DO RELATÓRIO (REF. ${fdBR(ref)})`, 0, 7);
    notes.forEach((t, i) => { const r = 41 + i; R.set(r, 0, t, 'wrap'); R.merge(`A${r}:H${r}`); R.h(r, 30); });
    const lr = 42 + notes.length;
    R.set(lr, 0, 'Legenda: célula amarela/azul = entrada (data de referência) · verde = vínculo com outra aba · preto = fórmula. Os textos da análise são fixos (leitura na data de referência).', 'note');
    R.set(lr + 1, 0, 'Gerado pelo aplicativo de consulta da obra a partir do relatório Pagar & Pago importado. Para nova leitura, importe o relatório novo no aplicativo e exporte de novo.', 'note');
    return W.blob(opts.logo, opts.u8);
  };


  /* =====================================================================
     4) Comparativo com o orçamento (item por item) — com quantidade executada para preencher
     ===================================================================== */
  YX.buildComparativo = async function (M, groups, refISO, opts = {}) {
    const W = YX.Book(); const O = M.cmp;
    const fdBR = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
    const brand = (ws, title, sub) => { ws.set(1, 0, 'GELLEN & GUIMARÃES', 'brand'); ws.set(2, 0, title, 'title'); ws.set(3, 0, sub, 'subt'); ws.h(2, 20); };
    const hdr = (ws, r, labs) => { labs.forEach((t, i) => ws.set(r, i, t, 'th')); ws.h(r, 36); };
    // ---------- PARCELAS × ITEM ----------
    const P = []; // linhas de alocação
    for (const o of Object.values(O.items)) for (const l of o.lanc) P.push({ it: o.c.it, x: l.x, sh: l.share, via: l.via });
    for (const [sid, x] of Object.entries(O.semItem)) for (const l of x.lanc) P.push({ it: 'SEM ITEM ' + sid, x: l.x, sh: 1, via: 'sem item do orçamento' });
    P.sort((a, b) => a.it.localeCompare(b.it) || a.x.d.localeCompare(b.x.d));
    const CT = !!M.ct;
    const C = W.sheet('COMPARATIVO', { cols: [8, 30, 12, 52, 6, 12, 13, 15, 15, 14, 14, 15, 10, 13, 13, 10, 26, 8, 15, 15], freeze: 'E7', logo: CT ? 19 : 17, tab: '6A6B6C', first: true });
    const R = W.sheet('RESUMO POR SERVIÇO', { cols: [11, 44, 30, 16, 16, 16, 10, 11], freeze: 'C7', logo: 8, tab: 'D6D8DB' });
    const CS = CT ? W.sheet('CONTRATOS × ITEM', { cols: [9, 6, 30, 36, 9, 34, 6, 11, 13, 13, 11, 34, 9, 14, 30, 11, 12, 13, 30], freeze: 'A7', logo: 18, tab: 'D6D8DB' }) : null;
    const PS = W.sheet('PARCELAS × ITEM', { cols: [11, 34, 30, 40, 9, 7, 14, 13, 13, 13, 44, 9, 15, 26], freeze: 'A7', logo: 14, tab: 'D6D8DB' });
    brand(PS, 'PARCELAS DO RELATÓRIO × ITEM DO ORÇAMENTO', 'Cada parcela do Pagar & Pago com o item do orçamento a que foi ligada · quando há rateio a parcela aparece uma vez por item, com a parte atribuída');
    hdr(PS, 6, ['Data pgto', 'Fornecedor', 'Insumo (relatório)', 'Item comprado (relatório)', 'Processo', 'Parcela', 'Valor da parcela (R$)', 'Pago (R$)', 'A pagar (R$)', 'Item do orçamento', 'Composição', 'Parte no item', 'Valor atribuído (R$)', 'Vínculo', 'Item da quantidade', 'Qtd. medida (contrato)', 'Qtd. executada no item', 'Regra da quantidade']);
    const comp = {}; Object.values(O.items).forEach(o => comp[o.c.it] = o.c);
    P.forEach((p, i) => {
      const r = 7 + i, x = p.x;
      PS.row(r, 0, [serial(x.d), x.forn, x.ins, x.item, +x.proc || x.proc, +x.parc || x.parc, x.pg + x.ap, x.pg, x.ap, p.it, comp[p.it] ? comp[p.it].d : '(sem item do orçamento)', p.sh, { f: `G${r}*L${r}`, v: (x.pg + x.ap) * p.sh }, p.via],
        ['dt', 'txt', 'txt', 'txt', 'txt', 'txt', 'mon', 'mon', 'mon', 'txt', 'txt', 'pctb', 'kmon', 'txt']);
    });
    const pl = 6 + P.length, PR = c => `'PARCELAS × ITEM'!$${c}$7:$${c}$${Math.max(7, pl)}`;
    PS.set(pl + 1, 0, 'TOTAL', 'ttxt'); PS.set(pl + 1, 12, { f: `SUM(M7:M${pl})`, v: P.reduce((a, p) => a + (p.x.pg + p.x.ap) * p.sh, 0) }, 'tmon');
    PS.o.filter = `A6:N${pl}`;
    let CR = null;
    if (CT) {
      brand(CS, 'CONTRATOS × ITEM DO ORÇAMENTO — SALDO A MEDIR', 'Relatório de contratos: só o valor ainda a medir (o já medido é lançado no Pagar & Pago) · quando o vínculo é rateio, o item de contrato aparece uma vez por item do orçamento');
      hdr(CS, 6, ['Contrato', 'Item', 'Fornecedor', 'Objeto do contrato', 'Serviço (CC)', 'Descrição do item', 'Un.', 'Qtd. a medir', 'Saldo a medir (R$)', 'Medido (R$)', 'Item do orçamento', 'Composição', 'Parte no item', 'Valor atribuído (R$)', 'Vínculo']);
      const CL = []; for (const it of M.ct.itens) { if (it.va <= 0.005 && !it.qit) continue; if (it.parts.length) it.parts.forEach(([k, sh], j) => CL.push({ it, k, sh, first: j === 0 })); else CL.push({ it, k: 'SEM ITEM', sh: 1, first: true }); }
      CL.forEach((c, i) => { const r = 7 + i, it = c.it; CS.row(r, 0, [+it.ct || it.ct, +it.item || it.item, it.forn, it.obj, it.srv, it.d, it.un, it.qa, it.va, it.vm, c.k, O.items[c.k] ? O.items[c.k].c.d : '(sem item do orçamento)', c.sh, { f: `I${r}*M${r}`, v: it.va * c.sh }, it.via, ...(c.first && it.qit ? [it.qit, it.qm, it.qcontrib || 0, it.qvia + (O.items[it.qit] && O.items[it.qit].qx ? ' · ' + O.items[it.qit].qx.regra : '')] : ['', '', '', it.qvia || ''])], ['txt', 'txt', 'txt', 'txt', 'txt', 'txt', 'ctr', 'mon', 'mon', 'mon', 'txt', c.k === 'SEM ITEM' ? 'rtxt' : 'txt', 'pctb', 'kmon', 'txt', 'txt', 'mon', 'kmon', 'txt']); });
      const cl2 = 6 + CL.length; CS.set(cl2 + 1, 0, 'TOTAL', 'ttxt'); CS.set(cl2 + 1, 13, { f: `SUM(N7:N${cl2})`, v: CL.reduce((a, c) => a + c.it.va * c.sh, 0) }, 'tmon'); CS.o.filter = `A6:S${cl2}`;
      CR = c => `'CONTRATOS × ITEM'!$${c}$7:$${c}$${Math.max(7, cl2)}`;
    }
    // ---------- COMPARATIVO ----------
    brand(C, `COMPARATIVO ORÇAMENTO × GASTO — ITEM POR ITEM${opts.rev ? ' — R' + String(opts.rev).padStart(2, '0') : ''}`, `Orçamento R${M.meta.orcRev} × relatório Pagar & Pago (ref. ${fdBR(refISO)}) · Saldo = Orçado − Gasto (vermelho negativo, verde positivo) · quantidade executada (coluna N, amarela) já vem dos contratos medidos (aba CONTRATOS × ITEM) — pode sobrescrever — e o saldo da quantidade se abate sozinho`);
    C.set(4, 0, 'Legenda:', 'lbl'); C.set(4, 1, 'amarelo = preencher · verde/vermelho = saldo positivo/negativo · Gasto vem da aba PARCELAS × ITEM', 'note');
    hdr(C, 6, ['Nível', 'Serviço', 'Item', 'Composição do orçamento', 'Un.', 'Qtd. orçada', 'Preço unit. (R$)', 'Orçado (R$)', 'Gasto (R$)', 'dos quais pago (R$)', 'dos quais a pagar (R$)', 'Saldo (R$)', '% consumido', 'Qtd. executada (preencher)', 'Saldo qtd.', '% qtd. executada', 'Vínculo do gasto', 'Parcelas', ...(CT ? ['A medir em contratos (R$)', 'Saldo após contratos (R$)'] : [])]);
    let r = 7; const TC = { 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 18: 0 };
    const grpRow = (rr, nivel, chave, titulo, first, last, vals, lvl) => {
      const rg = c => `${colL(c)}${first}:${colL(c)}${last}`, cond = `$A${first}:$A${last},"Item"`;
      C.row(rr, 0, [nivel, chave, '', titulo, '', '', '', { f: `SUMIFS(${rg(7)},${cond})`, v: vals.tot }, { f: `SUMIFS(${rg(8)},${cond})`, v: vals.g }, { f: `SUMIFS(${rg(9)},${cond})`, v: vals.pg }, { f: `SUMIFS(${rg(10)},${cond})`, v: vals.ap },
        { f: `H${rr}-I${rr}`, v: vals.tot - vals.g }, { f: `IF(H${rr}=0,"",I${rr}/H${rr})`, v: vals.tot ? vals.g / vals.tot : '' }, '', '', '', '', '', ...(CT ? [{ f: `SUMIFS(${rg(18)},${cond})`, v: vals.ct }, { f: `L${rr}-S${rr}`, v: vals.tot - vals.g - vals.ct }] : [])],
        nivel === 'Etapa' ? ['ttxt', 'ttxt', 'ttxt', 'ttxt', 'ttxt', 'ttxt', 'ttxt', 'tmon', 'tmon', 'tmon', 'tmon', 'tmon', 'tpct', 'ttxt', 'ttxt', 'ttxt', 'ttxt', 'ttxt', 'tmon', 'tmon'] : ['lbl', 'lbl', 'txt', 'lbl', 'txt', 'txt', 'txt', 'kmon', 'kmon', 'mon', 'mon', 'kmon', 'pctb', 'txt', 'txt', 'txt', 'txt', 'txt', 'kmon', 'kmon']);
      C.outline(rr, lvl, lvl > 0);
    };
    for (const { B, sv } of groups) {
      const rB = r++; const vb = { tot: 0, g: 0, pg: 0, ap: 0, ct: 0 };
      for (const x of sv) {
        const nd = M.nodes[x.id], rS = r++; const vs = { tot: 0, g: 0, pg: 0, ap: 0, ct: 0 };
        const lines = x.its.map(o => ({ it: o.c.it, c: o.c, o })); if (x.sem) lines.push({ it: 'SEM ITEM ' + x.id, sem: x.sem });
        for (const ln of lines) {
          const g = ln.o ? ln.o.pg + ln.o.ap : ln.sem.pg + ln.sem.ap, pg = ln.o ? ln.o.pg : ln.sem.pg, ap = ln.o ? ln.o.ap : ln.sem.ap;
          const tot = ln.c ? ln.c.tot : 0, sd = tot - g;
          const vias = ln.o ? Object.entries(ln.o.vias).filter(e => !g || e[1] / g >= 0.005).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + (g ? ' ' + Math.round(v / g * 100) + '%' : '')).join(' · ') : 'sem item';
          C.row(r, 0, ['Item', x.id + ' ' + nd.desc, ln.it, ln.c ? ln.c.d : 'Gasto sem item correspondente no orçamento', ln.c ? ln.c.un : '', ln.c ? ln.c.q : 0, ln.c ? ln.c.pu : 0, tot,
            { f: `SUMIFS(${PR('M')},${PR('J')},$C${r})`, v: g }, { f: `SUMPRODUCT((${PR('J')}=$C${r})*${PR('H')}*${PR('L')})`, v: pg }, { f: `SUMPRODUCT((${PR('J')}=$C${r})*${PR('I')}*${PR('L')})`, v: ap },
            { f: `H${r}-I${r}`, v: sd }, { f: `IF(H${r}=0,"",I${r}/H${r})`, v: tot ? g / tot : '' }, CT && ln.o && ln.o.qx ? { f: `SUMIFS(${CR('R')},${CR('P')},$C${r})`, v: ln.o.qex } : null, { f: `IF(F${r}=0,"",F${r}-N${r})`, v: ln.c && ln.c.q ? ln.c.q - (ln.o && ln.o.qx ? ln.o.qex : 0) : '' }, { f: `IF(OR(F${r}=0,N${r}=""),"",N${r}/F${r})`, v: ln.c && ln.c.q && ln.o && ln.o.qx ? ln.o.qex / ln.c.q : '' }, vias,
            { f: `COUNTIF(${PR('J')},$C${r})`, v: ln.o ? ln.o.n : ln.sem.n }, ...(CT ? [{ f: `SUMIFS(${CR('N')},${CR('K')},$C${r})`, v: ln.o ? ln.o.ct || 0 : 0 }, { f: `L${r}-S${r}`, v: sd - (ln.o ? ln.o.ct || 0 : 0) }] : [])],
            ['sub8', 'txt', 'txt', ln.c ? 'txt' : 'rtxt', 'ctr', 'mon', 'mon', 'mon', 'kmon', 'mon', 'mon', 'kmon', 'pctb', 'inpq', 'mon', 'pctb', 'txt', 'int', 'mon', 'kmon']);
          C.outline(r, 2, true);
          vs.tot += tot; vs.g += g; vs.pg += pg; vs.ap += ap; vs.ct += ln.o ? ln.o.ct || 0 : 0; r++;
        }
        grpRow(rS, 'Serviço', x.id + ' ' + nd.desc, '   ' + x.id + ' · ' + nd.desc, rS + 1, r - 1, vs, 1);
        for (const k in vb) vb[k] += vs[k];
      }
      grpRow(rB, 'Etapa', B.id + ' ' + B.desc, B.id + ' · ' + B.desc, rB + 1, r - 1, vb, 0);
      TC[7] += vb.tot; TC[8] += vb.g; TC[9] += vb.pg; TC[10] += vb.ap; TC[11] += vb.tot - vb.g; TC[18] += vb.ct;
    }
    const cl = r - 1;
    C.set(r, 0, 'TOTAL', 'ttxt'); for (let c = 1; c < (CT ? 20 : 18); c++) C.set(r, c, '', 'ttxt');
    if (CT) { C.set(r, 18, { f: `SUMIFS(S7:S${cl},$A$7:$A$${cl},"Item")`, v: TC[18] }, 'tmon'); C.set(r, 19, { f: `L${r}-S${r}`, v: TC[11] - TC[18] }, 'tmon'); }
    for (const c of [7, 8, 9, 10]) C.set(r, c, { f: `SUMIFS(${colL(c)}7:${colL(c)}${cl},$A$7:$A$${cl},"Item")`, v: TC[c] }, 'tmon');
    C.set(r, 11, { f: `H${r}-I${r}`, v: TC[11] }, 'tmon');
    C.set(r, 12, { f: `IF(H${r}=0,"",I${r}/H${r})`, v: TC[7] ? TC[8] / TC[7] : '' }, 'tpct');
    C.o.filter = `A6:${CT ? 'T' : 'R'}${cl}`; C.o.cf = [`L7:L${r}`, `O7:O${cl}`, ...(CT ? [`T7:T${r}`] : [])];
    C.set(r + 2, 0, 'Como abrir: use os botões 1 · 2 · 3 no canto esquerdo (agrupamento) ou o + de cada etapa/serviço. Começa fechado, só com as etapas.', 'note');
    C.set(r + 3, 0, 'Como o gasto é ligado ao item: 1) pelo insumo P00xxx da FLUXO-BASE (códigos ORÇ-) — "direto" quando o insumo tem um item só; 2) com vários itens, pela descrição do item comprado ("texto"); 3) sem item que se destaque, rateio pelo orçado ("rateio"). Parcelas de serviço sem item no orçamento aparecem como "SEM ITEM".', 'note');
    if (CT) C.set(r + 5, 0, 'A medir em contratos = valor ainda a medir dos itens de contrato ligados ao item (aba CONTRATOS × ITEM); o já medido não entra de novo porque é lançado no Pagar & Pago. Saldo após contratos = Saldo − A medir.', 'note');
    C.set(r + 4, 0, 'Saldo qtd. = Qtd. orçada − Qtd. executada (vem da quantidade medida nos contratos ligados ao item; em verba, % medido em valor × qtd. orçada; pode sobrescrever). Valores calculados na data da exportação; exporte de novo pelo aplicativo após importar um relatório novo.', 'note');
    // ---------- RESUMO POR SERVIÇO ----------
    brand(R, 'RESUMO POR SERVIÇO — ORÇADO × GASTO × SALDO', 'Soma dos itens da aba COMPARATIVO');
    hdr(R, 6, ['Serviço (ID)', 'Serviço', 'Etapa', 'Orçado (R$)', 'Gasto (R$)', 'Saldo (R$)', '% consumido', 'Itens com saldo negativo']);
    let rr = 7; const TR = { 3: 0, 4: 0, 5: 0 };
    for (const { B, sv } of groups) for (const x of sv) {
      const key = x.id + ' ' + M.nodes[x.id].desc, its = x.its; const tot = its.reduce((a, o) => a + o.c.tot, 0), g = its.reduce((a, o) => a + o.pg + o.ap, 0) + (x.sem ? x.sem.pg + x.sem.ap : 0);
      R.row(rr, 0, [x.id, M.nodes[x.id].desc, B.id + ' ' + B.desc, { f: `SUMIFS(COMPARATIVO!$H$7:$H$${cl},COMPARATIVO!$B$7:$B$${cl},"${key.replace(/"/g, '""')}",COMPARATIVO!$A$7:$A$${cl},"Item")`, v: tot }, { f: `SUMIFS(COMPARATIVO!$I$7:$I$${cl},COMPARATIVO!$B$7:$B$${cl},"${key.replace(/"/g, '""')}",COMPARATIVO!$A$7:$A$${cl},"Item")`, v: g },
        { f: `D${rr}-E${rr}`, v: tot - g }, { f: `IF(D${rr}=0,"",E${rr}/D${rr})`, v: tot ? g / tot : '' }, { f: `COUNTIFS(COMPARATIVO!$B$7:$B$${cl},"${key.replace(/"/g, '""')}",COMPARATIVO!$L$7:$L$${cl},"<-0.005",COMPARATIVO!$A$7:$A$${cl},"Item")`, v: its.filter(o => o.c.tot - o.pg - o.ap < -0.005).length + (x.sem ? 1 : 0) }],
        ['txt', 'txt', 'txt', 'mon', 'kmon', 'kmon', 'pctb', 'int']);
      TR[3] += tot; TR[4] += g; TR[5] += tot - g; rr++;
    }
    R.set(rr, 0, 'TOTAL', 'ttxt'); for (let c = 1; c < 8; c++) R.set(rr, c, '', 'ttxt');
    for (const c of [3, 4, 5]) R.set(rr, c, { f: `SUM(${colL(c)}7:${colL(c)}${rr - 1})`, v: TR[c] }, 'tmon');
    R.o.filter = `A6:H${rr - 1}`; R.o.cf = [`F7:F${rr}`];
    return W.blob(opts.logo, opts.u8);
  };

  YX.planoName = (rev, iso) => `Planejamento_3meses_Contratos_R${String(rev).padStart(2, '0')}_${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}.xlsx`;
  /* Planejamento dos próximos 3 meses por serviço: linhas (mão de obra, equipamento, materiais) × previsto da FLUXO-BASE × contratos */
  YX.buildPlano = async function (M, plano, refISO, opts = {}) {
    const W = YX.Book(); const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const ml = k => MES[+k.slice(5, 7) - 1] + '/' + k.slice(2, 4);
    const addM = (k, n) => { let y = +k.slice(0, 4), m = +k.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + String(m + 1).padStart(2, '0'); };
    const rm = opts.comp || refISO.slice(0, 7), ms = [1, 2, 3].map(k => addM(rm, k));
    const fdBR = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
    const brand = (ws, title, sub) => { ws.set(1, 0, 'GELLEN & GUIMARÃES', 'brand'); ws.set(2, 0, title, 'title'); ws.set(3, 0, sub, 'subt'); ws.h(2, 20); };
    const hdr = (ws, r, labs) => { labs.forEach((t, i) => ws.set(r, i, t, 'th')); ws.h(r, 36); };
    const TIP = { MO: 'Mão de obra', EQ: 'Equipamento / outros', MAT: 'Materiais' };
    const LV = (l, m) => l.v ? +l.v[m] || 0 : (+l.pu || 0) * (+(l.q || {})[m] || 0);
    const R = W.sheet('RESUMO 3 MESES', { cols: [10, 40, 30, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14], freeze: 'D8', logo: 18, tab: '6A6B6C', first: true });
    const P = W.sheet('PLANEJAMENTO', { cols: [10, 34, 18, 52, 24, 26, 12, 15, 15, 15, 16], freeze: 'E7', logo: 11, tab: 'D6D8DB' });
    const K = M.ct ? W.sheet('CONTRATOS', { cols: [9, 6, 30, 34, 9, 34, 6, 11, 11, 14, 13, 13, 13, 13, 30, 30, 26], freeze: 'A7', logo: 17, tab: 'D6D8DB' }) : null;
    // PLANEJAMENTO
    brand(P, `PLANEJAMENTO ${ml(ms[0]).toUpperCase()} – ${ml(ms[2]).toUpperCase()} — MATERIAIS, MÃO DE OBRA E EQUIPAMENTO (R$)`, `Linhas montadas no aplicativo (orçamento × cronograma, contratos ou manuais) · ref. ${fdBR(refISO)} · amarelo = pode alterar o valor aqui e o resumo se recalcula`);
    hdr(P, 6, ['Serviço (ID)', 'Serviço', 'Tipo', 'Descrição', 'Origem', 'Fornecedor', 'Item do orçamento', ...ms.map(m => 'R$ ' + ml(m)), 'Total 3 meses (R$)']);
    const lines = plano.lines.filter(l => M.nodes[l.node]).slice().sort((a, b) => a.node.localeCompare(b.node) || (a.it || 'zz').localeCompare(b.it || 'zz') || (a.tipo || '').localeCompare(b.tipo || ''));
    const orig = l => !l.src ? 'manual' : String(l.src).startsWith('aloc:') ? 'funcionário próprio (alocação)' : String(l.src).startsWith('mo:') ? 'mão de obra (própria/terceirizada)' : String(l.src).startsWith('proj:') ? 'projeção (cronograma)' : String(l.src).startsWith('orc:') ? 'orçamento × cronograma' : 'contrato ' + (l.ct || '') + ' (' + l.src + ')';
    lines.forEach((l, i) => {
      const r = 7 + i;
      P.row(r, 0, [l.node, M.nodes[l.node].desc, TIP[l.tipo] || l.tipo, l.d || '', orig(l), l.forn || '', l.it || '', ...ms.map(m => Math.round(LV(l, m) * 100) / 100), { f: `SUM(H${r}:J${r})`, v: ms.reduce((a, m) => a + Math.round(LV(l, m) * 100) / 100, 0) }],
        ['txt', 'txt', 'txt', 'txt', 'txt', 'txt', 'txt', 'inpq', 'inpq', 'inpq', 'kmon']);
    });
    const pl = 6 + Math.max(1, lines.length), PR = c => `PLANEJAMENTO!$${c}$7:$${c}$${pl}`;
    P.set(pl + 1, 0, 'TOTAL', 'ttxt'); for (let c = 1; c < 7; c++) P.set(pl + 1, c, '', 'ttxt');
    ['H', 'I', 'J', 'K'].forEach((c, i) => P.set(pl + 1, 7 + i, { f: `SUM(${c}7:${c}${pl})`, v: lines.reduce((a, l) => a + (i < 3 ? Math.round(LV(l, ms[i]) * 100) / 100 : ms.reduce((b, m) => b + Math.round(LV(l, m) * 100) / 100, 0)), 0) }, 'tmon'));
    P.o.filter = `A6:K${pl}`;
    P.set(pl + 3, 0, 'Orçamento × cronograma = valor orçado da parte do item (material, M.O. ou outros/equipamento) × fração do cronograma atual do serviço no mês. Contrato = saldo a medir estimado pelo cronograma; substitui M.O./equipamento previstos do mesmo item. Valores em amarelo podem ser alterados.', 'note');
    if (!lines.length) P.set(7, 0, 'Nenhuma linha de planejamento ainda — monte no aplicativo (aba Contratos) e exporte de novo.', 'note');
    // RESUMO
    const est = {}; if (M.ct) for (const it of M.ct.itens) { if (!it.pnode || !it.est) continue; const o = est[it.pnode] || (est[it.pnode] = {}); for (const m of ms) o[m] = (o[m] || 0) + (it.est[m] ? it.est[m].v : 0); }
    brand(R, `RESUMO ${ml(ms[0]).toUpperCase()} – ${ml(ms[2]).toUpperCase()} — CONSOLIDADO + O QUE FALTA DO PLANEJADO = FLUXO-BASE`, `Pago/a pagar = relatório Pagar & Pago · Planejado = soma da aba PLANEJAMENTO · FLUXO-BASE${opts.fluxo ? ' da ' + opts.fluxo : ''} · Diferença = FLUXO-BASE − maior(consolidado, planejado) (0 = bate; serviços sem planejamento ficam em branco e mantêm o previsto)`);
    ms.forEach((m, i) => { R.set(6, 3 + i * 4, ml(m), 'th'); for (let c = 1; c < 4; c++) R.set(6, 3 + i * 4 + c, '', 'th'); R.merge(`${colL(3 + i * 4)}6:${colL(6 + i * 4)}6`); });
    R.set(6, 15, '3 meses', 'th'); for (let c = 16; c < 19; c++) R.set(6, c, '', 'th'); R.merge(`P6:S6`);
    hdr(R, 7, ['Serviço (ID)', 'Serviço', 'Etapa', ...[0, 1, 2, 3].flatMap(() => ['Consolidado (pago / a pagar)', 'Planejado (total do mês)', 'FLUXO-BASE', 'Diferença: FB − maior(consolidado, planejado)'])]);
    const rp = {}; for (const x of M.rp) { const m = x.d.slice(0, 7); if (!ms.includes(m) || !x.n) continue; const o = rp[x.n] || (rp[x.n] = {}); o[m] = (o[m] || 0) + x.pg + x.ap; }
    const Cs = Object.values(M.nodes).filter(n => n.lv === 'C' && !n.extra && (ms.some(m => (n.prev[m] || 0) > 0.005 || (rp[n.id] && rp[n.id][m] > 0.005)) || lines.some(l => l.node === n.id)));
    let r = 8; const T = Array(16).fill(0);
    for (const n of Cs) {
      const cells = [], sty = [];
      ms.forEach((m, i) => {
        const c0 = 3 + i * 4, pv = n.prev[m] || 0, ce = est[n.id] ? est[n.id][m] || 0 : 0, pla = lines.filter(l => l.node === n.id).reduce((a, l) => a + Math.round(LV(l, m) * 100) / 100, 0);
        const rv = rp[n.id] ? rp[n.id][m] || 0 : 0;
        const tem = lines.some(l => l.node === n.id), alvo = tem ? rv + Math.max(pla - rv, 0) : null;
        cells.push(rv, { f: `SUMIFS(${PR(colL(7 + i))},${PR('A')},$A${r})`, v: pla }, pv, tem ? { f: `${colL(c0 + 2)}${r}-MAX(${colL(c0)}${r},${colL(c0 + 1)}${r})`, v: pv - alvo } : ''); sty.push('mon', 'kmon', 'kmon', 'kmon');
        T[i * 4] += rv; T[i * 4 + 1] += pla; T[i * 4 + 2] += pv; T[i * 4 + 3] += tem ? pv - alvo : 0;
      });
      const t3 = k => [0, 1, 2].map(i => `${colL(3 + i * 4 + k)}${r}`).join('+');
      [0, 1, 2, 3].forEach(k => { cells.push({ f: k === 3 ? `SUM(${[0, 1, 2].map(i => `${colL(3 + i * 4 + 3)}${r}`).join(',')})` : t3(k), v: [0, 1, 2].reduce((a, i) => a + (typeof cells[i * 4 + k] === 'object' ? cells[i * 4 + k].v : (+cells[i * 4 + k] || 0)), 0) }); sty.push(k ? 'kmon' : 'mon'); T[12 + k] += cells[cells.length - 1].v; });
      R.row(r, 0, [n.id, n.desc, M.nodes[n.b] ? n.b + ' ' + M.nodes[n.b].desc : '', ...cells], ['txt', 'txt', 'txt', ...sty]); r++;
    }
    R.set(r, 0, 'TOTAL', 'ttxt'); R.set(r, 1, '', 'ttxt'); R.set(r, 2, '', 'ttxt');
    for (let c = 3; c < 19; c++) R.set(r, c, { f: `SUM(${colL(c)}8:${colL(c)}${r - 1})`, v: T[c - 3] }, 'tmon');
    R.o.filter = `A7:S${r - 1}`; R.o.cf = [0, 1, 2, 3].map(i => `${colL(6 + i * 4)}8:${colL(6 + i * 4)}${r}`);
    R.set(r + 2, 0, 'Serviços com planejamento: o planejado é o total esperado do mês; o consolidado no Pagar & Pago sai dele, e a FLUXO-BASE é refeita como consolidado + (planejado − consolidado, mínimo 0) = o maior dos dois (diferença 0). Serviços sem planejamento: mantêm o previsto e sobem só o que o relatório superar — por isso podem ter diferença. Planejado = orçamento × cronograma, contratos (saldo a medir estimado) e linhas manuais.', 'note');
    R.set(r + 3, 0, 'Esta planilha não altera a YAC-FLUXO: serve para fechar o fluxo dos próximos 3 meses serviço a serviço.', 'note');
    // CONTRATOS
    if (K) {
      brand(K, 'CONTRATOS — SALDO A MEDIR E ESTIMATIVA DOS PRÓXIMOS 3 MESES', 'Relatório de contratos · estimativa = saldo a medir × fração do cronograma do serviço em cada mês');
      hdr(K, 6, ['Contrato', 'Item', 'Fornecedor', 'Objeto', 'Serviço (CC)', 'Descrição do item', 'Un.', 'Qtd. contratada', 'Qtd. a medir', 'Saldo a medir (R$)', ...ms.map(m => 'Estim. ' + ml(m) + ' (R$)'), 'Total 3 meses (R$)', 'Serviço FLUXO-BASE', 'Item do orçamento', 'Vínculo / como estimado']);
      const its = M.ct.itens.filter(i => i.va > 0.005);
      its.forEach((it, i) => { const r2 = 7 + i; K.row(r2, 0, [+it.ct || it.ct, +it.item || it.item, it.forn, it.obj, it.srv, it.d, it.un, it.q, it.qa, it.va, ...ms.map(m => it.est ? it.est[m].v : 0), { f: `SUM(K${r2}:M${r2})`, v: ms.reduce((a, m) => a + (it.est ? it.est[m].v : 0), 0) }, it.pnode ? it.pnode + ' ' + M.nodes[it.pnode].desc : '(sem serviço)', it.parts.length === 1 ? it.parts[0][0] : it.parts.length ? it.parts.length + ' itens (rateio)' : '(sem item)', it.via + ' · ' + (it.how || '')], ['txt', 'txt', 'txt', 'txt', 'txt', 'txt', 'ctr', 'mon', 'mon', 'kmon', 'mon', 'mon', 'mon', 'kmon', it.pnode ? 'txt' : 'rtxt', 'txt', 'txt']); });
      const kl = 6 + Math.max(1, its.length); K.set(kl + 1, 0, 'TOTAL', 'ttxt'); for (const c of [9, 10, 11, 12, 13]) K.set(kl + 1, c, { f: `SUM(${colL(c)}7:${colL(c)}${kl})`, v: c === 9 ? its.reduce((a, i) => a + i.va, 0) : its.reduce((a, i) => a + (c === 13 ? ms.reduce((b, m) => b + (i.est ? i.est[m].v : 0), 0) : (i.est ? i.est[ms[c - 10]].v : 0)), 0) }, 'tmon');
      K.o.filter = `A6:Q${kl}`;
    }
    return W.blob(opts.logo, opts.u8);
  };

  G.YX = YX;
})(typeof globalThis !== 'undefined' ? globalThis : window);
