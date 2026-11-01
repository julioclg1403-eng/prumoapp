/* Comparativo com o orçamento: cada parcela do relatório Pagar & Pago ligada ao item (composição) do orçamento */
(function (G) {
  const YO = {};
  const STOP = new Set('DE DA DO DAS DOS E EM NO NA NOS NAS PARA POR COM SEM A O AS OS AO AOS UM UMA TIPO REF MM CM UN UND PC PCT KG MT M2 M3 CX GL LT ROLO SACO MATERIAL MATERIAIS SERVICO SERVICOS'.split(' '));
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const toks = s => norm(s).replace(/(\d)([A-Z])/g, '$1 $2').replace(/([A-Z])(\d)/g, '$1 $2').replace(/(\d),(\d)/g, '$1.$2').split(/[^A-Z0-9.]+/).map(w => w.replace(/^\.+|\.+$/g, '')).filter(w => (w.length >= 3 || /^\d{2,}/.test(w)) && !STOP.has(w)).map(w => w.length > 4 && !/\d/.test(w) ? w.replace(/(OES|AIS|EIS|S)$/, '') : w);
  const mm2cm = s => norm(s).replace(/(\d+)\s*MM\b/g, (m, n) => m + (+n >= 100 && +n % 10 === 0 ? ' ' + (+n / 10) + 'CM' : ''));
  const strip = s => String(s || '').replace(/^\s*[A-Z0-9.\-]+\s+-\s+/, '');

  /* Regra de vínculo de cada parcela:
     1) insumo da parcela (P00xxx) dentro do serviço → itens do orçamento ligados a esse insumo na FLUXO-BASE (códigos ORÇ-)
        · 1 item → direto
        · vários → o item cujo texto (composição + insumos do orçamento + linha da FLUXO-BASE) mais se parece com o item comprado;
          se nenhum se destacar, rateio proporcional ao orçado desses itens
     2) insumo sem item no orçamento → itens do mesmo serviço, pela mesma regra de texto/rateio
     3) serviço sem item no orçamento → "sem item do orçamento" (aparece à parte, nada some) */
  YO.build = function (M, raw) {
    const fb = raw.fluxobase, comps = (raw.orc && raw.orc.comps) || [];
    const C = {}; comps.forEach(c => { C[c.it] = c; });
    const byD = {}, byNode = {};
    for (const c of comps) {
      const n = fb.orcLinks[c.it]; if (!n) continue;
      (byNode[n] || (byNode[n] = [])).push(c.it);
      const d = fb.orcIns && fb.orcIns[c.it]; if (d) (byD[d] || (byD[d] = [])).push(c.it);
    }
    // TF-IDF dos itens: um vetor só com a descrição da composição (peso maior) e outro com composição + insumos
    const mk = it => { const c = C[it]; return [[c.d, (fb.orcTxt || {})[c.it] || ''].join(' '), [c.d, ...(c.ins || []), (fb.orcTxt || {})[c.it] || ''].join(' ')]; };
    const df = {}; const raw2 = {};
    for (const c of comps) { const [a, b] = mk(c.it); raw2[c.it] = [toks(a), toks(b)]; for (const w of new Set(raw2[c.it][1])) df[w] = (df[w] || 0) + 1; }
    const N = comps.length || 1, idf = w => Math.log(1 + N / (df[w] || 0.5));
    const vec = ws => { const v = {}; for (const w of ws) v[w] = (v[w] || 0) + 1; let n = 0; for (const w in v) { v[w] = (1 + Math.log(v[w])) * idf(w); n += v[w] * v[w]; } return [v, Math.sqrt(n) || 1]; };
    const docs = {}; for (const c of comps) docs[c.it] = [vec(raw2[c.it][0]), vec(raw2[c.it][1])];
    const cos = (q, d) => { let s = 0; for (const w in q[0]) if (d[0][w]) s += q[0][w] * d[0][w]; return s / (q[1] * d[1]); };
    const score = (q, its) => { const qv = vec(toks(mm2cm(q))); return its.map(it => [it, 0.7 * cos(qv, docs[it][0]) + 0.3 * cos(qv, docs[it][1])]).sort((a, b) => b[1] - a[1]); };
    const items = {}; comps.forEach(c => { items[c.it] = { c, node: fb.orcLinks[c.it] || null, pg: 0, ap: 0, n: 0, lanc: [], vias: {} }; });
    // itens sem linha na FLUXO-BASE (em geral orçado zero) ficam no serviço dos itens irmãos (mesmo código até o 3º nível), para aparecerem no comparativo
    const pref = it => it.split('.').slice(0, 3).join('.'), sib = {};
    for (const o of Object.values(items)) if (o.node) { const k = pref(o.c.it), m = sib[k] || (sib[k] = {}); m[o.node] = (m[o.node] || 0) + 1; }
    for (const o of Object.values(items)) if (!o.node && sib[pref(o.c.it)]) { o.node = Object.entries(sib[pref(o.c.it)]).sort((a, b) => b[1] - a[1])[0][0]; o.semFB = true; }
    const semItem = {}; // por serviço
    const cache = {};
    const alloc = [];
    M.rp.forEach((x, k) => {
      const p = (x.ins || '').split(' - ')[0].trim(), key = (x.n || '') + '|' + p;
      let cand = byD[key], nivel = 'insumo';
      if (!cand || !cand.length) { cand = byNode[x.n]; nivel = 'serviço'; }
      if (!cand || !cand.length) {
        const s = semItem[x.n || ''] || (semItem[x.n || ''] = { pg: 0, ap: 0, n: 0, lanc: [] }); s.pg += x.pg; s.ap += x.ap; s.n++; s.lanc.push({ x, share: 1 });
        alloc.push({ k, its: [], via: 'sem item do orçamento' }); return;
      }
      let parts, via;
      if (cand.length === 1) { parts = [[cand[0], 1]]; via = nivel === 'insumo' ? 'direto pelo insumo' : 'único item do serviço'; }
      else {
        const q = strip(x.item) + ' ' + strip(x.item) + ' ' + strip(x.ins);
        const ck = key + '#' + q; let sc = cache[ck]; if (!sc) sc = cache[ck] = score(q, cand);
        if (sc[0][1] >= 0.12 && sc[0][1] >= 1.15 * (sc[1] ? sc[1][1] : 0)) { parts = [[sc[0][0], 1]]; via = `texto ${Math.round(sc[0][1] * 100)}% (${nivel})`; }
        else { const tot = cand.reduce((a, it) => a + (C[it].tot || 0), 0) || cand.length; parts = cand.map(it => [it, (C[it].tot || (tot === cand.length ? 1 : 0)) / tot]).filter(p => p[1] > 0); via = `rateio pelo orçado (${nivel})`; }
      }
      for (const [it, sh] of parts) { const o = items[it]; o.pg += x.pg * sh; o.ap += x.ap * sh; o.n++; o.lanc.push({ x, share: sh, via }); const vk = via.split(' ')[0]; o.vias[vk] = (o.vias[vk] || 0) + (x.pg + x.ap) * sh; }
      alloc.push({ k, its: parts, via });
    });
    return { items, semItem, alloc, byNode, score: (q, its) => score(q, its.filter(it => docs[it])) };
  };

  G.YO = YO;
})(typeof globalThis !== 'undefined' ? globalThis : window);
