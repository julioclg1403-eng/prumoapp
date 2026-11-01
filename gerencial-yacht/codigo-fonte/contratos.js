/* Contratos (relatório de contratos do UAU) — saldo a medir ligado ao orçamento e planejamento dos próximos 3 meses */
(function (G) {
  const YC = {};
  const dec = s => String(s || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n));
  const num = s => { s = String(s || '').trim(); if (!s) return 0; if (/,/.test(s) && !/\./.test(s)) s = s.replace(',', '.'); else if (/,/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); const v = parseFloat(s); return isNaN(v) ? 0 : v; };
  const code = s => String(s || '').split(' - ')[0].trim();

  YC.is = txt => /CHAVECONTRATO/i.test(txt) && /Cod_cont/i.test(txt);
  /* Uma linha por item de contrato (CHAVECONTRATO = empresa-obra-contrato-item). Repetições da mesma chave contam uma vez só. */
  YC.parse = function (html) {
    const rows = [];
    for (const tr of html.split(/<tr\b/i).slice(1)) {
      const cells = []; for (const m of tr.matchAll(/<td\b[^>]*>([\s\S]*?)(?=<td\b|<\/tr|$)/gi)) cells.push(dec(m[1].replace(/<[^>]+>/g, '')).trim());
      if (cells.length) rows.push(cells);
    }
    const hi = rows.findIndex(r => r.includes('CHAVECONTRATO') && r.includes('Cod_cont'));
    if (hi < 0) throw new Error('Relatório de contratos: cabeçalho não encontrado');
    const H = rows[hi]; const ix = n => H.indexOf(n);
    for (const n of ['Cod_cont', 'Objeto_cont', 'Nome_pes', 'Serv_itens', 'Descr_itens', 'Qtde_itens', 'Preco_itens', 'Total', 'QtdeAcomp', 'ValorAcomp', 'QtdeAAcomp', 'ValorAAcomp']) if (ix(n) < 0) throw new Error('Relatório de contratos: coluna ' + n + ' ausente');
    const seen = new Set(), itens = [], dup = [];
    for (const r of rows.slice(hi + 1)) {
      if (r.length < H.length - 2) continue;
      const g = n => r[ix(n)] || '';
      const key = g('CHAVECONTRATO') || [g('Empresa_cont'), g('Obra_cont'), g('Cod_cont'), g('Item_itens')].join('-');
      if (seen.has(key)) { dup.push(key); continue; } seen.add(key);
      itens.push({
        key, obra: g('Obra_cont'), ct: g('Cod_cont'), obj: g('Objeto_cont'), fcod: g('CodPes_cont'), forn: g('Nome_pes'),
        status: g('StatusCont'), sit: g('SituacaoCont'), item: g('Item_itens'), srv: g('Serv_itens'), d: g('Descr_itens'), un: g('Unid_itens'),
        q: num(g('Qtde_itens')), pu: num(g('Preco_itens')), tot: num(g('Total')), qm: num(g('QtdeAcomp')), vm: num(g('ValorAcomp')), qa: num(g('QtdeAAcomp')), va: num(g('ValorAAcomp')),
        ctTot: num(r[ix('TotalContrato')]), ctMed: num(g('ValorMedido')), ctSaldo: num(g('SaldoContrato')), ctApagar: num(g('APagar'))
      });
    }
    return { itens, dup };
  };

  /* Liga cada item de contrato ao item do orçamento (e ao serviço da FLUXO-BASE):
     1) o código do serviço do contrato (CCxxxx) aparece como item comprado no relatório Pagar & Pago → usa os mesmos itens do orçamento dessas parcelas
        (primeiro só as do mesmo fornecedor; se não houver, de qualquer fornecedor)
     2) o fornecedor do contrato tem parcelas no relatório → serviço onde ele tem mais valor; dentro dele, item pelo texto (ou rateio pelo orçado)
     3) semelhança de texto (descrição do item + objeto) com todas as composições do orçamento
     4) sem vínculo → aparece à parte; nada some */
  YC.link = function (M, cmp, itens) {
    const byItem = {}, byForn = {};
    cmp.alloc.forEach(a => {
      const x = M.rp[a.k]; if (!a.its.length) return; const v = x.pg + x.ap || 1e-9, ic = code(x.item), fc = code(x.forn);
      (byItem[ic] || (byItem[ic] = [])).push({ a, v, fc, n: x.n });
      (byForn[fc] || (byForn[fc] = [])).push({ a, v, n: x.n });
    });
    const agg = L => { const o = {}; let t = 0; for (const { a, v } of L) for (const [it, sh] of a.its) { o[it] = (o[it] || 0) + v * sh; t += v * sh; } return Object.entries(o).map(([it, v]) => [it, v / t]).filter(p => p[1] >= 0.001).sort((a, b) => b[1] - a[1]); };
    const nodeOf = parts => { const o = {}; for (const [it, sh] of parts) { const n = cmp.items[it].node; o[n] = (o[n] || 0) + sh; } return Object.entries(o).sort((a, b) => b[1] - a[1])[0][0]; };
    const allIts = Object.keys(cmp.items);
    for (const it of itens) {
      it.parts = []; it.node = null; it.via = 'sem vínculo';
      const q = it.d + ' ' + it.d + ' ' + it.obj;
      const L1 = byItem[it.srv] || [];
      const Lf = L1.filter(l => l.fc === it.fcod);
      if (Lf.length || L1.length) { it.parts = agg(Lf.length ? Lf : L1); it.via = `código ${it.srv} no relatório` + (Lf.length ? '' : ' (outro fornecedor)'); }
      else if (byForn[it.fcod]) {
        const o = {}; for (const l of byForn[it.fcod]) o[l.n] = (o[l.n] || 0) + l.v; const nd = Object.entries(o).sort((a, b) => b[1] - a[1])[0][0];
        const cand = cmp.byNode[nd] || [];
        if (cand.length === 1) { it.parts = [[cand[0], 1]]; it.via = 'fornecedor no relatório (único item do serviço)'; }
        else if (cand.length) {
          const sc = cmp.score(q, cand);
          if (sc[0][1] >= 0.12 && sc[0][1] >= 1.15 * (sc[1] ? sc[1][1] : 0)) { it.parts = [[sc[0][0], 1]]; it.via = `fornecedor + texto ${Math.round(sc[0][1] * 100)}%`; }
          else { const t = cand.reduce((a, c) => a + (cmp.items[c].c.tot || 0), 0) || 1; it.parts = cand.map(c => [c, (cmp.items[c].c.tot || 0) / t]).filter(p => p[1] > 0); it.via = 'fornecedor + rateio pelo orçado'; }
        }
      }
    }
    // 2ª passada, por contrato: itens sem vínculo seguem os itens do mesmo contrato já ligados;
    // se o contrato inteiro ficou sem vínculo, usa o objeto do contrato (e o valor total igual ao de um item do orçamento), depois o texto do item
    const porCt = {}; for (const it of itens) (porCt[it.ct] || (porCt[it.ct] = [])).push(it);
    for (const L of Object.values(porCt)) {
      const lig = L.filter(i => i.parts.length);
      if (lig.length) {
        const o = {}; let t = 0; for (const i of lig) for (const [k, sh] of i.parts) { const v = (i.tot || 1) * sh; o[k] = (o[k] || 0) + v; t += v; }
        const parts = Object.entries(o).map(([k, v]) => [k, v / t]).sort((a, b) => b[1] - a[1]);
        for (const i of L) if (!i.parts.length) { i.parts = parts; i.via = 'mesmo contrato'; }
        continue;
      }
      const f = L[0], ctTot = f.ctTot || L.reduce((a, i) => a + i.tot, 0);
      const so = cmp.score(f.obj + ' ' + f.obj + ' ' + L.map(i => i.d).join(' '), allIts);
      const top = so[0] ? so[0][1] : 0, igual = so.slice(0, 15).find(([k, v]) => v >= 0.08 && (v >= 0.6 * top || top < 0.3) && ctTot > 0 && Math.abs(cmp.items[k].c.tot - ctTot) <= 0.005 * ctTot);
      let parts = null, via = '';
      if (igual) { parts = [[igual[0], 1]]; via = `objeto do contrato + valor igual ao orçado (${Math.round(igual[1] * 100)}%)`; }
      else if (so[0] && so[0][1] >= 0.25 && so[0][1] >= 1.2 * (so[1] ? so[1][1] : 0)) { parts = [[so[0][0], 1]]; via = `objeto do contrato ${Math.round(so[0][1] * 100)}%`; }
      for (const i of L) {
        if (parts) { i.parts = parts; i.via = via; continue; }
        const sc = cmp.score(i.d + ' ' + i.d + ' ' + i.obj, allIts);
        if (sc[0] && sc[0][1] >= 0.3 && sc[0][1] >= 1.2 * (sc[1] ? sc[1][1] : 0)) { i.parts = [[sc[0][0], 1]]; i.via = `texto ${Math.round(sc[0][1] * 100)}%`; }
      }
    }
    for (const it of itens) if (it.parts.length) it.node = nodeOf(it.parts);
    return itens;
  };

  /* Quantidade: cada item de contrato é ligado a UM item do orçamento com a mesma unidade e o texto mais parecido
     (estaca Ø60 → escavação de estaca Ø60, armação de blocos → corte/dobra/montagem de aço dos blocos, preparo da cabeça → preparo cabeça de estacas).
     Procura primeiro nos itens já ligados ao gasto, depois no mesmo serviço, na mesma etapa e por fim no orçamento todo.
     A quantidade medida do contrato vira a "quantidade executada" do item. */
  const nu = u => { u = String(u || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/²/g, '2').replace(/³/g, '3').replace(/[^A-Z0-9]/g, ''); return ({ ME: 'MES', MS: 'MES', MESES: 'MES', DIARI: 'DIA', DIARIA: 'DIA', DIAS: 'DIA', UND: 'UN', UM: 'UN', UNID: 'UN', PC: 'UN', ML: 'M', MT: 'M', M2: 'M2', M3: 'M3', VB: 'VB', KG: 'KG', QUINZ: 'QUINZENA' })[u] || u; };
  YC.nu = nu;
  YC.qlink = function (M, cmp, itens) {
    const all = Object.keys(cmp.items), byB = {};
    for (const k of all) { const n = cmp.items[k].node, b = n && M.nodes[n] ? M.nodes[n].b : ''; (byB[b] || (byB[b] = [])).push(k); }
    for (const it of itens) {
      it.qit = null; it.qvia = '';
      const u = nu(it.un);
      const okU = k => u && it.q > 0 && nu(cmp.items[k].c.un) === u;
      const q = it.d + ' ' + it.d + ' ' + it.obj;
      const nd = it.node, B = nd && M.nodes[nd] ? M.nodes[nd].b : null;
      const scopes = [['gasto', it.parts.map(p => p[0]), 0.2], ['serviço', nd ? cmp.byNode[nd] || [] : [], 0.2], ['etapa', B ? byB[B] || [] : [], 0.27], ['orçamento', all, 0.32]];
      const tried = new Set();
      const glob = all.filter(okU); const sg = glob.length ? cmp.score(q, glob) : [];
      for (const [nome, cand0, min] of scopes) {
        const cand = cand0.filter(k => !tried.has(k) && okU(k)); cand0.forEach(k => tried.add(k));
        if (!cand.length) continue;
        const sc = cmp.score(q, cand); if (!sc.length) continue;
        if (nome === 'gasto' && cand.length === 1 && it.parts.length === 1 && (u === 'VB' || sc[0][1] >= 0.1)) { it.qit = cand[0]; it.qvia = 'mesmo item do gasto, mesma unidade'; break; }
        if (nome !== 'orçamento' && sg[0] && sg[0][0] !== sc[0][0] && sg[0][1] >= 0.35 && sg[0][1] >= 1.3 * sc[0][1]) { it.qit = sg[0][0]; it.qvia = `texto ${Math.round(sg[0][1] * 100)}% + unidade ${u} (orçamento)`; break; }
        if (sc[0][1] >= min && sc[0][1] >= 1.1 * (sc[1] ? sc[1][1] : 0)) { it.qit = sc[0][0]; it.qvia = `texto ${Math.round(sc[0][1] * 100)}% + unidade ${u} (${nome})`; break; }
      }
      // o valor a medir segue o item da quantidade quando o vínculo do gasto era rateio/vários itens
      if (it.qit && it.parts.length !== 1) { it.parts = [[it.qit, 1]]; it.via = 'item do contrato → ' + it.qvia; const n = cmp.items[it.qit].node; if (n) it.node = n; }
      // sem item de mesma unidade: o valor ainda assim vai para UM item — o de texto mais parecido (nada de espalhar pelo serviço)
      if (it.parts.length > 1) {
        const loc = [...new Set([...it.parts.map(p => p[0]), ...(nd ? cmp.byNode[nd] || [] : [])])];
        const tries = [['serviço', loc, 0.15], ['etapa', B ? byB[B] || [] : [], 0.22], ['orçamento', all, 0.3]];
        let done = false; const sg2 = cmp.score(q, all), sl = cmp.score(q, loc);
        if (sg2[0] && sg2[0][1] >= 0.35 && sg2[0][1] >= 1.3 * (sl[0] ? sl[0][1] : 0)) { it.parts = [[sg2[0][0], 1]]; it.via = `item do contrato → texto ${Math.round(sg2[0][1] * 100)}% (orçamento)`; done = true; }
        if (!done) for (const [nome, cand, min] of tries) { const sc = cmp.score(q, cand); if (sc[0] && sc[0][1] >= min && sc[0][1] >= 1.1 * (sc[1] ? sc[1][1] : 0)) { it.parts = [[sc[0][0], 1]]; it.via = `item do contrato → texto ${Math.round(sc[0][1] * 100)}% (${nome})`; done = true; break; } }
        if (!done && sl[0] && sl[0][1] >= 0.15) { it.parts = [[sl[0][0], 1]]; it.via = `item do contrato → texto fraco ${Math.round(sl[0][1] * 100)}% (conferir)`; done = true; }
        if (!done) { it.parts = []; it.via = 'sem item parecido no orçamento (escolha o item na aba Contratos)'; }
        else { const n = cmp.items[it.parts[0][0]].node; if (n) it.node = n; }
      }
    }
    // revisão final: um item só para valor e quantidade; texto forte no orçamento todo vence vínculo fraco (fornecedor/rateio)
    for (const it of itens) {
      if (it.parts.length !== 1) continue;
      const q = it.d + ' ' + it.d + ' ' + it.obj, cur = it.parts[0][0];
      const forte = /^código|valor igual/.test(it.via), contrato = /valor igual|^objeto do contrato|^mesmo contrato/.test(it.via);
      const sc = cmp.score(q, [cur]); const sCur = sc[0] ? sc[0][1] : 0;
      const sg = cmp.score(q, all);
      if (sg[0] && sg[0][0] !== cur && sg[0][1] >= (forte ? 0.5 : 0.35) && sg[0][1] >= (forte ? 2 : 1.3) * sCur) { it.parts = [[sg[0][0], 1]]; it.via = `texto ${Math.round(sg[0][1] * 100)}% no orçamento (antes: ${it.via})`; }
      else if (!contrato && sCur < (forte ? 0.15 : 0.25) && !/conferir/.test(it.via) && !/^item do contrato → texto \d+% \+ unidade/.test(it.via)) it.via += ' · texto fraco, conferir';
      const v = it.parts[0][0];
      if (it.qit && it.qit !== v) { const s2 = cmp.score(q, [it.qit, v]); if (s2[0] && s2[0][0] === it.qit && s2[0][1] > (s2[1] ? s2[1][1] : 0) * 1.1) { it.parts = [[it.qit, 1]]; it.via = 'item do contrato → ' + it.qvia; } }
      const fin = it.parts[0][0]; it.node = cmp.items[fin].node || it.node;
      const u = nu(it.un), uc = nu(cmp.items[fin].c.un);
      if (/conferir/.test(it.via)) { it.qit = null; it.qvia = 'vínculo fraco: sem quantidade até conferir'; }
      else if (it.qit !== fin) { it.qit = it.q > 0 && (u === uc || uc === 'VB') ? fin : null; it.qvia = it.qit ? 'mesmo item do valor' + (uc === 'VB' ? ' (verba: % medido)' : ', mesma unidade') : (it.q > 0 ? `unidade diferente (${it.un} × ${cmp.items[fin].c.un}): sem quantidade` : ''); }
    }
    return itens;
  };
  /* quantidade executada por item do orçamento: soma das quantidades medidas dos contratos ligados;
     em verba (VB) vale a fração medida em valor (medido ÷ total dos itens de contrato) × quantidade orçada */
  /* vínculo escolhido à mão na aba Contratos: vale para o valor a medir e para a quantidade */
  YC.manual = function (cmp, itens, map) {
    for (const it of itens) { const k = map && map[it.key]; if (!k || !cmp.items[k]) continue; it.parts = [[k, 1]]; it.via = 'escolhido à mão'; it.node = cmp.items[k].node || it.node; it.qit = nu(cmp.items[k].c.un) === nu(it.un) || nu(cmp.items[k].c.un) === 'VB' ? k : null; it.qvia = it.qit ? 'escolhido à mão' : 'escolhido à mão (unidade diferente: sem quantidade)'; }
  };
  YC.qexec = function (cmp, itens) {
    const g = {};
    for (const it of itens) if (it.qit) (g[it.qit] || (g[it.qit] = [])).push(it);
    const out = {};
    for (const [k, L] of Object.entries(g)) {
      const c = cmp.items[k].c, vb = nu(c.un) === 'VB';
      const tot = L.reduce((a, i) => a + i.tot, 0), vm = L.reduce((a, i) => a + i.vm, 0), qc = L.reduce((a, i) => a + i.q, 0), qm = L.reduce((a, i) => a + i.qm, 0);
      for (const i of L) i.qcontrib = vb ? (tot ? (c.q || 1) * i.vm / tot : 0) : i.qm;
      out[k] = vb ? { qex: tot ? (c.q || 1) * vm / tot : 0, qct: c.q || 1, regra: `verba: ${((tot ? vm / tot : 0) * 100).toFixed(1).replace('.', ',')}% medido em valor × qtd. orçada`, L } : { qex: qm, qct: qc, regra: 'soma das quantidades medidas nos contratos', L };
    }
    return out;
  };

  /* Estimativa do saldo a medir por mês: proporcional aos dias das atividades do serviço que ainda faltam no cronograma (a partir de M+1).
     Sem atividade futura → proporcional ao previsto futuro da FLUXO-BASE; sem nada → M+1…M+3 em partes iguais. */
  const D = s => new Date(s + 'T00:00:00Z').getTime();
  const mk = t => { const d = new Date(t); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); };
  const addM = (k, n) => { let y = +k.slice(0, 4), m = +k.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + String(m + 1).padStart(2, '0'); };
  YC.addM = addM;
  YC.shape = function (M, id, refM, cache) {
    cache = cache || {}; if (cache[id]) return cache[id];
    const ref = D(addM(refM, 1) + '-01'); const w = {}; let how;
    const sc = id ? YM.scope(M, id) : { tasks: [] }; const ts = sc.tasks.filter(t => t.i && t.f && D(t.f) + 864e5 > ref);
    if (ts.length) {
      for (const t of ts) { let a = Math.max(D(t.i), ref); const b = D(t.f) + 864e5; while (a < b) { const d = new Date(a); const nx = Math.min(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1), b); w[mk(a)] = (w[mk(a)] || 0) + (nx - a); a = nx; } }
      const fim = ts.reduce((a, t) => t.f > a ? t.f : a, ''); how = 'cronograma (até ' + fim.slice(8, 10) + '/' + fim.slice(5, 7) + '/' + fim.slice(2, 4) + ')';
    } else {
      const p = id ? Object.entries(M.nodes[id].prev || {}).filter(([m, v]) => m > refM && v > 0) : [];
      if (p.length) { p.forEach(([m, v]) => w[m] = v); how = 'previsto da FLUXO-BASE'; }
      else { [1, 2, 3].forEach(k => w[addM(refM, k)] = 1); how = 'partes iguais nos 3 meses'; }
    }
    const tot = Object.values(w).reduce((a, x) => a + x, 0); for (const k in w) w[k] /= tot;
    return (cache[id] = { w, how });
  };
  YC.estimate = function (M, itens, refM) {
    const cache = {}; const ms = [1, 2, 3].map(k => addM(refM, k));
    for (const it of itens) {
      const sh = YC.shape(M, it.node, refM, cache); it.how = sh.how; it.est = {};
      for (const m of ms) it.est[m] = { q: it.qa * (sh.w[m] || 0), v: it.va * (sh.w[m] || 0), f: sh.w[m] || 0 };
    }
    return ms;
  };
  // tipo sugerido para a linha do planejamento
  YC.tipo = it => /LOCA[ÇC][ÃA]O|ESCAVADEIRA|RETRO|CAMINH|BETONEIRA|GRUA|ANDAIME|PLATAFORMA|EQUIPAMENTO|M[ÁA]QUINA|BOMBA|GUINDA|MUNCK|TORRE|PERFURATRIZ|SOFTWARE|MENSALIDADE/i.test(it.d + ' ' + it.obj) ? 'EQ' : /FORNECIMENTO|MATERIA/i.test(it.d) ? 'MAT' : 'MO';
  YC.TIPOS = { MAT: 'Materiais', MO: 'Mão de obra', EQ: 'Equipamento / outros' };

  G.YC = YC;
})(typeof globalThis !== 'undefined' ? globalThis : window);
