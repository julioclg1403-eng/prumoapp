/* ============================================================
   PROJETOS — apontamentos multi-disciplina, inspirado na
   Construflow (ver conversa que gerou este módulo). Cada
   apontamento carrega disciplinas com status/prazo próprios,
   comentários, anexos e um histórico de troca de status.

   Módulo de gestão/admin — não entra na navegação do campo,
   mesmo padrão de Equipamentos e Segurança. O banco reforça isso:
   criar/editar exige private.eh_gestao().
   ============================================================ */

import { useState, useMemo } from 'react'
import { useDados } from '../lib/DadosContext'
import {
  formatarData,
  PRIORIDADES, ROTULO_PRIORIDADE,
  STATUS_APONTAMENTO, ROTULO_STATUS_APONTAMENTO, TOM_STATUS_APONTAMENTO,
  VISIBILIDADE_APONTAMENTO, ROTULO_VISIBILIDADE_APONTAMENTO,
} from '../lib/dominio'
import {
  Icon, Chip, PageHeader, Segmentos, Sheet, Campo, Confirmar, Vazio,
  TextareaComAudio, CampoAnexos, useLinksDeAnexos, ChipToggle,
} from '../components'
import { enviarAnexoComentario } from '../lib/anexos'

function normalizarComparar(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
}

function siglaOuNome(lista, id) {
  const item = (lista || []).find((x) => x.id === id)
  if (!item) return null
  return item.sigla || item.nome
}

const VAZIO_NOVO = {
  titulo: '', descricao: '', prioridade: 'media', visibilidade: 'rascunho',
  stage_id: '', category_ids: [], location_ids: [], etiquetas: [],
  disciplinas: [], anexos: [], comentarios: [], historico: [], status: 'ativo',
}

