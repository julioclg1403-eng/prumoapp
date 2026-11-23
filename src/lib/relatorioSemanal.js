/* ============================================================
   RELATÓRIO SEMANAL DE OBRA — layout vindo do ObraZap, com a
   marca do Prumo. Função pura: recebe os dados já carregados e
   devolve um documento HTML completo (A4), que a tela mostra num
   iframe e imprime/salva em PDF pelo navegador.
   Nada aqui lê o banco; quem chama decide qual obra e período.
   ============================================================ */

import { deISO, formatarData, nomeDiaSemana, hojeISO } from './dominio'

const ROTULO_STATUS = { nao_iniciada: 'não iniciada', em_andamento: 'em andamento', concluida: 'concluída' }
const ROTULO_PRIORIDADE = { baixa: 'Baixa', media: 'Média', alta: 'Alta' }

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const num = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 })

export function montarRelatorioSemanal({
  obra, org, de, ate, diarios, planejamento, servicos, locais, empresas,
  tiposOcorrencia, pendencias, responsavel,
}) {
  const nomeDe = (lista, id, padrao = '—') => lista.find((x) => x.id === id)?.nome || padrao
  const plan = (id) => planejamento.find((p) => p.id === id)

  const dias = diarios
    .filter((d) => d.worksite_id === obra.id && d.data >= de && d.data <= ate)
    .sort((a, b) => (a.data < b.data ? -1 : 1))

  const presentes = (d) => (d.presencas || []).filter((p) => p.presente).length
  const efetivoMedio = dias.length ? dias.reduce((s, d) => s + presentes(d), 0) / dias.length : 0
  const concluidas = dias.reduce((s, d) => s + (d.atividades || []).filter((a) => a.status === 'concluida').length, 0)
  const ocorrencias = dias.reduce((s, d) => s + (d.ocorrencias || []).length, 0)
  const fotos = dias.reduce((s, d) => s + (d.fotos || []).length, 0)

  const hoje = hojeISO()
  const abertas = pendencias
    .filter((p) => p.worksite_id === obra.id && p.status !== 'resolvida')
    .sort((a, b) => ((a.prazo || '9999') < (b.prazo || '9999') ? -1 : 1))

  /* gráfico de barras do efetivo por dia */
  const W = 360, H = 120, base = 98
  const maxEf = Math.max(1, ...dias.map(presentes))
  const passo = dias.length ? (W - 20) / dias.length : 0
  const larg = Math.min(34, passo * 0.6)
  const barras = dias.map((d, i) => {
    const v = presentes(d)
    const h = Math.round((v / maxEf) * 70)
    const x = 10 + i * passo + (passo - larg) / 2
    const cx = x + larg / 2
    const dia = deISO(d.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    return `<rect x="${x.toFixed(1)}" y="${base - h}" width="${larg.toFixed(1)}" height="${h}" rx="3" fill="#EA6E1F"/>`
      + `<text x="${cx.toFixed(1)}" y="${base - h - 4}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#18181B">${v}</text>`
      + `<text x="${cx.toFixed(1)}" y="110" text-anchor="middle" font-size="8.5" fill="#71717A">${dia}</text>`
  }).join('')

  const blocosDia = dias.map((d) => {
    const linhas = []
    for (const a of d.atividades || []) {
      const p = plan(a.planned_id)
      const serv = p ? nomeDe(servicos, p.service_id, 'Atividade') : 'Atividade'
      const local = p ? nomeDe(locais, p.location_id, '') : ''
      const emp = p?.company_id ? nomeDe(empresas, p.company_id, '') : ''
      const pessoas = (a.worker_ids || []).length
      linhas.push(`• ${esc(serv)}${local ? ` (${esc(local)})` : ''}${emp ? ` — ${esc(emp)}` : ''} — ${ROTULO_STATUS[a.status] || esc(a.status)}${pessoas ? ` · ${pessoas} pessoa${pessoas > 1 ? 's' : ''}` : ''}`)
      if (a.observacao) linhas.push(`&nbsp;&nbsp;<span class="mut">${esc(a.observacao)}</span>`)
    }
    for (const o of d.ocorrencias || []) {
      linhas.push(`⚠ Ocorrência: ${esc(nomeDe(tiposOcorrencia, o.tipo_id, 'outra').toLowerCase())}${o.descricao ? ` · ${esc(o.descricao)}` : ''}`)
    }
    const n = presentes(d)
    if (n) linhas.push(`Efetivo: ${n} pessoa${n > 1 ? 's' : ''}`)
    if (d.observacao) linhas.push(`Obs.: ${esc(d.observacao)}`)
    if (d.status === 'rascunho') linhas.push('(diário ainda aberto)')
    const dt = formatarData(d.data)
    return `<div class="dia"><div class="data"><b>${dt}</b><span>${esc(nomeDiaSemana(d.data))}</span><span>${esc(d.clima || '')}</span></div>`
      + `<div class="corpo"><div class="txt">${linhas.join('<br>') || '—'}</div>${(d.fotos || []).length ? `<div class="mut">+ ${(d.fotos || []).length} foto(s) no app</div>` : ''}</div></div>`
  }).join('')

  const linhasPend = abertas.map((p) => {
    const atrasada = p.prazo && p.prazo < hoje
    return `<tr><td>${esc(p.titulo)}</td><td class="c">${p.prazo ? formatarData(p.prazo) : '—'}</td><td class="c">${esc(ROTULO_PRIORIDADE[p.prioridade] || p.prioridade || '—')}</td><td class="c">${atrasada ? '<b style="color:#B91C1C">Atrasada</b>' : 'No prazo'}</td></tr>`
  }).join('')

  const periodo = `${formatarData(de)} a ${formatarData(ate)}`

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatorio_${esc(obra.nome)}_${de}_a_${ate}</title>
<style>@page{size:A4;margin:12mm}*{box-sizing:border-box}html{background:#fff;color-scheme:only light}body{background:#fff;font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#27272A;font-size:12px;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.topo{background:#18181B;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;border-radius:8px}
.topo .marca{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#F59A5E;font-weight:700}.topo h1{margin:2px 0 0;font-size:21px;letter-spacing:.01em}
.selo{border-radius:20px;padding:4px 12px;font-weight:700;font-size:11px;background:#EA6E1F;color:#fff}
.info{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px}.info div{border:1px solid #D4D4D8;border-radius:6px;padding:5px 9px}.info small{display:block;color:#71717A;font-size:8.5px;text-transform:uppercase;letter-spacing:.06em}.info b{font-size:11.5px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}.kpi{border-radius:8px;padding:8px 11px;background:#F4F4F5;border-left:4px solid #EA6E1F}.kpi small{display:block;color:#71717A;font-size:8.5px;text-transform:uppercase;letter-spacing:.06em}.kpi b{font-size:15px;color:#18181B}
.kpi.forte{background:#18181B;border-left-color:#F59A5E}.kpi.forte small{color:#F59A5E}.kpi.forte b{color:#fff}
.graf{border:1px solid #D4D4D8;border-radius:8px;padding:8px 10px;margin-top:12px;page-break-inside:avoid}.graf h3{margin:0 0 4px;font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#71717A}
h2{font-size:13px;color:#18181B;margin:16px 0 8px;padding-bottom:4px;border-bottom:2px solid #EA6E1F;text-transform:uppercase;letter-spacing:.06em}
.dia{display:flex;gap:12px;margin:0 0 10px;page-break-inside:avoid}.data{flex:0 0 96px;background:#FFF1E6;border-radius:8px;padding:8px;text-align:center;align-self:flex-start}.data b{display:block;color:#18181B;font-size:13px}.data span{display:block;color:#52525B;font-size:9.5px;margin-top:2px}
.corpo{flex:1;border-left:3px solid #EA6E1F;padding-left:12px}.txt{line-height:1.55}.mut{color:#71717A;font-size:10px;margin-top:3px}
table{width:100%;border-collapse:collapse}th{background:#18181B;color:#fff;font-size:9.5px;padding:6px;text-align:center;border:1px solid #18181B}th:first-child{text-align:left}
td{border:1px solid #D4D4D8;padding:5px 6px;vertical-align:top}tbody tr:nth-child(even) td{background:#FAFAFA}.c{text-align:center}
.ass{display:grid;grid-template-columns:1fr 1fr;gap:70px;margin-top:44px;page-break-inside:avoid}.ass div{border-top:2px solid #18181B;padding-top:5px;text-align:center}.ass b{color:#18181B;font-size:12px}.ass span{display:block;color:#71717A;font-size:9.5px;margin-top:9px}
.rodape{margin-top:16px;padding-top:6px;border-top:1px solid #D4D4D8;color:#71717A;font-size:8.5px;display:flex;justify-content:space-between}</style></head><body>
<div class="topo"><div><div class="marca">Prumo App · gestão de obra</div><h1>Relatório semanal de obra</h1></div><div class="selo">${periodo}</div></div>
<div class="info"><div><small>Obra</small><b>${esc(obra.nome)}</b></div><div><small>Endereço</small><b>${esc(obra.endereco || '—')}</b></div><div><small>Responsável</small><b>${esc(responsavel || org?.nome || '—')}</b></div></div>
<div class="kpis"><div class="kpi forte"><small>Dias com diário</small><b>${dias.length}</b></div><div class="kpi"><small>Efetivo médio / dia</small><b>${num(efetivoMedio)}</b></div><div class="kpi"><small>Atividades concluídas</small><b>${concluidas}</b></div><div class="kpi"><small>Ocorrências</small><b>${ocorrencias}</b></div></div>
${dias.length ? `<div class="graf"><h3>Efetivo presente por dia</h3><svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:460px"><line x1="10" y1="${base}" x2="${W - 10}" y2="${base}" stroke="#D4D4D8"/>${barras}</svg></div>` : ''}
<h2>Diário de obra</h2>
${blocosDia || '<div class="mut">Sem diário lançado no período.</div>'}
<h2>Pendências em aberto</h2>
${abertas.length ? `<table><thead><tr><th>Pendência</th><th>Prazo</th><th>Prioridade</th><th>Situação</th></tr></thead><tbody>${linhasPend}</tbody></table>` : '<div class="mut">Nenhuma pendência em aberto.</div>'}
<div class="ass"><div><b>Engenheiro responsável</b><span>${esc(responsavel || '')}: ____________________________</span></div><div><b>Recebido por (cliente ou terceiro)</b><span>Nome: ____________________________</span></div></div>
<div class="rodape"><span>Gerado pelo Prumo App. Os registros foram lançados pela equipe no diário de obra.${fotos ? '' : ''}</span><span>${esc(obra.nome)}</span></div>
</body></html>`
}
