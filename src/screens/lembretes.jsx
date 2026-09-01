/* ============================================================
   LEMBRETES

   Quem manda o aviso na hora certa é a notificação push do
   navegador (Web Push + VAPID, ver usePushNotifications) — cada
   pessoa ativa no aparelho dela. Sem ativar, um lembrete
   "pendente" é só uma lista — não uma notificação. O WhatsApp
   ainda não está configurado, então ele não é um canal aqui.
   ============================================================ */

import { useState, useMemo } from 'react'
import { useDados } from '../lib/DadosContext'
import {
  hojeISO, formatarDataHora, situacaoLembrete, filtrarLembretes, plural, filtrarPorPeriodo, rotuloPeriodo,
} from '../lib/dominio'
import { Icon, Chip, PageHeader, Segmentos, Sheet, Campo, Confirmar, Vazio, FiltroPeriodo, SecaoRecolhivel } from '../components'
import { usePushNotifications } from '../hooks/usePushNotifications'

/* O input datetime-local trabalha em hora LOCAL, sem fuso — igual ao
   que new Date(valor).toISOString() espera receber de volta. */
function paraDatetimeLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function Lembretes({ perfil }) {
  const dados = useDados()
  const push = usePushNotifications()
  const agora = new Date()
  const [filtro, setFiltro] = useState('pendentes')
  const [editando, setEditando] = useState(null)
  const [removendo, setRemovendo] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [buscaResponsavel, setBuscaResponsavel] = useState('')
  const hoje = hojeISO()
  const [periodoModo, setPeriodoModo] = useState('tudo')
  const [periodoDia, setPeriodoDia] = useState(hoje)
  const [periodoMes, setPeriodoMes] = useState(hoje.slice(0, 7))
  const [periodoInicio, setPeriodoInicio] = useState(hoje)
  const [periodoFim, setPeriodoFim] = useState(hoje)

  /* "Meus" agora inclui tanto o que a pessoa criou pra si (jeito de
     sempre) quanto o que outra pessoa criou marcando ela como
     responsável — ver campo Responsáveis no formulário. */
  const meus = useMemo(
    () => dados.lembretes.filter((l) =>
      l.destinatario_id === perfil.id || (l.responsaveis_ids || []).includes(perfil.id)),
    [dados.lembretes, perfil.id],
  )

  /* Período olha a data marcada pra disparar (disparar_em), não a
     data de criação — é "o que cai nesse recorte", não "o que foi
     anotado nesse recorte". Mesmo padrão (Tudo/Dia/Mês/Período) do
     resto do app. */
  const meusDoPeriodo = useMemo(
    () => filtrarPorPeriodo(
      meus, periodoModo,
      { dia: periodoDia, mes: periodoMes, inicio: periodoInicio, fim: periodoFim },
      (l) => l.disparar_em.slice(0, 10),
    ),
    [meus, periodoModo, periodoDia, periodoMes, periodoInicio, periodoFim],
  )

  const lista = useMemo(
    () => filtrarLembretes(meusDoPeriodo, filtro, agora).slice().sort((a, b) => (a.disparar_em < b.disparar_em ? -1 : 1)),
    [meusDoPeriodo, filtro], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const cont = useMemo(() => ({
    pendentes: meusDoPeriodo.filter((l) => l.status === 'pendente').length,
    atrasados: meusDoPeriodo.filter((l) => situacaoLembrete(l, agora).chave === 'atrasado').length,
    concluidos: meusDoPeriodo.filter((l) => l.status === 'concluido').length,
    cancelados: meusDoPeriodo.filter((l) => l.status === 'cancelado').length,
    total: meusDoPeriodo.length,
  }), [meusDoPeriodo]) // eslint-disable-line react-hooks/exhaustive-deps

  const abrirNovo = () => {
    setBuscaResponsavel('')
    setEditando({ texto: '', disparar_em: '', local: '', observacoes: '', responsaveis_ids: [] })
  }

  const adicionarResponsavel = (id) => {
    setBuscaResponsavel('')
    setEditando((p) => {
      const atual = p.responsaveis_ids || []
      return atual.includes(id) ? p : { ...p, responsaveis_ids: [...atual, id] }
    })
  }

  const removerResponsavel = (id) => setEditando((p) => ({
    ...p, responsaveis_ids: (p.responsaveis_ids || []).filter((x) => x !== id),
  }))

  const resultadosResponsavel = useMemo(() => {
    const termo = buscaResponsavel.trim().toLowerCase()
    if (!termo) return []
    const jaMarcados = new Set(editando?.responsaveis_ids || [])
    return dados.perfis
      .filter((p) => p.id !== perfil.id && !jaMarcados.has(p.id) && p.nome.toLowerCase().includes(termo))
      .slice(0, 8)
  }, [buscaResponsavel, dados.perfis, editando?.responsaveis_ids, perfil.id])

  const salvar = async () => {
    if (!editando?.texto?.trim() || !editando?.disparar_em) return
    setSalvando(true)
    const ok = await dados.salvarLembrete({
      ...(editando.id ? { id: editando.id } : {}),
      texto: editando.texto,
      disparar_em: new Date(editando.disparar_em).toISOString(),
      local: editando.local,
      observacoes: editando.observacoes,
      responsaveis_ids: editando.responsaveis_ids || [],
    })
    setSalvando(false)
    if (ok) setEditando(null)
  }

  return (
    <>
      <div className="topbar">
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Lembretes</div>
          <div className="sub">{plural(cont.pendentes, 'pendente', 'pendentes')}</div>
        </div>
        <button onClick={abrirNovo} aria-label="Novo lembrete">
          <Icon name="mais_sinal" size={22} />
        </button>
      </div>

      <div className="page">
        <PageHeader
          titulo="Lembretes"
          sub={`${plural(lista.length, 'item', 'itens')} neste filtro`}
          acao={
            <button className="btn btn-primary" onClick={abrirNovo}>
              <Icon name="mais_sinal" size={18} /> Novo
            </button>
          }
        />

        <div className="stack-2">
          {push.suportado ? (
            <div className="card-flat row-between" style={{ alignItems: 'center', gap: 10 }}>
              <div className="grow">
                <div className="t-strong" style={{ fontSize: 14 }}>Notificações no navegador</div>
                <div className="t-caption">
                  {push.inscrito
                    ? 'Ativadas neste aparelho — você recebe um aviso quando o lembrete vencer, mesmo com o app fechado.'
                    : 'Ative para receber um aviso na hora exata do lembrete, mesmo com o app fechado.'}
                </div>
                {push.erro && (
                  <div className="t-caption" style={{ color: 'var(--danger)', marginTop: 4 }}>{push.erro}</div>
                )}
              </div>
              <button
                className={push.inscrito ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm'}
                disabled={push.carregando}
                onClick={() => (push.inscrito ? push.desativar() : push.ativar())}
              >
                {push.carregando ? '...' : push.inscrito ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          ) : (
            <div className="alert info">
              Este navegador não aceita notificações push. Isto guarda a data marcada, mas
              ninguém é avisado sozinho — é só uma lista pra você checar por conta própria.
            </div>
          )}

          <Segmentos
            valor={filtro} onChange={setFiltro}
            opcoes={[
              { valor: 'pendentes', rotulo: 'Pendentes', contador: cont.pendentes },
              { valor: 'atrasados', rotulo: 'Atrasados', contador: cont.atrasados },
              { valor: 'concluidos', rotulo: 'Concluídos', contador: cont.concluidos },
              { valor: 'cancelados', rotulo: 'Cancelados', contador: cont.cancelados },
              { valor: 'todos', rotulo: 'Todos', contador: cont.total },
            ]}
          />

          <SecaoRecolhivel
            titulo="Período"
            resumo={rotuloPeriodo(periodoModo, { dia: periodoDia, mes: periodoMes, inicio: periodoInicio, fim: periodoFim })}
          >
            <FiltroPeriodo
              modo={periodoModo} onModo={setPeriodoModo}
              dia={periodoDia} onDia={setPeriodoDia}
              mes={periodoMes} onMes={setPeriodoMes}
              inicio={periodoInicio} onInicio={setPeriodoInicio}
              fim={periodoFim} onFim={setPeriodoFim}
            />
          </SecaoRecolhivel>

          {lista.length === 0 ? (
            <div className="card-flat">
              <Vazio
                titulo="Nada por aqui"
                texto="Anote algo que precisa lembrar depois."
                acao={<button className="btn btn-primary" onClick={abrirNovo}>Novo lembrete</button>}
              />
            </div>
          ) : (
            <div className="stack-1">
              {lista.map((l) => {
                const s = situacaoLembrete(l, agora)
                return (
                  <div
                    key={l.id} className="card-flat"
                    style={{ borderLeft: s.chave === 'atrasado' ? '4px solid var(--danger)' : undefined }}
                  >
                    <div className="row-between" style={{ alignItems: 'flex-start', gap: 10 }}>
                      <div className="grow">
                        <div className="t-strong" style={{ fontSize: 15 }}>{l.texto}</div>
                        {l.observacoes && (
                          <div className="t-caption" style={{ marginTop: 4, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                            {l.observacoes}
                          </div>
                        )}
                        <div className="row-wrap" style={{ marginTop: 8, gap: 6, alignItems: 'center' }}>
                          <Chip tom={s.tom}>{s.rotulo}</Chip>
                          <span className="t-caption">{formatarDataHora(l.disparar_em)}</span>
                          {l.local && <span className="t-caption">· {l.local}</span>}
                        </div>
                        {l.responsaveis_ids?.length > 0 && (
                          <div className="t-caption" style={{ marginTop: 4 }}>
                            Responsáveis: {l.responsaveis_ids.map((id) => dados.perfilPorId(id)?.nome || '—').join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="row-flex" style={{ gap: 2 }}>
                        {l.status !== 'enviado' && (
                          <button
                            className="btn btn-ghost btn-sm" aria-label="Editar"
                            onClick={() => { setBuscaResponsavel(''); setEditando({ ...l, disparar_em: paraDatetimeLocal(l.disparar_em) }) }}
                          >
                            <Icon name="editar" size={16} />
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => setRemovendo(l)} aria-label="Excluir">
                          <Icon name="x" size={16} />
                        </button>
                      </div>
                    </div>
                    {(l.status === 'pendente' || s.chave === 'atrasado') && (
                      <div className="row-flex" style={{ marginTop: 8, gap: 8 }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => dados.mudarStatusLembrete(l.id, 'concluido')}
                        >
                          <Icon name="check" size={14} /> Concluir
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => dados.mudarStatusLembrete(l.id, 'cancelado')}
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                    {(l.status === 'concluido' || l.status === 'cancelado') && (
                      <button
                        className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
                        onClick={() => dados.mudarStatusLembrete(l.id, 'pendente')}
                      >
                        Reabrir
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <Sheet
        aberto={Boolean(editando)}
        titulo={editando?.id ? 'Editar lembrete' : 'Novo lembrete'}
        onFechar={() => setEditando(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setEditando(null)}>Cancelar</button>
            <button
              className="btn btn-primary grow" onClick={salvar}
              disabled={salvando || !editando?.texto?.trim() || !editando?.disparar_em}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        <div className="stack-2">
          <Campo label="O que lembrar">
            <input
              className="ipt" autoFocus value={editando?.texto || ''}
              onChange={(e) => setEditando((p) => ({ ...p, texto: e.target.value }))}
              placeholder="Ex.: Ligar para o fornecedor de cimento"
            />
          </Campo>
          <Campo label="Quando">
            <input
              className="ipt" type="datetime-local" value={editando?.disparar_em || ''}
              onChange={(e) => setEditando((p) => ({ ...p, disparar_em: e.target.value }))}
            />
          </Campo>
          <Campo label="Local" dica="Opcional">
            <input
              className="ipt" value={editando?.local || ''}
              onChange={(e) => setEditando((p) => ({ ...p, local: e.target.value }))}
            />
          </Campo>
          <Campo label="Observações" dica="Opcional — detalhe mais o que precisa lembrar.">
            <textarea
              className="ipt" style={{ minHeight: 80 }}
              value={editando?.observacoes || ''}
              onChange={(e) => setEditando((p) => ({ ...p, observacoes: e.target.value }))}
              placeholder="Ex.: falar com o João, ramal 42, sobre a cotação do cimento."
            />
          </Campo>
          <Campo label="Responsáveis" dica="Opcional — quem mais precisa ficar de olho nisso, além de você. Aparece na lista de lembretes de cada um.">
            <div className="stack-1">
              {(editando?.responsaveis_ids || []).length > 0 && (
                <div className="row-wrap" style={{ gap: 6 }}>
                  {editando.responsaveis_ids.map((id) => (
                    <Chip key={id}>
                      {dados.perfilPorId(id)?.nome || '—'}
                      <button
                        onClick={() => removerResponsavel(id)} aria-label="Remover responsável"
                        style={{ border: 0, background: 'none', cursor: 'pointer', marginLeft: 4, padding: 0, display: 'inline-flex' }}
                      >
                        <Icon name="x" size={12} />
                      </button>
                    </Chip>
                  ))}
                </div>
              )}
              <input
                className="ipt" value={buscaResponsavel}
                onChange={(e) => setBuscaResponsavel(e.target.value)}
                placeholder="Digite o nome…"
              />
              {resultadosResponsavel.length > 0 && (
                <div className="stack-1">
                  {resultadosResponsavel.map((p) => (
                    <button
                      key={p.id} type="button" className="btn btn-secondary btn-sm"
                      style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                      onClick={() => adicionarResponsavel(p.id)}
                    >
                      {p.nome}
                    </button>
                  ))}
                </div>
              )}
              {buscaResponsavel.trim() && resultadosResponsavel.length === 0 && (
                <div className="t-caption">Ninguém com esse nome.</div>
              )}
            </div>
          </Campo>
        </div>
      </Sheet>

      <Confirmar
        aberto={Boolean(removendo)}
        titulo="Excluir lembrete?"
        texto={removendo ? `«${removendo.texto}» some da lista. Isso não tem volta.` : ''}
        rotuloOk="Excluir" perigo
        onOk={async () => { await dados.removerLembrete(removendo.id); setRemovendo(null) }}
        onCancelar={() => setRemovendo(null)}
      />
    </>
  )
}
