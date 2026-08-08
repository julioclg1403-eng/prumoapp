/* ============================================================
   LEMBRETES

   Sempre da pessoa para ela mesma (sem terceiro na v1 — mesmo
   recorte que a Edge Function do WhatsApp usa). Esta tela só GUARDA
   a data marcada: quem de fato manda o aviso na hora certa é o
   agendador do WhatsApp, que ainda não existe. Sem ele, um lembrete
   "pendente" é só uma lista — não uma notificação. O alerta no topo
   da tela é para não vender um recurso que não está pronto.
   ============================================================ */

import { useState, useMemo } from 'react'
import { useDados } from '../lib/DadosContext'
import { formatarDataHora, situacaoLembrete, filtrarLembretes, plural } from '../lib/dominio'
import { Icon, Chip, PageHeader, Segmentos, Sheet, Campo, Confirmar, Vazio } from '../components'

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
  const agora = new Date()
  const [filtro, setFiltro] = useState('pendentes')
  const [editando, setEditando] = useState(null)
  const [removendo, setRemovendo] = useState(null)
  const [salvando, setSalvando] = useState(false)

  const meus = useMemo(
    () => dados.lembretes.filter((l) => l.destinatario_id === perfil.id),
    [dados.lembretes, perfil.id],
  )

  const lista = useMemo(
    () => filtrarLembretes(meus, filtro, agora).slice().sort((a, b) => (a.disparar_em < b.disparar_em ? -1 : 1)),
    [meus, filtro], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const cont = useMemo(() => ({
    pendentes: meus.filter((l) => l.status === 'pendente').length,
    atrasados: meus.filter((l) => situacaoLembrete(l, agora).chave === 'atrasado').length,
    cancelados: meus.filter((l) => l.status === 'cancelado').length,
    total: meus.length,
  }), [meus]) // eslint-disable-line react-hooks/exhaustive-deps

  const abrirNovo = () => setEditando({ texto: '', disparar_em: '', local: '' })

  const salvar = async () => {
    if (!editando?.texto?.trim() || !editando?.disparar_em) return
    setSalvando(true)
    const ok = await dados.salvarLembrete({
      ...(editando.id ? { id: editando.id } : {}),
      texto: editando.texto,
      disparar_em: new Date(editando.disparar_em).toISOString(),
      local: editando.local,
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
          <div className="alert info">
            Isto guarda a data marcada. Quem manda o aviso na hora certa é o WhatsApp — sem ele
            configurado, um lembrete pendente não avisa ninguém sozinho, é só uma lista pra você
            checar por conta própria.
          </div>

          <Segmentos
            valor={filtro} onChange={setFiltro}
            opcoes={[
              { valor: 'pendentes', rotulo: 'Pendentes', contador: cont.pendentes },
              { valor: 'atrasados', rotulo: 'Atrasados', contador: cont.atrasados },
              { valor: 'cancelados', rotulo: 'Cancelados', contador: cont.cancelados },
              { valor: 'todos', rotulo: 'Todos', contador: cont.total },
            ]}
          />

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
                        <div className="row-wrap" style={{ marginTop: 8, gap: 6, alignItems: 'center' }}>
                          <Chip tom={s.tom}>{s.rotulo}</Chip>
                          <span className="t-caption">{formatarDataHora(l.disparar_em)}</span>
                          {l.local && <span className="t-caption">· {l.local}</span>}
                        </div>
                      </div>
                      <div className="row-flex" style={{ gap: 2 }}>
                        {l.status !== 'enviado' && (
                          <button
                            className="btn btn-ghost btn-sm" aria-label="Editar"
                            onClick={() => setEditando({ ...l, disparar_em: paraDatetimeLocal(l.disparar_em) })}
                          >
                            <Icon name="editar" size={16} />
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => setRemovendo(l)} aria-label="Excluir">
                          <Icon name="x" size={16} />
                        </button>
                      </div>
                    </div>
                    {(l.status === 'pendente' || l.status === 'cancelado') && (
                      <button
                        className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
                        onClick={() => dados.alternarLembrete(l.id)}
                      >
                        {l.status === 'pendente' ? 'Cancelar' : 'Reativar'}
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