export default function Projetos({ goto, voltar, perfil }) {
  const dados = useDados()
  const [aba, setAba] = useState('lista')
  const [filtro, setFiltro] = useState('ativo')
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [abaDetalhe, setAbaDetalhe] = useState('detalhes')

  const abrirNovo = () => { setEditando({ ...VAZIO_NOVO }); setAbaDetalhe('detalhes') }
  const abrirExistente = (item) => { setEditando(item); setAbaDetalhe('detalhes') }

  const cont = useMemo(() => {
    const porStatus = (s) => dados.apontamentos.filter((a) => a.status === s).length
    return {
      ativo: porStatus('ativo'), resolvido: porStatus('resolvido'), reprovado: porStatus('reprovado'),
      total: dados.apontamentos.length,
    }
  }, [dados.apontamentos])

  const lista = useMemo(() => {
    const b = normalizarComparar(busca)
    return dados.apontamentos
      .filter((a) => filtro === 'todos' || a.status === filtro)
      .filter((a) => !b || normalizarComparar(a.titulo).includes(b) || normalizarComparar(a.descricao).includes(b))
      .sort((x, y) => (x.created_at < y.created_at ? 1 : -1))
  }, [dados.apontamentos, filtro, busca])

  const salvar = async () => {
    if (!editando?.titulo?.trim()) return
    setSalvando(true)
    const salvo = await dados.salvarApontamento({ ...editando, titulo: editando.titulo.trim() })
    setSalvando(false)
    if (salvo) setEditando(null)
  }

  const garantirSalvo = async () => {
    if (editando.id) return editando
    if (!editando.titulo?.trim()) return null
    const salvo = await dados.salvarApontamento({ ...editando, titulo: editando.titulo.trim() })
    if (salvo) setEditando(salvo)
    return salvo
  }

  const mudarStatus = (novoStatus) => {
    if (novoStatus === 'ativo' && editando.status !== 'ativo') {
      setConfirmar({
        titulo: 'Reabrir apontamento?',
        texto: `«${editando.titulo}» volta a ficar ativo.`,
        rotuloOk: 'Reabrir',
        onOk: async () => {
          setConfirmar(null)
          const fresco = await dados.mudarStatusApontamento(editando.id, 'ativo')
          if (fresco) setEditando(fresco)
        },
      })
      return
    }
    dados.mudarStatusApontamento(editando.id, novoStatus).then((fresco) => { if (fresco) setEditando(fresco) })
  }

  return (
    <>
      <div className="topbar">
        {voltar && <button onClick={voltar} aria-label="Voltar"><Icon name="voltar" size={22} /></button>}
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Projetos</div>
          <div className="sub">{cont.ativo} ativo(s)</div>
        </div>
        {aba === 'lista' && (
          <button onClick={abrirNovo} aria-label="Novo apontamento"><Icon name="mais_sinal" size={22} /></button>
        )}
      </div>

      <div className="page">
        <PageHeader
          titulo="Projetos"
          sub="Apontamentos entre projeto e obra, por disciplina"
          acao={
            <div className="row-flex">
              {goto && (
                <button
                  className="btn btn-secondary btn-sm" aria-label="Configurações de Projetos"
                  onClick={() => goto('cadastros', { tipo: 'disciplinasProjeto' })}
                >
                  <Icon name="cadastros" size={16} />
                </button>
              )}
              {aba === 'lista' && (
                <button className="btn btn-primary" onClick={abrirNovo}><Icon name="mais_sinal" size={18} /> Criar</button>
              )}
            </div>
          }
        />

        <div className="stack-2">
          <Segmentos
            valor={aba} onChange={setAba}
            opcoes={[{ valor: 'lista', rotulo: 'Apontamentos' }, { valor: 'dashboard', rotulo: 'Dashboard' }]}
          />

          {aba === 'lista' ? (
            <>
              <input
                className="ipt" value={busca} onChange={(e) => setBusca(e.target.value)}
                placeholder="Pesquisar…"
              />
              <Segmentos
                valor={filtro} onChange={setFiltro}
                opcoes={[
                  { valor: 'ativo', rotulo: 'Ativos', contador: cont.ativo },
                  { valor: 'resolvido', rotulo: 'Resolvidos', contador: cont.resolvido },
                  { valor: 'reprovado', rotulo: 'Reprovados', contador: cont.reprovado },
                  { valor: 'todos', rotulo: 'Todos', contador: cont.total },
                ]}
              />

              {lista.length === 0 ? (
                <div className="card-flat">
                  <Vazio
                    titulo="Nada por aqui"
                    texto="Nenhum apontamento neste filtro."
                    acao={<button className="btn btn-primary" onClick={abrirNovo}>Criar apontamento</button>}
                  />
                </div>
              ) : (
                <div className="stack-1">
                  {lista.map((a) => (
                    <button
                      key={a.id} onClick={() => abrirExistente(a)}
                      className="card-flat" style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}
                    >
                      <div className="row-between" style={{ alignItems: 'flex-start', gap: 10 }}>
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className="t-caption">Nº {a.numero}</div>
                          <div className="t-strong" style={{ fontSize: 15, marginTop: 2 }}>{a.titulo}</div>
                          <div className="row-wrap" style={{ marginTop: 8, gap: 6, alignItems: 'center' }}>
                            <Chip tom={TOM_STATUS_APONTAMENTO[a.status]}>{ROTULO_STATUS_APONTAMENTO[a.status]}</Chip>
                            {a.prioridade === 'alta' && a.status === 'ativo' && (
                              <span className="t-caption" style={{ color: 'var(--danger)', fontWeight: 600 }}>
                                · prioridade alta
                              </span>
                            )}
                            {a.disciplinas.length > 0 && (
                              <span className="t-caption">
                                · {a.disciplinas.map((d) => siglaOuNome(dados.disciplinasProjeto, d.discipline_id)).filter(Boolean).join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <DashboardProjetos dados={dados} />
          )}
        </div>
      </div>

      <Sheet
        aberto={Boolean(editando)}
        titulo={editando?.id ? `Nº ${editando.numero} — ${ROTULO_STATUS_APONTAMENTO[editando.status]}` : 'Criar apontamento'}
        onFechar={() => setEditando(null)}
        rodape={
          abaDetalhe === 'detalhes' && (
            <div className="row-flex">
              <button className="btn btn-secondary grow" onClick={() => setEditando(null)}>Cancelar</button>
              <button
                className="btn btn-primary grow" onClick={salvar}
                disabled={salvando || !editando?.titulo?.trim()}
              >
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          )
        }
      >
        {editando && (
          <div className="stack-2">
            {editando.id && (
              <div className="row-flex" style={{ flexWrap: 'wrap' }}>
                {editando.status === 'ativo' ? (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => mudarStatus('resolvido')}>
                      <Icon name="check" size={14} /> Resolver
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => mudarStatus('reprovado')}>
                      <Icon name="x" size={14} /> Reprovar
                    </button>
                  </>
                ) : (
                  <button className="btn btn-secondary btn-sm" onClick={() => mudarStatus('ativo')}>Reabrir</button>
                )}
              </div>
            )}

            <Segmentos
              valor={abaDetalhe} onChange={setAbaDetalhe}
              opcoes={[
                { valor: 'detalhes', rotulo: 'Detalhes' },
                { valor: 'disciplinas', rotulo: 'Disciplinas', contador: editando.disciplinas.length },
                { valor: 'comentarios', rotulo: 'Comentários', contador: editando.comentarios.length },
                { valor: 'historico', rotulo: 'Histórico', contador: editando.historico.length },
              ]}
            />

            {abaDetalhe === 'detalhes' && (
              <AbaDetalhes editando={editando} setEditando={setEditando} dados={dados} garantirSalvo={garantirSalvo} />
            )}
            {abaDetalhe === 'disciplinas' && (
              <AbaDisciplinas editando={editando} setEditando={setEditando} dados={dados} garantirSalvo={garantirSalvo} />
            )}
            {abaDetalhe === 'comentarios' && (
              <AbaComentarios editando={editando} setEditando={setEditando} dados={dados} perfil={perfil} garantirSalvo={garantirSalvo} />
            )}
            {abaDetalhe === 'historico' && <AbaHistorico editando={editando} dados={dados} />}
          </div>
        )}
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

/* ── Aba Detalhes ─────────────────────────────────────────── */

function AbaDetalhes({ editando, setEditando, dados, garantirSalvo }) {
  const links = useLinksDeAnexos(editando.anexos)
  const [enviandoAnexo, setEnviandoAnexo] = useState(0)
  const [novaEtiqueta, setNovaEtiqueta] = useState('')

  const alternar = (campo, id) => {
    setEditando((p) => {
      const atual = p[campo] || []
      const novo = atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]
      return { ...p, [campo]: novo }
    })
  }

  const enviarAnexos = async (arquivos) => {
    setEnviandoAnexo((n) => n + arquivos.length)
    try {
      const base = await garantirSalvo()
      if (!base) return
      for (const arquivo of arquivos) await dados.adicionarAnexoApontamento(base.id, arquivo)
    } finally {
      setEnviandoAnexo((n) => Math.max(0, n - arquivos.length))
    }
  }

  const removerAnexo = async (anexo) => {
    if (!editando.id) return
    await dados.removerAnexoApontamento(editando.id, anexo)
  }

  const adicionarEtiqueta = () => {
    const v = novaEtiqueta.trim()
    if (!v) return
    setEditando((p) => (p.etiquetas.includes(v) ? p : { ...p, etiquetas: [...p.etiquetas, v] }))
    setNovaEtiqueta('')
  }

  return (
    <div className="stack-2">
      <Campo label="Título">
        <input
          className="ipt" autoFocus value={editando.titulo || ''}
          onChange={(e) => setEditando((p) => ({ ...p, titulo: e.target.value }))}
          placeholder="Uma frase curta e específica"
        />
      </Campo>
      <Campo label="Descrição">
        <TextareaComAudio
          value={editando.descricao || ''}
          onChange={(e) => setEditando((p) => ({ ...p, descricao: e.target.value }))}
          placeholder="Contexto suficiente para quem for resolver."
        />
      </Campo>
      <div className="row-flex">
        <div className="grow">
          <Campo label="Visibilidade">
            <select
              className="sel" value={editando.visibilidade || 'rascunho'}
              onChange={(e) => setEditando((p) => ({ ...p, visibilidade: e.target.value }))}
            >
              {VISIBILIDADE_APONTAMENTO.map((v) => <option key={v} value={v}>{ROTULO_VISIBILIDADE_APONTAMENTO[v]}</option>)}
            </select>
          </Campo>
        </div>
        <div className="grow">
          <Campo label="Prioridade">
            <select
              className="sel" value={editando.prioridade || 'media'}
              onChange={(e) => setEditando((p) => ({ ...p, prioridade: e.target.value }))}
            >
              {PRIORIDADES.map((x) => <option key={x} value={x}>{ROTULO_PRIORIDADE[x]}</option>)}
            </select>
          </Campo>
        </div>
      </div>
      <Campo label="Etapa de criação">
        <select
          className="sel" value={editando.stage_id || ''}
          onChange={(e) => setEditando((p) => ({ ...p, stage_id: e.target.value || null }))}
        >
          <option value="">Não definida</option>
          {dados.etapasProjeto.filter((e) => e.ativo !== false).map((e) => (
            <option key={e.id} value={e.id}>{e.nome}</option>
          ))}
        </select>
      </Campo>
      <Campo label="Categorias" dica="Toque para marcar quantas fizerem sentido.">
        <div className="row-wrap">
          {dados.categoriasProjeto.filter((c) => c.ativo !== false).map((c) => (
            <ChipToggle key={c.id} ativo={editando.category_ids.includes(c.id)} onClick={() => alternar('category_ids', c.id)}>
              {c.nome}
            </ChipToggle>
          ))}
          {dados.categoriasProjeto.length === 0 && <div className="t-caption">Nenhuma categoria cadastrada ainda.</div>}
        </div>
      </Campo>
      <Campo label="Locais">
        <div className="row-wrap">
          {dados.locais.filter((l) => l.ativo !== false).map((l) => (
            <ChipToggle key={l.id} ativo={editando.location_ids.includes(l.id)} onClick={() => alternar('location_ids', l.id)}>
              {l.nome}
            </ChipToggle>
          ))}
          {dados.locais.length === 0 && <div className="t-caption">Nenhum local cadastrado ainda.</div>}
        </div>
      </Campo>
      <Campo label="Etiquetas">
        <div className="row-wrap" style={{ marginBottom: 8 }}>
          {editando.etiquetas.map((et) => (
            <ChipToggle key={et} ativo onClick={() => setEditando((p) => ({ ...p, etiquetas: p.etiquetas.filter((x) => x !== et) }))}>
              {et} ✕
            </ChipToggle>
          ))}
        </div>
        <div className="row-flex">
          <input
            className="ipt" value={novaEtiqueta} onChange={(e) => setNovaEtiqueta(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarEtiqueta() } }}
            placeholder="Digite e tecle Enter"
          />
          <button className="btn btn-secondary" onClick={adicionarEtiqueta}>Adicionar</button>
        </div>
      </Campo>
      <Campo label="Anexos" dica={!editando.id ? 'Salve o apontamento para anexar arquivos.' : undefined}>
        {editando.id ? (
          <CampoAnexos
            anexos={editando.anexos} links={links} enviando={enviandoAnexo}
            onAdicionar={enviarAnexos} onRemover={removerAnexo}
          />
        ) : (
          <button className="btn btn-secondary btn-sm" disabled>Salve para anexar</button>
        )}
      </Campo>
    </div>
  )
}

/* ── Aba Disciplinas ──────────────────────────────────────── */

function AbaDisciplinas({ editando, setEditando, dados, garantirSalvo }) {
  const [novaDisciplina, setNovaDisciplina] = useState('')

  const disciplinasDisponiveis = dados.disciplinasProjeto
    .filter((d) => d.ativo !== false)
    .filter((d) => !editando.disciplinas.some((x) => x.discipline_id === d.id))

  const atualizarLinha = async (linha, campos) => {
    const fresco = await dados.salvarDisciplinaApontamento(editando.id, { ...linha, ...campos })
    if (fresco) setEditando(fresco)
  }

  const removerLinha = async (linha) => {
    const fresco = await dados.removerDisciplinaApontamento(editando.id, linha.id)
    if (fresco) setEditando(fresco)
  }

  const adicionar = async () => {
    if (!novaDisciplina) return
    const base = await garantirSalvo()
    if (!base) return
    const fresco = await dados.salvarDisciplinaApontamento(base.id, { discipline_id: novaDisciplina })
    if (fresco) setEditando(fresco)
    setNovaDisciplina('')
  }

  if (!editando.id) {
    return <div className="t-caption">Salve o apontamento na aba Detalhes para adicionar disciplinas.</div>
  }

  return (
    <div className="stack-2">
      {editando.disciplinas.length === 0 && <div className="t-caption">Nenhuma disciplina envolvida ainda.</div>}

      <div className="stack-1">
        {editando.disciplinas.map((linha) => (
          <div key={linha.id} className="card-flat" style={{ padding: 10 }}>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <span className="t-strong" style={{ fontSize: 14 }}>
                {siglaOuNome(dados.disciplinasProjeto, linha.discipline_id) || 'Disciplina removida'}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => removerLinha(linha)} aria-label="Remover disciplina">
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="row-wrap" style={{ alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 140px' }}>
                <Campo label="Status">
                  <select
                    className="sel" value={linha.status_id || ''}
                    onChange={(e) => atualizarLinha(linha, { status_id: e.target.value || null })}
                  >
                    <option value="">Sem status</option>
                    {dados.statusDisciplinaProjeto.filter((s) => s.ativo !== false).map((s) => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))}
                  </select>
                </Campo>
              </div>
              <div style={{ flex: '1 1 120px' }}>
                <Campo label="Prazo">
                  <input
                    className="ipt" type="date" value={linha.prazo || ''}
                    onChange={(e) => atualizarLinha(linha, { prazo: e.target.value || null })}
                  />
                </Campo>
              </div>
              <div style={{ flex: '1 1 120px' }}>
                <Campo label="Concluído em">
                  <input
                    className="ipt" type="date" value={linha.concluido_em || ''}
                    onChange={(e) => atualizarLinha(linha, { concluido_em: e.target.value || null })}
                  />
                </Campo>
              </div>
            </div>
          </div>
        ))}
      </div>

      {disciplinasDisponiveis.length > 0 ? (
        <div className="row-flex">
          <select className="sel grow" value={novaDisciplina} onChange={(e) => setNovaDisciplina(e.target.value)}>
            <option value="">Escolha uma disciplina…</option>
            {disciplinasDisponiveis.map((d) => (
              <option key={d.id} value={d.id}>{d.sigla ? `${d.sigla} — ${d.nome}` : d.nome}</option>
            ))}
          </select>
          <button className="btn btn-secondary" onClick={adicionar} disabled={!novaDisciplina}>Adicionar</button>
        </div>
      ) : (
        dados.disciplinasProjeto.length === 0 && (
          <div className="t-caption">Nenhuma disciplina cadastrada — cadastre em Configurações.</div>
        )
      )}
    </div>
  )
}

/* ── Aba Comentários ──────────────────────────────────────── */

function AbaComentarios({ editando, setEditando, dados, perfil, garantirSalvo }) {
  const [texto, setTexto] = useState('')
  const [arquivo, setArquivo] = useState(null)
  const [enviando, setEnviando] = useState(false)

  if (!editando.id) {
    return <div className="t-caption">Salve o apontamento na aba Detalhes para comentar.</div>
  }

  const enviar = async () => {
    if (!texto.trim()) return
    setEnviando(true)
    try {
      const base = await garantirSalvo()
      if (!base) return
      let anexo = null
      if (arquivo) {
        const r = await enviarAnexoComentario({ arquivo, obraId: base.worksite_id, noteId: base.id })
        if (r.erro) { dados.avisarErro(r.erro); return }
        anexo = { caminho: r.caminho, nome: r.nome }
      }
      const fresco = await dados.salvarComentarioApontamento(base.id, texto.trim(), anexo)
      if (fresco) { setEditando(fresco); setTexto(''); setArquivo(null) }
    } finally {
      setEnviando(false)
    }
  }

  const apagar = async (comentarioId) => {
    const fresco = await dados.apagarComentarioApontamento(editando.id, comentarioId)
    if (fresco) setEditando(fresco)
  }

  return (
    <div className="stack-2">
      {editando.comentarios.length === 0 ? (
        <div className="t-caption">Nenhum comentário ainda.</div>
      ) : (
        <div className="stack-1">
          {editando.comentarios.map((c) => (
            <div key={c.id} className="card-flat" style={{ padding: 10 }}>
              <div className="row-between">
                <span className="t-strong" style={{ fontSize: 13 }}>{dados.perfilPorId(c.autor_id)?.nome || 'Alguém'}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => apagar(c.id)} aria-label="Apagar comentário">
                  <Icon name="x" size={14} />
                </button>
              </div>
              <div style={{ fontSize: 14, marginTop: 4, whiteSpace: 'pre-line' }}>{c.texto}</div>
              {c.anexo_caminho && (
                <div className="t-caption" style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="anexo" size={13} /> {c.anexo_nome || 'Anexo'}
                </div>
              )}
              <div className="t-caption" style={{ marginTop: 6 }}>{formatarData(c.created_at?.slice(0, 10))}</div>
            </div>
          ))}
        </div>
      )}

      <div>
        <TextareaComAudio value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva um comentário…" />
        <div className="row-between" style={{ marginTop: 8 }}>
          <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
            <Icon name="anexo" size={16} /> {arquivo ? arquivo.name : 'Anexar'}
            <input
              type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
              onChange={(e) => setArquivo(e.target.files?.[0] || null)}
            />
          </label>
          <button className="btn btn-primary btn-sm" onClick={enviar} disabled={enviando || !texto.trim()}>
            {enviando ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Aba Histórico ────────────────────────────────────────── */

function AbaHistorico({ editando, dados }) {
  if (editando.historico.length === 0) return <div className="t-caption">Sem histórico ainda.</div>
  return (
    <div className="stack-1">
      {editando.historico.map((h) => (
        <div key={h.id} className="row-between" style={{ fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <span>
            {dados.perfilPorId(h.autor_id)?.nome || 'Alguém'}
            {' '}mudou para <strong>{ROTULO_STATUS_APONTAMENTO[h.para_status] || h.para_status}</strong>
            {h.de_status && <> (de {ROTULO_STATUS_APONTAMENTO[h.de_status] || h.de_status})</>}
          </span>
          <span className="t-caption">{formatarData(h.created_at?.slice(0, 10))}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Dashboard ────────────────────────────────────────────── */

const CORES_STATUS = { ativo: 'var(--danger)', resolvido: 'var(--success)', reprovado: 'var(--text-3)' }
const CORES_PRIORIDADE = { baixa: 'var(--text-3)', media: 'var(--primary)', alta: 'var(--danger)' }
const PALETA = ['var(--primary)', 'var(--success)', 'var(--danger)', 'var(--info)', 'var(--text-3)', 'var(--primary-dark)']

function Rosca({ segmentos }) {
  const total = segmentos.reduce((s, x) => s + x.valor, 0)
  const r = 70; const cx = 90; const cy = 90; const largura = 26
  const circ = 2 * Math.PI * r
  let acumulado = 0
  return (
    <svg viewBox="0 0 180 180" style={{ width: '100%', maxWidth: 260, display: 'block', margin: '0 auto' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={largura} />
      {total > 0 && segmentos.filter((s) => s.valor > 0).map((s) => {
        const comprimento = (s.valor / total) * circ
        const el = (
          <circle
            key={s.rotulo} cx={cx} cy={cy} r={r} fill="none" stroke={s.cor} strokeWidth={largura}
            strokeDasharray={`${comprimento} ${circ - comprimento}`}
            strokeDashoffset={-acumulado}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        )
        acumulado += comprimento
        return el
      })}
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 26, fontWeight: 700, fill: 'var(--text)' }}>
        {total}
      </text>
    </svg>
  )
}

function BarraEmpilhada({ rotulo, segmentos }) {
  const total = segmentos.reduce((s, x) => s + x.valor, 0)
  return (
    <div>
      <div className="row-between" style={{ marginBottom: 6 }}>
        <span className="t-caption">{rotulo}</span>
        <span className="t-caption">{total}</span>
      </div>
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'var(--surface-2)' }}>
        {total === 0
          ? <div style={{ width: '100%' }} />
          : segmentos.filter((s) => s.valor > 0).map((s) => (
            <div key={s.rotulo} title={`${s.rotulo}: ${s.valor}`} style={{ width: `${(s.valor / total) * 100}%`, background: s.cor }} />
          ))}
      </div>
    </div>
  )
}

function Legenda({ itens }) {
  return (
    <div className="row-wrap" style={{ gap: 12, marginTop: 4 }}>
      {itens.map((i) => (
        <span key={i.rotulo} className="t-caption" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: i.cor, display: 'inline-block' }} />
          {i.rotulo}
        </span>
      ))}
    </div>
  )
}

function DashboardProjetos({ dados }) {
  const [visao, setVisao] = useState('resumo')
  const apontamentos = dados.apontamentos

  const resumo = useMemo(() => STATUS_APONTAMENTO.map((s) => ({
    rotulo: ROTULO_STATUS_APONTAMENTO[s], cor: CORES_STATUS[s],
    valor: apontamentos.filter((a) => a.status === s).length,
  })), [apontamentos])

  const disciplinaPrioridade = useMemo(() => dados.disciplinasProjeto
    .filter((d) => d.ativo !== false)
    .map((d) => ({
      rotulo: d.sigla || d.nome,
      segmentos: PRIORIDADES.map((p) => ({
        rotulo: ROTULO_PRIORIDADE[p], cor: CORES_PRIORIDADE[p],
        valor: apontamentos.filter((a) => a.prioridade === p && a.disciplinas.some((x) => x.discipline_id === d.id)).length,
      })),
    }))
    .filter((r) => r.segmentos.some((s) => s.valor > 0)), [dados.disciplinasProjeto, apontamentos])

  const localPrioridade = useMemo(() => dados.locais
    .filter((l) => l.ativo !== false)
    .map((l) => ({
      rotulo: l.nome,
      segmentos: PRIORIDADES.map((p) => ({
        rotulo: ROTULO_PRIORIDADE[p], cor: CORES_PRIORIDADE[p],
        valor: apontamentos.filter((a) => a.prioridade === p && a.location_ids.includes(l.id)).length,
      })),
    }))
    .filter((r) => r.segmentos.some((s) => s.valor > 0)), [dados.locais, apontamentos])

  const disciplinasAtivas = useMemo(() => dados.disciplinasProjeto.filter((d) => d.ativo !== false), [dados.disciplinasProjeto])

  const localDisciplina = useMemo(() => dados.locais
    .filter((l) => l.ativo !== false)
    .map((l) => ({
      rotulo: l.nome,
      segmentos: disciplinasAtivas.map((d, i) => ({
        rotulo: d.sigla || d.nome, cor: PALETA[i % PALETA.length],
        valor: apontamentos.filter((a) => a.location_ids.includes(l.id) && a.disciplinas.some((x) => x.discipline_id === d.id)).length,
      })),
    }))
    .filter((r) => r.segmentos.some((s) => s.valor > 0)), [dados.locais, disciplinasAtivas, apontamentos])

  const evolucao = useMemo(() => {
    if (apontamentos.length === 0) return null
    const dias = [...apontamentos].map((a) => a.created_at.slice(0, 10)).sort()
    const inicio = dias[0]
    const hoje = new Date().toISOString().slice(0, 10)
    const resolvidosPor = apontamentos
      .map((a) => a.historico.find((h) => h.para_status === 'resolvido')?.created_at?.slice(0, 10))
      .filter(Boolean).sort()

    const totalDias = Math.max(1, (new Date(hoje) - new Date(inicio)) / 86400000)
    const pontos = 24
    const linha = (datas) => Array.from({ length: pontos + 1 }, (_, i) => {
      const data = new Date(new Date(inicio).getTime() + (totalDias * i / pontos) * 86400000).toISOString().slice(0, 10)
      return datas.filter((d) => d <= data).length
    })
    return { criados: linha(dias), resolvidos: linha(resolvidosPor), max: dias.length }
  }, [apontamentos])

  return (
    <div className="stack-2">
      <Segmentos
        valor={visao} onChange={setVisao}
        opcoes={[
          { valor: 'resumo', rotulo: 'Resumo de Status' },
          { valor: 'disc_prio', rotulo: 'Disciplinas e Prioridade' },
          { valor: 'local_prio', rotulo: 'Locais e Prioridade' },
          { valor: 'local_disc', rotulo: 'Locais e Disciplinas' },
          { valor: 'evolucao', rotulo: 'Curva de Evolução' },
        ]}
      />

      {visao === 'resumo' && (
        <div className="card-flat">
          <Rosca segmentos={resumo} />
          <Legenda itens={resumo} />
        </div>
      )}

      {visao === 'disc_prio' && (
        <div className="card-flat stack-2">
          {disciplinaPrioridade.length === 0
            ? <div className="t-caption">Sem dados suficientes ainda.</div>
            : disciplinaPrioridade.map((r) => <BarraEmpilhada key={r.rotulo} rotulo={r.rotulo} segmentos={r.segmentos} />)}
          <Legenda itens={PRIORIDADES.map((p) => ({ rotulo: ROTULO_PRIORIDADE[p], cor: CORES_PRIORIDADE[p] }))} />
        </div>
      )}

      {visao === 'local_prio' && (
        <div className="card-flat stack-2">
          {localPrioridade.length === 0
            ? <div className="t-caption">Sem dados suficientes ainda.</div>
            : localPrioridade.map((r) => <BarraEmpilhada key={r.rotulo} rotulo={r.rotulo} segmentos={r.segmentos} />)}
          <Legenda itens={PRIORIDADES.map((p) => ({ rotulo: ROTULO_PRIORIDADE[p], cor: CORES_PRIORIDADE[p] }))} />
        </div>
      )}

      {visao === 'local_disc' && (
        <div className="card-flat stack-2">
          {localDisciplina.length === 0
            ? <div className="t-caption">Sem dados suficientes ainda.</div>
            : localDisciplina.map((r) => <BarraEmpilhada key={r.rotulo} rotulo={r.rotulo} segmentos={r.segmentos} />)}
          <Legenda itens={disciplinasAtivas.map((d, i) => ({ rotulo: d.sigla || d.nome, cor: PALETA[i % PALETA.length] }))} />
        </div>
      )}

      {visao === 'evolucao' && (
        <div className="card-flat">
          {!evolucao ? <div className="t-caption">Sem apontamentos ainda.</div> : <CurvaEvolucao dados={evolucao} />}
          <Legenda itens={[{ rotulo: 'Criados (acumulado)', cor: 'var(--graphite)' }, { rotulo: 'Resolvidos (acumulado)', cor: 'var(--success)' }]} />
        </div>
      )}
    </div>
  )
}

function CurvaEvolucao({ dados }) {
  const W = 600; const H = 160; const PAD = 10
  const max = Math.max(1, dados.max)
  const passo = W / (dados.criados.length - 1)
  const y = (v) => H - PAD - (v / max) * (H - 2 * PAD)
  const linha = (serie) => serie.map((v, i) => `${i * passo},${y(v)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 160, display: 'block' }}>
      <polyline points={linha(dados.criados)} fill="none" stroke="var(--graphite)" strokeWidth={2} />
      <polyline points={linha(dados.resolvidos)} fill="none" stroke="var(--success)" strokeWidth={2} />
    </svg>
  )
}
