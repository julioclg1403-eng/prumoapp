/* ============================================================
   CONTRATOS — itens de contrato importados do sistema (ERP) do
   Julio, planilha "CONTRATOS-UAU". Cada linha é um item de serviço
   dentro de um contrato, com os campos do contrato inteiro
   (fornecedor, valor contratado, valor medido, saldo) repetidos em
   toda linha — mesmo formato "achatado" da planilha de Suprimentos.

   O ponto central do módulo é o cruzamento: a mesma obra fecha vários
   contratos ao longo do tempo (original + aditivos, ou fornecedores
   diferentes) que reúsam o mesmo item de serviço (mesmo código) — o
   Dashboard soma a quantidade medida desse item em TODOS os
   contratos, pra saber o total realizado de verdade, não só dentro
   de um contrato isolado.

   "A Pagar" e "Retido" são um retrato do momento em que a planilha
   foi baixada (o Julio confirmou: é uma medição em andamento que
   ainda não tinha sido paga na hora da exportação, e isso muda a
   cada nova importação) — por isso o app nunca deriva um "valor
   pago" a partir daí, só mostra os números crus com a data da
   última importação ao lado.
   ============================================================ */

import { useState, useMemo, useEffect } from 'react'
import { useDados } from '../lib/DadosContext'
import { hojeISO, formatarData, formatarDinheiro, plural } from '../lib/dominio'
import { Icon, Chip, PageHeader, Segmentos, Sheet, Vazio, Indicador, Campo, Confirmar } from '../components'
import { RankingBarras, GraficoDonut } from '../components/charts'

const TOM_STATUS = { '1 - Aprovado': 'success', '2 - Em Aditivo': 'info', '0 - Não Aprovado': 'danger' }
const UNIDADES_PRINCIPAIS = ['M', 'M²', 'M³', 'UN', 'KG', 'H']
const DESTINOS = ['obra', 'projetos', 'outros']
const ROTULO_DESTINO = { obra: 'Obra', projetos: 'Projetos', outros: 'Outros' }

