/* ============================================================
   SCRUM · FLUXO DE CONTRATAÇÃO — aba dentro de Pendências.

   Segue o briefing "scrum-contratacao-yacht" ao pé da letra: quadro
   Kanban por etapa, prazo calculado a partir do início do serviço
   na obra, cor verde/amarelo/vermelho, Lembretes, Atividades,
   "Como funciona", painel lateral com o checklist, importar planilha,
   agenda .ics, avisos e backup.

   Os dados ficam no banco (scrum_contratacoes / scrum_contratacao_itens),
   com quem marcou cada item e quando. Carrega só quando a aba abre —
   se as tabelas ainda não existirem, só esta aba avisa, o resto do
   app continua normal.
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useDados } from '../lib/DadosContext'
import { Confirmar } from '../components'
import { carregarXLSX, lerWorkbook } from '../lib/xlsxCodepage'
import {
  ETAPAS, SEED, LABEL, CHAVES_ITENS, dayNum, isoFromNum, hojeIso, fmtData,
  calcular, calcularTodas, resumo, etapaTxt, diasTxt, ordemUrgencia, itemFeito,
  norm, candidatasDeAbas, gerarICS,
} from '../lib/scrumContratacao'
import './pendencias-scrum.css'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function baixar(nome, conteudo, tipo) {
  const blob = new Blob([conteudo], { type: tipo })
  const u = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = u; a.download = nome
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(u), 1000)
}

function Estado({ r }) {
  return <span className={`sc-st ${r.status}`}><i className={`sc-dot ${r.status}`} />{LABEL[r.status]}</span>
}

export default function PendenciasScrum({ perfil }) {
  const dados = useDados()
  const obraId = dados.obra.id
  const obraNome = dados.obra.nome
  const podeEditar = perfil.role !== 'campo'

  const [acts, setActs] = useState(null) // null = carregando
  const [erro, setErro] = useState('')
  const [tabelaFaltando, setTabelaFaltando] = useState(false)
  const [statusData, setStatusData] = useState(() => { try { return localStorage.getItem(`scrum-status-${obraId}`) || null } catch { return null } })
  const [aba, setAba] = useState(() => { try { return localStorage.getItem('scrum-aba') || 'board' } catch { return 'board' } })
  const [filtro, setFiltro] = useState(null)
  const [busca, setBusca] = useState('')
  const [abertoId, setAbertoId] = useState(null)
  const [toast, setToast] = useState(null)
  const [menuBackup, setMenuBackup] = useState(false)
  const [escolhaAba, setEscolhaAba] = useState(null) // candidatas de importação
  const [confirmar, setConfirmar] = useState(null)
  const [agora, setAgora] = useState(0)
  const [salvoEm, setSalvoEm] = useState('')
  const arqXls = useRef(null)
  const arqJson = useRef(null)
  const toastT = useRef(null)
  const seedTentado = useRef('')

  const statusIso = statusData || hojeIso()

  const avisar = useCallback((msg, desfazer) => {
    setToast({ msg, desfazer })
    clearTimeout(toastT.current)
    toastT.current = setTimeout(() => setToast(null), 5000)
  }, [])

  const marcarSalvo = () => setSalvoEm(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))

  /* ── carregar ───────────────────────────────────────────── */
  const carregar = useCallback(async () => {
    const cs = await supabase.from('scrum_contratacoes').select('*').eq('worksite_id', obraId).order('inicio')
    if (cs.error) {
      const sumiu = cs.error.code === 'PGRST205' || /scrum_contratacoes/.test(cs.error.message || '')
      setTabelaFaltando(sumiu)
      setErro(sumiu ? '' : `Não consegui carregar o Scrum. ${cs.error.message}`)
      setActs([])
      return
    }
    setTabelaFaltando(false)
    setErro('')
    const ids = (cs.data || []).map((c) => c.id)
    let itens = []
    if (ids.length) {
      const it = await supabase.from('scrum_contratacao_itens').select('contratacao_id, chave, estado').in('contratacao_id', ids)
      if (it.error) { setErro(`Não consegui carregar os itens. ${it.error.message}`); setActs([]); return }
      itens = it.data || []
    }
    const porAct = new Map()
    for (const i of itens) {
      if (!porAct.has(i.contratacao_id)) porAct.set(i.contratacao_id, {})
      porAct.get(i.contratacao_id)[i.chave] = i.estado
    }
    setActs((cs.data || []).map((c) => ({
      id: c.id, nome: c.nome, inicio: c.inicio, resp: c.responsavel || '', obs: c.observacoes || '', itens: porAct.get(c.id) || {},
    })))
  }, [obraId])

  useEffect(() => { setActs(null); carregar() }, [carregar])

  /* Dados iniciais (aba Planilha1) — só na obra YACHT e só se ainda estiver vazia */
  useEffect(() => {
    if (acts === null || acts.length > 0 || tabelaFaltando || !podeEditar) return
    if (!/yacht/i.test(obraNome) || seedTentado.current === obraId) return
    seedTentado.current = obraId
    ;(async () => {
      const r = await supabase.from('scrum_contratacoes').insert(
        SEED.map(([nome, inicio]) => ({ organization_id: perfil.organization_id, worksite_id: obraId, nome, inicio, criado_por: perfil.id })),
      )
      if (r.error) { setErro(`Não consegui carregar as atividades iniciais. ${r.error.message}`); return }
      carregar()
    })()
  }, [acts, tabelaFaltando, podeEditar, obraNome, obraId, perfil.organization_id, perfil.id, carregar])

  /* ── operações ──────────────────────────────────────────── */
  const falhou = (r, oQue) => {
    if (r.error) { setErro(`Não consegui ${oQue}. ${r.error.message}`); return true }
    setErro('')
    return false
  }

  const criar = async () => {
    const inicio = isoFromNum(dayNum(statusIso) + 120)
    const r = await supabase.from('scrum_contratacoes')
      .insert({ organization_id: perfil.organization_id, worksite_id: obraId, nome: 'Nova contratação', inicio, criado_por: perfil.id })
      .select('*').single()
    if (falhou(r, 'criar a atividade')) return
    const nova = { id: r.data.id, nome: r.data.nome, inicio: r.data.inicio, resp: '', obs: '', itens: {} }
    setActs((a) => [...a, nova])
    marcarSalvo()
    setAbertoId(nova.id)
  }

  const atualizarCampos = async (id, patch) => {
    setActs((a) => a.map((x) => (x.id === id ? { ...x, ...patch } : x)))
    const banco = {}
    if ('nome' in patch) banco.nome = patch.nome
    if ('inicio' in patch) banco.inicio = patch.inicio
    if ('resp' in patch) banco.responsavel = patch.resp || null
    if ('obs' in patch) banco.observacoes = patch.obs || null
    const r = await supabase.from('scrum_contratacoes').update(banco).eq('id', id)
    if (!falhou(r, 'salvar a atividade')) marcarSalvo()
  }

  const marcarItem = async (id, chave, estado) => {
    const antes = acts.find((x) => x.id === id)?.itens[chave]
    setActs((a) => a.map((x) => {
      if (x.id !== id) return x
      const itens = { ...x.itens }
      if (estado) itens[chave] = estado; else delete itens[chave]
      return { ...x, itens }
    }))
    const r = estado
      ? await supabase.from('scrum_contratacao_itens').upsert({
        contratacao_id: id, chave, estado, organization_id: perfil.organization_id,
        atualizado_por: perfil.id, atualizado_em: new Date().toISOString(),
      })
      : await supabase.from('scrum_contratacao_itens').delete().eq('contratacao_id', id).eq('chave', chave)
    if (falhou(r, 'marcar o item')) {
      setActs((a) => a.map((x) => {
        if (x.id !== id) return x
        const itens = { ...x.itens }
        if (antes) itens[chave] = antes; else delete itens[chave]
        return { ...x, itens }
      }))
      return
    }
    marcarSalvo()
  }

  /* Apaga tudo da obra e grava a lista dada (usado por restaurar backup,
     recarregar dados da planilha e pelo "Desfazer" dos dois). */
  const substituirTudo = async (lista) => {
    const del = await supabase.from('scrum_contratacoes').delete().eq('worksite_id', obraId)
    if (falhou(del, 'limpar as atividades atuais')) return false
    if (lista.length) {
      const linhas = lista.map((x) => ({
        ...(UUID.test(x.id || '') ? { id: x.id } : {}),
        organization_id: perfil.organization_id, worksite_id: obraId,
        nome: x.nome, inicio: x.inicio, responsavel: x.resp || null, observacoes: x.obs || null, criado_por: perfil.id,
      }))
      const ins = await supabase.from('scrum_contratacoes').insert(linhas).select('id, nome, inicio')
      if (falhou(ins, 'gravar as atividades')) return false
      const itens = []
      ins.data.forEach((row, i) => {
        Object.entries(lista[i].itens || {}).forEach(([chave, estado]) => {
          if (CHAVES_ITENS.includes(chave) && (estado === 'ok' || estado === 'na')) {
            itens.push({ contratacao_id: row.id, chave, estado, organization_id: perfil.organization_id, atualizado_por: perfil.id })
          }
        })
      })
      if (itens.length) {
        const it = await supabase.from('scrum_contratacao_itens').insert(itens)
        if (falhou(it, 'gravar os itens')) return false
      }
    }
    await carregar()
    marcarSalvo()
    return true
  }

  const excluir = async (id) => {
    const snap = acts.find((x) => x.id === id)
    if (!snap) return
    const r = await supabase.from('scrum_contratacoes').delete().eq('id', id)
    if (falhou(r, 'excluir a atividade')) return
    setActs((a) => a.filter((x) => x.id !== id))
    setAbertoId(null)
    marcarSalvo()
    avisar(`"${snap.nome}" excluída`, async () => {
      const ok = await supabase.from('scrum_contratacoes').insert({
        id: snap.id, organization_id: perfil.organization_id, worksite_id: obraId, nome: snap.nome, inicio: snap.inicio,
        responsavel: snap.resp || null, observacoes: snap.obs || null, criado_por: perfil.id,
      })
      if (ok.error) { setErro(`Não consegui desfazer. ${ok.error.message}`); return }
      const itens = Object.entries(snap.itens).map(([chave, estado]) => ({
        contratacao_id: snap.id, chave, estado, organization_id: perfil.organization_id, atualizado_por: perfil.id,
      }))
      if (itens.length) await supabase.from('scrum_contratacao_itens').insert(itens)
      carregar()
    })
  }

  /* ── importar planilha ──────────────────────────────────── */
  const aplicarImportacao = async (found) => {
    let add = 0
    let upd = 0
    const novos = []
    for (const [nome, inicio] of found) {
      const ex = acts.find((a) => norm(a.nome) === norm(nome))
      if (ex) {
        if (ex.inicio !== inicio) {
          const r = await supabase.from('scrum_contratacoes').update({ inicio }).eq('id', ex.id)
          if (falhou(r, 'atualizar a data')) return
          upd += 1
        }
      } else if (!novos.some(([n]) => norm(n) === norm(nome))) {
        novos.push([nome, inicio]); add += 1
      }
    }
    if (novos.length) {
      const r = await supabase.from('scrum_contratacoes').insert(
        novos.map(([nome, inicio]) => ({ organization_id: perfil.organization_id, worksite_id: obraId, nome, inicio, criado_por: perfil.id })),
      )
      if (falhou(r, 'importar as atividades')) return
    }
    await carregar()
    marcarSalvo()
    avisar(`${add} nova(s), ${upd} data(s) atualizada(s). Progresso mantido.`)
  }

  const lerPlanilha = async (arquivo) => {
    try {
      const XLSX = await carregarXLSX()
      const wb = await lerWorkbook(arquivo, { cellDates: true })
      const cands = candidatasDeAbas(wb.SheetNames.map((sn) => ({
        nome: sn.trim(), rows: XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true }),
      })))
      if (!cands.length) { avisar('Não achei colunas ATIVIDADE e INICIO com datas'); return }
      if (cands.length === 1) aplicarImportacao(cands[0].list)
      else setEscolhaAba(cands)
    } catch {
      avisar('Erro ao ler a planilha')
    }
  }

  /* ── backup ─────────────────────────────────────────────── */
  const exportarBackup = () => {
    const dadosBackup = { obra: obraNome, statusDate: statusData, acts }
    baixar(`scrum-contratacao-${obraNome.toLowerCase().replace(/\s+/g, '-')}-${statusIso}.json`, JSON.stringify(dadosBackup, null, 2), 'application/json')
  }
  const restaurarBackup = (arquivo) => {
    const rd = new FileReader()
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result)
        if (!d.acts || !Array.isArray(d.acts)) throw new Error('inválido')
        setConfirmar({
          titulo: 'Restaurar este backup?',
          texto: `As ${acts.length} atividade(s) atuais serão substituídas pelas ${d.acts.length} do arquivo (com o progresso dos itens).`,
          rotuloOk: 'Restaurar', perigo: true,
          onOk: async () => {
            setConfirmar(null)
            const antes = acts
            if (await substituirTudo(d.acts)) avisar('Backup restaurado', () => substituirTudo(antes))
          },
        })
      } catch { avisar('Arquivo de backup inválido') }
    }
    rd.readAsText(arquivo)
  }
  const recarregarSeed = () => setConfirmar({
    titulo: 'Recarregar dados da planilha?',
    texto: 'Volta para as 10 atividades originais, sem nenhum item marcado. O que existe agora é substituído (dá pra desfazer logo em seguida).',
    rotuloOk: 'Recarregar', perigo: true,
    onOk: async () => {
      setConfirmar(null)
      const antes = acts
      const ok = await substituirTudo(SEED.map(([nome, inicio]) => ({ nome, inicio, resp: '', obs: '', itens: {} })))
      if (ok) avisar('Dados originais recarregados', () => substituirTudo(antes))
    },
  })

  /* ── avisos do navegador (no máximo 1x por dia) ─────────── */
  const notifSuportado = typeof Notification !== 'undefined'
  const [permissao, setPermissao] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'denied'))
  const avisarNavegador = useCallback((forcar) => {
    if (!notifSuportado || Notification.permission !== 'granted' || !acts) return
    const chave = `scrum-avisado-${obraId}`
    const t = hojeIso()
    try { if (!forcar && localStorage.getItem(chave) === t) return } catch { /* sem storage */ }
    const lista = calcularTodas(acts, t)
    const verm = lista.filter((x) => x.r.status === 'red').map((x) => x.a.nome)
    const amar = lista.filter((x) => x.r.status === 'yellow').map((x) => x.a.nome)
    if (!verm.length && !amar.length) return
    try {
      // eslint-disable-next-line no-new
      new Notification(`Scrum de contratação · ${obraNome}`, {
        body: (verm.length ? `${verm.length} vencida(s): ${verm.slice(0, 3).join(', ')}${verm.length > 3 ? '…' : ''}\n` : '')
          + (amar.length ? `${amar.length} vencendo em até 2 dias: ${amar.slice(0, 3).join(', ')}` : ''),
      })
      localStorage.setItem(chave, t)
    } catch { /* navegador recusou */ }
  }, [acts, notifSuportado, obraId, obraNome])
  useEffect(() => { avisarNavegador(false) }, [avisarNavegador])
  const ativarAvisos = () => {
    if (!notifSuportado) return
    if (Notification.permission === 'granted') { avisarNavegador(true); return }
    Notification.requestPermission().then((p) => { setPermissao(p); avisarNavegador(true) })
  }

  /* recalcula de hora em hora (o status depende do dia) */
  useEffect(() => {
    const id = setInterval(() => setAgora((n) => n + 1), 3600 * 1000)
    return () => clearInterval(id)
  }, [])

  /* ── derivados ──────────────────────────────────────────── */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lista = useMemo(() => (acts ? calcularTodas(acts, statusIso) : []), [acts, statusIso, agora])
  const res = useMemo(() => resumo(lista), [lista])
  const visiveis = useMemo(() => lista.filter((x) => {
    if (filtro && x.r.status !== filtro) return false
    if (busca && !x.a.nome.toLowerCase().includes(busca.trim().toLowerCase())) return false
    return true
  }), [lista, filtro, busca])

  const trocarAba = (a) => { setAba(a); try { localStorage.setItem('scrum-aba', a) } catch { /* sem storage */ } }
  const trocarStatus = (v) => {
    const novo = v && v !== hojeIso() ? v : null
    setStatusData(novo)
    try { if (novo) localStorage.setItem(`scrum-status-${obraId}`, novo); else localStorage.removeItem(`scrum-status-${obraId}`) } catch { /* sem storage */ }
  }

  if (tabelaFaltando) {
    return (
      <div className="scrum">
        <div className="alert danger stack-1">
          <div className="t-strong">As tabelas do Scrum ainda não foram criadas no banco</div>
          <div className="t-caption">
            O código desta aba já está no app, falta aplicar a migração <code>20261021120000_scrum_contratacao.sql</code> no Supabase.
            Assim que ela rodar, a aba carrega sozinha.
          </div>
        </div>
      </div>
    )
  }
  if (acts === null) return <div className="scrum"><div className="sc-empty">Carregando o Scrum…</div></div>

  const aberta = acts.find((x) => x.id === abertoId) || null

  return (
    <div className="scrum">
      <header className="sc-top">
        <div>
          <div className="sc-brand">Gellen &amp; Guimarães · Planejamento</div>
          <h2>Scrum · Fluxo de Contratação — {obraNome}</h2>
        </div>
        <div className="sc-spacer" />
        <div className="sc-statusdate">
          <label htmlFor="sc-status">Data de status</label>
          <input id="sc-status" type="date" value={statusIso} onChange={(e) => trocarStatus(e.target.value)} />
          <button type="button" onClick={() => trocarStatus(null)}>Hoje</button>
        </div>
      </header>

      {erro && <div className="alert danger" style={{ marginTop: 10 }}>{erro}</div>}

      <div className="sc-kpis">
        {[
          ['all', 'Contratações', lista.length, 'no controle', null],
          ['green', 'No prazo', res.green, 'mais de 2 dias', 'green'],
          ['yellow', 'Atenção', res.yellow, 'vence em até 2 dias', 'yellow'],
          ['red', 'Vencidas', res.red, 'prazo da etapa passou', 'red'],
          ['backlog', 'Backlog', res.backlog, 'mais de 120 dias', 'backlog'],
          ['done', 'Liberadas', res.done, '4 etapas concluídas', 'done'],
        ].map(([f, rotulo, val, sub, cor]) => (
          <button
            key={f} type="button" className="sc-kpi"
            aria-pressed={filtro === f || (f === 'all' && !filtro)}
            onClick={() => setFiltro(f === 'all' || filtro === f ? null : f)}
          >
            <div className="lbl">{cor && <i className={`sc-dot ${cor}`} />}{rotulo}</div>
            <div className="val">{val}</div>
            <div className="sub">{sub}</div>
          </button>
        ))}
        <div className="sc-kpi fixo">
          <div className="lbl">Alcance do sprint</div>
          <div className="val">{res.alcance}%</div>
          <div className="sub">{res.realizado} realizado de {res.previsto} previsto · meta 80%</div>
          <div className="sc-meter"><i style={{ width: `${res.alcance}%` }} /></div>
        </div>
      </div>

      <nav className="sc-tabs" role="tablist">
        {[['board', 'Quadro'], ['rem', 'Lembretes'], ['list', 'Atividades'], ['guide', 'Como funciona'], ['sheet', 'Planilha']].map(([k, rotulo]) => (
          <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => trocarAba(k)}>{rotulo}</button>
        ))}
      </nav>

      <div className="sc-toolbar">
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar atividade…" />
        {podeEditar && <button type="button" className="sc-btn primary" onClick={criar}>+ Nova atividade</button>}
        {podeEditar && (
          <button type="button" className="sc-btn" title="Lê a aba com colunas ATIVIDADE e INICIO" onClick={() => arqXls.current?.click()}>
            Importar planilha
          </button>
        )}
        <button
          type="button" className="sc-btn" title="Prazos de cada etapa com alarme 2 dias antes"
          onClick={() => { const g = gerarICS(acts, obraNome); baixar(g.nomeArquivo, g.conteudo, 'text/calendar'); avisar(`${g.eventos} prazos exportados para a agenda`) }}
        >
          Exportar agenda (.ics)
        </button>
        {notifSuportado && (
          <button type="button" className="sc-btn" disabled={permissao === 'denied'} onClick={ativarAvisos}>
            {permissao === 'granted' ? 'Avisos ativos' : 'Ativar avisos'}
          </button>
        )}
        <button type="button" className="sc-btn" aria-haspopup="true" onClick={() => setMenuBackup((v) => !v)}>Backup</button>
        {menuBackup && (
          <div className="sc-menu" onMouseLeave={() => setMenuBackup(false)}>
            <button type="button" className="sc-btn small" onClick={() => { setMenuBackup(false); exportarBackup() }}>Exportar backup (.json)</button>
            {podeEditar && <button type="button" className="sc-btn small" onClick={() => { setMenuBackup(false); arqJson.current?.click() }}>Restaurar backup</button>}
            {podeEditar && <button type="button" className="sc-btn small danger" onClick={() => { setMenuBackup(false); recarregarSeed() }}>Recarregar dados da planilha</button>}
          </div>
        )}
        <input ref={arqXls} type="file" accept=".xlsx,.xls,.xlsm,.csv" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) lerPlanilha(f) }} />
        <input ref={arqJson} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) restaurarBackup(f) }} />
      </div>

      {aba === 'board' && <Quadro itens={visiveis} abrir={setAbertoId} />}
      {aba === 'rem' && <Lembretes itens={visiveis} abrir={setAbertoId} />}
      {aba === 'list' && <Tabela itens={visiveis} abrir={setAbertoId} />}
      {aba === 'guide' && <ComoFunciona />}
      {aba === 'sheet' && <Planilha itens={visiveis} abrir={setAbertoId} marcar={marcarItem} podeEditar={podeEditar} res={res} />}

      <footer className="sc-foot">
        <span>Gellen &amp; Guimarães · Engenharia Civil</span>
        <span>{salvoEm ? `Salvo no banco · ${salvoEm}` : 'Salvo no banco'}</span>
      </footer>

      {aberta && (
        <Painel
          key={aberta.id} act={aberta} statusIso={statusIso} podeEditar={podeEditar}
          fechar={() => setAbertoId(null)}
          salvarCampos={(patch) => atualizarCampos(aberta.id, patch)}
          marcar={(chave, estado) => marcarItem(aberta.id, chave, estado)}
          excluir={() => excluir(aberta.id)}
        />
      )}

      {escolhaAba && (
        <EscolherAba
          cands={escolhaAba} hoje={statusIso}
          cancelar={() => setEscolhaAba(null)}
          importar={(c) => { setEscolhaAba(null); aplicarImportacao(c.list) }}
        />
      )}

      {toast && (
        <div className="sc-toast" role="status">
          {toast.msg}
          {toast.desfazer && <u onClick={() => { toast.desfazer(); setToast(null) }}>Desfazer</u>}
        </div>
      )}

      <Confirmar
        aberto={Boolean(confirmar)} titulo={confirmar?.titulo || ''} texto={confirmar?.texto || ''}
        rotuloOk={confirmar?.rotuloOk} perigo={confirmar?.perigo}
        onOk={() => confirmar?.onOk()} onCancelar={() => setConfirmar(null)}
      />
    </div>
  )
}

