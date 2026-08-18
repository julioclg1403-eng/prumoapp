/* ============================================================
   SUPRIMENTOS — pedidos de compra importados do sistema (ERP) do
   Julio, sem digitar nada na mão. Cada linha da planilha é um
   insumo dentro de um pedido, com as datas do fluxo inteiro (Pedido
   → Aprovação → Cotação → Compra → Entrega) e os dois indicadores de
   dias que o próprio sistema já calcula.

   A planilha mistura material de obra e EPI — os dois estoques (o
   do Almoxarifado e o de Segurança) casam com Suprimentos pelo nome
   do insumo, mesmo mecanismo do Planejamento Global (schedule_global_
   items x schedule_items): linka sozinho quando o nome bate com
   exatamente UM pedido; quando bate com mais de um, ou nenhum, fica
   pendente pra revisão manual na aba Vínculos — o automático nunca
   arrisca escolher errado.

   Por que precisa desse vínculo: a nota chega na obra e o almoxarife
   lança a entrada na hora, antes de o sistema oficial (esta planilha)
   registrar o pedido como entregue. O vínculo é o que deixa ver,
   junto da entrada lançada na hora, quantos dias o pedido levou no
   fluxo oficial.
   ============================================================ */

import { useState, useMemo, useEffect, useRef } from 'react'
import { useDados } from '../lib/DadosContext'
import { formatarData, formatarDataCurta, plural, insumoCorrespondeMaterial } from '../lib/dominio'
import { Icon, Chip, PageHeader, Segmentos, Sheet, Vazio } from '../components'

const TOM_ESTAGIO = { '5 - Confirmado': 'success', '0 - Criada': 'info' }

function formatarDias(dias) {
  if (dias == null) return '—'
  return `${dias.toFixed(1)} dia${dias >= 1.95 ? 's' : ''}`
}