function formatarNumero(v) {
  if (v == null) return '—'
  return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

/* Um registro por contrato (cod_contrato), com os itens dele dentro —
   os campos do contrato inteiro se repetem em toda linha de item na
   planilha achatada, então pega só a primeira ocorrência de cada
   contrato e empilha os itens por baixo. Usado tanto na aba "Todos os
   dados" quanto em Controle de Medição (pra saber, ao escolher um
   contrato, se precisa de aditivo ou já dá pra medir). */
function agruparContratosComItens(itens) {
  const mapa = new Map()
  for (const i of itens) {
    if (!mapa.has(i.cod_contrato)) {
      mapa.set(i.cod_contrato, {
        cod_contrato: i.cod_contrato, objeto_contrato: i.objeto_contrato, fornecedor: i.fornecedor,
        status_contrato: i.status_contrato, situacao_contrato: i.situacao_contrato,
        total_contrato: i.total_contrato, saldo_contrato: i.saldo_contrato,
        valor_medido_contrato: i.valor_medido_contrato, retido: i.retido, a_pagar: i.a_pagar,
        destino: i.destino, company_id: i.company_id,
        itens: [],
      })
    }
    mapa.get(i.cod_contrato).itens.push(i)
  }
  for (const c of mapa.values()) c.itens.sort((a, b) => a.item_num - b.item_num)
  return [...mapa.values()].sort((a, b) => Number(b.cod_contrato) - Number(a.cod_contrato))
}

/* Itens de um contrato, com o saldo em destaque — usada tanto no
   sheet de estado da medição quanto no de agendar/mudar, sempre com
   o mesmo objetivo: mostrar, no momento de decidir, se ainda sobra
   quantidade contratada ou se precisa de aditivo antes de medir. */
function TabelaItensContrato({ itens }) {
  return (
    <div>
      <div className="t-micro" style={{ marginBottom: 6 }}>
        Itens do contrato — pra saber se precisa de aditivo antes de medir
      </div>
      <div className="scroll-x">
        <table className="tbl">
          <thead>
            <tr><th>Item</th><th>Unid</th><th>Qtde</th><th>Medida</th><th>Saldo</th></tr>
          </thead>
          <tbody>
            {itens.map((i) => {
              const saldoBaixo = Number(i.qtde_a_medir) <= 0
              return (
                <tr key={i.id}>
                  <td className="t-strong">{i.descricao_item}</td>
                  <td className="t-caption">{i.unidade || '—'}</td>
                  <td className="t-num">{formatarNumero(i.qtde_item)}</td>
                  <td className="t-num">{formatarNumero(i.qtde_medida)}</td>
                  <td className="t-num" style={saldoBaixo ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>
                    {formatarNumero(i.qtde_a_medir)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="t-caption" style={{ color: 'var(--text-2)', marginTop: 4 }}>
        Saldo em vermelho = já usou (quase) toda a quantidade contratada desse item — provavelmente precisa de aditivo antes de medir mais.
      </div>
    </div>
  )
}

export default function Contratos({ voltar, perfil, params = {} }) {
  const dados = useDados()
  const podeEditar = perfil.role !== 'campo'

  const [aba, setAba] = useState(params.aba === 'dashboard' ? 'dashboard' : 'dados')
  const [importando, setImportando] = useState(false)

  const itens = dados.contratos || []

  /* Um registro por contrato (os campos do contrato se repetem em
     toda linha de item — pega só a primeira ocorrência de cada). */
  const contratosUnicos = useMemo(() => {
    const mapa = new Map()
    for (const i of itens) {
      if (!mapa.has(i.cod_contrato)) {
        mapa.set(i.cod_contrato, {
          cod_contrato: i.cod_contrato, objeto_contrato: i.objeto_contrato, fornecedor: i.fornecedor,
          status_contrato: i.status_contrato, situacao_contrato: i.situacao_contrato,
          total_contrato: i.total_contrato, saldo_contrato: i.saldo_contrato,
          valor_medido_contrato: i.valor_medido_contrato, retido: i.retido, a_pagar: i.a_pagar,
          destino: i.destino, company_id: i.company_id,
        })
      }
    }
    return [...mapa.values()]
  }, [itens])

  const ultimaImportacao = useMemo(
    () => itens.reduce((max, i) => (i.atualizado_em > max ? i.atualizado_em : max), ''),
    [itens],
  )

  return (
    <>
      <div className="topbar">
        {voltar && <button onClick={voltar} aria-label="Voltar"><Icon name="voltar" size={22} /></button>}
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Contratos</div>
          <div className="sub">{dados.obra.nome}</div>
        </div>
      </div>

      <div className="page">
        <PageHeader
          titulo="Contratos"
          sub={`${plural(contratosUnicos.length, 'contrato importado', 'contratos importados')} · ${plural(itens.length, 'item', 'itens')}`}
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
              { valor: 'dados', rotulo: 'Todos os dados', contador: itens.length },
              { valor: 'dashboard', rotulo: 'Dashboard' },
              { valor: 'medicao', rotulo: 'Controle de Medição', contador: (dados.medicoesProgramadas || []).length },
            ]}
          />

          {itens.length === 0 ? (
            <div className="card-flat">
              <Vazio
                titulo="Nenhum contrato importado ainda"
                texto={
                  podeEditar
                    ? 'Importe a planilha "CONTRATOS-UAU" que você baixa do sistema.'
                    : 'A gestão ainda não importou os contratos desta obra.'
                }
                acao={podeEditar && <button className="btn btn-primary" onClick={() => setImportando(true)}>Importar planilha</button>}
              />
            </div>
          ) : (
            <>
              {aba === 'dados' && <AbaDados itens={itens} dados={dados} podeEditar={podeEditar} />}
              {aba === 'dashboard' && (
                <AbaDashboard itens={itens} contratosUnicos={contratosUnicos} ultimaImportacao={ultimaImportacao} />
              )}
              {aba === 'medicao' && <AbaControleMedicao dados={dados} podeEditar={podeEditar} />}
            </>
          )}
        </div>
      </div>

      <ImportarContratos aberto={importando} onFechar={() => setImportando(false)} dados={dados} />
    </>
  )
}

/* ── Todos os dados ────────────────────────────────────────── */

function AbaDados({ itens, dados, podeEditar }) {
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('todos')
  const [destinoFiltro, setDestinoFiltro] = useState('todos')
  const [detalhe, setDetalhe] = useState(null)
  const [contratoAberto, setContratoAberto] = useState(null)
  const [salvandoDestino, setSalvandoDestino] = useState(false)

  const statusList = useMemo(() => [...new Set(itens.map((i) => i.status_contrato).filter(Boolean))].sort(), [itens])

  /* Um cartão por contrato — nasce fechado, só com os dados gerais;
     clicar abre e mostra item a item. A busca só filtra QUAIS
     contratos aparecem (e, dentro deles, quais itens) — continua
     fechado até a pessoa clicar, mesmo com filtro ativo. */
  const contratosAgrupados = useMemo(() => agruparContratosComItens(itens), [itens])

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return contratosAgrupados
      .filter((c) => status === 'todos' || c.status_contrato === status)
      .filter((c) => destinoFiltro === 'todos' || (destinoFiltro === 'sem' ? !c.destino : c.destino === destinoFiltro))
      .map((c) => {
        if (!b) return c
        const contratoBate = (c.fornecedor || '').toLowerCase().includes(b)
          || (c.objeto_contrato || '').toLowerCase().includes(b)
          || String(c.cod_contrato).includes(b)
        if (contratoBate) return c
        const itensQueBatem = c.itens.filter((i) => i.descricao_item.toLowerCase().includes(b))
        return itensQueBatem.length ? { ...c, itens: itensQueBatem } : null
      })
      .filter(Boolean)
  }, [contratosAgrupados, busca, status, destinoFiltro])

  const detalheAtual = detalhe ? itens.find((i) => i.id === detalhe.id) : null

  return (
    <div className="stack-2">
      <div style={{ position: 'relative' }}>
        <Icon name="busca" size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
        <input
          className="ipt" style={{ paddingLeft: 34, width: '100%' }}
          value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por item, fornecedor, objeto ou número do contrato…"
        />
      </div>

      {statusList.length > 1 && (
        <div className="row-wrap" style={{ gap: 6 }}>
          <button className={`btn btn-sm ${status === 'todos' ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setStatus('todos')}>Todos</button>
          {statusList.map((s) => (
            <button key={s} className={`btn btn-sm ${status === s ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setStatus(s)}>{s}</button>
          ))}
        </div>
      )}

      <div className="row-wrap" style={{ gap: 6 }}>
        <span className="t-caption" style={{ alignSelf: 'center', marginRight: 2 }}>Destino:</span>
        <button className={`btn btn-sm ${destinoFiltro === 'todos' ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setDestinoFiltro('todos')}>Todos</button>
        {DESTINOS.map((d) => (
          <button key={d} className={`btn btn-sm ${destinoFiltro === d ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setDestinoFiltro(d)}>{ROTULO_DESTINO[d]}</button>
        ))}
        <button className={`btn btn-sm ${destinoFiltro === 'sem' ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setDestinoFiltro('sem')}>Sem destino</button>
      </div>

      {lista.length === 0 ? (
        <div className="card-flat"><Vazio titulo="Nada com esse filtro" texto="Troque a busca, o status ou o destino." /></div>
      ) : (
        <div className="stack-1">
          {lista.map((c) => {
            const aberto = contratoAberto === c.cod_contrato
            return (
              <div key={c.cod_contrato} className="card-flat" style={{ padding: 10 }}>
                <div
                  className="row-between"
                  style={{ alignItems: 'center', cursor: 'pointer' }}
                  onClick={() => setContratoAberto((v) => (v === c.cod_contrato ? null : c.cod_contrato))}
                >
                  <div className="row-flex" style={{ gap: 8, alignItems: 'center', minWidth: 0 }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="row-flex" style={{ gap: 6, alignItems: 'center' }}>
                        <span className="t-strong" style={{ fontSize: 14 }}>Contrato {c.cod_contrato}</span>
                        <Chip tom={TOM_STATUS[c.status_contrato] || ''}>{c.status_contrato || '—'}</Chip>
                        {c.destino && <Chip tom="info">{ROTULO_DESTINO[c.destino]}</Chip>}
                        {c.company_id && <Chip tom="success">{dados.nomeDe(dados.empresas, c.company_id)}</Chip>}
                      </div>
                      <div className="t-caption" style={{ marginTop: 2 }}>{c.fornecedor || 'Fornecedor não informado'}</div>
                      <div className="t-caption" style={{ color: 'var(--text-2)' }}>{c.objeto_contrato}</div>
                    </div>
                  </div>
                  <div className="row-flex" style={{ gap: 6, alignItems: 'center', flex: 'none' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div className="t-caption">Medido: <strong>{formatarDinheiro(c.valor_medido_contrato)}</strong></div>
                      <div className="t-caption">Contratado: {formatarDinheiro(c.total_contrato)}</div>
                    </div>
                    <Icon name="avancar" size={13} style={{ transform: `rotate(${aberto ? 90 : 0}deg)`, transition: 'transform .15s' }} />
                  </div>
                </div>

                {aberto && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
                    {podeEditar && (
                      <div className="row-wrap" style={{ gap: 6, marginBottom: 10, alignItems: 'center' }}>
                        <span className="t-caption" style={{ marginRight: 2 }}>Destino:</span>
                        {DESTINOS.map((d) => (
                          <button
                            key={d} disabled={salvandoDestino}
                            className={`btn btn-sm ${c.destino === d ? 'btn-dark' : 'btn-secondary'}`}
                            onClick={async () => {
                              setSalvandoDestino(true)
                              await dados.definirDestinoContrato(c.cod_contrato, d)
                              setSalvandoDestino(false)
                            }}
                          >
                            {ROTULO_DESTINO[d]}
                          </button>
                        ))}
                        {c.destino && (
                          <button
                            className="btn btn-sm btn-secondary" disabled={salvandoDestino}
                            onClick={async () => {
                              setSalvandoDestino(true)
                              await dados.definirDestinoContrato(c.cod_contrato, null)
                              setSalvandoDestino(false)
                            }}
                          >
                            Limpar
                          </button>
                        )}
                      </div>
                    )}
                    {podeEditar && (
                      <div className="row-flex" style={{ gap: 6, marginBottom: 10, alignItems: 'center' }}>
                        <span className="t-caption" style={{ marginRight: 2, flex: 'none' }}>Empresa vinculada:</span>
                        <select
                          className="sel" disabled={salvandoDestino}
                          value={c.company_id || ''}
                          onChange={async (e) => {
                            setSalvandoDestino(true)
                            await dados.definirEmpresaContrato(c.cod_contrato, e.target.value || null)
                            setSalvandoDestino(false)
                          }}
                        >
                          <option value="">Sem vínculo — fornecedor: {c.fornecedor || '—'}</option>
                          {(dados.empresas || []).filter((emp) => emp.ativo !== false).map((emp) => (
                            <option key={emp.id} value={emp.id}>{emp.nome}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="row-wrap" style={{ gap: 10, marginBottom: 10 }}>
                      <div style={{ flex: '1 1 110px' }}>
                        <div className="t-caption">Contratado</div>
                        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{formatarDinheiro(c.total_contrato)}</div>
                      </div>
                      <div style={{ flex: '1 1 110px' }}>
                        <div className="t-caption">Medido</div>
                        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{formatarDinheiro(c.valor_medido_contrato)}</div>
                      </div>
                      <div style={{ flex: '1 1 110px' }}>
                        <div className="t-caption">Saldo</div>
                        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{formatarDinheiro(c.saldo_contrato)}</div>
                      </div>
                      {Number(c.retido) > 0 && (
                        <div style={{ flex: '1 1 110px' }}>
                          <div className="t-caption">Retido</div>
                          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{formatarDinheiro(c.retido)}</div>
                        </div>
                      )}
                      {Number(c.a_pagar) > 0 && (
                        <div style={{ flex: '1 1 110px' }}>
                          <div className="t-caption">A pagar (na importação)</div>
                          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{formatarDinheiro(c.a_pagar)}</div>
                        </div>
                      )}
                    </div>
                    <div className="scroll-x">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Item</th><th>Unid</th><th>Qtde</th><th>Medida</th><th>Saldo</th><th>Preço unit.</th><th>Valor medido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.itens.map((i) => (
                          <tr key={i.id} onClick={() => setDetalhe(i)} style={{ cursor: 'pointer' }}>
                            <td className="t-strong">{i.descricao_item}</td>
                            <td className="t-caption">{i.unidade || '—'}</td>
                            <td className="t-num">{formatarNumero(i.qtde_item)}</td>
                            <td className="t-num">{formatarNumero(i.qtde_medida)}</td>
                            <td className="t-num">{formatarNumero(i.qtde_a_medir)}</td>
                            <td className="t-num">{formatarDinheiro(i.preco_item)}</td>
                            <td className="t-num">{formatarDinheiro(i.valor_medido_item)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <DetalheItem item={detalheAtual} onFechar={() => setDetalhe(null)} />
    </div>
  )
}

function DetalheItem({ item, onFechar }) {
  return (
    <Sheet aberto={Boolean(item)} titulo={item ? `Contrato ${item.cod_contrato}` : ''} onFechar={onFechar}>
      {item && (
        <div className="stack-2">
          <div>
            <div className="t-strong" style={{ fontSize: 15 }}>{item.objeto_contrato}</div>
            <div className="t-caption" style={{ marginTop: 2 }}>{item.fornecedor || 'Fornecedor não informado'}</div>
          </div>

          <div className="row-wrap" style={{ gap: 8 }}>
            <Chip tom={TOM_STATUS[item.status_contrato] || ''}>{item.status_contrato || 'Sem status'}</Chip>
            {item.situacao_contrato && <Chip tom="info">{item.situacao_contrato}</Chip>}
          </div>

          <div className="card-flat stack-1">
            <div className="t-micro">Contrato inteiro</div>
            <div className="row-wrap" style={{ gap: 10 }}>
              <div style={{ flex: '1 1 120px' }}>
                <div className="t-caption">Contratado</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{formatarDinheiro(item.total_contrato)}</div>
              </div>
              <div style={{ flex: '1 1 120px' }}>
                <div className="t-caption">Medido</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{formatarDinheiro(item.valor_medido_contrato)}</div>
              </div>
              <div style={{ flex: '1 1 120px' }}>
                <div className="t-caption">Saldo</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{formatarDinheiro(item.saldo_contrato)}</div>
              </div>
            </div>
            {(Number(item.retido) > 0 || Number(item.a_pagar) > 0) && (
              <div className="row-wrap" style={{ gap: 10, marginTop: 4 }}>
                {Number(item.retido) > 0 && (
                  <div style={{ flex: '1 1 120px' }}>
                    <div className="t-caption">Retido</div>
                    <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{formatarDinheiro(item.retido)}</div>
                  </div>
                )}
                {Number(item.a_pagar) > 0 && (
                  <div style={{ flex: '1 1 120px' }}>
                    <div className="t-caption">A pagar (na importação)</div>
                    <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{formatarDinheiro(item.a_pagar)}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card-flat stack-1">
            <div className="t-micro">Item {item.item_num} {item.codigo_servico ? `· ${item.codigo_servico}` : ''}</div>
            <div className="t-strong" style={{ fontSize: 14 }}>{item.descricao_item}</div>
            <div className="row-wrap" style={{ gap: 10, marginTop: 4 }}>
              <div style={{ flex: '1 1 120px' }}>
                <div className="t-caption">Qtde contratada</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{formatarNumero(item.qtde_item)} {item.unidade}</div>
              </div>
              <div style={{ flex: '1 1 120px' }}>
                <div className="t-caption">Preço unitário</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{formatarDinheiro(item.preco_item)}</div>
              </div>
              <div style={{ flex: '1 1 120px' }}>
                <div className="t-caption">Subtotal</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{formatarDinheiro(item.subtotal_item)}</div>
              </div>
            </div>
            <div className="row-wrap" style={{ gap: 10, marginTop: 4 }}>
              <div style={{ flex: '1 1 120px' }}>
                <div className="t-caption">Medido</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{formatarNumero(item.qtde_medida)} {item.unidade}</div>
                <div className="t-caption">{formatarDinheiro(item.valor_medido_item)}</div>
              </div>
              <div style={{ flex: '1 1 120px' }}>
                <div className="t-caption">A medir</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{formatarNumero(item.qtde_a_medir)} {item.unidade}</div>
                <div className="t-caption">{formatarDinheiro(item.valor_a_medir)}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  )
}

/* ── Dashboard ──────────────────────────────────────────────── */

function AbaDashboard({ itens, contratosUnicos, ultimaImportacao }) {
  const [buscaItem, setBuscaItem] = useState('')
  const [unidadeFiltro, setUnidadeFiltro] = useState('todas')

  const somar = (lista, campo) => lista.reduce((s, x) => s + (Number(x[campo]) || 0), 0)

  const totalContratado = somar(contratosUnicos, 'total_contrato')
  const totalMedido = somar(contratosUnicos, 'valor_medido_contrato')
  const totalSaldo = somar(contratosUnicos, 'saldo_contrato')
  const totalRetido = somar(contratosUnicos, 'retido')
  const totalAPagar = somar(contratosUnicos, 'a_pagar')

  /* Funil por status do contrato. */
  const porStatus = useMemo(() => {
    const mapa = new Map()
    for (const c of contratosUnicos) mapa.set(c.status_contrato || 'Sem status', (mapa.get(c.status_contrato || 'Sem status') || 0) + 1)
    return [...mapa.entries()].map(([status, quantidade]) => ({ status, quantidade })).sort((a, b) => b.quantidade - a.quantidade)
  }, [contratosUnicos])

  /* Top fornecedores por valor contratado. */
  const porFornecedor = useMemo(() => {
    const mapa = new Map()
    for (const c of contratosUnicos) {
      const nome = c.fornecedor || 'Sem fornecedor'
      const atual = mapa.get(nome) || { contratos: 0, contratado: 0, medido: 0 }
      atual.contratos += 1
      atual.contratado += Number(c.total_contrato) || 0
      atual.medido += Number(c.valor_medido_contrato) || 0
      mapa.set(nome, atual)
    }
    return [...mapa.entries()]
      .map(([fornecedor, info]) => ({ fornecedor, ...info }))
      .sort((a, b) => b.contratado - a.contratado)
      .slice(0, 15)
  }, [contratosUnicos])

  /* Contratos por destino (Obra/Projetos/Outros) — mesma ideia do
     "por tipo de material" do Suprimentos. */
  const porDestino = useMemo(() => {
    const mapa = new Map()
    for (const c of contratosUnicos) {
      const chave = c.destino || 'sem'
      const atual = mapa.get(chave) || { contratos: 0, contratado: 0 }
      atual.contratos += 1
      atual.contratado += Number(c.total_contrato) || 0
      mapa.set(chave, atual)
    }
    return [...DESTINOS, 'sem']
      .filter((d) => mapa.has(d))
      .map((d) => ({ destino: d, ...mapa.get(d) }))
  }, [contratosUnicos])

  /* Cruzamento entre contratos — mesmo item de serviço (código)
     aparecendo em mais de um contrato, com a quantidade medida
     somada. É o cruzamento que o Julio pediu: "quantidade medida"
     de verdade, olhando todos os contratos que têm aquele item. */
  const itensPorUnidade = unidadeFiltro === 'todas' ? itens : itens.filter((i) => (i.unidade || '') === unidadeFiltro)
  const cruzamento = useMemo(() => {
    const mapa = new Map()
    for (const i of itensPorUnidade) {
      const chave = i.codigo_servico || i.descricao_item
      if (!mapa.has(chave)) mapa.set(chave, { descricao: i.descricao_item, unidade: i.unidade, contratos: new Map() })
      const grupo = mapa.get(chave)
      if (!grupo.contratos.has(i.cod_contrato)) {
        grupo.contratos.set(i.cod_contrato, {
          cod_contrato: i.cod_contrato, fornecedor: i.fornecedor,
          qtdeContratada: 0, qtdeMedida: 0, valorMedido: 0,
        })
      }
      const c = grupo.contratos.get(i.cod_contrato)
      c.qtdeContratada += Number(i.qtde_item) || 0
      c.qtdeMedida += Number(i.qtde_medida) || 0
      c.valorMedido += Number(i.valor_medido_item) || 0
    }
    return [...mapa.values()]
      .map((g) => {
        const contratos = [...g.contratos.values()]
        return {
          descricao: g.descricao, unidade: g.unidade, contratos,
          qtdeContratada: contratos.reduce((s, c) => s + c.qtdeContratada, 0),
          qtdeMedida: contratos.reduce((s, c) => s + c.qtdeMedida, 0),
          valorMedido: contratos.reduce((s, c) => s + c.valorMedido, 0),
        }
      })
      .filter((g) => g.contratos.length > 1)
      .sort((a, b) => b.qtdeMedida - a.qtdeMedida)
  }, [itensPorUnidade])

  /* Busca por um item específico — pega todos os contratos que têm
     esse item (não só os que se repetem), pra achar um em especial. */
  const resultadosBusca = useMemo(() => {
    const termo = buscaItem.trim().toLowerCase()
    if (!termo) return []
    const mapa = new Map()
    for (const i of itensPorUnidade) {
      if (!i.descricao_item.toLowerCase().includes(termo)) continue
      const chave = i.codigo_servico || i.descricao_item
      if (!mapa.has(chave)) mapa.set(chave, { descricao: i.descricao_item, unidade: i.unidade, contratos: new Map() })
      const grupo = mapa.get(chave)
      if (!grupo.contratos.has(i.cod_contrato)) {
        grupo.contratos.set(i.cod_contrato, {
          cod_contrato: i.cod_contrato, fornecedor: i.fornecedor,
          qtdeContratada: 0, qtdeMedida: 0, valorMedido: 0,
        })
      }
      const c = grupo.contratos.get(i.cod_contrato)
      c.qtdeContratada += Number(i.qtde_item) || 0
      c.qtdeMedida += Number(i.qtde_medida) || 0
      c.valorMedido += Number(i.valor_medido_item) || 0
    }
    return [...mapa.values()]
      .map((g) => {
        const contratos = [...g.contratos.values()]
        return {
          descricao: g.descricao, unidade: g.unidade, contratos,
          qtdeContratada: contratos.reduce((s, c) => s + c.qtdeContratada, 0),
          qtdeMedida: contratos.reduce((s, c) => s + c.qtdeMedida, 0),
          valorMedido: contratos.reduce((s, c) => s + c.valorMedido, 0),
        }
      })
      .sort((a, b) => a.descricao.localeCompare(b.descricao))
  }, [itensPorUnidade, buscaItem])

  const unidadesDisponiveis = useMemo(
    () => UNIDADES_PRINCIPAIS.filter((u) => itens.some((i) => i.unidade === u)),
    [itens],
  )

  return (
    <div className="stack-2">
      <div className="row-wrap" style={{ gap: 10 }}>
        <div style={{ flex: '1 1 140px' }}><Indicador rotulo="Contratado" valor={formatarDinheiro(totalContratado)} /></div>
        <div style={{ flex: '1 1 140px' }}><Indicador rotulo="Medido" valor={formatarDinheiro(totalMedido)} /></div>
        <div style={{ flex: '1 1 140px' }}><Indicador rotulo="Saldo a medir" valor={formatarDinheiro(totalSaldo)} /></div>
        {totalRetido > 0 && (
          <div style={{ flex: '1 1 140px' }}><Indicador rotulo="Retido" valor={formatarDinheiro(totalRetido)} /></div>
        )}
        {totalAPagar > 0 && (
          <div style={{ flex: '1 1 140px' }}><Indicador rotulo="A pagar (na importação)" valor={formatarDinheiro(totalAPagar)} /></div>
        )}
      </div>
      {(totalRetido > 0 || totalAPagar > 0) && (
        <div className="t-caption" style={{ color: 'var(--text-2)' }}>
          "A pagar" e "Retido" são um retrato do momento da última importação{ultimaImportacao ? ` (${formatarData(ultimaImportacao.slice(0, 10))})` : ''} —
          pode já ter mudado desde então. Reimporte a planilha pra atualizar.
        </div>
      )}

      <div className="row-wrap" style={{ gap: 12 }}>
        <div className="card-flat chart-panel stack-2" style={{ flex: '1 1 320px' }}>
          <div className="t-micro">Contratos por destino</div>
          <GraficoDonut
            itens={porDestino.map((d) => ({
              chave: d.destino, rotulo: `${d.destino === 'sem' ? 'Sem destino' : ROTULO_DESTINO[d.destino]} (${d.contratos})`,
              valor: d.contratado,
            }))}
            formatarValor={formatarDinheiro}
          />
        </div>

        <div className="card-flat chart-panel stack-2" style={{ flex: '1 1 320px' }}>
          <div className="t-micro">Contratos por status</div>
          <RankingBarras
            itens={porStatus.map((s) => ({ chave: s.status, rotulo: s.status, valor: s.quantidade }))}
            formatarValor={(v) => String(v)}
          />
        </div>
      </div>

      <div className="card-flat chart-panel stack-2">
        <div className="t-micro">Fornecedores (top 15, por valor contratado)</div>
        <RankingBarras
          itens={porFornecedor.map((f) => ({ chave: f.fornecedor, rotulo: f.fornecedor, valor: f.contratado, contador: f.contratos }))}
          formatarValor={formatarDinheiro}
        />
      </div>

      {unidadesDisponiveis.length > 0 && (
        <div className="row-wrap" style={{ gap: 6 }}>
          <span className="t-caption" style={{ alignSelf: 'center', marginRight: 2 }}>Unidade:</span>
          <button className={`btn btn-sm ${unidadeFiltro === 'todas' ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setUnidadeFiltro('todas')}>Todas</button>
          {unidadesDisponiveis.map((u) => (
            <button key={u} className={`btn btn-sm ${unidadeFiltro === u ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setUnidadeFiltro(u)}>{u}</button>
          ))}
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <Icon name="busca" size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
        <input
          className="ipt" style={{ paddingLeft: 34, width: '100%' }}
          value={buscaItem} onChange={(e) => setBuscaItem(e.target.value)}
          placeholder="Buscar um item específico entre todos os contratos…"
        />
      </div>

      {buscaItem.trim() ? (
        resultadosBusca.length === 0 ? (
          <div className="card-flat"><Vazio titulo="Nada com esse nome" texto="Troque a busca — o filtro de unidade acima continua valendo." /></div>
        ) : (
          <GrupoCruzamento titulo={`Resultado da busca (${resultadosBusca.length})`} grupos={resultadosBusca} />
        )
      ) : (
        <GrupoCruzamento
          titulo="Cruzamento entre contratos — mesmo item, contratos diferentes"
          subtitulo={
            cruzamento.length === 0
              ? null
              : 'Cada linha é um item de serviço que aparece em mais de um contrato — a quantidade medida somada de todos eles.'
          }
          grupos={cruzamento}
          vazio="Nenhum item se repete em mais de um contrato ainda (com esse filtro de unidade)."
        />
      )}
    </div>
  )
}

function GrupoCruzamento({ titulo, subtitulo, grupos, vazio }) {
  return (
    <div className="card-flat stack-2">
      <div>
        <div className="t-micro">{titulo}</div>
        {subtitulo && <div className="t-caption" style={{ marginTop: 2, color: 'var(--text-2)' }}>{subtitulo}</div>}
      </div>
      {grupos.length === 0 ? (
        <div className="t-caption">{vazio || 'Nada aqui.'}</div>
      ) : (
        <div className="stack-2">
          {grupos.map((g) => (
            <div key={g.descricao} style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <div className="row-between" style={{ alignItems: 'flex-start' }}>
                <div className="t-strong" style={{ fontSize: 14, maxWidth: '65%' }}>{g.descricao}</div>
                <div style={{ textAlign: 'right' }}>
                  <div className="t-caption">Medido: <strong>{formatarNumero(g.qtdeMedida)} {g.unidade}</strong></div>
                  <div className="t-caption">Contratado: {formatarNumero(g.qtdeContratada)} {g.unidade}</div>
                  <div className="t-caption">{formatarDinheiro(g.valorMedido)}</div>
                </div>
              </div>
              <div className="stack-1" style={{ marginTop: 6 }}>
                {g.contratos.map((c) => (
                  <div key={c.cod_contrato} className="row-between t-caption" style={{ color: 'var(--text-2)' }}>
                    <span>Contrato {c.cod_contrato} · {c.fornecedor || 'sem fornecedor'}</span>
                    <span>{formatarNumero(c.qtdeMedida)} {g.unidade} medido</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Controle de Medição ────────────────────────────────────── */

const DIAS_RECORRENCIA = [1, 10, 20]

const STATUS_MEDICAO = [
  { valor: 'programada', rotulo: 'Programada', tom: '' },
  { valor: 'aguardando_aditivo', rotulo: 'Aguardando aditivo', tom: 'danger' },
  { valor: 'medicao_feita', rotulo: 'Medição feita', tom: 'success' },
  { valor: 'lancamento_nota', rotulo: 'Nota em lançamento', tom: 'info' },
]

function infoStatus(valor) {
  return STATUS_MEDICAO.find((s) => s.valor === valor) || STATUS_MEDICAO[0]
}

function ultimoDiaDoMes(aaaaMM) {
  const [ano, mes] = aaaaMM.split('-').map(Number)
  return new Date(ano, mes, 0).getDate()
}

function rotuloMes(aaaaMM) {
  const [ano, mes] = aaaaMM.split('-').map(Number)
  const nome = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return nome.charAt(0).toUpperCase() + nome.slice(1)
}

function somarMes(aaaaMM, delta) {
  const [ano, mes] = aaaaMM.split('-').map(Number)
  const d = new Date(ano, mes - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/* Data programada de medição por empresa. Cada linha é uma medição
   AVULSA (data fixa) ou RECORRENTE (dia do mês, repete sozinha, com
   uma lista de meses excluídos pra quando um mês específico é
   retirado ou muda de data sem afetar os outros). O saldo/andamento
   de verdade continua vindo do módulo Produtividade (eventos de
   marcação ligados a um item de contrato) — aqui só cruzamos: pra
   cada empresa agendada num mês, somamos quantidade × preço dos
   eventos daquele mês cujo item de contrato pertence a essa empresa.
   Como um mesmo mês pode ter itens de unidades diferentes (m³, kg,
   m²…), o cruzamento é sempre reportado em R$, nunca em quantidade
   "crua". */
function AbaControleMedicao({ dados, podeEditar }) {
  const [periodo, setPeriodo] = useState(() => hojeISO().slice(0, 7))
  const [sheetAberta, setSheetAberta] = useState(false)
  const [contexto, setContexto] = useState({ modo: 'nova' })
  const [excluindo, setExcluindo] = useState(null)
  const [excluindoSerie, setExcluindoSerie] = useState(null)
  const [detalheId, setDetalheId] = useState(null)

  const medicoes = dados.medicoesProgramadas || []
  const contratosAgrupados = useMemo(() => agruparContratosComItens(dados.contratos || []), [dados.contratos])
  const contratosPorCodigo = useMemo(() => new Map(contratosAgrupados.map((c) => [c.cod_contrato, c])), [contratosAgrupados])

  const ocorrenciasDoPeriodo = useMemo(() => {
    const lista = []
    for (const m of medicoes) {
      if (m.recorrente) {
        if ((m.meses_excluidos || []).includes(periodo)) continue
        const dia = Math.min(m.dia_mes, ultimoDiaDoMes(periodo))
        const status = (m.status_por_mes || {})[periodo] || m.status || 'programada'
        lista.push({ ...m, dataOcorrencia: `${periodo}-${String(dia).padStart(2, '0')}`, status })
      } else if (m.data && m.data.slice(0, 7) === periodo) {
        lista.push({ ...m, dataOcorrencia: m.data, status: m.status || 'programada' })
      }
    }
    return lista.sort((a, b) => a.dataOcorrencia.localeCompare(b.dataOcorrencia))
  }, [medicoes, periodo])

  const porData = useMemo(() => {
    const mapa = new Map()
    for (const oc of ocorrenciasDoPeriodo) {
      if (!mapa.has(oc.dataOcorrencia)) mapa.set(oc.dataOcorrencia, [])
      mapa.get(oc.dataOcorrencia).push(oc)
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [ocorrenciasDoPeriodo])

  /* "empresa|AAAA-MM" -> valor medido no módulo Produtividade naquele mês. */
  const { medidoPorEmpresaMes, empresasComItens, itensPorId } = useMemo(() => {
    const itensPorId = new Map((dados.contratos || []).map((i) => [i.id, i]))
    const empresasComItens = new Set((dados.contratos || []).filter((i) => i.company_id).map((i) => i.company_id))
    const medidoPorEmpresaMes = new Map()
    for (const ev of dados.eventosProducao || []) {
      if (!ev.contract_item_id || !ev.data_execucao) continue
      const item = itensPorId.get(ev.contract_item_id)
      if (!item?.company_id) continue
      const chave = `${item.company_id}|${ev.data_execucao.slice(0, 7)}`
      const valor = (Number(ev.quantidade) || 0) * (Number(item.preco_item) || 0)
      medidoPorEmpresaMes.set(chave, (medidoPorEmpresaMes.get(chave) || 0) + valor)
    }
    return { medidoPorEmpresaMes, empresasComItens, itensPorId }
  }, [dados.contratos, dados.eventosProducao])

  /* "codContrato|AAAA-MM" -> valor lançado no boletim manual naquele
     mês — canal totalmente separado do de Produtividade acima (serviço
     mensal/fixo, sem marcação física), nunca somado com ele: cada um
     aparece na tela como sua própria linha. */
  const manualPorContratoMes = useMemo(() => {
    const mapa = new Map()
    for (const m of dados.medicoesManuais || []) {
      const item = itensPorId.get(m.contract_item_id)
      if (!item) continue
      const chave = `${item.cod_contrato}|${m.periodo}`
      mapa.set(chave, (mapa.get(chave) || 0) + (Number(m.valor) || 0))
    }
    return mapa
  }, [dados.medicoesManuais, itensPorId])

  const abrirNova = () => { setContexto({ modo: 'nova' }); setSheetAberta(true) }
  const abrirMudarOcorrencia = (oc) => {
    setContexto(oc.recorrente ? { modo: 'ocorrencia', item: oc } : { modo: 'avulsa', item: oc })
    setSheetAberta(true)
  }
  const abrirEditarSerie = (oc) => { setContexto({ modo: 'serie', item: oc }); setSheetAberta(true) }

  const ocorrenciaDetalhe = ocorrenciasDoPeriodo.find((oc) => oc.id === detalheId) || null

  return (
    <div className="stack-2">
      {podeEditar && (
        <button className="btn btn-primary" onClick={abrirNova}>
          Nova medição programada
        </button>
      )}

      <div className="row-between" style={{ alignItems: 'center' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setPeriodo((p) => somarMes(p, -1))}>‹ Anterior</button>
        <div className="t-strong">{rotuloMes(periodo)}</div>
        <button className="btn btn-ghost btn-sm" onClick={() => setPeriodo((p) => somarMes(p, 1))}>Próximo ›</button>
      </div>

      {porData.length === 0 ? (
        <div className="card-flat">
          <Vazio
            titulo="Nenhuma medição programada neste mês"
            texto="Cadastre as datas em que cada empresa faz medição — dá pra deixar fixa (recorrente, ex.: todo dia 1, 10 ou 20) ou avulsa."
          />
        </div>
      ) : (
        <div className="stack-2">
          {porData.map(([data, lista]) => (
            <div key={data} className="card-flat stack-1">
              <div className="t-strong" style={{ fontSize: 14 }}>{formatarData(data)}</div>
              <div className="stack-1">
                {lista.map((oc) => {
                  const contrato = oc.cod_contrato ? contratosPorCodigo.get(oc.cod_contrato) : null
                  const nomeEmpresa = oc.company_id
                    ? dados.nomeDe(dados.empresas, oc.company_id)
                    : (contrato?.fornecedor || dados.nomeDe(dados.empresas, oc.company_id))
                  const valorMedido = medidoPorEmpresaMes.get(`${oc.company_id}|${data.slice(0, 7)}`) || 0
                  const valorManual = oc.cod_contrato ? (manualPorContratoMes.get(`${oc.cod_contrato}|${data.slice(0, 7)}`) || 0) : 0
                  const temItens = empresasComItens.has(oc.company_id)
                  return (
                    <div
                      key={oc.id} className="row-between"
                      style={{ alignItems: 'flex-start', borderTop: '1px solid var(--border)', paddingTop: 8 }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div className="row-flex" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span
                            className="t-strong" style={{ fontSize: 13, cursor: 'pointer', textDecoration: 'underline dotted' }}
                            onClick={() => setDetalheId(oc.id)}
                          >
                            {contrato ? `Contrato ${contrato.cod_contrato} — ${nomeEmpresa}` : nomeEmpresa}
                          </span>
                          <Chip tom={infoStatus(oc.status).tom}>{infoStatus(oc.status).rotulo}</Chip>
                          {oc.recorrente && <Chip tom="info">Recorrente · todo dia {oc.dia_mes}</Chip>}
                        </div>
                        {!oc.cod_contrato && (
                          <div className="t-caption" style={{ color: 'var(--danger)' }}>
                            Ainda não ligada a um contrato específico — clique em "Mudar" para escolher.
                          </div>
                        )}
                        {oc.observacao && <div className="t-caption" style={{ color: 'var(--text-2)' }}>{oc.observacao}</div>}
                        <div className="t-caption" style={{ marginTop: 2 }}>
                          {temItens
                            ? <>Medido no mês (Produtividade): <strong>{formatarDinheiro(valorMedido)}</strong></>
                            : 'Sem item de contrato vinculado a essa empresa ainda'}
                        </div>
                        {valorManual > 0 && (
                          <div className="t-caption">
                            Medido no mês (manual): <strong>{formatarDinheiro(valorManual)}</strong>
                          </div>
                        )}
                        {podeEditar && oc.recorrente && (
                          <div className="row-flex" style={{ gap: 10 }}>
                            <button
                              className="btn btn-ghost btn-sm" style={{ marginTop: 2, padding: '2px 0', height: 'auto', color: 'var(--primary)' }}
                              onClick={() => abrirEditarSerie(oc)}
                            >
                              Editar recorrência
                            </button>
                            <button
                              className="btn btn-ghost btn-sm" style={{ marginTop: 2, padding: '2px 0', height: 'auto', color: 'var(--danger)' }}
                              onClick={() => setExcluindoSerie(oc)}
                            >
                              Excluir recorrência
                            </button>
                          </div>
                        )}
                      </div>
                      {podeEditar && (
                        <div className="row-flex" style={{ gap: 6, flex: 'none' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => abrirMudarOcorrencia(oc)}>Mudar</button>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setExcluindo(oc)}>
                            {oc.recorrente ? 'Pular este mês' : 'Retirar'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <SheetMedicaoProgramada
        aberto={sheetAberta}
        contexto={contexto}
        periodo={periodo}
        dados={dados}
        contratosAgrupados={contratosAgrupados}
        onFechar={() => setSheetAberta(false)}
      />

      <SheetEstadoMedicao
        aberto={Boolean(ocorrenciaDetalhe)}
        ocorrencia={ocorrenciaDetalhe}
        periodo={periodo}
        dados={dados}
        contrato={ocorrenciaDetalhe?.cod_contrato ? contratosPorCodigo.get(ocorrenciaDetalhe.cod_contrato) : null}
        valorMedido={ocorrenciaDetalhe ? (medidoPorEmpresaMes.get(`${ocorrenciaDetalhe.company_id}|${periodo}`) || 0) : 0}
        temItens={ocorrenciaDetalhe ? empresasComItens.has(ocorrenciaDetalhe.company_id) : false}
        podeEditar={podeEditar}
        onFechar={() => setDetalheId(null)}
      />

      <Confirmar
        aberto={Boolean(excluindo)}
        titulo={excluindo?.recorrente ? `Pular a medição de ${rotuloMes(periodo)}?` : 'Retirar esta medição programada?'}
        texto={excluindo ? `${dados.nomeDe(dados.empresas, excluindo.company_id)} — ${formatarData(excluindo.dataOcorrencia)}${excluindo.recorrente ? ' (os outros meses da recorrência continuam)' : ''}` : ''}
        perigo
        onCancelar={() => setExcluindo(null)}
        onOk={async () => {
          if (excluindo.recorrente) await dados.excluirOcorrenciaRecorrente(excluindo.id, periodo)
          else await dados.excluirMedicaoProgramada(excluindo.id)
          setExcluindo(null)
        }}
      />

      <Confirmar
        aberto={Boolean(excluindoSerie)}
        titulo="Excluir toda a recorrência?"
        texto={excluindoSerie ? `${dados.nomeDe(dados.empresas, excluindoSerie.company_id)} — todo dia ${excluindoSerie.dia_mes}, em todos os meses. Use quando a empresa sair da obra.` : ''}
        perigo
        onCancelar={() => setExcluindoSerie(null)}
        onOk={async () => {
          await dados.excluirMedicaoProgramada(excluindoSerie.id)
          setExcluindoSerie(null)
        }}
      />
    </div>
  )
}

/* Estado da medição de uma ocorrência específica (empresa + mês em
   exibição) — separado do "mudar data", porque isso é sobre O QUE
   está acontecendo com a medição (precisa de aditivo? já foi feita?
   nota em lançamento?), não sobre quando ela é. */
function SheetEstadoMedicao({ aberto, ocorrencia, periodo, dados, contrato, valorMedido, temItens, podeEditar, onFechar }) {
  const [salvando, setSalvando] = useState(false)

  const nomeEmpresa = ocorrencia
    ? (ocorrencia.company_id ? dados.nomeDe(dados.empresas, ocorrencia.company_id) : (contrato?.fornecedor || '—'))
    : ''

  const escolher = async (status) => {
    if (!ocorrencia || !podeEditar) return
    setSalvando(true)
    try {
      await dados.salvarStatusMedicao(ocorrencia, periodo, status)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Sheet aberto={aberto} titulo={contrato ? `Contrato ${contrato.cod_contrato} — ${nomeEmpresa}` : nomeEmpresa} onFechar={onFechar}>
      {ocorrencia && (
        <div className="stack-2">
          <div className="t-caption">
            {formatarData(ocorrencia.dataOcorrencia)}
            {ocorrencia.recorrente ? ` · recorrente, todo dia ${ocorrencia.dia_mes}` : ''}
          </div>
          {ocorrencia.observacao && <div className="t-caption" style={{ color: 'var(--text-2)' }}>{ocorrencia.observacao}</div>}
          <div className="card-flat">
            <div className="t-caption">Cruzamento com Produtividade</div>
            <div className="t-caption" style={{ marginTop: 2 }}>
              {temItens
                ? <>Medido no mês: <strong>{formatarDinheiro(valorMedido)}</strong></>
                : 'Sem item de contrato vinculado a essa empresa ainda'}
            </div>
          </div>

          {contrato && <TabelaItensContrato itens={contrato.itens} />}

          <Campo label="Estado da medição">
            <div className="stack-1">
              {STATUS_MEDICAO.map((s) => (
                <button
                  key={s.valor} disabled={salvando || !podeEditar}
                  className={`btn btn-block ${ocorrencia.status === s.valor ? 'btn-dark' : 'btn-secondary'}`}
                  style={{ justifyContent: 'flex-start' }}
                  onClick={() => escolher(s.valor)}
                >
                  {s.rotulo}
                </button>
              ))}
            </div>
          </Campo>

          {contrato && (
            <BoletimManual contrato={contrato} periodo={periodo} dados={dados} podeEditar={podeEditar} />
          )}
        </div>
      )}
    </Sheet>
  )
}

/* Boletim de medição "manual": pra item de contrato mensal/fixo (ex.:
   mobilização, administração local) que não passa por marcação física
   no Produtividade — a pessoa lança direto quanto foi medido naquele
   mês. Canal separado de propósito: nunca lê nem escreve em cima do
   que vem de Produtividade (eventosProducao/marcadoresProducao), só
   soma ao lado (ver manualPorContratoMes em AbaControleMedicao). */
function BoletimManual({ contrato, periodo, dados, podeEditar }) {
  const [lancando, setLancando] = useState(false)
  const [itemId, setItemId] = useState('')
  const [quantidade, setQuantidade] = useState('1')
  const [valor, setValor] = useState('')
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [excluindo, setExcluindo] = useState(null)

  const entradas = useMemo(() => {
    const idsDoContrato = new Set(contrato.itens.map((i) => i.id))
    return (dados.medicoesManuais || [])
      .filter((m) => m.periodo === periodo && idsDoContrato.has(m.contract_item_id))
      .sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1))
  }, [dados.medicoesManuais, contrato, periodo])

  const itemEscolhido = contrato.itens.find((i) => i.id === itemId)

  const escolherItem = (id) => {
    setItemId(id)
    const item = contrato.itens.find((i) => i.id === id)
    if (item) setValor(String((Number(quantidade) || 0) * (Number(item.preco_item) || 0)))
  }

  const mudarQuantidade = (texto) => {
    setQuantidade(texto)
    if (itemEscolhido) setValor(String((Number(texto) || 0) * (Number(itemEscolhido.preco_item) || 0)))
  }

  const abrirNovo = () => {
    setItemId(''); setQuantidade('1'); setValor(''); setObservacao(''); setLancando(true)
  }

  const salvar = async () => {
    if (!itemId || !Number(valor)) return
    setSalvando(true)
    try {
      const salvo = await dados.salvarMedicaoManual({ contract_item_id: itemId, periodo, quantidade, valor, observacao })
      if (salvo) setLancando(false)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div>
      <div className="row-between" style={{ alignItems: 'center', marginBottom: 6 }}>
        <div className="t-micro">Boletim de medição manual — serviços mensais/fixos ({rotuloMes(periodo)})</div>
        {podeEditar && !lancando && (
          <button className="btn btn-ghost btn-sm" onClick={abrirNovo}>
            <Icon name="mais_sinal" size={14} /> Lançar
          </button>
        )}
      </div>

      {entradas.length === 0 && !lancando && (
        <div className="t-caption" style={{ color: 'var(--text-2)' }}>Nada lançado à mão neste mês ainda.</div>
      )}

      {entradas.length > 0 && (
        <div className="stack-1" style={{ marginBottom: lancando ? 10 : 0 }}>
          {entradas.map((m) => {
            const item = contrato.itens.find((i) => i.id === m.contract_item_id)
            return (
              <div key={m.id} className="row-between card-flat" style={{ padding: 8, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="t-strong" style={{ fontSize: 12 }}>{item?.descricao_item || 'Item removido'}</div>
                  <div className="t-caption">{formatarNumero(m.quantidade)} × {formatarDinheiro(Number(m.valor) / (Number(m.quantidade) || 1))} = {formatarDinheiro(m.valor)}</div>
                  {m.observacao && <div className="t-caption" style={{ color: 'var(--text-2)' }}>{m.observacao}</div>}
                </div>
                {podeEditar && (
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setExcluindo(m)}>
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {lancando && (
        <div className="stack-1 card-flat" style={{ padding: 10 }}>
          <Campo label="Item do contrato">
            <select className="sel" value={itemId} onChange={(e) => escolherItem(e.target.value)}>
              <option value="">Selecione…</option>
              {contrato.itens.map((i) => (
                <option key={i.id} value={i.id}>{i.descricao_item}</option>
              ))}
            </select>
          </Campo>
          <div className="row-flex">
            <Campo label="Quantidade">
              <input className="ipt" type="number" min="0" step="any" value={quantidade} onChange={(e) => mudarQuantidade(e.target.value)} />
            </Campo>
            <Campo label="Valor" dica={itemEscolhido ? `Sugerido: ${formatarNumero(quantidade)} × ${formatarDinheiro(itemEscolhido.preco_item)}` : undefined}>
              <input className="ipt" type="number" min="0" step="any" value={valor} onChange={(e) => setValor(e.target.value)} />
            </Campo>
          </div>
          <Campo label="Observação (opcional)">
            <input className="ipt" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: mobilização de setembro" />
          </Campo>
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setLancando(false)}>Cancelar</button>
            <button className="btn btn-primary grow" disabled={!itemId || !Number(valor) || salvando} onClick={salvar}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      <Confirmar
        aberto={Boolean(excluindo)}
        titulo="Excluir este lançamento manual?"
        texto={excluindo ? `${formatarDinheiro(excluindo.valor)} sai do boletim deste mês. Isso não tem volta.` : ''}
        perigo
        onCancelar={() => setExcluindo(null)}
        onOk={async () => { const m = excluindo; setExcluindo(null); if (m) await dados.excluirMedicaoManual(m.id) }}
      />
    </div>
  )
}

/* contexto.modo:
   - 'nova': cadastro do zero, escolhe avulsa ou recorrente.
   - 'serie': edita a recorrência inteira (empresa/dia do mês), com
     opção de excluir a série toda.
   - 'ocorrencia': muda só o mês em exibição de uma recorrência —
     exclui aquele mês da série e cria uma medição avulsa no lugar.
   - 'avulsa': edita uma medição avulsa já existente. */
function SheetMedicaoProgramada({ aberto, contexto, periodo, dados, contratosAgrupados, onFechar }) {
  const [codContrato, setCodContrato] = useState('')
  const [recorrente, setRecorrente] = useState(false)
  const [diaMes, setDiaMes] = useState(1)
  const [data, setData] = useState('')
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [excluindoSerie, setExcluindoSerie] = useState(false)

  const modo = contexto?.modo || 'nova'
  const item = contexto?.item

  useEffect(() => {
    if (!aberto) return
    if (modo === 'serie') {
      setCodContrato(item.cod_contrato || ''); setRecorrente(true); setDiaMes(item.dia_mes || 1)
      setData(''); setObservacao(item.observacao || '')
    } else if (modo === 'ocorrencia') {
      const dia = Math.min(item.dia_mes, ultimoDiaDoMes(periodo))
      setCodContrato(item.cod_contrato || ''); setRecorrente(false)
      setData(`${periodo}-${String(dia).padStart(2, '0')}`); setObservacao(item.observacao || '')
    } else if (modo === 'avulsa') {
      setCodContrato(item.cod_contrato || ''); setRecorrente(false)
      setData(item.data); setObservacao(item.observacao || '')
    } else {
      setCodContrato(''); setRecorrente(false); setDiaMes(1)
      setData(hojeISO()); setObservacao('')
    }
  }, [aberto, modo, item, periodo])

  const titulo = {
    nova: 'Nova medição programada',
    serie: 'Editar recorrência',
    ocorrencia: `Mudar medição de ${rotuloMes(periodo)}`,
    avulsa: 'Mudar data da medição',
  }[modo]

  const contratoSelecionado = contratosAgrupados.find((c) => c.cod_contrato === codContrato) || null
  const companyId = contratoSelecionado?.company_id || null
  const podeSalvar = Boolean(codContrato) && (recorrente ? Boolean(diaMes) : Boolean(data))

  const salvar = async () => {
    if (!podeSalvar) return
    setSalvando(true)
    try {
      if (modo === 'ocorrencia') {
        await dados.excluirOcorrenciaRecorrente(item.id, periodo)
        const salvo = await dados.salvarMedicaoProgramada({ company_id: companyId, cod_contrato: codContrato, recorrente: false, data, observacao })
        if (salvo) onFechar()
        return
      }
      const salvo = await dados.salvarMedicaoProgramada({
        id: modo === 'serie' || modo === 'avulsa' ? item.id : undefined,
        company_id: companyId, cod_contrato: codContrato, recorrente, dia_mes: diaMes, data, observacao,
      })
      if (salvo) onFechar()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <Sheet aberto={aberto} titulo={titulo} onFechar={onFechar}>
        <div className="stack-2">
          <Campo label="Contrato">
            <select className="sel" value={codContrato} onChange={(e) => setCodContrato(e.target.value)}>
              <option value="">Selecione…</option>
              {contratosAgrupados.map((c) => (
                <option key={c.cod_contrato} value={c.cod_contrato}>
                  Contrato {c.cod_contrato} — {c.fornecedor || c.objeto_contrato || 'sem descrição'}
                  {!c.company_id ? ' (sem empresa vinculada)' : ''}
                </option>
              ))}
            </select>
          </Campo>

          {codContrato && !companyId && (
            <div className="t-caption" style={{ color: 'var(--text-2)' }}>
              Esse contrato ainda não tem empresa vinculada (Todos os dados → abrir o contrato → Empresa vinculada) — dá pra agendar assim mesmo, só o cruzamento com Produtividade não vai aparecer até vincular.
            </div>
          )}

          {contratoSelecionado && <TabelaItensContrato itens={contratoSelecionado.itens} />}

          {modo === 'nova' && (
            <div className="row-wrap" style={{ gap: 6 }}>
              <button
                className={`btn btn-sm ${!recorrente ? 'btn-dark' : 'btn-secondary'}`}
                onClick={() => setRecorrente(false)}
              >
                Data única
              </button>
              <button
                className={`btn btn-sm ${recorrente ? 'btn-dark' : 'btn-secondary'}`}
                onClick={() => setRecorrente(true)}
              >
                Recorrente (todo mês)
              </button>
            </div>
          )}

          {modo === 'ocorrencia' && (
            <div className="t-caption" style={{ color: 'var(--text-2)' }}>
              Isso muda só a medição de {rotuloMes(periodo)}. Os outros meses continuam no dia {item?.dia_mes}.
            </div>
          )}

          {(modo === 'serie' || (modo === 'nova' && recorrente)) ? (
            <Campo label="Dia da recorrência">
              <div className="row-wrap" style={{ gap: 6, alignItems: 'center' }}>
                {DIAS_RECORRENCIA.map((d) => (
                  <button
                    key={d} type="button"
                    className={`btn btn-sm ${diaMes === d ? 'btn-dark' : 'btn-secondary'}`}
                    onClick={() => setDiaMes(d)}
                  >
                    Dia {d}
                  </button>
                ))}
                <input
                  type="number" min={1} max={31} className="ipt" style={{ width: 70 }}
                  value={diaMes} onChange={(e) => setDiaMes(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
                />
              </div>
            </Campo>
          ) : (
            <Campo label="Data da medição">
              <input type="date" className="ipt" value={data} onChange={(e) => setData(e.target.value)} />
            </Campo>
          )}

          <Campo label="Observação (opcional)">
            <input
              className="ipt" value={observacao} onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: medição parcial, aditivo…"
            />
          </Campo>

          <button
            className="btn btn-primary btn-block"
            disabled={!podeSalvar || salvando}
            onClick={salvar}
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>

          {modo === 'serie' && (
            <button className="btn btn-ghost btn-block" style={{ color: 'var(--danger)' }} onClick={() => setExcluindoSerie(true)}>
              Excluir toda a recorrência
            </button>
          )}
        </div>
      </Sheet>

      <Confirmar
        aberto={excluindoSerie}
        titulo="Excluir toda a recorrência?"
        texto={item ? `${item.cod_contrato ? `Contrato ${item.cod_contrato}` : dados.nomeDe(dados.empresas, item.company_id)} — todo dia ${item.dia_mes}, em todos os meses.` : ''}
        perigo
        onCancelar={() => setExcluindoSerie(false)}
        onOk={async () => {
          await dados.excluirMedicaoProgramada(item.id)
          setExcluindoSerie(false)
          onFechar()
        }}
      />
    </>
  )
}

/* ── Importar planilha ─────────────────────────────────────── */

function ImportarContratos({ aberto, onFechar, dados }) {
  const [lendo, setLendo] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [importandoAgora, setImportandoAgora] = useState(false)
  const [feito, setFeito] = useState(null)

  const fechar = () => {
    setResultado(null); setNomeArquivo(''); setFeito(null); onFechar()
  }

  const chavesExistentes = useMemo(() => new Set((dados.contratos || []).map((c) => c.chave)), [dados.contratos])

  const onArquivo = async (e) => {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    e.target.value = ''
    setNomeArquivo(arquivo.name)
    setLendo(true)
    setResultado(null)
    setFeito(null)
    try {
      const { lerPlanilhaContratos } = await import('../lib/planilhaContratos')
      const lido = await lerPlanilhaContratos(arquivo)
      const itens = lido.itens.map((i) => ({ ...i, acao: chavesExistentes.has(i.chave) ? 'atualiza' : 'novo' }))
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
      const r = await dados.importarContratos(resultado.itens)
      if (!r) return
      setFeito({ ...r, novos, atualizados })
    } finally {
      setImportandoAgora(false)
    }
  }

  return (
    <Sheet aberto={aberto} titulo="Importar contratos" onFechar={fechar}>
      <div className="stack-2">
        {feito ? (
          <>
            <div className="alert success">
              {plural(feito.novos, 'item novo importado', 'itens novos importados')} e{' '}
              {plural(feito.atualizados, 'atualizado', 'atualizados')}.
            </div>
            <button className="btn btn-primary btn-block" onClick={fechar}>Fechar</button>
          </>
        ) : (
          <>
            <div className="t-caption" style={{ lineHeight: 1.5 }}>
              A planilha "CONTRATOS-UAU" que você baixa do sistema (.xlsx). Item que já existe (mesma chave de
              contrato) só atualiza os números — a medição mais nova substitui a anterior; item novo entra do zero.
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
                  {plural(novos, 'item novo', 'itens novos')} · {plural(atualizados, 'atualização', 'atualizações')}.
                </div>

                <div style={{ maxHeight: 300, overflowY: 'auto' }} className="stack-1">
                  {resultado.itens.slice(0, 100).map((i) => (
                    <div
                      key={i.chave}
                      style={{
                        fontSize: 12, padding: 8, borderRadius: 8,
                        border: `1px solid ${i.acao === 'novo' ? 'var(--success)' : 'var(--border)'}`,
                        background: i.acao === 'novo' ? 'var(--success-tint)' : 'var(--surface-2)',
                      }}
                    >
                      <div className="row-between">
                        <strong>{i.descricao_item}</strong>
                        <span style={{ color: i.acao === 'novo' ? 'var(--success)' : 'var(--text-3)', fontWeight: 600 }}>
                          {i.acao === 'novo' ? 'novo' : 'atualiza'}
                        </span>
                      </div>
                      <div style={{ marginTop: 2 }}>Contrato {i.cod_contrato} · {i.fornecedor || '—'}</div>
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
                  {importandoAgora ? 'Importando…' : `Importar ${plural(resultado.itens.length, 'item', 'itens')}`}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}