/* ── Quadro ─────────────────────────────────────────────────── */
function Cartao({ x, abrir }) {
  const { a, r } = x
  return (
    <button type="button" className={`sc-card ${r.status}`} onClick={() => abrir(a.id)}>
      <div className="name">{a.nome}</div>
      <div className="meta">
        <span>Início {fmtData(a.inicio)} · {r.toStart >= 0 ? `${r.toStart} d` : 'iniciado'}</span>
        {r.status !== 'done' && (
          <span className={`sc-pill${r.realizado || !r.previsto ? '' : ' warn'}`} title="Etapa prevista pela data">Prev. {etapaTxt(r.prevista)}</span>
        )}
      </div>
      <div className="meta">
        <span>{r.doneCount}/{r.total} itens{a.resp ? ` · ${a.resp}` : ''}</span>
        {r.critico && <span className="sc-pill warn">&lt;14 d</span>}
      </div>
      <div className="due"><i className={`sc-dot ${r.status}`} />{diasTxt(r)}</div>
    </button>
  )
}

function Quadro({ itens, abrir }) {
  const colunas = [{ k: 'backlog', t: 'Backlog', w: 'mais de 120 dias do início' }]
    .concat(ETAPAS.map((e) => ({ k: e.n, t: e.label, w: `${e.ini} a ${e.fim} dias · ${e.itens.length} itens` })))
    .concat([{ k: 'done', t: 'Liberado p/ obra', w: 'etapas 1 a 4 concluídas' }])
  return (
    <section>
      <div className="sc-board">
        {colunas.map((c) => {
          const dela = itens.filter((x) => {
            if (c.k === 'backlog') return x.r.status === 'backlog'
            if (c.k === 'done') return x.r.status === 'done'
            return x.r.status !== 'backlog' && x.r.status !== 'done' && x.r.atual === c.k
          }).sort(ordemUrgencia)
          return (
            <div key={c.k} className="sc-col">
              <h3>{c.t}<span className="count">{dela.length}</span></h3>
              <div className="win">{c.w}</div>
              <div className="cards">
                {dela.length ? dela.map((x) => <Cartao key={x.a.id} x={x} abrir={abrir} />) : <div className="sc-empty">Nenhum cartão</div>}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ── Lembretes ──────────────────────────────────────────────── */
function Lembretes({ itens, abrir }) {
  const grupos = [['red', 'Vencidas: agir hoje'], ['yellow', 'Vencem em até 2 dias'], ['green', 'Próximos prazos (7 dias)'], ['backlog', 'Entram no fluxo nos próximos 15 dias']]
  const blocos = grupos.map(([cor, titulo]) => {
    const dela = itens.filter((x) => {
      if (x.r.status !== cor) return false
      if (cor === 'green') return x.r.dias <= 7
      if (cor === 'backlog') return x.r.toStart - 120 <= 15
      return true
    }).sort(ordemUrgencia)
    return { cor, titulo, dela }
  }).filter((b) => b.dela.length)
  if (!blocos.length) return <div className="sc-empty">Nenhum lembrete para a data de status.</div>
  return (
    <section>
      {blocos.map((b) => (
        <div key={b.cor} className="sc-rem-group">
          <h4><i className={`sc-dot ${b.cor}`} />{b.titulo} · {b.dela.length}</h4>
          {b.dela.map(({ a, r }) => {
            const backlog = r.status === 'backlog'
            const badge = backlog
              ? <>{r.toStart - 120}<small>dias</small></>
              : <>{r.dias < 0 ? `+${-r.dias}` : r.dias}<small>{r.dias < 0 ? 'atraso' : r.dias === 0 ? 'hoje' : 'dias'}</small></>
            const msg = backlog
              ? `Abrir a 1ª Etapa (estudo de procedimento e projeto) em ${fmtData(isoFromNum(dayNum(a.inicio) - 120))}`
              : `Concluir a ${r.stage.label} até ${fmtData(isoFromNum(r.prazo))}. Pendente: ${r.pend.join(', ')}`
            return (
              <button key={a.id} type="button" className={`sc-rem ${r.status}`} onClick={() => abrir(a.id)}>
                <div className="badge">{badge}</div>
                <div className="txt">
                  <b>{a.nome}</b><span>{msg}</span><br />
                  <span>Início na obra {fmtData(a.inicio)}{a.resp ? ` · Resp.: ${a.resp}` : ''}</span>
                </div>
              </button>
            )
          })}
        </div>
      ))}
    </section>
  )
}

/* ── Atividades (tabela) ────────────────────────────────────── */
function Tabela({ itens, abrir }) {
  const linhas = itens.slice().sort((a, b) => dayNum(a.a.inicio) - dayNum(b.a.inicio))
  return (
    <section>
      <div className="sc-tablewrap">
        <table>
          <thead>
            <tr>
              <th>Contratação</th><th>Início na obra</th><th>Etapa prevista</th><th>Etapa atual</th><th>Prazo da etapa</th>
              <th>Dias</th><th>Itens</th><th>Previsto</th><th>Realizado</th><th>Status</th><th>Responsável</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && <tr><td colSpan={11} className="sc-empty">Nenhuma atividade</td></tr>}
            {linhas.map(({ a, r }) => (
              <tr key={a.id} onClick={() => abrir(a.id)}>
                <td><b>{a.nome}</b></td>
                <td>{fmtData(a.inicio)}</td>
                <td className="num">{etapaTxt(r.prevista)}</td>
                <td className="num">{r.status === 'done' ? 'Concluída' : etapaTxt(r.atual)}</td>
                <td>{r.prazo != null ? fmtData(isoFromNum(r.prazo)) : '—'}</td>
                <td className="num">{r.dias != null ? r.dias : '—'}</td>
                <td className="num">{r.doneCount}/{r.total}</td>
                <td className="num">{r.previsto}</td>
                <td className="num">{r.realizado}</td>
                <td><Estado r={r} /></td>
                <td>{a.resp || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* ── Planilha (grade de controle: atividade × item) ─────────── */
function Planilha({ itens, abrir, marcar, podeEditar, res }) {
  const linhas = itens.slice().sort((a, b) => dayNum(a.a.inicio) - dayNum(b.a.inicio))
  const proximo = (v) => (!v ? 'ok' : v === 'ok' ? 'na' : null)
  const totalPorItem = (chave) => linhas.filter((x) => itemFeito(x.a, chave)).length
  return (
    <section>
      <div className="sc-sheetwrap">
        <table className="sc-sheet">
          <thead>
            <tr>
              <th className="stk" rowSpan={2}>Atividade</th>
              <th rowSpan={2}>Início na obra</th>
              {ETAPAS.map((e) => <th key={e.n} colSpan={e.itens.length}>{e.label} · {e.ini}–{e.fim} d</th>)}
              <th rowSpan={2}>Etapa prevista</th><th rowSpan={2}>Etapa atual</th><th rowSpan={2}>Prazo da etapa</th>
              <th rowSpan={2}>Previsto</th><th rowSpan={2}>Realizado</th><th rowSpan={2}>Status</th><th rowSpan={2}>Responsável</th>
            </tr>
            <tr className="g2">
              {ETAPAS.flatMap((e) => e.itens.map((it) => (
                <th key={it[0]} className="it" title={`${it[1]}. ${it[2]}`}><span>{it[1]}. {it[2]}</span></th>
              )))}
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && <tr><td colSpan={30} className="sc-empty">Nenhuma atividade</td></tr>}
            {linhas.map(({ a, r }) => (
              <tr key={a.id}>
                <td className="stk"><button type="button" className="nome-btn" onClick={() => abrir(a.id)}>{a.nome}</button></td>
                <td className="num">{fmtData(a.inicio)}</td>
                {ETAPAS.flatMap((e) => e.itens.map((it) => {
                  const v = a.itens[it[0]]
                  return (
                    <td key={it[0]} className={`cel et${e.n} ${v || ''}`}>
                      <button
                        type="button" disabled={!podeEditar}
                        title={`${it[1]}. ${it[2]}${v === 'ok' ? ' · feito' : v === 'na' ? ' · não se aplica' : ''}`}
                        onClick={() => marcar(a.id, it[0], proximo(v))}
                      >
                        {v === 'ok' ? '✓' : v === 'na' ? 'N/A' : ''}
                      </button>
                    </td>
                  )
                }))}
                <td className="num">{etapaTxt(r.prevista)}</td>
                <td className="num">{r.status === 'done' ? 'Concluída' : etapaTxt(r.atual)}</td>
                <td className="num">{r.prazo != null ? fmtData(isoFromNum(r.prazo)) : '—'}</td>
                <td className="num">{r.previsto}</td>
                <td className="num">{r.realizado}</td>
                <td><Estado r={r} /></td>
                <td>{a.resp || ''}</td>
              </tr>
            ))}
          </tbody>
          {linhas.length > 0 && (
            <tfoot>
              <tr>
                <td className="stk">Itens feitos</td>
                <td />
                {CHAVES_ITENS.map((k) => <td key={k}>{totalPorItem(k)}</td>)}
                <td colSpan={3} />
                <td>{res.previsto}</td><td>{res.realizado}</td>
                <td colSpan={2}>Alcance {res.alcance}%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div className="sc-legend">
        <span>Clique numa célula: vazio → ✓ feito → N/A → vazio.</span>
        <span>Passe o mouse no título da coluna para ver o item.</span>
      </div>
    </section>
  )
}

/* ── Como funciona ──────────────────────────────────────────── */
function ComoFunciona() {
  return (
    <section className="sc-guide">
      <section>
        <h3>Como o quadro funciona</h3>
        <p>É o mesmo fluxo do painel da obra: cada contratação nasce no <b>Backlog</b> (mais de 120 dias antes do início do serviço) e é <b>puxada</b> pelas etapas até ficar liberada para a obra.</p>
        <div className="sc-flow"><span>Backlog &gt;120 d</span><span>1ª · 120–91 d</span><span>2ª · 90–61 d</span><span>3ª · 60–31 d</span><span>4ª · 30–15 d</span><span>Liberado</span></div>
        <p style={{ marginTop: 10 }}>O cartão sai de uma etapa quando todos os itens dela estão marcados como feitos (ou &quot;N/A&quot;). A etapa em que o cartão está é a <b>Etapa atual</b>; onde ele deveria estar pela data é a <b>Etapa prevista</b>.</p>
      </section>
      <section>
        <h3>Regra das cores</h3>
        <ul>
          <li><span className="sc-st green"><i className="sc-dot green" />Verde</span>: a etapa atual está no prazo, faltam mais de 2 dias.</li>
          <li><span className="sc-st yellow"><i className="sc-dot yellow" />Amarelo</span>: faltam 2 dias ou menos (inclui o dia do vencimento).</li>
          <li><span className="sc-st red"><i className="sc-dot red" />Vermelho</span>: o prazo da etapa já passou.</li>
          <li><span className="sc-st backlog"><i className="sc-dot backlog" />Cinza</span>: ainda está no backlog, a janela de 120 dias não abriu.</li>
        </ul>
        <p>Prazo da etapa = data de início na obra − limite da janela (91, 61, 31 e 15 dias). Abaixo de 14 dias sem a 4ª etapa concluída é a zona <b>ATRASADO</b> do painel.</p>
      </section>
      <section>
        <h3>Itens de cada etapa</h3>
        <ul>
          {ETAPAS.map((e) => (
            <li key={e.n}><b>{e.label} ({e.ini}–{e.fim} d):</b> {e.itens.map((it) => `${it[1]}. ${it[2]}`).join(' · ')}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3>Ritos sugeridos</h3>
        <ul>
          <li><b>Daily de suprimentos (15 min)</b>: abrir a aba Lembretes, começando pelos vermelhos e amarelos. Para cada um: o que foi feito, o que trava, quem resolve.</li>
          <li><b>Sprint semanal</b>: definir quais cartões precisam avançar de etapa na semana. O &quot;Alcance do sprint&quot; mostra Realizado ÷ Previsto.</li>
          <li><b>Revisão mensal</b>: comparar o alcance com a meta (80% na planilha) e registrar lições aprendidas, que entram no item 2 dos próximos pacotes.</li>
        </ul>
      </section>
      <section>
        <h3>Previsto × Realizado</h3>
        <p>Segue a definição da planilha de controle:</p>
        <ul>
          <li><b>Previsto = 1</b> quando a atividade já está dentro da janela do LOB (fora do backlog).</li>
          <li><b>Realizado = 1</b> quando a etapa atual é igual à prevista ou está adiantada.</li>
          <li><b>Alcance do sprint</b> = Σ Realizado ÷ Σ Previsto.</li>
        </ul>
      </section>
      <section>
        <h3>Integração com o aplicativo</h3>
        <p>Os dados ficam salvos no banco do Prumo, com o histórico de quem marcou cada item e quando. Use <b>Backup</b> para exportar ou restaurar o JSON e <b>Importar planilha</b> para carregar uma lista atualizada (colunas ATIVIDADE e INICIO).</p>
      </section>
    </section>
  )
}

/* ── Painel lateral (checklist da contratação) ──────────────── */
function Painel({ act, statusIso, podeEditar, fechar, salvarCampos, marcar, excluir }) {
  const [nome, setNome] = useState(act.nome)
  const [inicio, setInicio] = useState(act.inicio)
  const [resp, setResp] = useState(act.resp)
  const [obs, setObs] = useState(act.obs)

  const hoje = dayNum(statusIso)
  const d0 = dayNum(act.inicio)
  const r = calcular(act, hoje)

  /* salva o que mudou ao sair do campo e ao fechar */
  const gravar = (patch) => {
    const real = {}
    if ('nome' in patch && patch.nome.trim() && patch.nome.trim() !== act.nome) real.nome = patch.nome.trim()
    if ('inicio' in patch && patch.inicio && patch.inicio !== act.inicio) real.inicio = patch.inicio
    if ('resp' in patch && patch.resp.trim() !== act.resp) real.resp = patch.resp.trim()
    if ('obs' in patch && patch.obs !== act.obs) real.obs = patch.obs
    if (Object.keys(real).length) salvarCampos(real)
  }
  const concluir = () => { gravar({ nome, inicio, resp, obs }); fechar() }

  useEffect(() => {
    const aoTeclar = (e) => { if (e.key === 'Escape') concluir() }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  })

  return (
    <>
      <div className="sc-scrim" onClick={concluir} />
      <aside className="sc-drawer" aria-label="Contratação">
        <div className="sc-dr-head">
          <div className="t">
            <div className="sc-brand"><Estado r={r} /> · {diasTxt(r)}</div>
            <h2>{act.nome}</h2>
          </div>
          <button type="button" className="close" aria-label="Fechar" onClick={concluir}>×</button>
        </div>
        <div className="sc-dr-body">
          <div className="sc-fields">
            <label className="full">Contratação
              <input value={nome} disabled={!podeEditar} onChange={(e) => setNome(e.target.value)} onBlur={() => gravar({ nome })} />
            </label>
            <label>Início do serviço na obra
              <input type="date" value={inicio} disabled={!podeEditar} onChange={(e) => { setInicio(e.target.value); gravar({ inicio: e.target.value }) }} />
            </label>
            <label>Responsável
              <input value={resp} placeholder="Nome" disabled={!podeEditar} onChange={(e) => setResp(e.target.value)} onBlur={() => gravar({ resp })} />
            </label>
            <label className="full">Observações
              <textarea rows={2} value={obs} disabled={!podeEditar} onChange={(e) => setObs(e.target.value)} onBlur={() => gravar({ obs })} />
            </label>
          </div>

          {ETAPAS.map((e) => {
            const prazo = d0 - e.fim
            const dias = prazo - hoje
            const completa = e.itens.every((it) => itemFeito(act, it[0]))
            const cls = completa ? 'done' : dias < 0 ? 'red' : dias <= 2 ? 'yellow' : 'green'
            const quando = completa
              ? 'Concluída'
              : `${dias < 0 ? `Venceu há ${-dias} d` : dias === 0 ? 'Vence hoje' : `Faltam ${dias} d`} · ${fmtData(isoFromNum(prazo))}`
            return (
              <div key={e.n} className={`sc-stage${r.atual === e.n ? ' cur' : ''}`}>
                <div className="sh">
                  <i className={`sc-dot ${cls}`} />
                  <b>{e.label} <span style={{ fontWeight: 400, color: 'var(--sc-muted)' }}>({fmtData(isoFromNum(d0 - e.ini))} a {fmtData(isoFromNum(prazo))})</span></b>
                  <span className={`when sc-st ${cls}`}>{quando}</span>
                </div>
                {e.itens.map((it) => {
                  const v = act.itens[it[0]]
                  return (
                    <div key={it[0]} className={`sc-item ${v || ''}`}>
                      <input
                        type="checkbox" id={`cb_${it[0]}`} checked={v === 'ok'} disabled={v === 'na' || !podeEditar}
                        onChange={(ev) => marcar(it[0], ev.target.checked ? 'ok' : null)}
                      />
                      <span className="n">{it[1]}</span>
                      <label htmlFor={`cb_${it[0]}`}>{it[2]}</label>
                      <button
                        type="button" className="na-btn" title="Não se aplica a esta contratação" disabled={!podeEditar}
                        onClick={() => marcar(it[0], v === 'na' ? null : 'na')}
                      >
                        N/A
                      </button>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
        <div className="sc-dr-foot">
          {podeEditar ? <button type="button" className="sc-btn danger" onClick={excluir}>Excluir</button> : <span />}
          <button type="button" className="sc-btn primary" onClick={concluir}>Concluir</button>
        </div>
      </aside>
    </>
  )
}

/* ── Escolher aba da planilha ───────────────────────────────── */
function EscolherAba({ cands, hoje, cancelar, importar }) {
  const [sel, setSel] = useState(0)
  return (
    <div className="sc-overlay" onClick={(e) => { if (e.target === e.currentTarget) cancelar() }}>
      <div className="sc-dialog" role="dialog" aria-label="Escolher aba">
        <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Qual aba importar?</h3>
        <p style={{ margin: '0 0 12px', color: 'var(--sc-muted)', fontSize: 13 }}>
          Encontrei mais de uma lista de atividades nesta planilha. A sugerida é a que tem as datas mais recentes.
        </p>
        {cands.map((c, i) => {
          const antiga = c.max < hoje
          return (
            <label key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid var(--sc-line)', borderRadius: 8, padding: 10, marginBottom: 8, cursor: 'pointer' }}>
              <input type="radio" name="sheetc" checked={sel === i} onChange={() => setSel(i)} style={{ marginTop: 3 }} />
              <span>
                <b>{c.nomes.join(' / ')}</b>{i === 0 && <> <span className="sc-pill">sugerida</span></>}<br />
                <span style={{ fontSize: 12, color: 'var(--sc-muted)' }}>
                  {c.list.length} atividades · início de {fmtData(c.min)} a {fmtData(c.max)}
                  {antiga && <> · <b style={{ color: 'var(--sc-red)' }}>todas já passaram</b></>}
                </span><br />
                <span style={{ fontSize: 12, color: 'var(--sc-muted)' }}>
                  {c.list.slice(0, 4).map((x) => x[0]).join(', ')}{c.list.length > 4 ? '…' : ''}
                </span>
              </span>
            </label>
          )
        })}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
          <button type="button" className="sc-btn" onClick={cancelar}>Cancelar</button>
          <button type="button" className="sc-btn primary" onClick={() => importar(cands[sel])}>Importar</button>
        </div>
      </div>
    </div>
  )
}
