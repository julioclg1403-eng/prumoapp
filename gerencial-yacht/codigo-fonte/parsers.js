/* Leitores dos arquivos da obra — funcionam no navegador e no node (precisa de JSZip global) */
(function (G) {
  const YP = {};
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const dec = s => s == null ? s : s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e]);
  const colIdx = s => { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  YP.dec = dec;

  /* ---------- XLSX genérico (JSZip + regex, só valores em cache) ---------- */
  YP.openXlsx = async function (buf) {
    const zip = await G.JSZip.loadAsync(buf);
    const txt = p => zip.file(p) ? zip.file(p).async('string') : Promise.resolve(null);
    const wb = await txt('xl/workbook.xml');
    const rels = await txt('xl/_rels/workbook.xml.rels');
    const relMap = {};
    for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
      const id = /Id="([^"]+)"/.exec(m[1]), t = /Target="([^"]+)"/.exec(m[1]);
      if (id && t) relMap[id[1]] = t[1].replace(/^\/?xl\//, '').replace(/^\//, '');
    }
    const sheets = {};
    for (const m of wb.matchAll(/<sheet\b([^>]*)\/>/g)) {
      const nm = dec(/name="([^"]*)"/.exec(m[1])[1]);
      const rid = /r:id="([^"]+)"/.exec(m[1])[1];
      sheets[nm] = 'xl/' + relMap[rid];
    }
    let shared = null;
    async function sst() {
      if (shared) return shared;
      shared = [];
      const s = await txt('xl/sharedStrings.xml');
      if (!s) return shared;
      for (const m of s.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
        let t = '';
        for (const k of m[1].matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g)) t += k[1];
        shared.push(dec(t));
      }
      return shared;
    }
    async function rows(name, maxCol, fmap) {
      const p = sheets[name]; if (!p) return null;
      const ss = await sst();
      const x = await txt(p);
      const out = [];
      const re = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let m;
      while ((m = re.exec(x))) {
        const c = colIdx(m[1]); if (maxCol != null && c > maxCol) continue;
        const r = +m[2] - 1, attrs = m[3], body = m[4];
        if (!body) continue;
        if (fmap && body.indexOf('<f') >= 0) (fmap[r] || (fmap[r] = {}))[c] = true;
        const t = (/ t="([^"]+)"/.exec(attrs) || [])[1];
        let v;
        if (t === 'inlineStr') { const k = /<t[^>]*>([\s\S]*?)<\/t>/.exec(body); v = k ? dec(k[1]) : ''; }
        else {
          const vv = /<v>([\s\S]*?)<\/v>/.exec(body); if (!vv) continue;
          if (t === 's') v = ss[+vv[1]];
          else if (t === 'str') v = dec(vv[1]);
          else if (t === 'b') v = vv[1] === '1';
          else if (t === 'e') v = null;
          else v = +vv[1];
        }
        (out[r] || (out[r] = []))[c] = v;
      }
      return out;
    }
    return { names: Object.keys(sheets), rows, zip, paths: sheets, txt };
  };

  /* ---------- datas ---------- */
  const pad = n => String(n).padStart(2, '0');
  YP.serialToISO = function (v) {
    if (v == null || v === '' || v === '-') return null;
    if (typeof v === 'number') {
      const d = new Date(Math.round((v - 25569) * 864e5));
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    const s = String(v).trim();
    let k = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s); if (k) return `${k[3]}-${k[2]}-${k[1]}`;
    k = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (k) return `${k[1]}-${k[2]}-${k[3]}`;
    return null;
  };

  /* ---------- 1. Relatório Pagar & Pago (.xls que na verdade é HTML) ---------- */
  YP.parseReport = function (html) {
    const rows = [];
    for (const tr of html.split(/<tr\b/i).slice(1)) {
      const cells = [];
      for (const m of tr.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)) cells.push(dec(m[1].replace(/<[^>]+>/g, '')).trim());
      if (cells.length) rows.push(cells);
    }
    const hi = rows.findIndex(r => r.includes('Pagar') && r.includes('Pago') && r.includes('Fornecedor'));
    if (hi < 0) throw new Error('Relatório Pagar & Pago: cabeçalho não encontrado');
    const H = rows[hi], ix = n => H.indexOf(n);
    const num = s => { s = (s || '').replace(/\./g, '').replace(',', '.'); const v = parseFloat(s); return isNaN(v) ? 0 : v; };
    const need = ['Servico', 'Item_SiAp', 'Insumo', 'Fornecedor', 'Processo', 'Parcela', 'DataPg', 'Pagar', 'Pago', 'ItemProc'];
    for (const n of need) if (ix(n) < 0) throw new Error('Relatório Pagar & Pago: coluna ' + n + ' ausente');
    const out = [];
    for (const r of rows.slice(hi + 1)) {
      if (r.length < H.length - 2) continue;
      const d = YP.serialToISO(r[ix('DataPg')]); if (!d) continue;
      // número BR sem milhar no export ("402,783106"); se vier com milhar também funciona
      const pg = r[ix('Pagar')], pd = r[ix('Pago')];
      out.push({
        d, srv: r[ix('Servico')], eap: r[ix('Item_SiAp')], ins: r[ix('Insumo')], forn: r[ix('Fornecedor')],
        proc: r[ix('Processo')], parc: r[ix('Parcela')], item: r[ix('ItemProc')], ch: ix('Chave1') >= 0 ? r[ix('Chave1')] : '',
        ap: num(pg), pg: num(pd)
      });
    }
    return out;
  };

  /* ---------- 2. FLUXO-BASE (planilha de entrega YAC-FLUXO) ---------- */
  YP.parseFluxoBase = function (R, FM) {
    FM = FM || {};
    const hr = R.findIndex(r => r && r.includes('NÍVEL') && r.includes('DESCRIÇÃO'));
    if (hr < 0) throw new Error('FLUXO-BASE: cabeçalho não encontrado');
    const H = R[hr]; const ix = n => H.indexOf(n);
    const monthCols = [];
    H.forEach((h, c) => { const k = /^(\d{2})\/(\d{4})$/.exec(String(h || '')); if (k) monthCols.push([c, `${k[2]}-${k[1]}`]); });
    const cN = ix('NÍVEL'), cID = ix('ID'), cU = ix('ID UAU'), cT = ix('TIPO'), cCod = ix('COD'), cCI = ix('COD INSU'),
      cD = ix('DESCRIÇÃO'), cO = ix('ORÇADO R$'), cF = ix('FORNECEDOR'), cOb = ix('OBSERVAÇÕES');
    const nodes = {}, insumos = {}, orcLinks = {}, orcIns = {}, orcTxt = {};
    let curB = null, curC = null, curD = null;
    const body = [];
    for (let r = hr + 1; r < R.length; r++) { const x = R[r]; if (x && x[cN]) body.push([x, FM[r] || {}]); }
    const add = (mk, v) => {
      nodes[curC].prev[mk] = (nodes[curC].prev[mk] || 0) + v;
      if (curD) insumos[curD].prev[mk] = (insumos[curD].prev[mk] || 0) + v;
    };
    for (let i = 0; i < body.length; i++) {
      const [x, fx] = body[i], lv = String(x[cN]);
      const id = x[cID] != null ? String(x[cID]) : null;
      if (lv === 'A' || lv === 'B' || lv === 'C') {
        nodes[id] = { id, lv, uau: x[cU] != null ? String(x[cU]) : '', code: x[cCod] || '', desc: String(x[cD] || '').trim(), orc: 0, prev: {} };
        if (lv === 'B') { curB = id; curC = null; }
        if (lv === 'C') { curC = id; nodes[id].b = curB; }
        if (lv === 'A') { curB = null; curC = null; }
        curD = null; continue;
      }
      if (lv === 'D') {
        const k = curC + '|' + (x[cCod] || id);
        insumos[k] = { c: curC, cod: x[cCod] || '', desc: String(x[cD] || '').trim(), prev: {} };
        curD = k; continue;
      }
      if (!curC || lv !== 'E') continue;
      const o = typeof x[cO] === 'number' ? x[cO] : 0;
      nodes[curC].orc += o;
      const cod = String(x[cCod] || '');
      if (cod.startsWith('ORÇ-')) { orcLinks[cod.slice(4)] = curC; if (curD) orcIns[cod.slice(4)] = curD; orcTxt[cod.slice(4)] = String(x[cD] || '').trim(); }
      // filhos F (INSU-N2) logo abaixo
      const kids = []; for (let j = i + 1; j < body.length && String(body[j][0][cN]) === 'F'; j++) kids.push(body[j][0]);
      for (const [c, mk] of monthCols) {
        let v;
        // como no Excel: o TOTAL soma as linhas E; E com fórmula = soma dos F; E digitado = valor digitado
        if (kids.length && fx[c]) { v = 0; for (const k of kids) if (typeof k[c] === 'number') v += k[c]; }
        else v = x[c];
        if (typeof v === 'number' && v) add(mk, v);
      }
    }
    return { nodes, insumos: Object.values(insumos), orcLinks, orcIns, orcTxt, months: monthCols.map(m => m[1]) };
  };

  /* ---------- 3. Cronograma (aba POR PERÍODO) ---------- */
  YP.parseCrono = function (R) {
    const hr = R.findIndex(r => r && r.some(v => String(v || '').startsWith('Pacote de trabalho')));
    if (hr < 0) throw new Error('Cronograma: cabeçalho não encontrado');
    const H = R[hr].map(v => String(v || ''));
    const f = p => H.findIndex(h => h.startsWith(p));
    const c = {
      id: f('ID'), t: f('Pacote de trabalho'), s: f('Serviço'), l: f('Lote'), bi: f('Data de início da linha'), bf: f('Data de término da linha'),
      i: f('Data de Início'), fi: f('Data de Término'), ri: f('Início real'), rf: f('Término real')
    };
    let gerado = null;
    for (let r = 0; r < hr; r++) for (const v of (R[r] || [])) { const k = /Gerada Em (\d{2}\/\d{2}\/\d{4})/i.exec(String(v || '')); if (k) gerado = YP.serialToISO(k[1]); }
    const out = [];
    for (const x of R.slice(hr + 1)) {
      if (!x || !x[c.t]) continue;
      const t = String(x[c.t]).trim();
      out.push({
        id: String(x[c.id]), t, pre: t.includes(' - ') ? t.split(' - ')[0].trim() : t, srv: x[c.s] && x[c.s] !== '-' ? String(x[c.s]) : '',
        l: String(x[c.l] || '').trim(), bi: YP.serialToISO(x[c.bi]), bf: YP.serialToISO(x[c.bf]),
        i: YP.serialToISO(x[c.i]), f: YP.serialToISO(x[c.fi]), ri: YP.serialToISO(x[c.ri]), rf: YP.serialToISO(x[c.rf])
      });
    }
    return { tasks: out, gerado };
  };

  /* ---------- 4. Orçamento (aba Orçamento) — composições nível D ---------- */
  YP.parseOrc = function (R) {
    const hr = R.findIndex(r => r && r.includes('ITEMIZAÇÃO'));
    if (hr < 0) throw new Error('Orçamento: cabeçalho não encontrado');
    const H = R[hr].map(v => String(v || '')); const ix = n => H.indexOf(n);
    const c = {
      it: ix('ITEMIZAÇÃO'), nv: ix('NÍVEL'), cod: ix('CÓDIGO'), d: ix('DESCRIÇÃO'), un: ix('UNID.'), q: ix('QUANT./COEF.'),
      mat: ix('PREÇO MAT. (TOT.)(R$)'), mo: ix('PREÇO M.O. (TOT.)(R$)'), ou: ix('PREÇO OUTROS (TOT.)(R$)'), tot: ix('PREÇO FINAL (TOT.)(R$)'),
      pu: ix('PREÇO FINAL (UNIT.)(R$)'), st: ix('STATUS PLANEJ'), pum: ix('PREÇO MAT. (UNIT.)(R$)'), pumo: ix('PREÇO M.O. (UNIT.)(R$)'), puou: ix('PREÇO OUTROS (UNIT.)(R$)'), cl: ix('CLASS')
    };
    let rev = null, data = null;
    for (let r = 0; r < hr; r++) { const x = R[r] || []; x.forEach((v, j) => { if (v === 'Rev.:') rev = x[j + 1]; if (v === 'Data:') data = YP.serialToISO(x[j + 1]); }); }
    const n = v => typeof v === 'number' ? v : 0;
    const out = [];
    for (const x of R.slice(hr + 1)) {
      if (!x) continue;
      if (x[c.nv] === 'E' && out.length) { const t = String(x[c.d] || '').trim(); if (t) { const L = out[out.length - 1]; (L.ins || (L.ins = [])).push(t); (L.insD || (L.insD = [])).push({ cod: x[c.cod] || '', d: t, cl: x[c.cl] || '', un: String(x[c.un] || '').trim(), coef: n(x[c.q]), pm: n(x[c.pum]), pmo: n(x[c.pumo]), pou: n(x[c.puou]) }); } continue; }
      if (x[c.nv] !== 'D') continue;
      out.push({ it: String(x[c.it]), cod: x[c.cod] || '', d: String(x[c.d] || '').trim(), un: x[c.un] || '', q: n(x[c.q]), pu: n(x[c.pu]),
        mat: n(x[c.mat]), mo: n(x[c.mo]), ou: n(x[c.ou]), tot: n(x[c.tot]), st: x[c.st] || '', ins: [] });
    }
    return { comps: out, rev: rev != null ? String(rev).padStart(2, '0') : '', data };
  };



  /* ---------- Identificação de arquivo ---------- */
  YP.identify = async function (file) {
    const name = file.name || '';
    const buf = await file.arrayBuffer();
    const head = new TextDecoder('latin1').decode(buf.slice(0, 4));
    if ((new Uint8Array(buf.slice(0, 4))).join(',') === '208,207,17,224') { // .xls binário (BIFF)
      const sh = G.YK && YK.readXls(buf); if (sh && YK.is(sh)) return { kind: 'compras', data: YK.parse(sh), name };
      throw new Error(name + ': .xls binário não reconhecido (esperado Relação de Pedidos de Compras)');
    }
    if (head.slice(0, 2) !== 'PK') {
      // .xls exportado como HTML (latin-1)
      const txt = new TextDecoder('windows-1252').decode(buf);
      if (G.YC && YC.is(txt)) return { kind: 'contratos', data: YC.parse(txt), name };
      if (G.YK && /Pedidos? de Compra/i.test(txt)) { const sh = YK.readHtml(txt); return { kind: 'compras', data: YK.parse(sh), name }; }
      if (/Pagar/.test(txt) && /Fornecedor/.test(txt)) return { kind: 'report', data: YP.parseReport(txt), name };
      throw new Error(name + ': formato não reconhecido');
    }
    const x = await YP.openXlsx(buf);
    if (G.YK) for (const nm of x.names) { const R0 = await x.rows(nm, 30); if (YK.isRows(R0)) return { kind: 'compras', data: YK.fromRows(R0), name }; }
    if (G.YCX && YCX.is(x.names)) return { kind: 'caixa', data: await YCX.parse(x), name };
    if (x.names.includes('FLUXO-BASE')) { const fm = {}; const R = await x.rows('FLUXO-BASE', 70, fm); return { kind: 'fluxobase', data: YP.parseFluxoBase(R, fm), name }; }
    if (x.names.includes('Orçamento')) { const R0 = await x.rows('Orçamento', 25); if (G.YF && YF.is(R0)) return { kind: 'peso', data: YF.parse(R0), name }; return { kind: 'orc', data: YP.parseOrc(R0), name }; }
    const cs = x.names.find(n => /PER[ÍI]ODO/i.test(n)) || x.names[0];
    const R = await x.rows(cs, 15);
    if (R && R.some(r => r && r.some(v => String(v || '').startsWith('Pacote de trabalho')))) return { kind: 'crono', data: YP.parseCrono(R), name };
    throw new Error(name + ': não reconheci (esperado Pagar&Pago, Contratos, YAC-FLUXO, Orçamento ou Cronograma)');
  };

  G.YP = YP;
})(typeof globalThis !== 'undefined' ? globalThis : window);
