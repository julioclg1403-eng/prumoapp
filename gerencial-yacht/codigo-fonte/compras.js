/* Relação de Pedidos de Compras (UAU) — leitor .xls (BIFF8 ou HTML) + remontagem das linhas quebradas pela paginação */
(function (G) {
  const YK = {};
  /* ---------- leitor mínimo de .xls binário (CFB + BIFF8): texto, números, fórmulas ---------- */
  function cfbStream(u8, names) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (dv.getUint32(0, true) !== 0xE011CFD0) return null;
    const ss = 1 << dv.getUint16(30, true), mss = 1 << dv.getUint16(32, true), cut = dv.getUint32(56, true);
    const nFat = dv.getUint32(44, true), dirStart = dv.getUint32(48, true), miniFatStart = dv.getUint32(60, true), difStart = dv.getUint32(68, true);
    const off = s => 512 + s * ss;
    const difat = []; for (let i = 0; i < 109 && difat.length < nFat; i++) difat.push(dv.getUint32(76 + i * 4, true));
    let ds = difStart; while (difat.length < nFat && ds < 0xFFFFFFFA) { for (let i = 0; i < ss / 4 - 1 && difat.length < nFat; i++) difat.push(dv.getUint32(off(ds) + i * 4, true)); ds = dv.getUint32(off(ds) + ss - 4, true); }
    const fat = []; for (const s of difat) for (let i = 0; i < ss / 4; i++) fat.push(dv.getUint32(off(s) + i * 4, true));
    const chain = (s, f) => { const o = []; let g = 0; while (s < 0xFFFFFFFA && g++ < 1e6) { o.push(s); s = f[s]; } return o; };
    const read = (s, size) => { const c = chain(s, fat), out = new Uint8Array(c.length * ss); c.forEach((x, i) => out.set(u8.subarray(off(x), off(x) + ss), i * ss)); return size != null ? out.subarray(0, size) : out; };
    const dir = read(dirStart), dd = new DataView(dir.buffer), ents = [];
    for (let p = 0; p + 128 <= dir.length; p += 128) { const nl = dd.getUint16(p + 64, true); let nm = ''; for (let i = 0; i < nl / 2 - 1; i++) nm += String.fromCharCode(dd.getUint16(p + i * 2, true)); ents.push({ nm, type: dir[p + 66], start: dd.getUint32(p + 116, true), size: dd.getUint32(p + 120, true) }); }
    const root = ents[0];
    for (const n of names) { const e = ents.find(x => x.nm === n); if (!e) continue;
      if (e.size >= cut) return read(e.start, e.size);
      const mfat = []; for (const s of chain(miniFatStart, fat)) for (let i = 0; i < ss / 4; i++) mfat.push(dv.getUint32(off(s) + i * 4, true));
      const ms = read(root.start), c = chain(e.start, mfat), out = new Uint8Array(c.length * mss); c.forEach((x, i) => out.set(ms.subarray(x * mss, x * mss + mss), i * mss)); return out.subarray(0, e.size); }
    return null;
  }
  const rk = v => { let n; if (v & 2) n = v >> 2; else { const b = new DataView(new ArrayBuffer(8)); b.setUint32(4, v & 0xFFFFFFFC, true); n = b.getFloat64(0, true); } return v & 1 ? n / 100 : n; };
  YK.readXls = function (buf) {
    const u8 = new Uint8Array(buf), wb = cfbStream(u8, ['Workbook', 'Book']); if (!wb) return null;
    const dv = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
    // registros com CONTINUE juntados (guardando onde começa cada pedaço, para strings do SST)
    const recs = []; let p = 0;
    while (p + 4 <= wb.length) { const t = dv.getUint16(p, true), l = dv.getUint16(p + 2, true); const d = wb.subarray(p + 4, p + 4 + l); if (t === 0x003C && recs.length) { const r = recs[recs.length - 1]; r.parts.push(d); } else recs.push({ t, parts: [d] }); p += 4 + l; }
    const latin = b => { let s = ''; for (const c of b) s += String.fromCharCode(c); return s; };
    const sst = [];
    const sheets = []; let cur = null;
    for (const r of recs) {
      const d = r.parts[0], v = new DataView(d.buffer, d.byteOffset, d.byteLength);
      if (r.t === 0x0085) { const nl = d[6], f = d[7]; sheets.push({ name: f & 1 ? new TextDecoder('utf-16le').decode(d.subarray(8, 8 + nl * 2)) : latin(d.subarray(8, 8 + nl)), cells: {} }); }
      else if (r.t === 0x00FC) { // SST com continuação
        let pi = 0, b = r.parts[0], q = 8; const n = new DataView(b.buffer, b.byteOffset).getUint32(4, true);
        const need = k => { if (q + k <= b.length) return; };
        for (let i = 0; i < n; i++) {
          if (q >= b.length) { pi++; b = r.parts[pi]; q = 0; }
          const bv = new DataView(b.buffer, b.byteOffset, b.byteLength);
          let cch = bv.getUint16(q, true), fl = b[q + 2]; q += 3; let rt = 0, sz = 0;
          if (fl & 8) { rt = bv.getUint16(q, true); q += 2; } if (fl & 4) { sz = bv.getUint32(q, true); q += 4; }
          let s = '';
          while (cch > 0) {
            if (q >= b.length) { pi++; b = r.parts[pi]; q = 0; fl = b[q]; q += 1; }
            const wide = fl & 1, avail = Math.floor((b.length - q) / (wide ? 2 : 1)), k = Math.min(cch, avail);
            s += wide ? new TextDecoder('utf-16le').decode(b.subarray(q, q + k * 2)) : latin(b.subarray(q, q + k)); q += k * (wide ? 2 : 1); cch -= k;
          }
          let skip = rt * 4 + sz; while (skip > 0) { if (q >= b.length) { pi++; b = r.parts[pi]; q = 0; } const k = Math.min(skip, b.length - q); q += k; skip -= k; }
          sst.push(s);
        }
      }
      else if (r.t === 0x0809) { const bt = v.getUint16(2, true); if (bt === 0x10) { cur = sheets[sheets.findIndex(s => !s.used)]; if (cur) cur.used = true; } }
      else if (cur) {
        const set = (row, col, val) => { (cur.cells[row] || (cur.cells[row] = {}))[col] = val; };
        if (r.t === 0x00FD) set(v.getUint16(0, true), v.getUint16(2, true), sst[v.getUint32(6, true)]);
        else if (r.t === 0x0203) set(v.getUint16(0, true), v.getUint16(2, true), v.getFloat64(6, true));
        else if (r.t === 0x027E) set(v.getUint16(0, true), v.getUint16(2, true), rk(v.getUint32(6, true)));
        else if (r.t === 0x00BD) { const row = v.getUint16(0, true), c0 = v.getUint16(2, true), n = (d.length - 6) / 6; for (let i = 0; i < n; i++) set(row, c0 + i, rk(v.getUint32(4 + i * 6 + 2, true))); }
        else if (r.t === 0x0204) { const row = v.getUint16(0, true), col = v.getUint16(2, true), l = v.getUint16(6, true), f = d[8]; set(row, col, f & 1 ? new TextDecoder('utf-16le').decode(d.subarray(9, 9 + l * 2)) : latin(d.subarray(9, 9 + l))); }
        else if (r.t === 0x0006) { const row = v.getUint16(0, true), col = v.getUint16(2, true); if (v.getUint16(12, true) !== 0xFFFF) set(row, col, v.getFloat64(6, true)); else cur._fs = [row, col]; }
        else if (r.t === 0x0207 && cur._fs) { const l = v.getUint16(0, true), f = d[2]; set(cur._fs[0], cur._fs[1], f & 1 ? new TextDecoder('utf-16le').decode(d.subarray(3, 3 + l * 2)) : latin(d.subarray(3, 3 + l))); cur._fs = null; }
        else if (r.t === 0x000A) cur = null; // EOF da planilha
      }
    }
    return sheets.map(s => { const rows = []; for (const [ri, o] of Object.entries(s.cells)) { const a = []; for (const [ci, val] of Object.entries(o)) a[+ci] = val; rows[+ri] = a; } return { name: s.name, rows }; });
  };
  YK.readHtml = function (txt) {
    const dec = s => String(s || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n));
    const rows = []; for (const tr of txt.split(/<tr\b/i).slice(1)) { const c = []; for (const m of tr.matchAll(/<td\b[^>]*>([\s\S]*?)(?=<td\b|<\/tr|$)/gi)) c.push(dec(m[1].replace(/<[^>]+>/g, '')).trim()); rows.push(c); }
    return [{ name: 'html', rows }];
  };

  /* ---------- remontagem: cada insumo numa linha só ---------- */
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
  YK.is = rowsList => rowsList.some(R => R.rows.slice(0, 40).some(r => r && r.some(v => /PEDIDOS? DE COMPRA/i.test(norm(v)))));
  YK.parse = function (sheetsRows) {
    const R = (sheetsRows.find(s => s.rows.some(r => r && r.some(v => /^INSUMO$/.test(norm(v))))) || sheetsRows[0]).rows;
    const hi = R.findIndex(r => r && r.some(v => /^INSUMO$/.test(norm(v))) && r.some(v => /PEDIDO/.test(norm(v))));
    if (hi < 0) throw new Error('Pedidos de compras: cabeçalho (Pedido / Insumo) não encontrado');
    const H = R[hi].map(v => String(v == null ? '' : v).trim()); const hN = H.map(norm);
    const col = (...ps) => { for (const p of ps) { const i = hN.findIndex(h => h === p); if (i >= 0) return i; } for (const p of ps) { const i = hN.findIndex(h => h.includes(p)); if (i >= 0) return i; } return -1; };
    const cI = col('INSUMO'), cP = col('PEDIDO'), cCod = col('COD. INSUMO', 'COD INSUMO', 'CODIGO INSUMO'), cEx = col('EXCLUIDO');
    const isHeader = r => r && r.filter(v => v != null && v !== '').some(v => hN.includes(norm(v)) && norm(v).length > 2) && r.some(v => /^INSUMO$|^PEDIDO$/.test(norm(v)));
    const isJunk = r => !r || r.every(v => v == null || v === '') || isHeader(r) || r.some(v => /UAU|RELACAO DE PEDIDOS|PAGINA|EMITIDO|^TOTAL/.test(norm(v)));
    const filled = r => r.map((v, i) => v != null && v !== '' ? i : -1).filter(i => i >= 0);
    const isData = r => r && r[cP] != null && r[cP] !== '' && /^\d+$/.test(String(r[cP]).trim());
    const isText = r => r && !isData(r) && filled(r).length && filled(r).every(i => i === cI);
    // percorre as linhas: texto solto entra no insumo da linha de dado vizinha (antes se a de depois já tem nome, senão depois)
    const seq = []; for (let i = hi + 1; i < R.length; i++) { const r = R[i]; if (isData(r)) seq.push({ t: 'd', r: r.slice(), i }); else if (isText(r)) seq.push({ t: 'x', s: String(r[cI]).trim(), i }); }
    const datas = seq.filter(o => o.t === 'd'); datas.forEach(o => { o.nome = o.r[cI] ? String(o.r[cI]).trim() : ''; o.antes = []; o.depois = []; });
    let amb = 0;
    for (let k = 0; k < seq.length; k++) {
      if (seq[k].t !== 'x') continue;
      let a = null, b = null; for (let j = k - 1; j >= 0; j--) if (seq[j].t === 'd') { a = seq[j]; break; } for (let j = k + 1; j < seq.length; j++) if (seq[j].t === 'd') { b = seq[j]; break; }
      // regra do UAU: nome longo quebra em texto ANTES + dado (insumo vazio ou parcial) + texto DEPOIS
      const prevIsText = k > 0 && seq[k - 1].t === 'x', nextIsData = k + 1 < seq.length && seq[k + 1].t === 'd';
      let alvo;
      if (b && !b.nome && (!a || a.nome || a.depois.length)) alvo = ['antes', b];
      else if (a && !nextIsData) alvo = ['depois', a];
      else if (b && nextIsData && !prevIsText && (!a || a.depois.length || a.nome)) alvo = ['antes', b];
      else if (a) { alvo = ['depois', a]; amb++; } else if (b) alvo = ['antes', b];
      if (alvo) alvo[1][alvo[0]].push(seq[k].s);
    }
    const items = [];
    for (const o of datas) {
      const nome = [...o.antes, o.nome, ...o.depois].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      const rec = {}; H.forEach((h, i) => { if (h) rec[h] = o.r[i]; }); rec[H[cI] || 'Insumo'] = nome;
      rec._ex = cEx >= 0 ? /^1|SIM/.test(norm(o.r[cEx])) : false;
      items.push(rec);
    }
    return YK.norm({ items: items.filter(x => !x._ex), excluidos: items.filter(x => x._ex).length, ambiguas: amb });
  };
  /* planilha já corrigida (uma linha por item) ou remontada acima → registros padronizados */
  const iso = v => { if (v == null || v === '') return null; if (typeof v === 'number') return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10); const s = String(v); const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s) || /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s); return m ? (m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2]}-${m[1]}`) : null; };
  const num = v => typeof v === 'number' ? v : (parseFloat(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.')) || 0);
  YK.norm = function (P) {
    const pick = (o, ...ks) => { for (const k of ks) { const kk = Object.keys(o).find(x => norm(x) === norm(k)); if (kk != null && o[kk] != null && o[kk] !== '') return o[kk]; } return null; };
    const out = [], seen = new Set();
    for (const o of P.items) {
      const r = { ped: String(pick(o, 'Pedido') || ''), cot: String(pick(o, 'Cotação', 'Cotacao') || ''), cod: String(pick(o, 'CodIns', 'Cód. Insumo', 'Cod. Insumo', 'Código Insumo') || '').trim(), ins: String(pick(o, 'Insumo') || '').trim(),
        qtd: num(pick(o, 'QtdPedido', 'Qtde', 'Quantidade')), pu: num(pick(o, 'Preco', 'Preço', 'Preço Unit.', 'Preco Unit')), est: String(pick(o, 'Estagio', 'Estágio') || ''),
        dPed: iso(pick(o, 'DataPedido', 'Data Pedido')), dCompra: iso(pick(o, 'DataCompra', 'Data Compra')), dEnt: iso(pick(o, 'DataEntrega', 'Data Entrega')), oc: String(pick(o, 'O.C', 'OC') || ''),
        ltPC: pick(o, 'Pedido_Compra'), ltCE: pick(o, 'Compra_Entrega'), comprador: String(pick(o, 'UsuarioCompra') || '') };
      if (r.ltPC != null) r.ltPC = num(r.ltPC); if (r.ltCE != null) r.ltCE = num(r.ltCE);
      r.v = r.qtd * r.pu;
      const k = [r.ped, r.cot, r.cod, r.qtd, r.pu, r.dPed].join('|'); if (seen.has(k)) continue; seen.add(k); // linha duplicada pela paginação conta uma vez
      out.push(r);
    }
    return { itens: out, excluidos: P.excluidos || 0, ambiguas: P.ambiguas || 0, dup: P.items.length - out.length };
  };
  /* planilha .xlsx corrigida: linhas já prontas */
  YK.isRows = R => R && R[0] && R[0].some(v => /^PEDIDO$/.test(norm(v))) && R[0].some(v => /^INSUMO$/.test(norm(v))) && R[0].some(v => /CODINS|COD\. INSUMO|PRECO/.test(norm(v)));
  YK.fromRows = function (R) { const H = R[0].map(v => String(v == null ? '' : v).trim()); const items = []; let ex = 0;
    for (const r of R.slice(1)) { if (!r || !r.some(v => v != null && v !== '')) continue; const o = {}; H.forEach((h, i) => { if (h) o[h] = r[i]; }); const e = Object.keys(o).find(k => norm(k) === 'EXCLUIDO'); if (e && /^1|SIM/.test(norm(o[e]))) { ex++; continue; } items.push(o); }
    return YK.norm({ items, excluidos: ex }); };
  G.YK = YK;
})(typeof globalThis !== 'undefined' ? globalThis : window);
