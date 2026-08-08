/* ============================================================
   PENDÊNCIAS
   "Em aberto" INCLUI as atrasadas — decisão do guia, aplicada
   em filtrarPendencias(). A tela, os contadores do menu e o
   Início chamam a MESMA função. Se alguém reescrever o filtro
   aqui, o menu passa a mentir.
   ============================================================ */

import { useState, useMemo } from 'react'
import { useDados } from '../lib/DadosContext'
import {
  hojeISO, formatarData, filtrarPendencias, situacaoPendencia, contarPendencias,
  ROTULO_PRIORIDADE, PRIORIDADES, plural,
} from '../lib/dominio'
import { Icon, Chip, PageHeader, Segmentos, Sheet, Campo, Confirmar, Vazio } from '../components'

export default function Pendencias({ perfil, params = {} }) {
  const dados = useDados()
  const hoje = hojeISO()
  const [filtro, setFiltro] = useState('abertas')
  const [editando, setEditando] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [destaque, setDestaque] = useState(params.destacar || null)

  const cont = contarPendencias(dados.pendencias, hoje)

  const lista = useMemo(() => {
    return filtrarPendencias(dados.pendencias, filtro, hoje)
      .map((p) => ({ p, s: situacaoPendencia(p, hoje) }))
      .sort((a, b) => {
        /* Atrasada primeiro, depois o prazo mais próximo, depois sem prazo. */
        const peso = (x) => (x.s.chave === 'atrasada' ? 0 : x.s.chave === 'vence_hoje' ? 1 : x.p.prazo ? 2 : 3)
        const d = peso(a) - peso(b)
        if (d !== 0) return d
        if (!a.p.prazo) return 1
        if (!b.p.prazo) return -1
        return a.p.prazo < b.p.prazo ? -1 : 1
      })
  }, [dados.pendencias, filtro, hoje])

  const abrirNova = () =>
    setEditando({
      titulo: '', descricao: '', prioridade: 'media',
      prazo: '', responsavel_id: perfil.id, status: 'aberta',
    })

  const salvar = () => {
    if (!editando?.titulo?.trim()) return
    dados.salvarPendencia({
      ...editando,
      titulo: editando.titulo.trim(),
      descricao: (editando.descricao || '').trim(),
      prazo: editando.prazo || null,
    })
    setEditando(null)
  }

  const pedirAlternar = (p) => {
    if (p.status === 'resolvida') {
      setConfirmar({
        titulo: 'Reabrir pendência?',
        texto: `«${p.titulo}» volta para a lista de abertas.`,
        rotuloOk: 'Reabrir',
        onOk: () => { dados.alternarPendencia(p.id); setConfirmar(null) },
      })
    } else {
      dados.alternarPendencia(p.id)
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Pendências</div>
          <div className="sub">
            {cont.abertas} em aberto{cont.atrasadas > 0 && ` · ${cont.atrasadas} atrasada(s)`}
          </div>
        </div>
        <button onClick={abrirNova} aria-label="Nova pendência"><Icon name="mais_sinal" size={22} /></button>
      </div>

      <div className="page">
        <PageHeader
          titulo="Pendências"
          sub={`${plural(lista.length, 'item', 'itens')} neste filtro`}
          acao={<button className="btn btn-primary" onClick={abrirNova}><Icon name="mais_sinal" size={18} /> Nova</button>}
        />

        <div className="stack-2">
          <Segmentos
            valor={filtro} onChange={setFiltro}
            opcoes={[
              { valor: 'abertas', rotulo: 'Em aberto', contador: cont.abertas },
              { valor: 'atrasadas', rotulo: 'Atrasadas', contador: cont.atrasadas },
              { valor: 'resolvidas', rotulo: 'Resolvidas', contador: cont.resolvidas },
              { valor: 'todas', rotulo: 'Todas', contador: cont.total },
            ]}
          />

          {lista.length === 0 ? (
            <div className="card-flat">
              <Vazio
                titulo="Nada por aqui"
                texto={
                  filtro === 'atrasadas'
                    ? 'Nenhuma pendência passou do prazo.'
                    : 'Nenhuma pendência neste filtro. Registre o que precisa de alguém para resolver.'
                }
                acao={<button className="btn btn-primary" onClick={abrirNova}>Nova pendência</button>}
              />
            </div>
          ) : (
            <div className="stack-1">
              {lista.map(({ p, s }) => {
                const resolvida = p.status === 'resolvida'
                return (
                  <div
                    key={p.id}
                    className="card-flat"
                    style={{
                      borderLeft: s.chave === 'atrasada' ? '4px solid var(--danger)' : undefined,
                      outline: destaque === p.id ? '2px solid var(--primary)' : undefined,
                      opacity: resolvida ? 0.72 : 1,
                    }}
                    onMouseDown={() => setDestaque(null)}
                  >
                    <div className="row-between" style={{ alignItems: 'flex-start', gap: 10 }}>
                      <button
                        className="pick" data-on={resolvida ? '1' : '0'}
                        style={{ width: 'auto', border: 0, background: 'transparent', padding: 0, flex: 'none' }}
                        onClick={() => pedirAlternar(p)}
                        aria-label={resolvida ? 'Reabrir' : 'Marcar como resolvida'}
                      >
                        <span className="box"><Icon name="check" size={14} /></span>
                      </button>

                      <div className="grow" style={{ minWidth: 0 }}>
                        <div
                          className="t-strong"
                          style={{ fontSize: 15, textDecoration: resolvida ? 'line-through' : 'none' }}
                        >
                          {p.titulo}
                        </div>
                        {p.descricao && (
                          <div className="t-caption" style={{ marginTop: 4, lineHeight: 1.5 }}>{p.descricao}</div>
                        )}
                        <div className="row-wrap" style={{ marginTop: 8, gap: 6, alignItems: 'center' }}>
                          <Chip tom={s.tom}>{s.rotulo}</Chip>
                          <span className="t-caption">
                            {dados.perfilPorId(p.responsavel_id)?.nome || 'Sem responsável'}
                          </span>
                          {p.prazo && <span className="t-caption">· prazo {formatarData(p.prazo)}</span>}
                          {p.prioridade === 'alta' && !resolvida && (
                            <span className="t-caption" style={{ color: 'var(--danger)', fontWeight: 600 }}>
                              · prioridade alta
                            </span>
                          )}
                          {p.origem === 'diario' && <span className="t-caption">· veio do diário</span>}
                        </div>
                      </div>

                      <button className="btn btn-ghost btn-sm" onClick={() => setEditando({ ...p, prazo: p.prazo || '' })} aria-label="Editar">
                        <Icon name="editar" size={16} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <Sheet
        aberto={Boolean(editando)}
        titulo={editando?.id ? 'Editar pendência' : 'Nova pendência'}
        onFechar={() => setEditando(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setEditando(null)}>Cancelar</button>
            <button className="btn btn-primary grow" onClick={salvar} disabled={!editando?.titulo?.trim()}>
              Salvar
            </button>
          </div>
        }
      >
        <div className="stack-2">
          <Campo label="O que precisa ser resolvido">
            <input
              className="ipt" autoFocus value={editando?.titulo || ''}
              onChange={(e) => setEditando((p) => ({ ...p, titulo: e.target.value }))}
              placeholder="Uma frase curta e específica"
            />
          </Campo>
          <Campo label="Detalhe" >
            <textarea
              className="txt" value={editando?.descricao || ''}
              onChange={(e) => setEditando((p) => ({ ...p, descricao: e.target.value }))}
              placeholder="Contexto suficiente para o responsável agir sem precisar perguntar."
            />
          </Campo>
          <Campo label="Responsável">
            <select
              className="sel" value={editando?.responsavel_id || ''}
              onChange={(e) => setEditando((p) => ({ ...p, responsavel_id: e.target.value }))}
            >
              <option value="">Sem responsável</option>
              {dados.perfis.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Campo>
          <div className="row-flex" style={{ alignItems: 'flex-end' }}>
            <div className="grow">
              <Campo label="Prazo" dica="Sem prazo, a pendência nunca aparece como atrasada.">
                <input
                  className="ipt" type="date" value={editando?.prazo || ''}
                  onChange={(e) => setEditando((p) => ({ ...p, prazo: e.target.value }))}
                />
              </Campo>
            </div>
            <div style={{ width: 130 }}>
              <Campo label="Prioridade">
                <select
                  className="sel" value={editando?.prioridade || 'media'}
                  onChange={(e) => setEditando((p) => ({ ...p, prioridade: e.target.value }))}
                >
                  {PRIORIDADES.map((x) => <option key={x} value={x}>{ROTULO_PRIORIDADE[x]}</option>)}
                </select>
              </Campo>
            </div>
          </div>
        </div>
      </Sheet>

      <Confirmar
        aberto={Boolean(confirmar)}
        titulo={confirmar?.titulo}
        texto={confirmar?.texto}
        rotuloOk={confirmar?.rotuloOk}
        onOk={confirmar?.onOk}
        onCancelar={() => setConfirmar(null)}
      />
    </>
  )
}