export default function Suprimentos({ voltar, perfil }) {
  const dados = useDados()
  const podeEditar = perfil.role !== 'campo'

  const [aba, setAba] = useState('dados')
  const [importando, setImportando] = useState(false)

  const pedidos = dados.suprimentos || []

  const materiaisPorId = useMemo(() => new Map(dados.materiaisEstoque.map((m) => [m.id, m.nome])), [dados.materiaisEstoque])
  const episPorId = useMemo(() => new Map(dados.materiaisEpi.map((m) => [m.id, m.nome])), [dados.materiaisEpi])

  const entradasSemVinculo = useMemo(() => {
    const doEstoque = (dados.entradasEstoque || [])
      .filter((e) => !e.supply_order_id)
      .map((e) => ({ ...e, tabela: 'estoque', nomeMaterial: materiaisPorId.get(e.material_id) }))
    const doEpi = (dados.entradasEpi || [])
      .filter((e) => !e.supply_order_id)
      .map((e) => ({ ...e, tabela: 'epi', nomeMaterial: episPorId.get(e.material_id) }))
    return [...doEstoque, ...doEpi].filter((e) => e.nomeMaterial)
  }, [dados.entradasEstoque, dados.entradasEpi, materiaisPorId, episPorId])

  const candidatasPorEntrada = useMemo(() => {
    const mapa = new Map()
    for (const e of entradasSemVinculo) {
      mapa.set(e.id, pedidos.filter((p) => insumoCorrespondeMaterial(p.insumo, e.nomeMaterial)))
    }
    return mapa
  }, [entradasSemVinculo, pedidos])

  const ambiguos = entradasSemVinculo.filter((e) => (candidatasPorEntrada.get(e.id) || []).length > 1).length
  const semCandidata = entradasSemVinculo.filter((e) => (candidatasPorEntrada.get(e.id) || []).length === 0).length

  /* Toda vez que a tela abre, tenta linkar de novo sozinho — mesma
     ideia do Planejamento Global: pega pedido importado depois da
     última vez, sem exigir que a pessoa lembre de clicar no botão. */
  const jaTentouAoAbrir = useRef(false)
  useEffect(() => {
    if (jaTentouAoAbrir.current || !podeEditar) return
    jaTentouAoAbrir.current = true
    if (entradasSemVinculo.length > 0) dados.vincularSuprimentoAutomaticamente()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <div className="topbar">
        {voltar && <button onClick={voltar} aria-label="Voltar"><Icon name="voltar" size={22} /></button>}
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Suprimentos</div>
          <div className="sub">{dados.obra.nome}</div>
        </div>
      </div>

      <div className="page">
        <PageHeader
          titulo="Suprimentos"
          sub={`${plural(pedidos.length, 'pedido importado', 'pedidos importados')} do sistema`}
          acao={podeEditar && (
            <button className="btn btn-primary" onClick={() => setImportando(true)}>
              <Icon name="baixar" size={16} style={{ transform: 'rotate(180deg)' }} /> Importar planilha
            </button>
          )}
        />

        <div className="stack-2">
          <Segmentos
            valor={aba} onChange={setAba}
            opcoes={[
              { valor: 'dados', rotulo: 'Todos os dados', contador: pedidos.length },
              { valor: 'dashboard', rotulo: 'Dashboard' },
              { valor: 'vinculos', rotulo: 'Vínculos', contador: entradasSemVinculo.length },
            ]}
          />

          {pedidos.length === 0 ? (
            <div className="card-flat">
              <Vazio
                titulo="Nenhum pedido importado ainda"
                texto={
                  podeEditar
                    ? 'Importe a planilha "Relação de Pedidos de Compras" que você baixa do sistema.'
                    : 'A gestão ainda não importou os pedidos de compra desta obra.'
                }
                acao={podeEditar && <button className="btn btn-primary" onClick={() => setImportando(true)}>Importar planilha</button>}
              />
            </div>
          ) : (
            <>
              {aba === 'dados' && <AbaDados pedidos={pedidos} />}
              {aba === 'dashboard' && <AbaDashboard pedidos={pedidos} />}
              {aba === 'vinculos' && (
                <AbaVinculos
                  dados={dados} podeEditar={podeEditar}
                  entradas={entradasSemVinculo} candidatasPorEntrada={candidatasPorEntrada}
                  ambiguos={ambiguos} semCandidata={semCandidata}
                />
              )}
            </>
          )}
        </div>
      </div>

      <ImportarSuprimentos aberto={importando} onFechar={() => setImportando(false)} dados={dados} />
    </>
  )
}

/* ── Todos os dados ────────────────────────────────────────── */

function AbaDados({ pedidos }) {
  const [busca, setBusca] = useState('')
  const [estagio, setEstagio] = useState('todos')

  const estagios = useMemo(() => [...new Set(pedidos.map((p) => p.estagio).filter(Boolean))].sort(), [pedidos])

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return pedidos
      .filter((p) => estagio === 'todos' || p.estagio === estagio)
      .filter((p) => !b || p.insumo.toLowerCase().includes(b) || String(p.pedido).includes(b) || (p.codigo_insumo || '').toLowerCase().includes(b))
      .sort((a, b2) => (b2.pedido - a.pedido) || String(a.insumo).localeCompare(String(b2.insumo)))
  }, [pedidos, busca, estagio])

  return (
    <div className="stack-2">
      <div style={{ position: 'relative' }}>
        <Icon name="busca" size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
        <input
          className="ipt" style={{ paddingLeft: 34, width: '100%' }}
          value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por insumo, número do pedido ou código…"
        />
      </div>

      {estagios.length > 1 && (
        <div className="row-wrap" style={{ gap: 6 }}>
          <button className={`btn btn-sm ${estagio === 'todos' ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setEstagio('todos')}>Todos</button>
          {estagios.map((e) => (
            <button key={e} className={`btn btn-sm ${estagio === e ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setEstagio(e)}>{e}</button>
          ))}
        </div>
      )}

      {lista.length === 0 ? (
        <div className="card-flat"><Vazio titulo="Nada com esse filtro" texto="Troque a busca ou o estágio." /></div>
      ) : (
        <div className="card-flat scroll-x" style={{ padding: 0 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Pedido</th><th>Insumo</th><th>Qtde</th><th>Pedido em</th><th>Entrega</th>
                <th>Ped→Compra</th><th>Compra→Ent</th><th>Estágio</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id}>
                  <td className="t-caption">{p.pedido}</td>
                  <td className="t-strong">{p.insumo}</td>
                  <td className="t-num">{p.quantidade ?? '—'}</td>
                  <td style={{ color: 'var(--text-2)' }}>{p.data_pedido ? formatarDataCurta(p.data_pedido) : '—'}</td>
                  <td style={{ color: 'var(--text-2)' }}>{p.data_entrega ? formatarDataCurta(p.data_entrega) : '—'}</td>
                  <td className="t-num">{p.dias_pedido_compra ?? '—'}</td>
                  <td className="t-num">{p.dias_compra_entrega ?? '—'}</td>
                  <td><Chip tom={TOM_ESTAGIO[p.estagio] || ''}>{p.estagio || '—'}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ── Dashboard ──────────────────────────────────────────────── */

function AbaDashboard({ pedidos }) {
  const media = (itens, campo) => {
    const doGrupo = itens.filter((p) => p[campo] != null)
    return doGrupo.length ? doGrupo.reduce((s, p) => s + p[campo], 0) / doGrupo.length : null
  }

  const mediaPedidoCompra = media(pedidos, 'dias_pedido_compra')
  const mediaCompraEntrega = media(pedidos, 'dias_compra_entrega')
  const comAmbos = pedidos.filter((p) => p.dias_pedido_compra != null && p.dias_compra_entrega != null)
  const mediaTotal = comAmbos.length
    ? comAmbos.reduce((s, p) => s + p.dias_pedido_compra + p.dias_compra_entrega, 0) / comAmbos.length
    : null

  /* Por insumo — só entram quem já tem os dois tempos calculados
     (Estágio Confirmado), pra não misturar pedido ainda em aberto
     com pedido que já rodou o fluxo inteiro. Top 15 que mais
     demoram, é o "quem trava a compra" que interessa olhar. */
  const porInsumo = useMemo(() => {
    const mapa = new Map()
    for (const p of comAmbos) {
      if (!mapa.has(p.insumo)) mapa.set(p.insumo, [])
      mapa.get(p.insumo).push(p)
    }
    return [...mapa.entries()]
      .map(([insumo, itens]) => ({
        insumo, quantidade: itens.length,
        pedidoCompra: media(itens, 'dias_pedido_compra'),
        compraEntrega: media(itens, 'dias_compra_entrega'),
        total: media(itens.map((i) => ({ t: i.dias_pedido_compra + i.dias_compra_entrega })), 't'),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15)
  }, [comAmbos])

  const maxBarra = Math.max(1, ...porInsumo.map((i) => i.total))

  return (
    <div className="stack-2">
      <div className="row-wrap" style={{ gap: 10 }}>
        <div className="card-flat" style={{ flex: '1 1 160px' }}>
          <div className="t-caption">Pedido → Compra</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{formatarDias(mediaPedidoCompra)}</div>
        </div>
        <div className="card-flat" style={{ flex: '1 1 160px' }}>
          <div className="t-caption">Compra → Entrega</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{formatarDias(mediaCompraEntrega)}</div>
        </div>
        <div className="card-flat" style={{ flex: '1 1 160px' }}>
          <div className="t-caption">Total (pedido até chegar)</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{formatarDias(mediaTotal)}</div>
        </div>
      </div>

      <div className="card-flat stack-2">
        <div className="t-micro">Insumos que mais demoram (top 15, tempo total médio)</div>
        {porInsumo.length === 0 ? (
          <div className="t-caption">Nenhum pedido com os dois tempos calculados ainda.</div>
        ) : (
          <div className="stack-1">
            {porInsumo.map((i) => (
              <div key={i.insumo}>
                <div className="row-between" style={{ marginBottom: 3 }}>
                  <span className="t-caption" style={{ maxWidth: '70%' }}>{i.insumo} <span style={{ opacity: 0.6 }}>({i.quantidade})</span></span>
                  <span className="t-caption t-strong">{formatarDias(i.total)}</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden' }}>
                  <div style={{ width: `${(i.total / maxBarra) * 100}%`, height: '100%', background: 'var(--primary)' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Vínculos com Almoxarifado/EPI ─────────────────────────────
   Mesmo padrão do Planejamento Global: automático já rodou ao abrir
   a tela; aqui é a fila de revisão de quem ficou ambíguo ou sem
   candidata nenhuma. */
function AbaVinculos({ dados, podeEditar, entradas, candidatasPorEntrada, ambiguos, semCandidata }) {
  const [vinculando, setVinculando] = useState(false)
  const [entradaParaVincular, setEntradaParaVincular] = useState(null)

  const tentarDeNovo = async () => {
    setVinculando(true)
    try { await dados.vincularSuprimentoAutomaticamente() } finally { setVinculando(false) }
  }

  if (entradas.length === 0) {
    return (
      <div className="card-flat">
        <Vazio titulo="Tudo vinculado" texto="Toda entrada de estoque e de EPI já está ligada a um pedido de Suprimentos (ou não tinha candidata quando foi lançada)." />
      </div>
    )
  }

  return (
    <div className="stack-2">
      {podeEditar && (
        <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={tentarDeNovo} disabled={vinculando}>
          {vinculando ? 'Vinculando…' : 'Vincular automaticamente de novo'}
        </button>
      )}

      {ambiguos > 0 && (
        <div className="alert info">
          {plural(ambiguos, 'entrada achou mais de um pedido parecido', 'entradas acharam mais de um pedido parecido')} —
          o automático não arrisca escolher errado, confira e vincule manualmente qual é o certo.
        </div>
      )}
      {semCandidata > 0 && (
        <div className="alert danger">
          {plural(semCandidata, 'entrada ainda não tem', 'entradas ainda não têm')} nenhum pedido parecido importado —
          se o pedido já saiu no sistema, importe a planilha de novo.
        </div>
      )}

      <div className="stack-1">
        {entradas.map((e) => {
          const candidatas = candidatasPorEntrada.get(e.id) || []
          return (
            <div key={e.id} className="card-flat row-between" style={{ alignItems: 'center', gap: 10 }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="t-strong" style={{ fontSize: 14 }}>{e.nomeMaterial}</div>
                <div className="t-caption" style={{ marginTop: 2 }}>
                  {e.tabela === 'epi' ? 'EPI' : 'Almoxarifado'} · entrada de {formatarDataCurta(e.data)} · {e.quantidade}
                </div>
              </div>
              <button
                onClick={() => podeEditar && setEntradaParaVincular(e)}
                disabled={!podeEditar}
                style={{ background: 'none', border: 'none', padding: 0, cursor: podeEditar ? 'pointer' : 'default' }}
              >
                {candidatas.length > 1
                  ? <Chip tom="info">Conferir · {candidatas.length} parecidos</Chip>
                  : <Chip tom="danger">Sem pedido</Chip>}
              </button>
            </div>
          )
        })}
      </div>

      <VincularPedido
        key={entradaParaVincular?.id || 'fechado'}
        entrada={entradaParaVincular} onFechar={() => setEntradaParaVincular(null)} dados={dados}
        candidatas={entradaParaVincular ? (candidatasPorEntrada.get(entradaParaVincular.id) || []) : []}
      />
    </div>
  )
}

function VincularPedido({ entrada, onFechar, dados, candidatas }) {
  const [busca, setBusca] = useState('')
  const [salvando, setSalvando] = useState(false)

  const opcoes = useMemo(() => {
    const b = busca.trim().toLowerCase()
    const base = candidatas.length > 0 ? candidatas : dados.suprimentos
    return base.filter((p) => !b || p.insumo.toLowerCase().includes(b) || String(p.pedido).includes(b)).slice(0, 50)
  }, [candidatas, dados.suprimentos, busca])

  const escolher = async (supplyOrderId) => {
    setSalvando(true)
    try {
      if (entrada && await dados.vincularEntradaSuprimento(entrada.tabela, entrada.id, supplyOrderId)) onFechar()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Sheet aberto={Boolean(entrada)} titulo="Vincular a um pedido de Suprimentos" onFechar={onFechar}>
      {entrada && (
        <div className="stack-2">
          <div className="t-caption">{entrada.nomeMaterial} · entrada de {formatarData(entrada.data)}</div>

          <input
            className="ipt" value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por insumo ou número do pedido…"
          />

          <div className="stack-1" style={{ maxHeight: 360, overflowY: 'auto' }}>
            {opcoes.length === 0 ? (
              <div className="t-caption">Nenhum pedido encontrado.</div>
            ) : opcoes.map((p) => (
              <button
                key={p.id} className="card-flat" style={{ textAlign: 'left', width: '100%', cursor: 'pointer' }}
                onClick={() => escolher(p.id)} disabled={salvando}
              >
                <div className="t-strong" style={{ fontSize: 14 }}>{p.insumo}</div>
                <div className="t-caption" style={{ marginTop: 2 }}>
                  Pedido {p.pedido} · {p.quantidade ?? '—'} · {p.estagio || '—'}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  )
}

/* ── Importação da planilha ────────────────────────────────── */

function ImportarSuprimentos({ aberto, onFechar, dados }) {
  const [lendo, setLendo] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [importandoAgora, setImportandoAgora] = useState(false)
  const [feito, setFeito] = useState(null)

  const fechar = () => {
    setResultado(null); setNomeArquivo(''); setFeito(null); onFechar()
  }

  const chavesExistentes = useMemo(
    () => new Set((dados.suprimentos || []).map((p) => `${p.pedido}|${p.codigo_insumo}`)),
    [dados.suprimentos],
  )

  const onArquivo = async (e) => {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    e.target.value = ''
    setNomeArquivo(arquivo.name)
    setLendo(true)
    setResultado(null)
    setFeito(null)
    try {
      const { lerPlanilhaSuprimentos } = await import('../lib/planilhaSuprimentos')
      const lido = await lerPlanilhaSuprimentos(arquivo)
      const itens = lido.itens.map((i) => ({
        ...i, acao: chavesExistentes.has(`${i.pedido}|${i.codigo_insumo}`) ? 'atualiza' : 'novo',
      }))
      setResultado({ ...lido, itens })
    } catch (err) {
      setResultado({ itens: [], erroGeral: `Não consegui ler este arquivo. ${err.message}` })
    } finally {
      setLendo(false)
    }
  }

  const novos = (resultado?.itens || []).filter((i) => i.acao === 'novo').length
  const atualizados = (resultado?.itens || []).filter((i) => i.acao === 'atualiza').length

  const confirmar = async () => {
    if (!resultado?.itens?.length) return
    setImportandoAgora(true)
    try {
      const r = await dados.importarSuprimentos(resultado.itens)
      if (!r) return
      const vinc = await dados.vincularSuprimentoAutomaticamente()
      setFeito({ ...r, novos, atualizados, vinculados: vinc?.vinculados || 0 })
    } finally {
      setImportandoAgora(false)
    }
  }

  return (
    <Sheet aberto={aberto} titulo="Importar pedidos de Suprimentos" onFechar={fechar}>
      <div className="stack-2">
        {feito ? (
          <>
            <div className="alert success">
              {plural(feito.novos, 'pedido novo importado', 'pedidos novos importados')} e{' '}
              {plural(feito.atualizados, 'atualizado', 'atualizados')}.
              {feito.vinculados > 0 && ` ${plural(feito.vinculados, 'entrada vinculada', 'entradas vinculadas')} automaticamente pelo nome.`}
            </div>
            <button className="btn btn-primary btn-block" onClick={fechar}>Fechar</button>
          </>
        ) : (
          <>
            <div className="t-caption" style={{ lineHeight: 1.5 }}>
              A planilha "Relação de Pedidos de Compras" que você baixa do sistema (.xlsx). Pedido que já
              existe (mesmo número + código do insumo) só atualiza; pedido novo entra do zero. Depois de
              importar, o app tenta vincular sozinho com as entradas do Almoxarifado e do estoque de EPI
              que ainda não têm pedido — confira o resultado na aba Vínculos.
            </div>

            <label className="btn btn-secondary btn-block" style={{ cursor: 'pointer' }}>
              {lendo ? 'Lendo a planilha…' : nomeArquivo || 'Escolher arquivo .xlsx'}
              <input
                type="file" accept=".xlsx,.xls" onChange={onArquivo}
                style={{ display: 'none' }} disabled={lendo}
              />
            </label>

            {resultado?.erroGeral && <div className="alert danger">{resultado.erroGeral}</div>}

            {resultado && !resultado.erroGeral && (
              <>
                <div className="alert info">
                  {plural(novos, 'pedido novo', 'pedidos novos')} · {plural(atualizados, 'atualização', 'atualizações')}.
                </div>

                <div style={{ maxHeight: 300, overflowY: 'auto' }} className="stack-1">
                  {resultado.itens.slice(0, 100).map((i) => (
                    <div
                      key={`${i.pedido}-${i.codigo_insumo}`}
                      style={{
                        fontSize: 12, padding: 8, borderRadius: 8,
                        border: `1px solid ${i.acao === 'novo' ? 'var(--success)' : 'var(--border)'}`,
                        background: i.acao === 'novo' ? 'var(--success-tint)' : 'var(--surface-2)',
                      }}
                    >
                      <div className="row-between">
                        <strong>{i.insumo}</strong>
                        <span style={{ color: i.acao === 'novo' ? 'var(--success)' : 'var(--text-3)', fontWeight: 600 }}>
                          {i.acao === 'novo' ? 'novo' : 'atualiza'}
                        </span>
                      </div>
                      <div style={{ marginTop: 2 }}>Pedido {i.pedido} · {i.estagio || '—'}</div>
                    </div>
                  ))}
                  {resultado.itens.length > 100 && (
                    <div className="t-caption">…e mais {resultado.itens.length - 100}.</div>
                  )}
                </div>

                <button
                  className="btn btn-primary btn-block" onClick={confirmar}
                  disabled={importandoAgora || resultado.itens.length === 0}
                >
                  {importandoAgora ? 'Importando…' : `Importar ${plural(resultado.itens.length, 'pedido', 'pedidos')}`}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}
