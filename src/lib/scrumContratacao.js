/* ============================================================
   SCRUM · FLUXO DE CONTRATAÇÃO — regras puras (sem tela, sem banco).

   Implementa exatamente o briefing "scrum-contratacao-yacht": uma
   contratação nasce no Backlog e é puxada por 4 etapas, cujas
   janelas são contadas em dias ANTES do início do serviço na obra.
   A DATA só define a COR; quem muda o cartão de coluna é o
   checklist (todos os itens da etapa em ok/na).
   ============================================================ */

export const ETAPAS = [
  { n: 1, label: '1ª Etapa', ini: 120, fim: 91, itens: [
    ['i1', '1', 'Estudo de procedimento'], ['i2', '2', 'Lições aprendidas'], ['i3', '3', 'Estudo de projeto'],
    ['i4', '4', 'Requisitos de segurança'], ['i5', '5', 'Prospecção de fornecedores'], ['i6', '6', 'Equalização de propostas'],
  ] },
  { n: 2, label: '2ª Etapa', ini: 90, fim: 61, itens: [
    ['i7a', '7', 'Negociação serviço – Obra'], ['i7b', '7', 'Negociação material – Suprimentos'],
  ] },
  { n: 3, label: '3ª Etapa', ini: 60, fim: 31, itens: [
    ['i8', '8', 'Implantação de pedidos de materiais'], ['i9', '9', 'Aquisições de materiais'], ['i10', '10', 'Locação de equipamentos'],
  ] },
  { n: 4, label: '4ª Etapa', ini: 30, fim: 15, itens: [
    ['i11', '11', 'Contrato assinado'], ['i12', '12', 'Contrato no UAU'], ['i13', '13', 'Materiais na obra'],
    ['i14', '14', 'Equipamentos + ferramentas'], ['i15', '15', 'Documentação de fornecedores'],
  ] },
]

export const CHAVES_ITENS = ETAPAS.flatMap((e) => e.itens.map((i) => i[0]))

/* Atividades da aba Planilha1 de YAC-SCRUM-CONTROLE-R00.xlsx */
export const SEED = [
  ['REATERRO', '2027-02-09'], ['ESTRUTURA PERIFERIA', '2026-11-04'], ['REATERRO TOPO BLOCÃO', '2026-12-11'],
  ['DEMAIS BLOCOS (BL03 A BL05)', '2027-02-16'], ['VIGAS DE COROAMENTO', '2027-02-16'], ['FUNDAÇÃO DA CONTENÇÃO', '2026-12-22'],
  ['CONTENÇÃO', '2027-01-04'], ['IMPERMEAB. DA CONTENÇÃO', '2027-01-18'], ['DRENAGEM CONTENÇÃO', '2027-01-27'],
  ['ESTRUTURA TORRE', '2027-04-27'],
]

export const LABEL = { green: 'No prazo', yellow: 'Vence em até 2 dias', red: 'Vencido', backlog: 'Backlog', done: 'Liberado p/ obra' }

/* ── datas (dias inteiros, sem hora) ────────────────────────── */
export function dayNum(iso) {
  if (!iso) return NaN
  const p = iso.slice(0, 10).split('-')
  return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5
}
export function isoFromNum(n) { return new Date(n * 864e5).toISOString().slice(0, 10) }
export function hojeIso() {
  const d = new Date()
  const m = d.getMonth() + 1
  const dd = d.getDate()
  return `${d.getFullYear()}-${m < 10 ? '0' : ''}${m}-${dd < 10 ? '0' : ''}${dd}`
}
export function fmtData(iso) {
  if (!iso) return '—'
  const p = iso.slice(0, 10).split('-')
  return `${p[2]}/${p[1]}/${p[0]}`
}

/* ── regra de status ────────────────────────────────────────── */
export function itemFeito(a, k) {
  const v = a.itens && a.itens[k]
  return v === 'ok' || v === 'na'
}

export function calcular(a, hoje) {
  const d0 = dayNum(a.inicio)
  const toStart = d0 - hoje
  let atual = 5
  let started = false
  let doneCount = 0
  let total = 0
  ETAPAS.forEach((e) => e.itens.forEach((it) => {
    total += 1
    if (itemFeito(a, it[0])) { doneCount += 1; started = true }
  }))
  for (let i = 0; i < ETAPAS.length; i++) {
    if (!ETAPAS[i].itens.every((it) => itemFeito(a, it[0]))) { atual = ETAPAS[i].n; break }
  }
  const prevista = toStart > 120 ? 0 : toStart >= 91 ? 1 : toStart >= 61 ? 2 : toStart >= 31 ? 3 : toStart >= 15 ? 4 : 5
  const r = { toStart, atual, prevista, doneCount, total, started }
  if (atual === 5) {
    r.status = 'done'; r.prazo = null; r.dias = null
  } else {
    const et = ETAPAS[atual - 1]
    r.prazo = d0 - et.fim
    r.dias = r.prazo - hoje
    r.stage = et
    r.pend = et.itens.filter((it) => !itemFeito(a, it[0])).map((it) => it[2])
    if (prevista === 0 && !started) r.status = 'backlog'
    else r.status = r.dias < 0 ? 'red' : r.dias <= 2 ? 'yellow' : 'green'
  }
  r.previsto = prevista > 0 ? 1 : 0
  r.realizado = (r.previsto && atual >= prevista) ? 1 : 0
  r.critico = toStart < 15 && atual < 5
  return r
}

export function etapaTxt(n) { return n === 0 ? 'Backlog' : n === 5 ? '5ª' : `${n}ª` }

