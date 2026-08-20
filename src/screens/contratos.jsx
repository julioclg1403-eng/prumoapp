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

import { useState, useMemo } from 'react'
import { useDados } from '../lib/DadosContext'
import { formatarData, formatarDinheiro, plural } from '../lib/dominio'
import { Icon, Chip, PageHeader, Segmentos, Sheet, Vazio } from '../components'

const TOM_STATUS = { '1 - Aprovado': 'success', '2 - Em Aditivo': 'info', '0 - Não Aprovado': 'danger' }
const UNIDADES_PRINCIPAIS = ['M', 'M²', 'M³', 'UN', 'KG', 'H']

function formatarNumero(v) {
  if (v == null) return '—'
  return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

export default function Contratos({ voltar, perfil }) {
  const dados = useDados()
  const podeEditar = perfil.role !== 'campo'

  const [aba, setAba] = useState('dados')
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
              {aba === 'dados' && <AbaDados itens={itens} />}
              {aba === 'dashboard' && (
                <AbaDashboard itens={itens} contratosUnicos={contratosUnicos} ultimaImportacao={ultimaImportacao} />
              )}
            </>
          )}
        </div>
      </div>

      <ImportarContratos aberto={importando} onFechar={() => setImportando(false)} dados={dados} />
    </>
  )
}

/* ── Todos os dados ────────────────────────────────────────── */

function AbaDados({ itens }) {
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('todos')
  const [detalhe, setDetalhe] = useState(null)
  const [contratoAberto, setContratoAberto] = useState(null)

  const statusList = useMemo(() => [...new Set(itens.map((i) => i.status_contrato).filter(Boolean))].sort(), [itens])

  /* Um cartão por contrato — nasce fechado, só com os dados gerais;
     clicar abre e mostra item a item. A busca só filtra QUAIS
     contratos aparecem (e, dentro deles, quais itens) — continua
     fechado até a pessoa clicar, mesmo com filtro ativo. */
  const contratosAgrupados = useMemo(() => {
    const mapa = new Map()
    for (const i of itens) {
      if (!mapa.has(i.cod_contrato)) {
        mapa.set(i.cod_contrato, {
          cod_contrato: i.cod_contrato, objeto_contrato: i.objeto_contrato, fornecedor: i.fornecedor,
          status_contrato: i.status_contrato, situacao_contrato: i.situacao_contrato,
          total_contrato: i.total_contrato, saldo_contrato: i.saldo_contrato,
          valor_medido_contrato: i.valor_medido_contrato, retido: i.retido, a_pagar: i.a_pagar,
          itens: [],
        })
      }
      mapa.get(i.cod_contrato).itens.push(i)
    }
    for (const c of mapa.values()) c.itens.sort((a, b) => a.item_num - b.item_num)
    return [...mapa.values()].sort((a, b) => Number(b.cod_contrato) - Number(a.cod_contrato))
  }, [itens])

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return contratosAgrupados
      .filter((c) => status === 'todos' || c.status_contrato === status)
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
  }, [contratosAgrupados, busca, status])

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

      {lista.length === 0 ? (
        <div className="card-flat"><Vazio titulo="Nada com esse filtro" texto="Troque a busca ou o status." /></div>
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
                  <div className="scroll-x" style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Item</th><th>Unid</th><th>Qtde</th><th>Medida</th><th>Saldo</th><th>Valor medido</th>
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
                            <td className="t-num">{formatarDinheiro(i.valor_medido_item)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
  const maxStatus = Math.max(1, ...porStatus.map((s) => s.quantidade))

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
  const maxFornecedor = Math.max(1, ...porFornecedor.map((f) => f.contratado))

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
        <div className="card-flat" style={{ flex: '1 1 140px' }}>
          <div className="t-caption">Contratado</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{formatarDinheiro(totalContratado)}</div>
        </div>
        <div className="card-flat" style={{ flex: '1 1 140px' }}>
          <div className="t-caption">Medido</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{formatarDinheiro(totalMedido)}</div>
        </div>
        <div className="card-flat" style={{ flex: '1 1 140px' }}>
          <div className="t-caption">Saldo a medir</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{formatarDinheiro(totalSaldo)}</div>
        </div>
        {totalRetido > 0 && (
          <div className="card-flat" style={{ flex: '1 1 140px' }}>
            <div className="t-caption">Retido</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{formatarDinheiro(totalRetido)}</div>
          </div>
        )}
        {totalAPagar > 0 && (
          <div className="card-flat" style={{ flex: '1 1 140px' }}>
            <div className="t-caption">A pagar (na importação)</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{formatarDinheiro(totalAPagar)}</div>
          </div>
        )}
      </div>
      {(totalRetido > 0 || totalAPagar > 0) && (
        <div className="t-caption" style={{ color: 'var(--text-2)' }}>
          "A pagar" e "Retido" são um retrato do momento da última importação{ultimaImportacao ? ` (${formatarData(ultimaImportacao.slice(0, 10))})` : ''} —
          pode já ter mudado desde então. Reimporte a planilha pra atualizar.
        </div>
      )}

      <div className="card-flat stack-2">
        <div className="t-micro">Contratos por status</div>
        <div className="stack-1">
          {porStatus.map((s) => (
            <div key={s.status}>
              <div className="row-between" style={{ marginBottom: 3 }}>
                <span className="t-caption">{s.status}</span>
                <span className="t-caption t-strong">{s.quantidade}</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden' }}>
                <div style={{ width: `${(s.quantidade / maxStatus) * 100}%`, height: '100%', background: 'var(--primary)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card-flat stack-2">
        <div className="t-micro">Fornecedores (top 15, por valor contratado)</div>
        <div className="stack-1">
          {porFornecedor.map((f) => (
            <div key={f.fornecedor}>
              <div className="row-between" style={{ marginBottom: 3 }}>
                <span className="t-caption" style={{ maxWidth: '70%' }}>{f.fornecedor} <span style={{ opacity: 0.6 }}>({f.contratos})</span></span>
                <span className="t-caption t-strong">{formatarDinheiro(f.contratado)}</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden' }}>
                <div style={{ width: `${(f.contratado / maxFornecedor) * 100}%`, height: '100%', background: 'var(--primary)' }} />
              </div>
            </div>
          ))}
        </div>
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
