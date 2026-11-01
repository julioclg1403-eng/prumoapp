/* Vínculos e modelo consolidado */
(function (G) {
  const YM = {};

  /* De-para Cronograma → serviço da FLUXO-BASE (ID B ou C).
     Ordem: regra específica (regex na tarefa) antes da regra pelo prefixo. */
  YM.TASK_RULES = [
    [/^IND - Aprova/i, '01.01'], [/^IND - Projeto/i, '01.02'], [/^IND - Planejamento/i, '01.03'], [/^IND - Canteiro/i, '01.04'],
    [/^IND - Equipamentos/i, '01.05'], [/^IND - Segurança/i, '01.06'], [/^IND - Equipe/i, '01.07'],
    [/^CRE - /i, '01.05.01'], [/^ESQ - (Montagem|Desmontagem) Balancim/i, '01.05.02'],
    [/^SEG - /i, '01.06.02'],
    [/^INF - (Contenção|Fundação da Contenção)/i, '02.01.02'], [/^FUN - (Estacas Justapostas|Viga de Coroamento)/i, '02.01.02'],
    [/^INF - /i, '02.01.01'], [/^FUN - /i, '02.01.03'],
    [/^EST - Cobertura Met/i, '02.11.01'], [/^EST - Trat/i, '02.11.04'], [/^EST - /i, '02.02'],
    [/^TRAT - /i, '02.11.04'],
    [/^INS - SPDA/i, '02.05.01'], [/^INS - /i, '02.03.01'], [/^HID - /i, '02.03.01'],
    [/^PIS - Piso de Conc/i, '02.04.01'], [/^PIS - /i, '02.04.03'], [/^CON - /i, '02.04.01'],
    [/^REV - Piso Vin/i, '02.04.01'], [/^REV - Revest\. Piso$/i, '02.04.04'], [/^REV - Revest\. \+ Rejunte/i, '02.04.04'],
    [/^REV - Revest\. Espelho/i, '02.12.04'], [/^REV - Revestimento (Muro|Pilares)/i, '02.13.02'], [/^REV - /i, '02.04.05'],
    [/^ELE - Grupo Gerador/i, '02.05.03'], [/^ELE - /i, '02.05.02'],
    [/^VED - /i, '02.06'],
    [/^ESQ - Esquadrias de Madeira/i, '02.07.01'], [/^ESQ - Gradil/i, '02.08.02'], [/^ESQ - /i, '02.08.01'],
    [/^INC - Porta/i, '02.08.03'], [/^INC - /i, '02.09.04'],
    [/^ELV - /i, '02.09.01'], [/^ARC - /i, '02.09.02'], [/^(CLI|GAS) - /i, '02.09.03'],
    [/^LOU - /i, '02.10'], [/^PED - /i, '02.10.03'],
    [/^IMP - Prot/i, '02.11.02'], [/^IMP - /i, '02.11.03'],
    [/^REB - Reboco Fachada/i, '02.13.01'], [/^RPE - /i, '02.13.01'], [/^REB - /i, '02.12.01'],
    [/^FOR - Forro de Gesso/i, '02.14.02'], [/^FOR - /i, '02.14.03'],
    [/^PIN - Selador/i, '02.15.02'], [/^PIN - (Demarca|Pintura Po|Pintura Tub)/i, '02.15.04'], [/^PIN - /i, '02.15.01'],
    [/^PAI - /i, '02.16.01'], [/^MOB - /i, '02.16.04'],
    [/^LIM - /i, '02.17.01']
  ];
  /* De-para de serviços do relatório que não existem com o mesmo código na FLUXO-BASE */
  YM.SRV_RULES = { C00331: '02.09.05', C00220: '01.06.04', C00416: '02.01.01' };
  YM.taskNode = t => { for (const [re, id] of YM.TASK_RULES) if (re.test(t)) return id; return null; };

  /* Disciplinas (cores da linha de balanço) — máx. 8 grupos */
  YM.DISC = [
    ['Estrutura e fundação', ['FUN', 'INF', 'EST', 'TRAT', 'CON']],
    ['Vedação e revestimento', ['VED', 'REB', 'RPE', 'REV', 'PED']],
    ['Instalações', ['ELE', 'HID', 'INS', 'GAS', 'CLI', 'ARC', 'INC', 'ELV']],
    ['Esquadrias', ['ESQ']],
    ['Acabamentos', ['PIS', 'FOR', 'PIN', 'IMP', 'LOU']],
    ['Segurança e equipamentos', ['SEG', 'CRE', 'IND']],
    ['Limpeza e entrega', ['LIM', 'VIS', 'PAI', 'MOB', 'Check List']]
  ];
  YM.discOf = pre => { const i = YM.DISC.findIndex(d => d[1].includes(pre)); return i < 0 ? YM.DISC.length - 1 : i; };

  /* Ordem dos locais (eixo vertical da linha de balanço, de baixo para cima) */
  YM.lotOrder = function (lots) {
    const key = l => {
      let m = /^Pav (\d+)/.exec(l); if (m && !/Fachada/.test(l)) return [3, +m[1], l];
      if (/^Indiretos/.test(l)) return [0, 0, l];
      if (/^Infraestrutura/.test(l)) return [1, 0, l];
      if (/^Subsolo/.test(l)) return [2, 0, l];
      if (/^Pav Térreo$/.test(l)) return [3, 1, l];
      if (/^Pav Térreo Externo/.test(l)) return [3, 1.5, l];
      if (/Fachada/.test(l)) return [5, 0, l];
      if (/^Elev/.test(l)) return [6, 0, l];
      return [7, 0, l];
    };
    return [...lots].sort((a, b) => { const A = key(a), B = key(b); return A[0] - B[0] || A[1] - B[1] || A[2].localeCompare(B[2], 'pt'); });
  };

  const D = s => s ? new Date(s + 'T00:00:00Z').getTime() : null;
  const mkey = t => { const d = new Date(t); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); };
  YM.D = D; YM.mkey = mkey;


  /* ---------- Duplicidades: nada pode ser contado duas vezes ----------
     Cronograma:
       1) linha com a coluna Serviço preenchida que repete uma atividade própria
          (ex.: "FUN - Blocão" / Serviço "Forma Blocão (Sul)" = atividade "FUN - Forma Blocão (Sul)");
       2) linha-resumo: mesma tarefa sem Serviço que agrupa as linhas com Serviço (ex.: "FUN - Blocão" 14/10–24/12);
       3) linha idêntica a outra (mesma tarefa, serviço, local e datas) ou com o mesmo ID.
     Relatório: linha repetida (mesma Chave1, parcela, insumo, item e valores). A Chave1 sozinha não basta: ela se repete entre os itens da mesma parcela. */
  const nz = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  YM.dedupTasks = function (tasks) {
    const tails = new Map(); // "FORMA BLOCAO (SUL)" -> nome da atividade própria
    for (const t of tasks) if (!t.srv && t.t.includes(' - ')) tails.set(nz(t.t.split(' - ').slice(1).join(' - ')), t.t);
    const withSrv = new Set(tasks.filter(t => t.srv).map(t => t.t));
    const keep = [], dup = [], seen = new Set(), ids = new Set();
    for (const t of tasks) {
      let why = '';
      if (t.srv && tails.has(nz(t.srv)) && tails.get(nz(t.srv)) !== t.t) why = 'repete a atividade "' + tails.get(nz(t.srv)) + '"';
      else if (!t.srv && withSrv.has(t.t)) why = 'resumo das linhas "' + t.t + '" com serviço';
      const key = [t.t, t.srv, t.l, t.i, t.f, t.bi, t.bf].join('|');
      if (!why && seen.has(key)) why = 'linha idêntica repetida';
      if (!why && t.id && ids.has(t.id)) why = 'ID repetido (' + t.id + ')';
      if (why) { dup.push(Object.assign({ motivo: why }, t)); continue; }
      seen.add(key); if (t.id) ids.add(t.id); keep.push(t);
    }
    return { tasks: keep, dupTasks: dup };
  };
  YM.dedupReport = function (rows) {
    const seen = new Set(), keep = [], dup = [];
    for (const x of rows) {
      const key = [x.ch, x.d, x.srv, x.eap, x.ins, x.forn, x.proc, x.parc, x.item, x.ap, x.pg].join('|');
      if (seen.has(key)) { dup.push(x); continue; }
      seen.add(key); keep.push(x);
    }
    return { rp: keep, dupRep: dup };
  };

  /* Monta o modelo a partir dos quatro arquivos lidos */
  YM.build = function (raw) {
    const fb = raw.fluxobase, oc = raw.orc || { comps: [] };
    const { rp, dupRep } = YM.dedupReport(raw.report || []);
    const { tasks: ctasks, dupTasks } = YM.dedupTasks((raw.crono || { tasks: [] }).tasks);
    const cr = Object.assign({}, raw.crono || {}, { tasks: ctasks });
    const nodes = {};
    for (const n of Object.values(fb.nodes)) if (n.lv === 'B' || n.lv === 'C')
      nodes[n.id] = { id: n.id, lv: n.lv, b: n.lv === 'C' ? n.b : n.id, uau: n.uau, code: n.code, desc: n.desc, orc: n.orc, prev: n.prev,
        mat: 0, mo: 0, ou: 0, orcComp: 0, comps: [], tasks: [], lanc: [], insumos: [] };
    // B: soma dos C
    for (const n of Object.values(nodes)) if (n.lv === 'C' && nodes[n.b]) {
      const B = nodes[n.b]; if (!B._k) { B._k = []; B.orc = 0; B.prev = {}; }
      B._k.push(n.id); B.orc += n.orc; for (const [m, v] of Object.entries(n.prev)) B.prev[m] = (B.prev[m] || 0) + v;
    }
    for (const i of fb.insumos) if (nodes[i.c]) nodes[i.c].insumos.push(i);
    // Orçamento → C via códigos ORÇ- da FLUXO-BASE
    const semOrc = [];
    for (const c of oc.comps) {
      const id = fb.orcLinks[c.it];
      if (!id || !nodes[id]) { semOrc.push(c); continue; }
      const n = nodes[id]; n.comps.push(c); n.mat += c.mat; n.mo += c.mo; n.ou += c.ou; n.orcComp += c.tot;
    }
    // Relatório → C pelo Item EAP (= ID UAU); senão pela etapa (B)
    const byUau = {}, byUauB = {}, byCode = {}, byIns = {};
    for (const n of Object.values(nodes)) {
      if (n.lv === 'C' && n.uau) byUau[n.uau] = n.id; if (n.lv === 'B' && n.uau) byUauB[n.uau] = n.id;
      if (n.lv === 'C' && n.code) byCode[n.code] = n.id;
    }
    for (const i of fb.insumos) if (i.cod && !(i.cod in byIns)) byIns[i.cod] = i.c;
    const semLanc = [];
    rp.forEach((x, k) => {
      const sc = (x.srv || '').split(' - ')[0].trim(), ic = (x.ins || '').split(' - ')[0].trim();
      // 1º código do serviço (C00xxx) · 2º Item EAP (ID UAU) · 3º código do insumo (P00xxx) · 4º etapa
      let id = byCode[sc] || (YM.SRV_RULES[sc] && nodes[YM.SRV_RULES[sc]] ? YM.SRV_RULES[sc] : null) || byUau[x.eap] || byIns[ic], via = id ? 'ok' : '';
      if (!id) {
        const b = byUauB[x.eap.split('.').slice(0, 3).join('.')];
        if (b) {
          id = b + '.X'; via = 'etapa';
          if (!nodes[id]) nodes[id] = { id, lv: 'C', b, uau: '', code: '', desc: 'Outros lançamentos — ' + nodes[b].desc, orc: 0, prev: {}, mat: 0, mo: 0, ou: 0, orcComp: 0, comps: [], tasks: [], lanc: [], insumos: [], extra: true };
        }
      }
      x.k = k; x.n = id || null; x.via = via;
      if (id) nodes[id].lanc.push(k); else semLanc.push(k);
    });
    // Cronograma → nó
    const semTask = [];
    cr.tasks.forEach((t, k) => { t.k = k; t.n = YM.taskNode(t.t); t.g = YM.discOf(t.pre); if (t.n && nodes[t.n]) nodes[t.n].tasks.push(k); else { t.n = null; semTask.push(k); } });
    // filhos de B (inclui extras)
    for (const n of Object.values(nodes)) if (n.lv === 'B') n.kids = Object.values(nodes).filter(c => c.lv === 'C' && c.b === n.id).map(c => c.id);
    const lots = YM.lotOrder(new Set(cr.tasks.map(t => t.l)));
    return { nodes, rp, tasks: cr.tasks, lots, comps: oc.comps, semOrc, semLanc, semTask, dupTasks, dupRep,
      meta: { cronoGerado: cr.gerado, orcRev: oc.rev, orcData: oc.data, months: fb.months } };
  };


  /* Serviços do orçamento sem tarefa no cronograma: usam as datas das tarefas do serviço mais parecido
     (o vínculo da tarefa com o serviço dela não muda — só as datas são emprestadas) */
  YM.NODE_TASKS = {
    '02.18.01': /^(VIS - Vistoria Final|Check List)/,              // Despesas pós-entrega → fim da obra
    '02.04.06': /^REV - Revest\. (Piso$|\+ Rejunte)/,              // Pisos em pedras naturais → revestimento de piso (áreas comuns)
    '02.04.08': /^REV - Revest\. Piso \+ Parede/,                   // Soleiras → revestimento piso + parede
    '02.07.02': /^ESQ - Esquadrias de Madeira/,                     // Ferragens → esquadrias de madeira
    '02.04.02': /Lastro/,                                           // Lastro de concreto → escavação + lastro (blocão e blocos)
    '02.14.01': /^FOR - Forro de Gesso/,                            // Forro de gesso área comum → forro de gesso
    '02.12.03': /^REV - (Revestimento (Muro|Pilares)|Revest\. Espelho)/, // Revestimentos em pedras naturais
    '02.15.03': /^PIN - Pintura Final/,                             // Pinturas em esquadrias → pintura final
    '02.12.02': /^REV - Revest\. Piso \+ Parede/,                   // Revestimento cerâmico de parede
    '02.16.03': /^INC - Sinalização/,                               // Sinalização / comunicação visual
    '02.16.02': /^LIM - Limpeza Final/,                             // Serviços complementares → limpeza final
    '02.13.03': /^ESQ - Esquadria de Alumínio$/,                    // Peitoris → esquadria de alumínio
    '02.09.05': /^PAI - /,                                          // Irrigação → paisagismo
    '02.04.07': /^REV - Rejunte \+ Proteção/                        // Rodapés → rejunte + proteção
  };
  YM.prazoObra = function (M) {
    if (M._prazo !== undefined) return M._prazo;
    const ds = M.tasks.flatMap(t => [t.i, t.f]).filter(Boolean).sort();
    M._prazo = ds.length ? { k: -1, id: 'PRAZO', t: 'Prazo da obra (serviço sem tarefa ligada)', pre: '', srv: '', l: 'Obra', i: ds[0], f: ds.at(-1), bi: ds[0], bf: ds.at(-1), ri: null, rf: null, n: null, g: 6 } : null;
    return M._prazo;
  };

  /* Todos os lançamentos / tarefas / composições de um nó (B agrega os C) */
  YM.scope = function (M, id) {
    const n = M.nodes[id]; const ids = n.lv === 'B' ? [id, ...n.kids] : [id];
    const lanc = [], tasks = [], comps = [], insumos = [];
    for (const i of ids) { const x = M.nodes[i]; x.lanc.forEach(k => lanc.push(M.rp[k])); x.tasks.forEach(k => tasks.push(M.tasks[k])); comps.push(...x.comps); insumos.push(...x.insumos); }
    // C sem tarefa própria: 1º tarefas da etapa (B) · 2º tarefas do serviço mais parecido (YM.NODE_TASKS) · 3º prazo da obra
    let herdadas = false, origem = tasks.length ? 'próprias' : '';
    if (n.lv === 'C' && !tasks.length && M.nodes[n.b]) { M.nodes[n.b].tasks.forEach(k => tasks.push(M.tasks[k])); herdadas = tasks.length > 0; if (herdadas) origem = 'etapa'; }
    if (n.lv === 'C' && !tasks.length && n.orc > 0) {
      const re = YM.NODE_TASKS[id];
      if (re) { M.tasks.forEach(t => { if (re.test(t.t)) tasks.push(t); }); if (tasks.length) { herdadas = true; origem = 'semelhante'; } }
      if (!tasks.length) { const P = YM.prazoObra(M); if (P) { tasks.push(P); herdadas = true; origem = 'prazo'; } }
    }
    return { n, ids, lanc, tasks, comps, insumos, herdadas, origem };
  };

  /* Orçado distribuído pelo cronograma (datas atuais), linear por dia, ponderado pela duração */
  YM.curvaCrono = function (valor, tasks, campo) {
    const ini = campo === 'bl' ? 'bi' : 'i', fim = campo === 'bl' ? 'bf' : 'f';
    const ts = tasks.filter(t => t[ini] && t[fim]);
    const tot = ts.reduce((a, t) => a + (D(t[fim]) - D(t[ini]) + 864e5), 0);
    const out = {}; if (!tot || !valor) return out;
    for (const t of ts) {
      const a = D(t[ini]), b = D(t[fim]) + 864e5, share = valor * (b - a) / tot;
      let cur = a;
      while (cur < b) {
        const d = new Date(cur); const nx = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
        const end = Math.min(nx, b); const k = mkey(cur);
        out[k] = (out[k] || 0) + share * (end - cur) / (b - a); cur = end;
      }
    }
    return out;
  };

  G.YM = YM;
})(typeof globalThis !== 'undefined' ? globalThis : window);
