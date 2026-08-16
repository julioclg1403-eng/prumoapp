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
  hojeISO, formatarData, situacaoPendencia, contarPendencias,
  pendenciasGerais, pendenciasTaticas, fecharSemanaTatica, COLUNAS_QUADRO_PENDENCIA,
  inicioDaSemana, somarDias, rotuloDaSemana,
  ROTULO_PRIORIDADE, PRIORIDADES, plural,
} from '../lib/dominio'
import {
  Icon, Chip, PageHeader, Segmentos, Sheet, Campo, Confirmar, Vazio, Indicador,
  BotaoRelatorio, RelatorioFolha, SecaoRelatorio, TabelaRelatorio,
  CampoFotos, VisorFoto, useLinksDeFotos, TextareaComAudio,
} from '../components'

function normalizarComparar(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
}

export default function Pendencias({ perfil, params = {} }) {
  const dados = useDados()
  const hoje = hojeISO()
  const podeExcluir = perfil.role !== 'campo'
  const [categoria, setCategoria] = useState('geral')
  const [filtro, setFiltro] = useState('aberta')
  const [editando, setEditando] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [destaque, setDestaque] = useState(params.destacar || null)
  const [importandoPDF, setImportandoPDF] = useState(false)
  const [enviandoFoto, setEnviandoFoto] = useState(0)
  const [fotoAberta, setFotoAberta] = useState(null)
  const [inicio, setInicio] = useState(() => inicioDaSemana(hoje))
  const [verFechamentoTatico, setVerFechamentoTatico] = useState(false)
  const [visao, setVisao] = useState('lista')
  const [busca, setBusca] = useState('')

  const links = useLinksDeFotos(editando?.fotos)

  /* Tático (vem do PDF de restrições, reimportado semana a semana)
     é uma categoria à parte do dia a dia (manual ou vindo do diário)
     — cada uma com seu próprio filtro de aberta/atrasada/resolvida.
     A lista do tático é a semana navegada, não "todo tático que já
     existiu": o mesmo item de restrição pode se repetir várias
     semanas seguidas enquanto não resolve (fecharSemanaTatica, pela
     marca de confirmação de cada reimporte), e cada semana fechada
     mantém seu próprio retrato em % pra sempre. */
  const geraisTodas = pendenciasGerais(dados.pendencias)
  const taticasTodas = pendenciasTaticas(dados.pendencias)
  const semanaTatica = useMemo(
    () => fecharSemanaTatica(taticasTodas, dados.semanasTaticas, inicio),
    [taticasTodas, dados.semanasTaticas, inicio],
  )
  const pendenciasDaCategoria = categoria === 'tatico' ? semanaTatica.itens : geraisTodas

  /* A busca filtra o que aparece nos tópicos (Lista e Quadro, os
     dois), mas nunca o fechamento tático (semanaTatica.percentual
     etc.) — isso é um retrato fechado da semana, não pode balançar
     conforme alguém digita numa caixa de busca. */
  const pendenciasFiltradas = useMemo(() => {
    const alvo = normalizarComparar(busca)
    if (!alvo) return pendenciasDaCategoria
    return pendenciasDaCategoria.filter((p) =>
      normalizarComparar(p.titulo).includes(alvo) || normalizarComparar(p.descricao).includes(alvo))
  }, [pendenciasDaCategoria, busca])

  const cont = contarPendencias(pendenciasFiltradas, hoje)

  /* Dia a dia e Tático usam os mesmos 3 tópicos (status exato: A
     Fazer/Em Andamento/Concluído) — mesmo vocabulário em qualquer
     categoria e em qualquer visão (Lista ou Quadro). */
  const lista = useMemo(() => {
    return pendenciasFiltradas.filter((p) => p.status === filtro)
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
  }, [pendenciasFiltradas, filtro, hoje])

  const abrirNova = () =>
    setEditando({
      titulo: '', descricao: '', prioridade: 'media', resolucao: '', fotos: [],
      prazo: '', responsavel_id: perfil.id, status: 'aberta',
    })

  const salvar = async () => {
    if (!editando?.titulo?.trim()) return
    setSalvando(true)
    const salva = await dados.salvarPendencia({
      ...editando,
      titulo: editando.titulo.trim(),
      descricao: (editando.descricao || '').trim(),
      resolucao: (editando.resolucao || '').trim(),
      prazo: editando.prazo || null,
    })
    setSalvando(false)
    if (salva) setEditando(null)
  }

  /* A foto precisa de uma pendência que já exista no banco, pra se
     pendurar nela. Se a pessoa ainda está criando uma nova (sem id)
     e já quer anexar foto, salva primeiro -- mesma saída que o
     diário usa (garantirSalvo), pelo mesmo motivo: não faz sentido
     pedir "salve antes de fotografar". */
  const garantirSalvo = async () => {
    if (editando.id) return editando
    if (!editando.titulo?.trim()) return null
    const salva = await dados.salvarPendencia({
      ...editando,
      titulo: editando.titulo.trim(),
      descricao: (editando.descricao || '').trim(),
      prazo: editando.prazo || null,
    })
    if (salva) setEditando(salva)
    return salva
  }

  const enviarFotosPendencia = async (arquivos) => {
    setEnviandoFoto((n) => n + arquivos.length)
    try {
      const base = await garantirSalvo()
      if (!base) return
      const novas = []
      for (const arquivo of arquivos) {
        const f = await dados.adicionarFotoPendencia(base.id, arquivo)
        if (f) novas.push(f)
      }
      if (novas.length) setEditando((p) => ({ ...p, fotos: [...(p.fotos || []), ...novas] }))
    } finally {
      setEnviandoFoto((n) => Math.max(0, n - arquivos.length))
    }
  }

  const removerFotoPendencia = async (foto) => {
    const ok = await dados.removerFotoPendencia(foto)
    if (ok) setEditando((p) => ({ ...p, fotos: (p.fotos || []).filter((f) => f.id !== foto.id) }))
  }

  const pedirAlternar = (p) => {
    if (p.status === 'resolvida') {
      setConfirmar({
        titulo: 'Reabrir pendência?',
        texto: `«${p.titulo}» volta para a lista de abertas.`,
        rotuloOk: 'Reabrir',
        onOk: async () => { setConfirmar(null); await dados.alternarPendencia(p.id) },
      })
    } else {
      dados.alternarPendencia(p.id)
    }
  }

  const pedirExcluir = (p) => {
    setConfirmar({
      titulo: 'Excluir pendência?',
      texto: `«${p.titulo}» sai da lista pra sempre, junto com fotos e resolução registradas. Isso não tem volta.`,
      rotuloOk: 'Excluir', perigo: true,
      onOk: async () => { setConfirmar(null); await dados.excluirPendencia(p.id) },
    })
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
        {categoria === 'geral' && (
          <button onClick={abrirNova} aria-label="Nova pendência"><Icon name="mais_sinal" size={22} /></button>
        )}
      </div>

      <div className="page">
        <PageHeader
          titulo="Pendências"
          sub={`${plural(lista.length, 'item', 'itens')} neste filtro`}
          acao={
            <div className="row-flex">
              {lista.length > 0 && <BotaoRelatorio />}
              {categoria === 'tatico' ? (
                <>
                  <button
                    className={`btn btn-sm ${verFechamentoTatico ? 'btn-dark' : 'btn-secondary'}`}
                    onClick={() => setVerFechamentoTatico((v) => !v)}
                  >
                    Fechamento
                  </button>
                  <button className="btn btn-secondary" onClick={() => setImportandoPDF(true)}>
                    Importar PDF tático
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={abrirNova}><Icon name="mais_sinal" size={18} /> Nova</button>
              )}
            </div>
          }
        />

        <div className="stack-2">
          <Segmentos
            valor={categoria} onChange={(v) => { setCategoria(v); setFiltro('aberta') }}
            opcoes={[
              { valor: 'geral', rotulo: 'Dia a dia', contador: geraisTodas.length },
              { valor: 'tatico', rotulo: 'Tático', contador: semanaTatica.total },
            ]}
          />

          <div style={{ position: 'relative' }}>
            <Icon
              name="busca" size={16}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}
            />
            <input
              className="ipt" style={{ paddingLeft: 34, width: '100%' }}
              value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar pendência por título ou descrição…"
            />
          </div>

          {categoria === 'geral' && (
            <Segmentos
              valor={visao} onChange={setVisao}
              opcoes={[{ valor: 'lista', rotulo: 'Lista' }, { valor: 'quadro', rotulo: 'Quadro' }]}
            />
          )}

          {categoria === 'tatico' && (
            <div className="row-between" style={{ flexWrap: 'wrap' }}>
              <div className="row-flex">
                <button className="btn btn-secondary btn-sm" onClick={() => setInicio(somarDias(inicio, -7))}>
                  <Icon name="voltar" size={16} />
                </button>
                <button
                  className={`btn btn-sm ${inicio === inicioDaSemana(hoje) ? 'btn-dark' : 'btn-secondary'}`}
                  onClick={() => setInicio(inicioDaSemana(hoje))}
                >
                  {inicio === inicioDaSemana(hoje) ? 'Esta semana' : rotuloDaSemana(inicio)}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setInicio(somarDias(inicio, 7))}>
                  <Icon name="avancar" size={16} />
                </button>
              </div>
            </div>
          )}

          {categoria === 'tatico' && verFechamentoTatico && (
            <div className="card stack-2">
              <div className="row-between">
                <div className="t-micro">Fechamento da semana tática</div>
                <span className="t-num t-strong" style={{ fontSize: 20, color: 'var(--success)' }}>
                  {semanaTatica.percentual}%
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8 }}>
                <Indicador rotulo="Confirmadas" valor={semanaTatica.total} />
                <Indicador rotulo="Resolvidas" valor={semanaTatica.resolvidas} tom={semanaTatica.resolvidas ? 'success' : undefined} />
                <Indicador rotulo="Em aberto" valor={semanaTatica.abertas} tom={semanaTatica.abertas ? 'danger' : undefined} />
              </div>
              <div className="t-caption" style={{ lineHeight: 1.5 }}>
                Conta as restrições que a planilha tática confirmou pra essa semana (reimportada ou não de
                novo) — resolvidas sobre o total confirmado.
              </div>
            </div>
          )}

          {categoria === 'geral' && visao === 'quadro' ? (
            <QuadroPendencias
              itens={pendenciasFiltradas} dados={dados} destaque={destaque}
              onAbrir={(p) => { setDestaque(null); setEditando({ ...p, prazo: p.prazo || '', resolucao: p.resolucao || '', fotos: p.fotos || [] }) }}
              onMover={(p, status) => dados.mudarStatusPendencia(p.id, status)}
            />
          ) : (
            <>
          <Segmentos
            valor={filtro} onChange={setFiltro}
            opcoes={COLUNAS_QUADRO_PENDENCIA.map((c) => (
              { valor: c.status, rotulo: c.rotulo, contador: pendenciasFiltradas.filter((p) => p.status === c.status).length }
            ))}
          />

          {lista.length === 0 ? (
            <div className="card-flat">
              <Vazio
                titulo="Nada por aqui"
                texto={
                  categoria === 'tatico'
                    ? 'Nenhuma pendência tática neste tópico. Importe o PDF do planejamento tático para trazer as da semana.'
                    : 'Nenhuma pendência neste tópico. Registre o que precisa de alguém para resolver.'
                }
                acao={
                  categoria === 'tatico'
                    ? <button className="btn btn-primary" onClick={() => setImportandoPDF(true)}>Importar PDF tático</button>
                    : <button className="btn btn-primary" onClick={abrirNova}>Nova pendência</button>
                }
              />
            </div>
          ) : (
            <div className="stack-1">
              {lista.map(({ p, s }) => {
                const resolvida = p.status === 'resolvida'
                const indiceTopico = COLUNAS_QUADRO_PENDENCIA.findIndex((c) => c.status === p.status)
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

                      <button
                        className="btn btn-ghost btn-sm" disabled={indiceTopico === 0}
                        onClick={() => dados.mudarStatusPendencia(p.id, COLUNAS_QUADRO_PENDENCIA[indiceTopico - 1].status)}
                        aria-label={`Mover pra ${indiceTopico > 0 ? COLUNAS_QUADRO_PENDENCIA[indiceTopico - 1].rotulo : ''}`}
                        title={indiceTopico > 0 ? `Mover pra ${COLUNAS_QUADRO_PENDENCIA[indiceTopico - 1].rotulo}` : undefined}
                      >
                        <Icon name="voltar" size={16} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm" disabled={indiceTopico === COLUNAS_QUADRO_PENDENCIA.length - 1}
                        onClick={() => dados.mudarStatusPendencia(p.id, COLUNAS_QUADRO_PENDENCIA[indiceTopico + 1].status)}
                        aria-label={`Mover pra ${indiceTopico < COLUNAS_QUADRO_PENDENCIA.length - 1 ? COLUNAS_QUADRO_PENDENCIA[indiceTopico + 1].rotulo : ''}`}
                        title={indiceTopico < COLUNAS_QUADRO_PENDENCIA.length - 1 ? `Mover pra ${COLUNAS_QUADRO_PENDENCIA[indiceTopico + 1].rotulo}` : undefined}
                      >
                        <Icon name="avancar" size={16} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setEditando({ ...p, prazo: p.prazo || '', resolucao: p.resolucao || '', fotos: p.fotos || [] })}
                        aria-label="Editar"
                      >
                        <Icon name="editar" size={16} />
                      </button>
                      {podeExcluir && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => pedirExcluir(p)}
                          aria-label="Excluir"
                        >
                          <Icon name="x" size={16} />
                        </button>
                      )}
                    </div>

                    {resolvida && p.resolucao && (
                      <div className="t-caption" style={{ marginTop: 8, paddingLeft: 32, lineHeight: 1.5 }}>
                        <strong>Resolução:</strong> {p.resolucao}
                      </div>
                    )}
                    {p.fotos?.length > 0 && (
                      <div className="t-caption" style={{ marginTop: 6, paddingLeft: 32, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="camera" size={13} />
                        {plural(p.fotos.length, 'foto', 'fotos')}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
            </>
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
            <button
              className="btn btn-primary grow" onClick={salvar}
              disabled={salvando || !editando?.titulo?.trim()}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
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
            <TextareaComAudio
              value={editando?.descricao || ''}
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
          <Campo label="Resolução" dica="O que foi feito para resolver — fica registrado pra quem olhar depois.">
            <TextareaComAudio
              value={editando?.resolucao || ''}
              onChange={(e) => setEditando((p) => ({ ...p, resolucao: e.target.value }))}
              placeholder="Ex.: reforçado o escoramento e liberado pela fiscalização."
            />
          </Campo>
          <Campo label="Fotos">
            <CampoFotos
              fotos={editando?.fotos || []}
              links={links}
              enviando={enviandoFoto}
              onAdicionar={enviarFotosPendencia}
              onRemover={removerFotoPendencia}
              onAbrir={setFotoAberta}
            />
          </Campo>
        </div>
      </Sheet>

      <VisorFoto
        foto={fotoAberta}
        fotos={editando?.fotos || []}
        links={links}
        onFechar={() => setFotoAberta(null)}
        onIr={(delta) => {
          const lista = editando?.fotos || []
          const i = lista.findIndex((f) => f.id === fotoAberta.id)
          const prox = lista[(i + delta + lista.length) % lista.length]
          if (prox) setFotoAberta(prox)
        }}
      />

      <Confirmar
        aberto={Boolean(confirmar)}
        titulo={confirmar?.titulo}
        texto={confirmar?.texto}
        rotuloOk={confirmar?.rotuloOk}
        perigo={confirmar?.perigo}
        onOk={confirmar?.onOk}
        onCancelar={() => setConfirmar(null)}
      />

      <ImportarPDFTatico
        aberto={importandoPDF}
        onFechar={() => setImportandoPDF(false)}
        dados={dados}
        inicio={inicio}
      />

      <RelatorioFolha
        titulo="Pendências"
        sub={`${categoria === 'tatico' ? 'Tático' : 'Dia a dia'} · ${ROTULO_FILTRO[filtro]}`}
        obra={dados.obra.nome} org={dados.org.nome}
      >
        <SecaoRelatorio>
          <TabelaRelatorio
            colunas={['Título', 'Responsável', 'Prioridade', 'Prazo', 'Situação']}
            linhas={lista.map(({ p, s }) => [
              p.titulo,
              dados.perfilPorId(p.responsavel_id)?.nome || '—',
              ROTULO_PRIORIDADE[p.prioridade] || p.prioridade,
              p.prazo ? formatarData(p.prazo) : '—',
              s.rotulo,
            ])}
          />
        </SecaoRelatorio>
      </RelatorioFolha>
    </>
  )
}

const ROTULO_FILTRO = {
  abertas: 'Em aberto', atrasadas: 'Atrasadas', resolvidas: 'Resolvidas', todas: 'Todas',
  aberta: 'A Fazer', em_andamento: 'Em Andamento', resolvida: 'Concluído',
}

/* ── Quadro (visão Trello) ────────────────────────────────
   Só o Dia a dia tem quadro — Tático já tem seu próprio jeito de
   olhar a semana (Fechamento). Sem arrastar nada (o app inteiro é
   por toque, não por arrastar, e cartão lado a lado é ruim de
   arrastar no celular): cada cartão tem ‹ › pra mover pra coluna
   vizinha, uma de cada vez. */
function QuadroPendencias({ itens, dados, destaque, onAbrir, onMover }) {
  return (
    <div
      className="row-flex"
      style={{ alignItems: 'flex-start', overflowX: 'auto', gap: 10, paddingBottom: 8 }}
    >
      {COLUNAS_QUADRO_PENDENCIA.map((coluna, indiceColuna) => {
        const doCartoes = itens.filter((p) => p.status === coluna.status)
        return (
          <div key={coluna.status} style={{ flex: '0 0 260px', minWidth: 260 }} className="stack-1">
            <div className="row-between" style={{ padding: '0 2px' }}>
              <div className="t-micro">{coluna.rotulo}</div>
              <div className="t-caption">{doCartoes.length}</div>
            </div>
            {doCartoes.length === 0 ? (
              <div className="card-flat t-caption" style={{ textAlign: 'center', padding: 16 }}>—</div>
            ) : (
              doCartoes.map((p) => {
                const s = situacaoPendencia(p, hojeISO())
                return (
                  <div
                    key={p.id}
                    className="card-flat card-tap"
                    style={{ outline: destaque === p.id ? '2px solid var(--primary)' : undefined }}
                    onClick={() => onAbrir(p)}
                  >
                    <div className="t-strong" style={{ fontSize: 14 }}>{p.titulo}</div>
                    <div className="row-wrap" style={{ marginTop: 6, gap: 6, alignItems: 'center' }}>
                      {coluna.status !== 'resolvida' && <Chip tom={s.tom}>{s.rotulo}</Chip>}
                      {p.prioridade === 'alta' && coluna.status !== 'resolvida' && (
                        <span className="t-caption" style={{ color: 'var(--danger)', fontWeight: 600 }}>prioridade alta</span>
                      )}
                    </div>
                    <div className="t-caption" style={{ marginTop: 6 }}>
                      {dados.perfilPorId(p.responsavel_id)?.nome || 'Sem responsável'}
                    </div>
                    {p.fotos?.length > 0 && (
                      <div className="t-caption" style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name="camera" size={13} />{p.fotos.length}
                      </div>
                    )}
                    <div className="row-between" style={{ marginTop: 8 }}>
                      <button
                        className="btn btn-ghost btn-sm" disabled={indiceColuna === 0}
                        onClick={(e) => { e.stopPropagation(); onMover(p, COLUNAS_QUADRO_PENDENCIA[indiceColuna - 1].status) }}
                        aria-label="Mover pra coluna anterior"
                      >
                        <Icon name="voltar" size={14} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm" disabled={indiceColuna === COLUNAS_QUADRO_PENDENCIA.length - 1}
                        onClick={(e) => { e.stopPropagation(); onMover(p, COLUNAS_QUADRO_PENDENCIA[indiceColuna + 1].status) }}
                        aria-label="Mover pra próxima coluna"
                      >
                        <Icon name="avancar" size={14} />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── Importação do PDF tático ─────────────────────────────
   O relatório tático marca, com a cor de fundo da linha, quais
   restrições precisam ser resolvidas nesta semana (vermelho) —
   pdfTatico.js lê isso direto da página (não é texto, é a cor).
   Cada linha vermelha vira uma pendência: o prazo é a própria data
   de início do serviço (faz sentido — a restrição precisa sair do
   caminho antes disso), e o responsável do relatório não é ligado
   a um usuário do Prumo (são nomes de fora, tipo "LEONARDO"), então
   fica só como texto na descrição. */

function ImportarPDFTatico({ aberto, onFechar, dados, inicio }) {
  const [lendo, setLendo] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [importando, setImportando] = useState(false)
  const [feito, setFeito] = useState(null)

  const fechar = () => {
    setResultado(null); setNomeArquivo(''); setFeito(null); onFechar()
  }

  const onArquivo = async (e) => {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    e.target.value = ''
    setNomeArquivo(arquivo.name)
    setLendo(true)
    setResultado(null)
    setFeito(null)
    try {
      const { lerTaticoDoPDF } = await import('../lib/pdfTatico')
      setResultado(await lerTaticoDoPDF(arquivo))
    } catch (err) {
      setResultado({ itens: [], erroGeral: `Não consegui ler este arquivo. ${err.message}` })
    } finally {
      setLendo(false)
    }
  }

  /* Uma pendência já importada antes (mesmo título) não entra de
     novo — é assim que reimportar o relatório da semana seguinte
     não duplica o que já foi trazido, resolvido ou não. Mas ela
     PRECISA ser reconfirmada pra essa semana (existente.id junto),
     senão o fechamento semanal nunca saberia que essa restrição
     continua valendo agora, e não só na semana em que foi criada. */
  const itensParaCriar = useMemo(() => {
    const itens = resultado?.itens || []
    const taticasExistentes = pendenciasTaticas(dados.pendencias)
    return itens.map((it) => {
      const titulo = `${it.acao_remocao} — ${it.servico}`
      const existente = taticasExistentes.find((p) => normalizarComparar(p.titulo) === normalizarComparar(titulo))
      const linhasDescricao = [
        it.lote && `Lote: ${it.lote}`,
        it.responsavel && `Responsável (relatório): ${it.responsavel}`,
        it.motivo && `Motivo: ${it.motivo}`,
      ].filter(Boolean)
      return {
        item: it,
        jaExiste: Boolean(existente),
        existente,
        novo: {
          titulo,
          descricao: linhasDescricao.join('\n') || null,
          prazo: it.data_inicio_servico,
          prioridade: 'alta',
          origem: 'tatico_pdf',
        },
      }
    })
  }, [resultado, dados.pendencias])

  const novos = itensParaCriar.filter((x) => !x.jaExiste)

  const confirmar = async () => {
    setImportando(true)
    try {
      const salvas = await dados.salvarPendenciasEmLote(novos.map((x) => x.novo))
      const idsNovos = (salvas || []).map((s) => s.id)
      const idsExistentes = itensParaCriar.filter((x) => x.jaExiste).map((x) => x.existente.id)
      await dados.confirmarPendenciasTaticasDaSemana([...idsNovos, ...idsExistentes], inicio)
      setFeito({ criadas: salvas?.length || 0, jaExistiam: itensParaCriar.length - novos.length })
    } finally {
      setImportando(false)
    }
  }

  return (
    <Sheet aberto={aberto} titulo="Importar PDF tático" onFechar={fechar}>
      <div className="stack-2">
        {feito ? (
          <>
            <div className="alert success">
              {plural(feito.criadas, 'pendência criada', 'pendências criadas')}.
              {feito.jaExistiam > 0 && ` ${plural(feito.jaExistiam, 'item já existia e foi reconfirmado', 'itens já existiam e foram reconfirmados')} pra esta semana, sem duplicar.`}
            </div>
            <button className="btn btn-primary btn-block" onClick={fechar}>Fechar</button>
          </>
        ) : (
          <>
            <div className="t-caption" style={{ lineHeight: 1.5 }}>
              O planejamento tático, do jeito que o setor de planejamento manda. Puxo só as linhas marcadas
              em vermelho no relatório — "A Resolver na Semana" — e viram pendências, com prazo na data de
              início do serviço. Todo item (novo ou já existente) fica confirmado como parte de{' '}
              <strong>{rotuloDaSemana(inicio)}</strong> — troque a semana na tela antes de importar, se for
              outro período.
            </div>

            <label className="btn btn-secondary btn-block" style={{ cursor: 'pointer' }}>
              {lendo ? 'Lendo o PDF…' : nomeArquivo || 'Escolher arquivo .pdf'}
              <input
                type="file" accept=".pdf,application/pdf" onChange={onArquivo}
                style={{ display: 'none' }} disabled={lendo}
              />
            </label>

            {resultado?.erroGeral && <div className="alert danger">{resultado.erroGeral}</div>}

            {resultado && !resultado.erroGeral && (
              <>
                <div className="alert info">
                  {plural(novos.length, 'pendência nova', 'pendências novas')}
                  {itensParaCriar.length > novos.length
                    ? ` · ${plural(itensParaCriar.length - novos.length, 'item reconfirmado', 'itens reconfirmados')}`
                    : ''}.
                </div>

                <div style={{ maxHeight: 320, overflowY: 'auto' }} className="stack-1">
                  {itensParaCriar.map(({ item, jaExiste, novo }) => (
                    <div
                      key={item.linha}
                      style={{
                        fontSize: 12, padding: 8, borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--surface)', opacity: jaExiste ? 0.6 : 1,
                      }}
                    >
                      <strong>{novo.titulo}</strong>
                      <div style={{ marginTop: 4, whiteSpace: 'pre-line' }}>{novo.descricao}</div>
                      <div style={{ marginTop: 4 }}>
                        Prazo: {formatarData(novo.prazo)}
                        {jaExiste && ' · já existia, só reconfirma pra esta semana'}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="row-flex">
                  <button className="btn btn-secondary grow" onClick={() => setResultado(null)}>Corrigir</button>
                  <button
                    className="btn btn-primary grow" onClick={confirmar}
                    disabled={!itensParaCriar.length || importando}
                  >
                    {importando ? 'Importando…' : (
                      novos.length
                        ? `Importar ${plural(novos.length, 'pendência', 'pendências')}`
                        : 'Confirmar esta semana'
                    )}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}
