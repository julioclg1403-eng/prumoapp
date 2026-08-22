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
import {
  hojeISO, formatarData, formatarDataCurta, formatarDinheiro, plural, insumoCorrespondeMaterial, filtrarPorPeriodo,
} from '../lib/dominio'
import { Icon, Chip, PageHeader, Segmentos, Sheet, Campo, Vazio, Indicador, PainelColapsavel } from '../components'
import { RankingBarras, GraficoColunas, GraficoDonut } from '../components/charts'

const TOM_ESTAGIO = { '5 - Confirmado': 'success', '0 - Criada': 'info' }
const ROTULO_DESTINO = {
  almoxarifado: 'Almoxarifado', epi: 'EPI', administracao: 'Administração', equipamentos: 'Equipamentos',
}
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/* Mesmo filtro Tudo/Dia/Mês/Período usado no Almoxarifado e na
   Segurança — componente local pra não criar dependência cruzada
   entre telas por um pedaço de UI tão pequeno. */
function FiltroPeriodo({ modo, onModo, dia, onDia, mes, onMes, inicio, onInicio, fim, onFim }) {
  return (
    <div className="stack-1">
      <Segmentos
        valor={modo} onChange={onModo}
        opcoes={[
          { valor: 'tudo', rotulo: 'Tudo' },
          { valor: 'dia', rotulo: 'Dia' },
          { valor: 'mes', rotulo: 'Mês' },
          { valor: 'periodo', rotulo: 'Período' },
        ]}
      />
      {modo === 'dia' && <input className="ipt" type="date" value={dia} onChange={(e) => onDia(e.target.value)} />}
      {modo === 'mes' && <input className="ipt" type="month" value={mes} onChange={(e) => onMes(e.target.value)} />}
      {modo === 'periodo' && (
        <div className="row-flex">
          <Campo label="De">
            <input className="ipt" type="date" value={inicio} onChange={(e) => onInicio(e.target.value)} />
          </Campo>
          <Campo label="Até">
            <input className="ipt" type="date" value={fim} onChange={(e) => onFim(e.target.value)} />
          </Campo>
        </div>
      )}
    </div>
  )
}

function formatarDias(dias) {
  if (dias == null) return '—'
  return `${dias.toFixed(1)} dia${dias >= 1.95 ? 's' : ''}`
}

function diferencaDiasSimples(dataInicioISO, dataFimISO) {
  const inicio = new Date(`${dataInicioISO}T00:00:00Z`)
  const fim = new Date(`${dataFimISO}T00:00:00Z`)
  return Math.round((fim - inicio) / 86400000)
}

/* Ordem oficial do fluxo da planilha: Pedido → Aprovação do Pedido →
   Aprovação da Simulação → Confirmação da Cotação → Fechamento da
   Compra → Entrega. Mesmos seis campos que o sistema (ERP) calcula
   os dois indicadores de dias em cima. */
