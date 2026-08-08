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
  pendenciasGerais, pendenciasTaticas,
  ROTULO_PRIORIDADE, PRIORIDADES, plural,
} from '../lib/dominio'
import {
  Icon, Chip, PageHeader, Segmentos, Sheet, Campo, Confirmar, Vazio,
  BotaoRelatorio, RelatorioFolha, SecaoRelatorio, TabelaRelatorio,
} from '../components'

function normalizarComparar(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
}

export default function Pendencias({ perfil, params = {} }) {
  const dados = useDados()
  const hoje = hojeISO()
  const [categoria, setCategoria] = useState('geral')
  const [filtro, setFiltro] = useState('abertas')
  const [editando, setEditando] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [destaque, setDestaque] = useState(params.destacar || null)
  const [importandoPDF, setImportandoPDF] = useState(false)

  /* Tático (vem do PDF de restrições, revisado semana a semana) é
     uma categoria à parte do dia a dia (manual ou vindo do diário)
     — cada uma com seu próprio filtro de aberta/atrasada/resolvida. */
  const geraisTodas = pendenciasGerais(dados.pendencias)
  const taticasTodas = pendenciasTaticas(dados.pendencias)
  const pendenciasDaCategoria = categoria === 'tatico' ? taticasTodas : geraisTodas

  const cont = contarPendencias(pendenciasDaCategoria, hoje)

  const lista = useMemo(() => {
    return filtrarPendencias(pendenciasDaCategoria, filtro, hoje)
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
  }, [pendenciasDaCategoria, filtro, hoje])

  const abrirNova = () =>
    setEditando({
      titulo: '', descricao: '', prioridade: 'media',
      prazo: '', responsavel_id: perfil.id, status: 'aberta',
    })

  const salvar = async () => {
    if (!editando?.titulo?.trim()) return
    setSalvando(true)
    const ok = await dados.salvarPendencia({
      ...editando,
      titulo: editando.titulo.trim(),
      descricao: (editando.descricao || '').trim(),
      prazo: editando.prazo || null,
    })
    setSalvando(false)
    if (ok) setEditando(null)
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
                <button className="btn btn-secondary" onClick={() => setImportandoPDF(true)}>
                  Importar PDF tático
                </button>
              ) : (
                <button className="btn btn-primary" onClick={abrirNova}><Icon name="mais_sinal" size={18} /> Nova</button>
              )}
            </div>
          }
        />

        <div className="stack-2">
          <Segmentos
            valor={categoria} onChange={(v) => { setCategoria(v); setFiltro('abertas') }}
            opcoes={[
              { valor: 'geral', rotulo: 'Dia a dia', contador: geraisTodas.length },
              { valor: 'tatico', rotulo: 'Tático', contador: taticasTodas.length },
            ]}
          />
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
                    : categoria === 'tatico'
                      ? 'Nenhuma pendência tática neste filtro. Importe o PDF do planejamento tático para trazer as da semana.'
                      : 'Nenhuma pendência neste filtro. Registre o que precisa de alguém para resolver.'
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

      <ImportarPDFTatico
        aberto={importandoPDF}
        onFechar={() => setImportandoPDF(false)}
        dados={dados}
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

function ImportarPDFTatico({ aberto, onFechar, dados }) {
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
     não duplica o que já foi trazido, resolvido ou não. */
  const itensParaCriar = useMemo(() => {
    const itens = resultado?.itens || []
    const taticasExistentes = pendenciasTaticas(dados.pendencias)
    return itens.map((it) => {
      const titulo = `${it.acao_remocao} — ${it.servico}`
      const jaExiste = taticasExistentes.some((p) => normalizarComparar(p.titulo) === normalizarComparar(titulo))
      const linhasDescricao = [
        it.lote && `Lote: ${it.lote}`,
        it.responsavel && `Responsável (relatório): ${it.responsavel}`,
        it.motivo && `Motivo: ${it.motivo}`,
      ].filter(Boolean)
      return {
        item: it,
        jaExiste,
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
              {feito.jaExistiam > 0 && ` ${plural(feito.jaExistiam, 'item já tinha sido importado antes', 'itens já tinham sido importados antes')} e não foram repetidos.`}
            </div>
            <button className="btn btn-primary btn-block" onClick={fechar}>Fechar</button>
          </>
        ) : (
          <>
            <div className="t-caption" style={{ lineHeight: 1.5 }}>
              O planejamento tático, do jeito que o setor de planejamento manda. Puxo só as linhas marcadas
              em vermelho no relatório — "A Resolver na Semana" — e viram pendências, com prazo na data de
              início do serviço.
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
                    ? ` · ${plural(itensParaCriar.length - novos.length, 'item já importado', 'itens já importados')}`
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
                        {jaExiste && ' · já importado antes'}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="row-flex">
                  <button className="btn btn-secondary grow" onClick={() => setResultado(null)}>Corrigir</button>
                  <button
                    className="btn btn-primary grow" onClick={confirmar}
                    disabled={!novos.length || importando}
                  >
                    {importando ? 'Importando…' : `Importar ${plural(novos.length, 'pendência', 'pendências')}`}
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