export function diasTxt(r) {
  if (r.status === 'done') return 'Todas as etapas concluídas'
  if (r.status === 'backlog') return `Entra no fluxo em ${r.toStart - 120} d`
  if (r.dias < 0) return `Venceu há ${-r.dias} d · ${fmtData(isoFromNum(r.prazo))}`
  if (r.dias === 0) return `Vence hoje · ${fmtData(isoFromNum(r.prazo))}`
  return `Faltam ${r.dias} d · ${fmtData(isoFromNum(r.prazo))}`
}

const ORDEM = { red: 0, yellow: 1, green: 2, backlog: 3, done: 4 }
/* vermelho, amarelo, verde — e dentro da cor, por dias restantes */
export function ordemUrgencia(a, b) {
  const o = ORDEM[a.r.status] - ORDEM[b.r.status]
  if (o) return o
  const da = a.r.dias == null ? 1e9 : a.r.dias
  const db = b.r.dias == null ? 1e9 : b.r.dias
  return (da - db) || (a.r.toStart - b.r.toStart)
}

export function calcularTodas(acts, hojeIsoStr) {
  const h = dayNum(hojeIsoStr)
  return acts.map((a) => ({ a, r: calcular(a, h) }))
}

export function resumo(lista) {
  const c = { green: 0, yellow: 0, red: 0, backlog: 0, done: 0 }
  let prev = 0
  let real = 0
  lista.forEach((x) => { c[x.r.status] += 1; prev += x.r.previsto; real += x.r.realizado })
  return { ...c, previsto: prev, realizado: real, alcance: prev ? Math.round((real / prev) * 100) : 0 }
}

/* ── importar planilha ──────────────────────────────────────── */
export function norm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase()
}

/* Date, serial do Excel (serial − 25569 = dias desde 1970) ou dd/mm/aaaa */
export function paraIso(d) {
  if (d instanceof Date) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (typeof d === 'number' && d > 20000 && d < 80000) return isoFromNum(Math.round(d) - 25569)
  if (typeof d === 'string') {
    const t = d.trim()
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) { const p = t.split('/'); return `${p[2]}-${p[1]}-${p[0]}` }
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  }
  return null
}

/* procura cabeçalho ATIVIDADE/CONTRATAÇÃO + INICIO/DATA INICIO e devolve [[nome, iso], ...] */
export function lerLinhas(rows) {
  for (let i = 0; i < rows.length; i++) {
    const row = (rows[i] || []).map(norm)
    let ca = row.indexOf('ATIVIDADE')
    const ci = row.findIndex((v) => v === 'INICIO' || v === 'DATA INICIO')
    if (ca < 0) ca = row.indexOf('CONTRATACAO')
    if (ca >= 0 && ci >= 0) {
      const out = []
      for (let j = i + 1; j < rows.length; j++) {
        const r = rows[j] || []
        const n = r[ca]
        if (n == null || String(n).trim() === '') continue
        const iso = paraIso(r[ci])
        if (iso) out.push([String(n).trim(), iso])
      }
      if (out.length) return out
    }
  }
  return []
}

/* Todas as abas com lista de atividades; abas idênticas viram uma opção só;
   a de datas mais recentes vem primeiro (é a sugerida). */
export function candidatasDeAbas(abas) { /* abas: [{ nome, rows }] */
  const cands = []
  const vistas = {}
  abas.forEach((sh) => {
    const list = lerLinhas(sh.rows)
    if (!list.length) return
    const sig = JSON.stringify(list)
    if (vistas[sig]) { vistas[sig].nomes.push(sh.nome); return }
    const ds = list.map((x) => x[1]).sort()
    const cand = { nomes: [sh.nome], list, min: ds[0], max: ds[ds.length - 1] }
    vistas[sig] = cand
    cands.push(cand)
  })
  cands.sort((a, b) => (a.max < b.max ? 1 : a.max > b.max ? -1 : 0))
  return cands
}

/* ── agenda .ics (um evento de dia inteiro por etapa não concluída,
      alarme 2 dias antes, itens pendentes na descrição) ──────── */
export function gerarICS(acts, obra) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gellen e Guimaraes//Scrum Contratacao//PT', 'CALSCALE:GREGORIAN']
  const stamp = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`
  let n = 0
  const d = (x) => isoFromNum(x).replace(/-/g, '')
  const esc = (s) => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')
  acts.forEach((a) => {
    const d0 = dayNum(a.inicio)
    ETAPAS.forEach((e) => {
      if (e.itens.every((it) => itemFeito(a, it[0]))) return
      const pz = d0 - e.fim
      const pend = e.itens.filter((it) => !itemFeito(a, it[0])).map((it) => `${it[1]} ${it[2]}`)
      n += 1
      L.push(
        'BEGIN:VEVENT', `UID:${a.id}-${e.n}@scrum-contratacao`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${d(pz)}`, `DTEND;VALUE=DATE:${d(pz + 1)}`,
        `SUMMARY:${esc(`Prazo ${e.label} · ${a.nome}`)}`,
        `DESCRIPTION:${esc(`Início na obra: ${fmtData(a.inicio)}\nPendente: ${pend.join('; ')}`)}`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`Faltam 2 dias: ${e.label} · ${a.nome}`)}`, 'TRIGGER:-P2D', 'END:VALARM',
        'END:VEVENT',
      )
    })
  })
  L.push('END:VCALENDAR')
  return { conteudo: L.join('\r\n'), eventos: n, nomeArquivo: `prazos-scrum-${(obra || 'obra').toLowerCase()}.ics` }
}