const ETAPAS_FLUXO = [
  { chave: 'data_pedido', rotulo: 'Pedido' },
  { chave: 'aprov_pedido', rotulo: 'Aprovação do pedido' },
  { chave: 'aprov_simulacao', rotulo: 'Aprovação da simulação' },
  { chave: 'confirm_cotacao', rotulo: 'Confirmação da cotação' },
  { chave: 'fechamento_compra', rotulo: 'Fechamento da compra' },
  { chave: 'data_entrega', rotulo: 'Entrega' },
]

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
      mapa.set(e.id, pedidos.filter((p) => !p.entrada_id && insumoCorrespondeMaterial(p.insumo, e.nomeMaterial)))
    }
    return mapa
  }, [entradasSemVinculo, pedidos])

  const ambiguos = entradasSemVinculo.filter((e) => (candidatasPorEntrada.get(e.id) || []).length > 1).length
  const semCandidata = entradasSemVinculo.filter((e) => (candidatasPorEntrada.get(e.id) || []).length === 0).length
  const semDestino = pedidos.filter((p) => !p.destino).length

  /* Toda vez que a tela abre, tenta linkar (entrada↔pedido) e
     detectar o Destino de novo sozinho — mesma ideia do Planejamento
     Global: pega pedido importado depois da última vez, sem exigir
     que a pessoa lembre de clicar no botão. */
  const jaTentouAoAbrir = useRef(false)
  useEffect(() => {
    if (jaTentouAoAbrir.current || !podeEditar) return
    jaTentouAoAbrir.current = true
    if (entradasSemVinculo.length > 0 || semDestino > 0) dados.vincularSuprimentoAutomaticamente()
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
              {aba === 'dados' && <AbaDados pedidos={pedidos} dados={dados} podeEditar={podeEditar} />}
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

function AbaDados({ pedidos, dados, podeEditar }) {
  const [busca, setBusca] = useState('')
  const [estagio, setEstagio] = useState('todos')
  const [destinoFiltro, setDestinoFiltro] = useState('todos')
  const [detalhe, setDetalhe] = useState(null)

  const estagios = useMemo(() => [...new Set(pedidos.map((p) => p.estagio).filter(Boolean))].sort(), [pedidos])

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return pedidos
      .filter((p) => estagio === 'todos' || p.estagio === estagio)
      .filter((p) => destinoFiltro === 'todos' || (destinoFiltro === 'sem' ? !p.destino : p.destino === destinoFiltro))
      .filter((p) => !b || p.insumo.toLowerCase().includes(b) || String(p.pedido).includes(b) || (p.codigo_insumo || '').toLowerCase().includes(b))
      .sort((a, b2) => (b2.pedido - a.pedido) || String(a.insumo).localeCompare(String(b2.insumo)))
  }, [pedidos, busca, estagio, destinoFiltro])

  /* Reabre o detalhe com o dado mais fresco depois de salvar o
     destino (a lista `pedidos` já veio atualizada do recarregar). */
  const detalheAtual = detalhe ? lista.find((p) => p.id === detalhe.id) || pedidos.find((p) => p.id === detalhe.id) : null

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

      <div className="row-wrap" style={{ gap: 6 }}>
        <span className="t-caption" style={{ alignSelf: 'center', marginRight: 2 }}>Destino:</span>
        <button className={`btn btn-sm ${destinoFiltro === 'todos' ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setDestinoFiltro('todos')}>Todos</button>
        <button className={`btn btn-sm ${destinoFiltro === 'almoxarifado' ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setDestinoFiltro('almoxarifado')}>Almoxarifado</button>
        <button className={`btn btn-sm ${destinoFiltro === 'epi' ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setDestinoFiltro('epi')}>EPI</button>
        <button className={`btn btn-sm ${destinoFiltro === 'equipamentos' ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setDestinoFiltro('equipamentos')}>Equipamentos</button>
        <button className={`btn btn-sm ${destinoFiltro === 'administracao' ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setDestinoFiltro('administracao')}>Administração</button>
        <button className={`btn btn-sm ${destinoFiltro === 'sem' ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setDestinoFiltro('sem')}>Sem destino</button>
      </div>

      {lista.length === 0 ? (
        <div className="card-flat"><Vazio titulo="Nada com esse filtro" texto="Troque a busca, o estágio ou o destino." /></div>
      ) : (
        <div className="stack-1">
          {lista.map((p) => (
            <div key={p.id} className="card-tap" style={{ padding: 10, cursor: 'pointer' }} onClick={() => setDetalhe(p)}>
              <div className="row-between" style={{ alignItems: 'flex-start', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="t-strong" style={{ fontSize: 14 }}>{p.insumo}</div>
                  <div className="t-caption" style={{ marginTop: 2 }}>
                    Pedido {p.pedido} · Cotação {p.cotacao ?? '—'} · Cód. {p.codigo_insumo || '—'}
                  </div>
                </div>
                <div className="row-flex" style={{ gap: 6, flex: 'none' }}>
                  {p.excluido && p.excluido !== '0 - Não' && <Chip tom="danger">Excluído</Chip>}
                  <Chip tom={TOM_ESTAGIO[p.estagio] || ''}>{p.estagio || 'Sem estágio'}</Chip>
                </div>
              </div>
              <div className="row-wrap" style={{ gap: 14, marginTop: 8, alignItems: 'center' }}>
                <span className="t-caption">Qtde <span className="t-strong">{p.quantidade ?? '—'}</span></span>
                <span className="t-caption">Preço <span className="t-strong">{formatarDinheiro(p.preco)}</span></span>
                <span className="t-caption">
                  Pedido em <span className="t-strong">{p.data_pedido ? formatarDataCurta(p.data_pedido) : '—'}</span>
                </span>
                <span className="t-caption">
                  {p.data_entrega ? (
                    <>Entregue <span className="t-strong" style={{ color: 'var(--success)' }}>{formatarDataCurta(p.data_entrega)}</span></>
                  ) : p.previsao_entrega ? (
                    <>Previsto <span className="t-strong" style={{ color: 'var(--info)' }}>{formatarDataCurta(p.previsao_entrega)}</span></>
                  ) : (
                    <span style={{ color: 'var(--text-3)' }}>Sem previsão de entrega</span>
                  )}
                </span>
                {p.destino && <Chip tom="info">{ROTULO_DESTINO[p.destino]}</Chip>}
              </div>
            </div>
          ))}
        </div>
      )}

      <DetalhePedido pedido={detalheAtual} onFechar={() => setDetalhe(null)} dados={dados} podeEditar={podeEditar} />
    </div>
  )
}

/* ── Detalhe de um pedido — linha do tempo completa ────────────
   Aqui sim entra tudo que a planilha traz: cotação, código, preço,
   excluído, e as seis datas do fluxo (Pedido → Aprovação do Pedido →
   Aprovação da Simulação → Confirmação da Cotação → Fechamento da
   Compra → Entrega), não só o resumo que cabe na tabela. */
function DetalhePedido({ pedido, onFechar, dados, podeEditar }) {
  const [salvando, setSalvando] = useState(false)

  const escolherDestino = async (destino) => {
    if (!pedido) return
    setSalvando(true)
    try {
      await dados.definirDestinoSuprimento(pedido.id, destino)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Sheet aberto={Boolean(pedido)} titulo={pedido ? `Pedido ${pedido.pedido}` : ''} onFechar={onFechar}>
      {pedido && (
        <div className="stack-2">
          <div>
            <div className="t-strong" style={{ fontSize: 15 }}>{pedido.insumo}</div>
            <div className="t-caption" style={{ marginTop: 2 }}>Código {pedido.codigo_insumo || '—'} · Cotação {pedido.cotacao ?? '—'}</div>
          </div>

          <div className="row-wrap" style={{ gap: 8 }}>
            <Chip tom={TOM_ESTAGIO[pedido.estagio] || ''}>{pedido.estagio || 'Sem estágio'}</Chip>
            {pedido.excluido && pedido.excluido !== '0 - Não' && <Chip tom="danger">Excluído</Chip>}
          </div>

          <div className="card-flat stack-1">
            <div className="t-micro">Destino</div>
            <div className="t-caption" style={{ lineHeight: 1.4 }}>
              Marca uma vez pra esse insumo — pedido repetido com o mesmo nome já entra classificado sozinho, na
              hora de importar de novo. "Equipamentos" é pra máquina/ferramenta (vai pra aba Equipamentos do
              Almoxarifado, cadastro por unidade, não por quantidade). "Administração" é pra item que não entra
              no controle de estoque (material de escritório, limpeza administrativa etc.) — só pra ele sair da
              fila de pendente.
            </div>
            {podeEditar ? (
              <div className="row-wrap" style={{ gap: 6, marginTop: 2 }}>
                <button
                  className={`btn btn-sm ${pedido.destino === 'almoxarifado' ? 'btn-dark' : 'btn-secondary'}`}
                  onClick={() => escolherDestino('almoxarifado')} disabled={salvando}
                >
                  Almoxarifado
                </button>
                <button
                  className={`btn btn-sm ${pedido.destino === 'epi' ? 'btn-dark' : 'btn-secondary'}`}
                  onClick={() => escolherDestino('epi')} disabled={salvando}
                >
                  EPI
                </button>
                <button
                  className={`btn btn-sm ${pedido.destino === 'equipamentos' ? 'btn-dark' : 'btn-secondary'}`}
                  onClick={() => escolherDestino('equipamentos')} disabled={salvando}
                >
                  Equipamentos
                </button>
                <button
                  className={`btn btn-sm ${pedido.destino === 'administracao' ? 'btn-dark' : 'btn-secondary'}`}
                  onClick={() => escolherDestino('administracao')} disabled={salvando}
                >
                  Administração
                </button>
                {pedido.destino && (
                  <button className="btn btn-sm btn-secondary" onClick={() => escolherDestino(null)} disabled={salvando}>
                    Limpar
                  </button>
                )}
              </div>
            ) : (
              <div>{pedido.destino ? <Chip tom="info">{ROTULO_DESTINO[pedido.destino]}</Chip> : <span className="t-caption">Sem destino definido</span>}</div>
            )}
          </div>

          <div className="row-wrap" style={{ gap: 10 }}>
            <div className="card-flat" style={{ flex: '1 1 120px' }}>
              <div className="t-caption">Quantidade</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{pedido.quantidade ?? '—'}</div>
            </div>
            <div className="card-flat" style={{ flex: '1 1 120px' }}>
              <div className="t-caption">Preço unitário</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{formatarDinheiro(pedido.preco)}</div>
            </div>
            <div className="card-flat" style={{ flex: '1 1 120px' }}>
              <div className="t-caption">Total</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
                {pedido.preco != null && pedido.quantidade != null ? formatarDinheiro(pedido.preco * pedido.quantidade) : '—'}
              </div>
            </div>
          </div>

          <div className="card-flat stack-1">
            <div className="t-micro">Linha do tempo do fluxo</div>
            {ETAPAS_FLUXO.map((etapa, i) => {
              const data = pedido[etapa.chave]
              return (
                <div key={etapa.chave} className="row-between" style={{ alignItems: 'center', padding: '6px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: data ? 'var(--success)' : 'var(--border)',
                    }} />
                    <span className="t-caption" style={{ color: data ? 'var(--text-1)' : 'var(--text-3)' }}>{etapa.rotulo}</span>
                  </div>
                  <span className="t-caption t-strong">{data ? formatarData(data) : '—'}</span>
                </div>
              )
            })}
            {pedido.previsao_entrega && (
              <div className="row-between" style={{ alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--info)' }} />
                  <span className="t-caption">Previsão de entrega</span>
                </div>
                <span className="row" style={{ gap: 8, alignItems: 'center' }}>
                  {pedido.data_entrega && (() => {
                    const diff = diferencaDiasSimples(pedido.previsao_entrega, pedido.data_entrega)
                    if (diff <= 0) return <Chip tom="success">{diff === 0 ? 'No prazo' : `${-diff}d antes`}</Chip>
                    return <Chip tom="danger">{`${diff}d de atraso`}</Chip>
                  })()}
                  <span className="t-caption t-strong">{formatarData(pedido.previsao_entrega)}</span>
                </span>
              </div>
            )}
          </div>

          <div className="row-wrap" style={{ gap: 10 }}>
            <div className="card-flat" style={{ flex: '1 1 160px' }}>
              <div className="t-caption">Pedido → Compra</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{formatarDias(pedido.dias_pedido_compra)}</div>
            </div>
            <div className="card-flat" style={{ flex: '1 1 160px' }}>
              <div className="t-caption">Compra → Entrega</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{formatarDias(pedido.dias_compra_entrega)}</div>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  )
}

/* ── Dashboard ──────────────────────────────────────────────── */

function AbaDashboard({ pedidos }) {
  const hoje = hojeISO()
  const [periodoModo, setPeriodoModo] = useState('tudo')
  const [periodoDia, setPeriodoDia] = useState(hoje)
  const [periodoMes, setPeriodoMes] = useState(hoje.slice(0, 7))
  const [periodoInicio, setPeriodoInicio] = useState(hoje)
  const [periodoFim, setPeriodoFim] = useState(hoje)
  const [destinoFiltro, setDestinoFiltro] = useState('todos')
  const [buscaInsumo, setBuscaInsumo] = useState('')
  const [materialSelecionado, setMaterialSelecionado] = useState(null)

  /* Filtro de período olha a data do Pedido — é o marco que sempre
     existe (Entrega às vezes não), e é o que faz sentido pra "quanto
     eu pedi em tal mês". */
  const pedidosPeriodo = useMemo(
    () => filtrarPorPeriodo(
      pedidos, periodoModo,
      { dia: periodoDia, mes: periodoMes, inicio: periodoInicio, fim: periodoFim },
      (p) => p.data_pedido,
    ),
    [pedidos, periodoModo, periodoDia, periodoMes, periodoInicio, periodoFim],
  )
  const pedidosFiltrados = useMemo(
    () => (destinoFiltro === 'todos'
      ? pedidosPeriodo
      : pedidosPeriodo.filter((p) => (destinoFiltro === 'sem' ? !p.destino : p.destino === destinoFiltro))),
    [pedidosPeriodo, destinoFiltro],
  )

  const media = (itens, campo) => {
    const doGrupo = itens.filter((p) => p[campo] != null)
    return doGrupo.length ? doGrupo.reduce((s, p) => s + p[campo], 0) / doGrupo.length : null
  }
  const valorItem = (p) => (p.preco != null && p.quantidade != null ? p.preco * p.quantidade : null)
  const somaValor = (itens) => itens.reduce((s, p) => { const v = valorItem(p); return v != null ? s + v : s }, 0)

  const mediaPedidoCompra = media(pedidosFiltrados, 'dias_pedido_compra')
  const mediaCompraEntrega = media(pedidosFiltrados, 'dias_compra_entrega')
  const comAmbos = pedidosFiltrados.filter((p) => p.dias_pedido_compra != null && p.dias_compra_entrega != null)
  const mediaTotal = comAmbos.length
    ? comAmbos.reduce((s, p) => s + p.dias_pedido_compra + p.dias_compra_entrega, 0) / comAmbos.length
    : null

  /* Funil por estágio — onde os pedidos estão travando dentro do
     período/tipo escolhido. */
  const porEstagio = useMemo(() => {
    const mapa = new Map()
    for (const p of pedidosFiltrados) mapa.set(p.estagio || 'Sem estágio', (mapa.get(p.estagio || 'Sem estágio') || 0) + 1)
    return [...mapa.entries()].map(([estagio, quantidade]) => ({ estagio, quantidade })).sort((a, b) => b.quantidade - a.quantidade)
  }, [pedidosFiltrados])

  /* Por tipo de material (Destino) — sempre olha o período inteiro,
     ignorando o filtro de tipo abaixo, senão o comparativo entre
     tipos perde sentido (compararia um tipo com ele mesmo). */
  const porDestino = useMemo(() => {
    const grupos = { almoxarifado: [], epi: [], equipamentos: [], administracao: [], sem: [] }
    for (const p of pedidosPeriodo) grupos[p.destino || 'sem'].push(p)
    return Object.entries(grupos)
      .map(([destino, itens]) => ({ destino, quantidade: itens.length, valor: somaValor(itens) }))
      .filter((d) => d.quantidade > 0)
  }, [pedidosPeriodo])

  /* Evolução mensal (quantidade e valor gasto por mês do Pedido). */
  const evolucaoMensal = useMemo(() => {
    const mapa = new Map()
    for (const p of pedidosFiltrados) {
      if (!p.data_pedido) continue
      const mes = p.data_pedido.slice(0, 7)
      const atual = mapa.get(mes) || { quantidade: 0, valor: 0 }
      atual.quantidade += 1
      const v = valorItem(p)
      if (v != null) atual.valor += v
      mapa.set(mes, atual)
    }
    return [...mapa.entries()].map(([mes, info]) => ({ mes, ...info })).sort((a, b) => a.mes.localeCompare(b.mes))
  }, [pedidosFiltrados])

  /* Por insumo — só entram quem já tem os dois tempos calculados
     (Estágio Confirmado), pra não misturar pedido ainda em aberto
     com pedido que já rodou o fluxo inteiro. Top 15 que mais
     demoram, é o "quem trava a compra" que interessa olhar. */
  const porInsumoTempo = useMemo(() => {
    const mapa = new Map()
    for (const p of comAmbos) {
      if (!mapa.has(p.insumo)) mapa.set(p.insumo, [])
      mapa.get(p.insumo).push(p)
    }
    return [...mapa.entries()]
      .map(([insumo, itens]) => ({
        insumo, quantidade: itens.length,
        total: media(itens.map((i) => ({ t: i.dias_pedido_compra + i.dias_compra_entrega })), 't'),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15)
  }, [comAmbos])

  /* Top 15 por valor gasto — "onde está indo o dinheiro", não só o
     tempo. Conta todo pedido com preço lançado, não só os confirmados. */
  const porInsumoValor = useMemo(() => {
    const mapa = new Map()
    for (const p of pedidosFiltrados) {
      const v = valorItem(p)
      if (v == null) continue
      const atual = mapa.get(p.insumo) || { quantidade: 0, valor: 0 }
      atual.quantidade += 1
      atual.valor += v
      mapa.set(p.insumo, atual)
    }
    return [...mapa.entries()].map(([insumo, info]) => ({ insumo, ...info })).sort((a, b) => b.valor - a.valor).slice(0, 15)
  }, [pedidosFiltrados])

  /* Ranking de materiais que ainda não chegaram — pedido sem Data
     Entrega preenchida, agrupado por insumo. Ordenado por quantos dias
     o pedido mais antigo desse insumo já está esperando, é o "quem tá
     travado há mais tempo" que interessa olhar primeiro. */
  const materiaisNaoChegaram = useMemo(() => {
    const hoje = hojeISO()
    const mapa = new Map()
    for (const p of pedidosFiltrados) {
      if (p.data_entrega) continue
      const atual = mapa.get(p.insumo) || { quantidade: 0, valor: 0, dataMaisAntiga: null, itens: [] }
      atual.quantidade += 1
      const v = valorItem(p)
      if (v != null) atual.valor += v
      if (p.data_pedido && (!atual.dataMaisAntiga || p.data_pedido < atual.dataMaisAntiga)) atual.dataMaisAntiga = p.data_pedido
      atual.itens.push(p)
      mapa.set(p.insumo, atual)
    }
    return [...mapa.entries()]
      .map(([insumo, info]) => ({
        insumo, ...info,
        diasEsperando: info.dataMaisAntiga ? diferencaDiasSimples(info.dataMaisAntiga, hoje) : null,
      }))
      .sort((a, b) => (b.diasEsperando ?? -1) - (a.diasEsperando ?? -1))
      .slice(0, 20)
  }, [pedidosFiltrados])
  const totalNaoChegaram = pedidosFiltrados.filter((p) => !p.data_entrega).length

  /* Busca por um material específico — pega todos os pedidos que
     batem (não só os do top 15) e resume tudo dele: quantidade,
     valor, os três tempos e a lista de cada pedido individual. */
  const resultadosBusca = useMemo(() => {
    const termo = buscaInsumo.trim().toLowerCase()
    if (!termo) return []
    const mapa = new Map()
    for (const p of pedidosFiltrados) {
      if (!p.insumo.toLowerCase().includes(termo)) continue
      if (!mapa.has(p.insumo)) mapa.set(p.insumo, [])
      mapa.get(p.insumo).push(p)
    }
    return [...mapa.entries()]
      .map(([insumo, itens]) => {
        const comTempo = itens.filter((p) => p.dias_pedido_compra != null && p.dias_compra_entrega != null)
        return {
          insumo,
          itens: [...itens].sort((a, b) => (b.pedido - a.pedido)),
          quantidade: itens.length,
          valor: somaValor(itens),
          mediaPedidoCompra: media(itens, 'dias_pedido_compra'),
          mediaCompraEntrega: media(itens, 'dias_compra_entrega'),
          mediaTotal: comTempo.length
            ? comTempo.reduce((s, p) => s + p.dias_pedido_compra + p.dias_compra_entrega, 0) / comTempo.length
            : null,
        }
      })
      .sort((a, b) => a.insumo.localeCompare(b.insumo))
  }, [pedidosFiltrados, buscaInsumo])

  return (
    <div className="stack-2">
      <div className="card-flat stack-1">
        <div className="t-micro">Período (data do pedido)</div>
        <FiltroPeriodo
          modo={periodoModo} onModo={setPeriodoModo}
          dia={periodoDia} onDia={setPeriodoDia}
          mes={periodoMes} onMes={setPeriodoMes}
          inicio={periodoInicio} onInicio={setPeriodoInicio}
          fim={periodoFim} onFim={setPeriodoFim}
        />
      </div>

      <div className="row-wrap" style={{ gap: 6 }}>
        <span className="t-caption" style={{ alignSelf: 'center', marginRight: 2 }}>Tipo de material:</span>
        <button className={`btn btn-sm ${destinoFiltro === 'todos' ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setDestinoFiltro('todos')}>Todos</button>
        <button className={`btn btn-sm ${destinoFiltro === 'almoxarifado' ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setDestinoFiltro('almoxarifado')}>Almoxarifado</button>
        <button className={`btn btn-sm ${destinoFiltro === 'epi' ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setDestinoFiltro('epi')}>EPI</button>
        <button className={`btn btn-sm ${destinoFiltro === 'equipamentos' ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setDestinoFiltro('equipamentos')}>Equipamentos</button>
        <button className={`btn btn-sm ${destinoFiltro === 'administracao' ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setDestinoFiltro('administracao')}>Administração</button>
        <button className={`btn btn-sm ${destinoFiltro === 'sem' ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setDestinoFiltro('sem')}>Sem destino</button>
      </div>

      <div style={{ position: 'relative' }}>
        <Icon name="busca" size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
        <input
          className="ipt" style={{ paddingLeft: 34, width: '100%' }}
          value={buscaInsumo} onChange={(e) => setBuscaInsumo(e.target.value)}
          placeholder="Buscar um material específico…"
        />
      </div>

      {buscaInsumo.trim() ? (
        resultadosBusca.length === 0 ? (
          <div className="card-flat"><Vazio titulo="Nada com esse nome" texto="Troque a busca — o período e o tipo de material acima continuam valendo." /></div>
        ) : (
          <div className="stack-2">
            {resultadosBusca.map((r) => (
              <div key={r.insumo} className="card-flat stack-2">
                <div className="t-strong" style={{ fontSize: 15 }}>{r.insumo}</div>
                <div className="row-wrap" style={{ gap: 10 }}>
                  <div style={{ flex: '1 1 120px' }}>
                    <div className="t-caption">Pedidos</div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{r.quantidade}</div>
                  </div>
                  <div style={{ flex: '1 1 120px' }}>
                    <div className="t-caption">Valor total</div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{formatarDinheiro(r.valor)}</div>
                  </div>
                  <div style={{ flex: '1 1 120px' }}>
                    <div className="t-caption">Pedido → Compra</div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{formatarDias(r.mediaPedidoCompra)}</div>
                  </div>
                  <div style={{ flex: '1 1 120px' }}>
                    <div className="t-caption">Compra → Entrega</div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{formatarDias(r.mediaCompraEntrega)}</div>
                  </div>
                  <div style={{ flex: '1 1 120px' }}>
                    <div className="t-caption">Total</div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{formatarDias(r.mediaTotal)}</div>
                  </div>
                </div>
                <div className="scroll-x">
                  <table className="tbl">
                    <thead>
                      <tr><th>Pedido</th><th>Qtde</th><th>Preço</th><th>Pedido em</th><th>Entrega</th><th>Estágio</th><th>Destino</th></tr>
                    </thead>
                    <tbody>
                      {r.itens.map((p) => (
                        <tr key={p.id}>
                          <td className="t-caption">{p.pedido}</td>
                          <td className="t-num">{p.quantidade ?? '—'}</td>
                          <td className="t-num">{formatarDinheiro(p.preco)}</td>
                          <td style={{ color: 'var(--text-2)' }}>{p.data_pedido ? formatarDataCurta(p.data_pedido) : '—'}</td>
                          <td style={{ color: 'var(--text-2)' }}>{p.data_entrega ? formatarDataCurta(p.data_entrega) : '—'}</td>
                          <td><Chip tom={TOM_ESTAGIO[p.estagio] || ''}>{p.estagio || '—'}</Chip></td>
                          <td>{p.destino ? <Chip tom="info">{ROTULO_DESTINO[p.destino]}</Chip> : <span className="t-caption">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )
      ) : pedidosFiltrados.length === 0 ? (
        <div className="card-flat"><Vazio titulo="Nada nesse filtro" texto="Troque o período ou o tipo de material." /></div>
      ) : (
        <>
          <div className="row-wrap" style={{ gap: 10 }}>
            <div style={{ flex: '1 1 140px' }}><Indicador rotulo="Pedidos (itens)" valor={pedidosFiltrados.length} /></div>
            <div style={{ flex: '1 1 140px' }}><Indicador rotulo="Valor total" valor={formatarDinheiro(somaValor(pedidosFiltrados))} /></div>
            <div style={{ flex: '1 1 140px' }}><Indicador rotulo="Pedido → Compra" valor={formatarDias(mediaPedidoCompra)} /></div>
            <div style={{ flex: '1 1 140px' }}><Indicador rotulo="Compra → Entrega" valor={formatarDias(mediaCompraEntrega)} /></div>
            <div style={{ flex: '1 1 140px' }}><Indicador rotulo="Total (pedido até chegar)" valor={formatarDias(mediaTotal)} /></div>
          </div>

          <div className="row-wrap" style={{ gap: 12, alignItems: 'stretch' }}>
            {porDestino.length > 0 && (
              <div style={{ flex: '1 1 320px' }}>
                <PainelColapsavel titulo="Por tipo de material (no período acima)">
                  <GraficoDonut
                    itens={porDestino.map((d) => ({
                      chave: d.destino, rotulo: `${ROTULO_DESTINO[d.destino] || 'Sem destino'} (${d.quantidade})`, valor: d.valor,
                    }))}
                    formatarValor={formatarDinheiro}
                  />
                </PainelColapsavel>
              </div>
            )}

            <div style={{ flex: '1 1 320px' }}>
              <PainelColapsavel titulo="Funil por estágio">
                <RankingBarras
                  itens={porEstagio.map((e) => ({ chave: e.estagio, rotulo: e.estagio, valor: e.quantidade }))}
                  formatarValor={(v) => String(v)}
                />
              </PainelColapsavel>
            </div>
          </div>

          {evolucaoMensal.length > 1 && (
            <PainelColapsavel titulo="Evolução mensal (pela data do pedido)">
              <GraficoColunas
                itens={evolucaoMensal.map((m) => {
                  const [ano, mesNum] = m.mes.split('-')
                  return { chave: m.mes, rotulo: `${MESES_ABREV[Number(mesNum) - 1]}/${ano.slice(2)}`, valor: m.quantidade }
                })}
                formatarValor={(v) => String(v)}
              />
            </PainelColapsavel>
          )}

          <PainelColapsavel titulo="Insumos que mais demoram (top 15, tempo total médio)">
            <RankingBarras
              itens={porInsumoTempo.map((i) => ({ chave: i.insumo, rotulo: i.insumo, valor: i.total, contador: i.quantidade }))}
              formatarValor={formatarDias}
              vazio="Nenhum pedido com os dois tempos calculados ainda."
            />
          </PainelColapsavel>

          <PainelColapsavel titulo="Insumos com maior gasto (top 15)">
            <RankingBarras
              itens={porInsumoValor.map((i) => ({ chave: i.insumo, rotulo: i.insumo, valor: i.valor, contador: i.quantidade }))}
              formatarValor={formatarDinheiro}
              vazio="Nenhum pedido com preço lançado ainda."
            />
          </PainelColapsavel>

          <PainelColapsavel
            titulo="Materiais que ainda não chegaram"
            contador={`top 20 de ${plural(totalNaoChegaram, 'pedido', 'pedidos')} sem Data Entrega`}
          >
            <RankingBarras
              itens={materiaisNaoChegaram
                .filter((i) => i.diasEsperando != null)
                .map((i) => ({ chave: i.insumo, rotulo: i.insumo, valor: i.diasEsperando, contador: i.quantidade }))}
              formatarValor={(v) => `${v} dia${v === 1 ? '' : 's'}`}
              cor="var(--danger)"
              vazio="Nada pendente — todo pedido nesse filtro já tem Data Entrega."
              onClicarItem={(item) => setMaterialSelecionado(materiaisNaoChegaram.find((m) => m.insumo === item.chave))}
            />
          </PainelColapsavel>
        </>
      )}

      <SheetMaterialNaoChegou material={materialSelecionado} onFechar={() => setMaterialSelecionado(null)} />
    </div>
  )
}

/* ── Sheet: todos os pedidos em aberto de um material — o que dá
   pra levar pra uma cobrança ao Compras sem precisar abrir pedido
   por pedido. Um card por pedido, com o que muda de um pra outro
   (nº do pedido, cotação, estágio, previsão) — o resto (insumo) já
   está no título. */
function SheetMaterialNaoChegou({ material, onFechar }) {
  const hoje = hojeISO()
  const itensOrdenados = material
    ? [...material.itens].sort((a, b) => (b.data_pedido || '').localeCompare(a.data_pedido || ''))
    : []
  return (
    <Sheet aberto={Boolean(material)} titulo={material ? material.insumo : ''} onFechar={onFechar}>
      {material && (
        <div className="stack-2">
          <div className="t-caption">
            {plural(material.itens.length, 'pedido em aberto', 'pedidos em aberto')} · {formatarDinheiro(material.valor)} no total
          </div>
          {itensOrdenados.map((p) => {
            const diasEsperando = p.data_pedido ? diferencaDiasSimples(p.data_pedido, hoje) : null
            const diasPrevisao = p.previsao_entrega ? diferencaDiasSimples(p.previsao_entrega, hoje) : null
            return (
              <div key={p.id} className="card-flat stack-1">
                <div className="row-between" style={{ alignItems: 'center' }}>
                  <span className="t-strong">Pedido {p.pedido} · Cotação {p.cotacao ?? '—'}</span>
                  <Chip tom={TOM_ESTAGIO[p.estagio] || ''}>{p.estagio || 'Sem estágio'}</Chip>
                </div>
                <div className="row-wrap" style={{ gap: 16 }}>
                  <span className="t-caption">Qtde <span className="t-strong">{p.quantidade ?? '—'}</span></span>
                  <span className="t-caption">Preço <span className="t-strong">{formatarDinheiro(p.preco)}</span></span>
                  <span className="t-caption">Código <span className="t-strong">{p.codigo_insumo || '—'}</span></span>
                </div>
                <div className="row-wrap" style={{ gap: 16 }}>
                  <span className="t-caption">
                    Pedido em <span className="t-strong">{p.data_pedido ? formatarDataCurta(p.data_pedido) : '—'}</span>
                    {diasEsperando != null && <span style={{ color: 'var(--danger)' }}> · esperando há {diasEsperando}d</span>}
                  </span>
                </div>
                {p.previsao_entrega ? (
                  <div className="t-caption">
                    Previsão de entrega <span className="t-strong">{formatarDataCurta(p.previsao_entrega)}</span>
                    {diasPrevisao != null && (
                      diasPrevisao < 0
                        ? <Chip tom="danger">{`previsão vencida há ${-diasPrevisao}d`}</Chip>
                        : <Chip tom="info">{diasPrevisao === 0 ? 'previsto para hoje' : `previsto em ${diasPrevisao}d`}</Chip>
                    )}
                  </div>
                ) : (
                  <div className="t-caption" style={{ color: 'var(--text-3)' }}>Compras ainda não deu previsão de entrega.</div>
                )}
                {p.destino && <div><Chip tom="info">{ROTULO_DESTINO[p.destino]}</Chip></div>}
              </div>
            )
          })}
        </div>
      )}
    </Sheet>
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

/* Seleção múltipla — quando dois pedidos separados do mesmo material
   chegaram juntos numa entrada só, marca os dois e a quantidade soma
   (dados.vincularEntradaSuprimento aceita um array). */
function VincularPedido({ entrada, onFechar, dados, candidatas }) {
  const [busca, setBusca] = useState('')
  const [selecionados, setSelecionados] = useState([])
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { setSelecionados([]) }, [entrada?.id])

  const opcoes = useMemo(() => {
    const b = busca.trim().toLowerCase()
    const base = candidatas.length > 0 ? candidatas : dados.suprimentos
    return base.filter((p) => !b || p.insumo.toLowerCase().includes(b) || String(p.pedido).includes(b)).slice(0, 50)
  }, [candidatas, dados.suprimentos, busca])

  const alternar = (id) => setSelecionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const confirmar = async () => {
    setSalvando(true)
    try {
      if (entrada && await dados.vincularEntradaSuprimento(entrada.tabela, entrada.id, selecionados)) onFechar()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Sheet aberto={Boolean(entrada)} titulo="Vincular a um pedido de Suprimentos" onFechar={onFechar}>
      {entrada && (
        <div className="stack-2">
          <div className="t-caption">{entrada.nomeMaterial} · entrada de {formatarData(entrada.data)}</div>

          {candidatas.length > 1 && (
            <div className="alert info">
              Achou {candidatas.length} pedidos parecidos — se essa entrada juntou mais de um pedido do mesmo
              material, marque todos que se aplicam e a quantidade soma.
            </div>
          )}

          <input
            className="ipt" value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por insumo ou número do pedido…"
          />

          <div className="stack-1" style={{ maxHeight: 360, overflowY: 'auto' }}>
            {opcoes.length === 0 ? (
              <div className="t-caption">Nenhum pedido encontrado.</div>
            ) : opcoes.map((p) => {
              const marcado = selecionados.includes(p.id)
              return (
                <button
                  key={p.id} className="card-flat row-between" style={{ textAlign: 'left', width: '100%', cursor: 'pointer', alignItems: 'center', border: marcado ? '2px solid var(--primary)' : undefined }}
                  onClick={() => alternar(p.id)} disabled={salvando}
                >
                  <div>
                    <div className="t-strong" style={{ fontSize: 14 }}>{p.insumo}</div>
                    <div className="t-caption" style={{ marginTop: 2 }}>
                      Pedido {p.pedido} · {p.quantidade ?? '—'} · {p.estagio || '—'}
                    </div>
                  </div>
                  {marcado && <Icon name="check" size={18} />}
                </button>
              )
            })}
          </div>

          <button className="btn btn-primary btn-block" onClick={confirmar} disabled={salvando || selecionados.length === 0}>
            {salvando ? 'Vinculando…' : selecionados.length > 1 ? `Vincular ${selecionados.length} pedidos` : 'Vincular'}
          </button>
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
      setFeito({
        ...r, novos, atualizados, removidos: r.removidos || 0,
        vinculados: vinc?.vinculados || 0, destinosDetectados: vinc?.destinosDetectados || 0,
      })
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
              {feito.destinosDetectados > 0 && ` ${plural(feito.destinosDetectados, 'pedido teve', 'pedidos tiveram')} o Destino detectado sozinho.`}
            </div>
            {feito.removidos > 0 && (
              <div className="alert danger">
                {plural(feito.removidos, 'pedido em aberto sumiu', 'pedidos em aberto sumiram')} desta planilha e{' '}
                {plural(feito.removidos, 'foi removido', 'foram removidos')} — provavelmente cancelado ou excluído na origem.
              </div>
            )}
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

                {resultado.avisos?.length > 0 && (
                  <div className="alert info" style={{ lineHeight: 1.5 }}>
                    <div className="t-strong" style={{ marginBottom: 4 }}>
                      {plural(resultado.avisos.length, 'observação', 'observações')} sobre o realinhamento automático:
                    </div>
                    <div className="stack-1">
                      {resultado.avisos.map((a, i) => <div key={i} className="t-caption">{a}</div>)}
                    </div>
                  </div>
                )}

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
