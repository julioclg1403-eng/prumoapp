/* ============================================================
   PRODUTIVIDADE E MEDIÇÃO

   Marcação visual de execução sobre a planta (PDF): cada pino é um
   elemento (sapata, pilar...), com dimensões que viram quantidade
   pela fórmula do tipo de serviço (Catálogo, em Cadastros), e um
   histórico de eventos por estágio — cada evento com seu próprio
   colaborador, data e (opcional, caso a caso) item de contrato.
   Ver prumoapp-modulo-produtividade-medicao.md.

   3 sub-abas: Plantas (upload + marcação), Medição (por contrato) e
   Rendimento (por colaborador/serviço) — as duas últimas na fase 3.
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDados } from '../lib/DadosContext'
import { hojeISO, formatarData, formatarDinheiro, diarioDaData, filtrarPorPeriodo, rotuloPeriodo } from '../lib/dominio'
import { calcularQuantidade } from '../lib/formulaProducao'
import { linkTemporarioPlanta } from '../lib/plantasProducao'
import { Icon, Chip, PageHeader, Segmentos, Sheet, Campo, Confirmar, Vazio, Indicador, FiltroPeriodo, SecaoRecolhivel } from '../components'

const ROTULO_UNIDADE = { m3: 'm³', m2: 'm²', ml: 'ml', un: 'un' }

export default function Producao({ voltar, perfil }) {
  const dados = useDados()
  const [aba, setAba] = useState('plantas')
  const podeEditar = perfil.role !== 'campo'

  return (
    <>
      <div className="topbar">
        {voltar && <button onClick={voltar} aria-label="Voltar"><Icon name="voltar" size={22} /></button>}
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Produtividade</div>
          <div className="sub">{dados.obra.nome}</div>
        </div>
      </div>

      <div className="page">
        <PageHeader titulo="Produtividade" sub="Marcação de execução na planta, medição por contrato e rendimento" />

        <div className="stack-2">
          <Segmentos
            valor={aba} onChange={setAba}
            opcoes={[
              { valor: 'plantas', rotulo: 'Plantas' },
              { valor: 'medicao', rotulo: 'Medição' },
              { valor: 'rendimento', rotulo: 'Rendimento' },
            ]}
          />

          {aba === 'plantas' && <AbaPlantas dados={dados} perfil={perfil} podeEditar={podeEditar} />}
          {aba === 'medicao' && <AbaMedicao dados={dados} />}
          {aba === 'rendimento' && <AbaRendimento dados={dados} />}
        </div>
      </div>
    </>
  )
}

/* ── Plantas ────────────────────────────────────────────────── */

function AbaPlantas({ dados, perfil, podeEditar }) {
  const [enviando, setEnviando] = useState(false)
  const [plantaAberta, setPlantaAberta] = useState(null)

  const plantas = (dados.plantasProducao || []).filter((p) => p.ativo !== false)
  const plantaAtual = plantaAberta && plantas.find((p) => p.id === plantaAberta.id)

  if (plantaAtual) {
    return <VisualizarPlanta planta={plantaAtual} dados={dados} perfil={perfil} podeEditar={podeEditar} voltar={() => setPlantaAberta(null)} />
  }

  return (
    <div className="stack-2">
      {podeEditar && (
        <button className="btn btn-primary" onClick={() => setEnviando(true)} style={{ alignSelf: 'flex-start' }}>
          <Icon name="baixar" size={16} style={{ transform: 'rotate(180deg)' }} /> Enviar planta
        </button>
      )}

      {plantas.length === 0 ? (
        <div className="card-flat">
          <Vazio
            titulo="Nenhuma planta enviada ainda"
            texto={podeEditar ? 'Envie o PDF da planta pra começar a marcar a execução.' : 'A gestão ainda não enviou nenhuma planta desta obra.'}
            acao={podeEditar && <button className="btn btn-primary" onClick={() => setEnviando(true)}>Enviar planta</button>}
          />
        </div>
      ) : (
        <div className="stack-1">
          {plantas.map((p) => {
            const qtdeMarcadores = (dados.marcadoresProducao || []).filter((m) => m.plan_id === p.id && m.ativo !== false).length
            return (
              <button key={p.id} className="card-tap" style={{ textAlign: 'left', width: '100%' }} onClick={() => setPlantaAberta(p)}>
                <div className="row-between" style={{ alignItems: 'center' }}>
                  <div>
                    <div className="t-strong">{p.nome}</div>
                    <div className="t-caption">{qtdeMarcadores} marcação{qtdeMarcadores === 1 ? '' : 'ões'} · enviada {formatarData(p.created_at.slice(0, 10))}</div>
                  </div>
                  <Icon name="avancar" size={16} />
                </div>
              </button>
            )
          })}
        </div>
      )}

      <EnviarPlantaSheet aberto={enviando} onFechar={() => setEnviando(false)} dados={dados} />
    </div>
  )
}

function EnviarPlantaSheet({ aberto, onFechar, dados }) {
  const [nome, setNome] = useState('')
  const [arquivo, setArquivo] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const fechar = () => { setNome(''); setArquivo(null); setErro(''); onFechar() }

  const enviar = async () => {
    if (!arquivo) return
    setEnviando(true)
    setErro('')
    const r = await dados.enviarPlanta({ arquivo, nome: nome.trim() || arquivo.name })
    setEnviando(false)
    if (r) fechar()
    else setErro('Não consegui enviar a planta. Tente de novo.')
  }

  return (
    <Sheet
      aberto={aberto} titulo="Enviar planta" onFechar={fechar}
      rodape={
        <div className="row-flex">
          <button className="btn btn-secondary grow" onClick={fechar}>Cancelar</button>
          <button className="btn btn-primary grow" onClick={enviar} disabled={enviando || !arquivo}>
            {enviando ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      }
    >
      <div className="stack-2">
        <Campo label="Nome" dica="Opcional — se deixar em branco, usa o nome do arquivo.">
          <input className="ipt" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Pavimento térreo — estrutural" />
        </Campo>
        <Campo label="Arquivo (PDF)">
          <label className="btn btn-secondary btn-block" style={{ cursor: 'pointer' }}>
            {arquivo ? arquivo.name : 'Escolher arquivo .pdf'}
            <input
              type="file" accept="application/pdf" style={{ display: 'none' }}
              onChange={(e) => setArquivo(e.target.files?.[0] || null)}
            />
          </label>
        </Campo>
        {erro && <div className="alert danger">{erro}</div>}
      </div>
    </Sheet>
  )
}

/* ── Visualizar planta + marcação ──────────────────────────── */

function VisualizarPlanta({ planta, dados, perfil, podeEditar, voltar }) {
  const [pdfDoc, setPdfDoc] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [pagina, setPagina] = useState(1)
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [novoPonto, setNovoPonto] = useState(null)
  const [marcadorAberto, setMarcadorAberto] = useState(null)

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    setErro('')
    setPdfDoc(null)
    ;(async () => {
      const url = await linkTemporarioPlanta(planta.caminho)
      if (!url) { if (vivo) { setErro('Não consegui abrir esta planta.'); setCarregando(false) }; return }
      try {
        const { carregarDocumentoPDF } = await import('../lib/pdfRender')
        const doc = await carregarDocumentoPDF(url)
        if (vivo) { setPdfDoc(doc); setPagina(1); setCarregando(false) }
      } catch {
        if (vivo) { setErro('Não consegui ler o PDF desta planta.'); setCarregando(false) }
      }
    })()
    return () => { vivo = false }
  }, [planta.id, planta.caminho])

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !containerRef.current) return
    let vivo = true
    ;(async () => {
      const largura = containerRef.current.clientWidth
      try {
        const { renderizarPaginaPDF } = await import('../lib/pdfRender')
        await renderizarPaginaPDF(pdfDoc, pagina, canvasRef.current, largura)
      } catch {
        if (vivo) setErro('Não consegui desenhar esta página.')
      }
    })()
    return () => { vivo = false }
  }, [pdfDoc, pagina])

  const marcadoresDaPagina = useMemo(
    () => (dados.marcadoresProducao || []).filter((m) => m.plan_id === planta.id && m.pagina === pagina && m.ativo !== false),
    [dados.marcadoresProducao, planta.id, pagina],
  )

  const aoClicarNaPlanta = (e) => {
    if (!podeEditar || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setNovoPonto({ x, y, pagina })
  }

  return (
    <div className="stack-2">
      <div className="row-between" style={{ alignItems: 'center' }}>
        <button className="btn btn-ghost btn-sm" onClick={voltar}><Icon name="voltar" size={16} /> Plantas</button>
        <div className="t-strong" style={{ fontSize: 14 }}>{planta.nome}</div>
        {pdfDoc && pdfDoc.numPages > 1 ? (
          <div className="row-flex" style={{ gap: 6, alignItems: 'center' }}>
            <button className="btn btn-ghost btn-sm" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>‹</button>
            <span className="t-caption">{pagina}/{pdfDoc.numPages}</span>
            <button className="btn btn-ghost btn-sm" disabled={pagina >= pdfDoc.numPages} onClick={() => setPagina((p) => p + 1)}>›</button>
          </div>
        ) : <span />}
      </div>

      {erro && <div className="alert danger">{erro}</div>}
      {carregando && <div className="t-caption">Carregando planta…</div>}
      {!carregando && !erro && podeEditar && (
        <div className="t-caption">Toque num ponto vazio da planta pra marcar um elemento novo.</div>
      )}

      <div
        ref={containerRef} onClick={aoClicarNaPlanta}
        style={{ position: 'relative', width: '100%', cursor: podeEditar ? 'crosshair' : 'default', lineHeight: 0 }}
      >
        <canvas ref={canvasRef} style={{ width: '100%', display: 'block', borderRadius: 8, border: '1px solid var(--border)' }} />
        {marcadoresDaPagina.map((m) => {
          const tipo = dados.tiposServico?.find((t) => t.id === m.service_type_id)
          const etapaInfo = tipo?.etapas?.find((e) => e.chave === m.etapa_atual)
          const cor = etapaInfo?.cor
          return (
            <button
              key={m.id}
              onClick={(e) => { e.stopPropagation(); setMarcadorAberto(m) }}
              aria-label={m.elemento}
              style={{
                position: 'absolute', left: `${m.x}%`, top: `${m.y}%`,
                width: 22, height: 22, padding: 0,
                borderRadius: '50% 50% 50% 0', transform: 'translate(-50%, -100%) rotate(-45deg)',
                background: cor ? `var(--${cor})` : 'var(--text-3)',
                border: '2px solid var(--surface, #fff)', boxShadow: '0 1px 3px rgba(0,0,0,.4)', cursor: 'pointer',
              }}
            />
          )
        })}
      </div>

      {novoPonto && (
        <MarcadorSheet
          ponto={novoPonto} planta={planta} dados={dados}
          onFechar={() => setNovoPonto(null)}
        />
      )}
      {marcadorAberto && (
        <DetalheMarcadorSheet
          marcador={marcadorAberto} dados={dados} podeEditar={podeEditar}
          onFechar={() => setMarcadorAberto(null)}
        />
      )}
    </div>
  )
}

/* ── Aviso de saldo (avisa, não bloqueia) ──────────────────── */

function AvisoSaldoContrato({ contratoItem, quantidade, dados }) {
  if (!contratoItem || !quantidade) return null
  const jaLancado = (dados.eventosProducao || [])
    .filter((e) => e.contract_item_id === contratoItem.id)
    .reduce((s, e) => s + (Number(e.quantidade) || 0), 0)
  const saldo = Number(contratoItem.qtde_item || 0) - jaLancado
  if (Number(quantidade) <= saldo) return null
  return (
    <div className="alert danger">
      Isto passa do saldo do item ({saldo.toLocaleString('pt-BR')} {contratoItem.unidade} restantes) — pode lançar
      mesmo assim, só fica sinalizado.
    </div>
  )
}

/* ── Buscar e escolher: colaborador ou item de contrato ────── */

function BuscarColaborador({ dados, diarioDoDia, valor, onEscolher }) {
  const [busca, setBusca] = useState('')
  const selecionado = valor ? dados.colaboradorPorId(valor) : null

  const disponiveis = useMemo(() => {
    if (diarioDoDia) {
      const presentes = new Set((diarioDoDia.presencas || []).filter((p) => p.presente).map((p) => p.worker_id))
      return (dados.colaboradores || []).filter((c) => presentes.has(c.id))
    }
    return (dados.colaboradores || []).filter((c) => c.ativo !== false)
  }, [diarioDoDia, dados.colaboradores])

  const resultados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return []
    return disponiveis.filter((c) => c.nome.toLowerCase().includes(termo)).slice(0, 8)
  }, [busca, disponiveis])

  return (
    <div className="stack-1">
      {selecionado && (
        <Chip>
          {selecionado.nome}
          <button onClick={() => onEscolher('')} aria-label="Remover" style={{ border: 0, background: 'none', cursor: 'pointer', marginLeft: 4, padding: 0, display: 'inline-flex' }}>
            <Icon name="x" size={12} />
          </button>
        </Chip>
      )}
      {!selecionado && (
        <>
          <input
            className="ipt" value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder={diarioDoDia ? 'Buscar no efetivo do dia…' : 'Buscar colaborador…'}
          />
          {resultados.length > 0 && (
            <div className="stack-1">
              {resultados.map((c) => (
                <button key={c.id} type="button" className="btn btn-secondary btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => { onEscolher(c.id); setBusca('') }}>
                  {c.nome}
                </button>
              ))}
            </div>
          )}
          {busca.trim() && resultados.length === 0 && <div className="t-caption">Ninguém com esse nome.</div>}
        </>
      )}
    </div>
  )
}

function BuscarItemContrato({ dados, valor, onEscolher }) {
  const [busca, setBusca] = useState('')
  const selecionado = valor ? (dados.contratos || []).find((i) => i.id === valor) : null

  const resultados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return []
    return (dados.contratos || [])
      .filter((i) => i.descricao_item.toLowerCase().includes(termo) || String(i.cod_contrato).includes(termo))
      .slice(0, 8)
  }, [busca, dados.contratos])

  return (
    <div className="stack-1">
      {selecionado && (
        <Chip>
          Contrato {selecionado.cod_contrato} — {selecionado.descricao_item}
          <button onClick={() => onEscolher('')} aria-label="Remover" style={{ border: 0, background: 'none', cursor: 'pointer', marginLeft: 4, padding: 0, display: 'inline-flex' }}>
            <Icon name="x" size={12} />
          </button>
        </Chip>
      )}
      {!selecionado && (
        <>
          <input className="ipt" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item por descrição ou nº do contrato…" />
          {resultados.length > 0 && (
            <div className="stack-1">
              {resultados.map((i) => (
                <button key={i.id} type="button" className="btn btn-secondary btn-sm" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => { onEscolher(i.id); setBusca('') }}>
                  Contrato {i.cod_contrato} — {i.descricao_item}
                </button>
              ))}
            </div>
          )}
          {busca.trim() && resultados.length === 0 && <div className="t-caption">Nenhum item com esse nome.</div>}
        </>
      )}
    </div>
  )
}

/* ── Nova marcação ──────────────────────────────────────────── */

function MarcadorSheet({ ponto, planta, dados, onFechar }) {
  const hoje = hojeISO()
  const [tipoId, setTipoId] = useState('')
  const [elemento, setElemento] = useState('')
  const [dimensoes, setDimensoes] = useState({})
  const [etapa, setEtapa] = useState('')
  const [workerId, setWorkerId] = useState('')
  const [dataExecucao, setDataExecucao] = useState(hoje)
  const [contractItemId, setContractItemId] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)

  const tiposAtivos = (dados.tiposServico || []).filter((t) => t.ativo !== false)
  const tipo = tiposAtivos.find((t) => t.id === tipoId)
  const quantidadeCalculada = tipo ? calcularQuantidade(tipo.formula, dimensoes) : null
  const diarioDoDia = dataExecucao ? diarioDaData(dados.diarios || [], dataExecucao, dados.obra.id) : null
  const contratoSelecionado = contractItemId ? (dados.contratos || []).find((i) => i.id === contractItemId) : null
  const quantidadeEvento = quantidade === '' ? quantidadeCalculada : Number(quantidade)

  useEffect(() => {
    if (tipo) {
      setDimensoes(Object.fromEntries((tipo.campos_dimensao || []).map((c) => [c.chave, ''])))
      setEtapa(tipo.etapas?.[0]?.chave || '')
    }
  }, [tipoId]) // eslint-disable-line react-hooks/exhaustive-deps

  const podeSalvar = tipo && elemento.trim() && etapa && dataExecucao && quantidadeCalculada != null

  const salvar = async () => {
    setSalvando(true)
    const ok = await dados.salvarMarcador({
      plan_id: planta.id, service_type_id: tipo.id, elemento: elemento.trim(),
      x: ponto.x, y: ponto.y, pagina: ponto.pagina,
      dimensoes: Object.fromEntries(Object.entries(dimensoes).map(([k, v]) => [k, Number(v) || 0])),
      quantidade_calculada: quantidadeCalculada,
      evento: {
        etapa, worker_id: workerId || null, data_execucao: dataExecucao,
        contract_item_id: contractItemId || null,
        quantidade: quantidadeEvento,
        observacao: observacao.trim() || null,
      },
    })
    setSalvando(false)
    if (ok) onFechar()
  }

  return (
    <Sheet
      aberto titulo="Nova marcação" onFechar={onFechar}
      rodape={
        <div className="row-flex">
          <button className="btn btn-secondary grow" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary grow" onClick={salvar} disabled={salvando || !podeSalvar}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      }
    >
      <div className="stack-2">
        <Campo label="Tipo de serviço">
          <select className="sel" value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
            <option value="">Escolha</option>
            {tiposAtivos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          {tiposAtivos.length === 0 && (
            <div className="t-caption" style={{ marginTop: 4 }}>
              Nenhum tipo de serviço cadastrado ainda — cadastre em Cadastros → Catálogo de Serviços.
            </div>
          )}
        </Campo>

        {tipo && (
          <>
            <Campo label="Identificação do elemento" dica='Ex.: "Sapata N12"'>
              <input className="ipt" autoFocus value={elemento} onChange={(e) => setElemento(e.target.value)} placeholder="Sapata N12" />
            </Campo>

            <Campo label="Dimensões">
              <div className="row-wrap" style={{ gap: 8 }}>
                {(tipo.campos_dimensao || []).map((c) => (
                  <div key={c.chave} style={{ flex: '1 1 100px' }}>
                    <div className="t-caption" style={{ marginBottom: 2 }}>{c.rotulo}</div>
                    <input
                      className="ipt" type="number" inputMode="decimal" step="0.01" min="0"
                      value={dimensoes[c.chave] ?? ''}
                      onChange={(e) => setDimensoes((d) => ({ ...d, [c.chave]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <div className="t-caption" style={{ marginTop: 6 }}>
                Quantidade calculada: <strong>{quantidadeCalculada != null ? `${quantidadeCalculada.toLocaleString('pt-BR')} ${ROTULO_UNIDADE[tipo.unidade_resultado] || tipo.unidade_resultado}` : '—'}</strong>
              </div>
            </Campo>

            <Campo label="Estágio atual">
              <select className="sel" value={etapa} onChange={(e) => setEtapa(e.target.value)}>
                {(tipo.etapas || []).map((e) => <option key={e.chave} value={e.chave}>{e.rotulo}</option>)}
              </select>
            </Campo>

            <Campo label="Data de execução">
              <input className="ipt" type="date" value={dataExecucao} onChange={(e) => setDataExecucao(e.target.value)} />
              {dataExecucao && !diarioDoDia && (
                <div className="t-caption" style={{ marginTop: 4 }}>
                  Ainda não existe diário desse dia — a lista de colaboradores abaixo mostra todo mundo ativo da obra, e isto entra como lançamento a posteriori.
                </div>
              )}
            </Campo>

            <Campo label="Colaborador" dica="Opcional.">
              <BuscarColaborador dados={dados} diarioDoDia={diarioDoDia} valor={workerId} onEscolher={setWorkerId} />
            </Campo>

            <Campo label="Item de contrato" dica="Opcional — pode vincular depois, no detalhe da marcação.">
              <BuscarItemContrato dados={dados} valor={contractItemId} onEscolher={setContractItemId} />
            </Campo>

            {contratoSelecionado && (
              <Campo label="Quantidade a medir" dica="Nasce igual à quantidade calculada — mude se este evento mede menos que o elemento inteiro.">
                <input
                  className="ipt" type="number" inputMode="decimal" step="0.01"
                  value={quantidade} placeholder={String(quantidadeCalculada ?? '')}
                  onChange={(e) => setQuantidade(e.target.value)}
                />
                <AvisoSaldoContrato contratoItem={contratoSelecionado} quantidade={quantidadeEvento} dados={dados} />
              </Campo>
            )}

            <Campo label="Observação" dica="Opcional.">
              <textarea className="ipt" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </Campo>
          </>
        )}
      </div>
    </Sheet>
  )
}

/* ── Detalhe do marcador: estágio atual + histórico + novo evento ── */

function DetalheMarcadorSheet({ marcador: marcadorInicial, dados, podeEditar, onFechar }) {
  const [novoEvento, setNovoEvento] = useState(false)
  const [confirmarArquivar, setConfirmarArquivar] = useState(false)

  /* `marcadorInicial` é o que estava na hora do clique no pino — um
     "novo evento" muda o etapa_atual no banco, e sem reler daqui o
     cabeçalho ficava preso no estágio antigo até fechar e reabrir a
     folha. */
  const marcador = dados.marcadoresProducao?.find((m) => m.id === marcadorInicial.id) || marcadorInicial

  const tipo = dados.tiposServico?.find((t) => t.id === marcador.service_type_id)
  const eventos = useMemo(
    () => (dados.eventosProducao || [])
      .filter((e) => e.marker_id === marcador.id)
      .sort((a, b) => (a.data_execucao < b.data_execucao ? 1 : -1)),
    [dados.eventosProducao, marcador.id],
  )
  const etapaAtualInfo = tipo?.etapas?.find((e) => e.chave === marcador.etapa_atual)

  return (
    <Sheet aberto titulo={marcador.elemento} onFechar={onFechar}>
      <div className="stack-2">
        <div className="row-wrap" style={{ gap: 8, alignItems: 'center' }}>
          <Chip tom={etapaAtualInfo?.cor}>{etapaAtualInfo?.rotulo || marcador.etapa_atual}</Chip>
          <span className="t-caption">{tipo?.nome}</span>
        </div>

        <div className="card-flat stack-1">
          <div className="t-micro">Dimensões</div>
          <div className="t-caption">
            {(tipo?.campos_dimensao || []).map((c) => `${c.rotulo}: ${marcador.dimensoes?.[c.chave] ?? '—'}`).join(' · ')}
          </div>
          <div className="t-strong" style={{ fontSize: 15, marginTop: 4 }}>
            {marcador.quantidade_calculada != null
              ? `${Number(marcador.quantidade_calculada).toLocaleString('pt-BR')} ${ROTULO_UNIDADE[tipo?.unidade_resultado] || tipo?.unidade_resultado || ''}`
              : '—'}
          </div>
        </div>

        {podeEditar && (
          <div className="row-flex" style={{ gap: 8 }}>
            <button className="btn btn-primary btn-sm grow" onClick={() => setNovoEvento(true)}>
              <Icon name="mais_sinal" size={14} /> Novo evento
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setConfirmarArquivar(true)}>
              <Icon name="x" size={14} /> Arquivar
            </button>
          </div>
        )}

        <div>
          <div className="t-micro" style={{ marginBottom: 6 }}>Histórico ({eventos.length})</div>
          {eventos.length === 0 ? (
            <div className="t-caption">Nenhum evento ainda.</div>
          ) : (
            <div className="stack-1">
              {eventos.map((ev) => {
                const etapaInfo = tipo?.etapas?.find((e) => e.chave === ev.etapa)
                const contratoItem = ev.contract_item_id ? (dados.contratos || []).find((i) => i.id === ev.contract_item_id) : null
                return (
                  <div key={ev.id} className="card-flat" style={{ padding: 10 }}>
                    <div className="row-between" style={{ alignItems: 'center' }}>
                      <Chip tom={etapaInfo?.cor}>{etapaInfo?.rotulo || ev.etapa}</Chip>
                      <span className="t-caption">{formatarData(ev.data_execucao)}</span>
                    </div>
                    <div className="t-caption" style={{ marginTop: 4 }}>
                      {ev.worker_id ? dados.colaboradorPorId(ev.worker_id)?.nome || '—' : 'Sem colaborador vinculado'}
                      {ev.a_posteriori && <span style={{ marginLeft: 6 }}><Chip tom="info">a posteriori</Chip></span>}
                    </div>
                    {contratoItem && (
                      <div className="t-caption" style={{ marginTop: 2 }}>
                        Contrato {contratoItem.cod_contrato} — {contratoItem.descricao_item} · {Number(ev.quantidade || 0).toLocaleString('pt-BR')} {contratoItem.unidade}
                      </div>
                    )}
                    {ev.observacao && <div className="t-caption" style={{ marginTop: 2 }}>{ev.observacao}</div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {novoEvento && (
        <NovoEventoSheet marcador={marcador} tipo={tipo} dados={dados} onFechar={() => setNovoEvento(false)} />
      )}

      <Confirmar
        aberto={confirmarArquivar}
        titulo="Arquivar marcação?"
        texto={`«${marcador.elemento}» some da planta, mas o histórico continua guardado. Nada é apagado.`}
        rotuloOk="Arquivar" perigo
        onOk={async () => { setConfirmarArquivar(false); await dados.arquivarMarcador(marcador.id); onFechar() }}
        onCancelar={() => setConfirmarArquivar(false)}
      />
    </Sheet>
  )
}

function NovoEventoSheet({ marcador, tipo, dados, onFechar }) {
  const hoje = hojeISO()
  const [etapa, setEtapa] = useState(marcador.etapa_atual || tipo?.etapas?.[0]?.chave || '')
  const [workerId, setWorkerId] = useState('')
  const [dataExecucao, setDataExecucao] = useState(hoje)
  const [contractItemId, setContractItemId] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)

  const diarioDoDia = dataExecucao ? diarioDaData(dados.diarios || [], dataExecucao, dados.obra.id) : null
  const contratoSelecionado = contractItemId ? (dados.contratos || []).find((i) => i.id === contractItemId) : null
  const quantidadeEvento = quantidade === '' ? marcador.quantidade_calculada : Number(quantidade)

  const podeSalvar = etapa && dataExecucao

  const salvar = async () => {
    setSalvando(true)
    const ok = await dados.registrarEventoMarcador(marcador.id, {
      etapa, worker_id: workerId || null, data_execucao: dataExecucao,
      contract_item_id: contractItemId || null,
      quantidade: quantidadeEvento,
      observacao: observacao.trim() || null,
    })
    setSalvando(false)
    if (ok) onFechar()
  }

  return (
    <Sheet
      aberto titulo="Novo evento" onFechar={onFechar}
      rodape={
        <div className="row-flex">
          <button className="btn btn-secondary grow" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary grow" onClick={salvar} disabled={salvando || !podeSalvar}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      }
    >
      <div className="stack-2">
        <Campo label="Estágio">
          <select className="sel" value={etapa} onChange={(e) => setEtapa(e.target.value)}>
            {(tipo?.etapas || []).map((e) => <option key={e.chave} value={e.chave}>{e.rotulo}</option>)}
          </select>
        </Campo>

        <Campo label="Data de execução">
          <input className="ipt" type="date" value={dataExecucao} onChange={(e) => setDataExecucao(e.target.value)} />
          {dataExecucao && !diarioDoDia && (
            <div className="t-caption" style={{ marginTop: 4 }}>Sem diário nesse dia — entra como lançamento a posteriori.</div>
          )}
        </Campo>

        <Campo label="Colaborador" dica="Opcional.">
          <BuscarColaborador dados={dados} diarioDoDia={diarioDoDia} valor={workerId} onEscolher={setWorkerId} />
        </Campo>

        <Campo label="Item de contrato" dica="Opcional — caso a caso: este estágio pode ser de um contrato diferente do estágio anterior.">
          <BuscarItemContrato dados={dados} valor={contractItemId} onEscolher={setContractItemId} />
        </Campo>

        {contratoSelecionado && (
          <Campo label="Quantidade a medir">
            <input
              className="ipt" type="number" inputMode="decimal" step="0.01"
              value={quantidade} placeholder={String(marcador.quantidade_calculada ?? '')}
              onChange={(e) => setQuantidade(e.target.value)}
            />
            <AvisoSaldoContrato contratoItem={contratoSelecionado} quantidade={quantidadeEvento} dados={dados} />
          </Campo>
        )}

        <Campo label="Observação" dica="Opcional.">
          <textarea className="ipt" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </Campo>
      </div>
    </Sheet>
  )
}

/* ── Medição ────────────────────────────────────────────────── */

function AbaMedicao({ dados }) {
  const hoje = hojeISO()
  const [periodoModo, setPeriodoModo] = useState('mes')
  const [periodoDia, setPeriodoDia] = useState(hoje)
  const [periodoMes, setPeriodoMes] = useState(hoje.slice(0, 7))
  const [periodoInicio, setPeriodoInicio] = useState(hoje)
  const [periodoFim, setPeriodoFim] = useState(hoje)

  /* Só evento com item de contrato vinculado vira medição — o
     "caso a caso" da conversa: nem todo evento precisa medir contra
     um contrato (ver MarcadorSheet/NovoEventoSheet, campo opcional). */
  const eventosComContrato = useMemo(
    () => (dados.eventosProducao || []).filter((e) => e.contract_item_id),
    [dados.eventosProducao],
  )
  const eventosDoPeriodo = useMemo(
    () => filtrarPorPeriodo(
      eventosComContrato, periodoModo,
      { dia: periodoDia, mes: periodoMes, inicio: periodoInicio, fim: periodoFim },
      (e) => e.data_execucao,
    ),
    [eventosComContrato, periodoModo, periodoDia, periodoMes, periodoInicio, periodoFim],
  )

  const porItem = useMemo(() => {
    const noPeriodo = new Map()
    for (const ev of eventosDoPeriodo) {
      noPeriodo.set(ev.contract_item_id, (noPeriodo.get(ev.contract_item_id) || 0) + (Number(ev.quantidade) || 0))
    }
    /* Saldo é sempre o histórico completo — mesma regra do saldo de
       Almoxarifado: o período é só um recorte de exibição, nunca do
       que define quanto ainda resta do contrato. */
    const totalHistorico = new Map()
    for (const ev of eventosComContrato) {
      totalHistorico.set(ev.contract_item_id, (totalHistorico.get(ev.contract_item_id) || 0) + (Number(ev.quantidade) || 0))
    }
    return [...noPeriodo.entries()]
      .map(([itemId, quantidadePeriodo]) => {
        const item = (dados.contratos || []).find((i) => i.id === itemId)
        if (!item) return null
        const saldo = Number(item.qtde_item || 0) - (totalHistorico.get(itemId) || 0)
        return { item, quantidadePeriodo, valorPeriodo: quantidadePeriodo * Number(item.preco_item || 0), saldo }
      })
      .filter(Boolean)
      .sort((a, b) => b.valorPeriodo - a.valorPeriodo)
  }, [eventosDoPeriodo, eventosComContrato, dados.contratos])

  const totalValorPeriodo = porItem.reduce((s, x) => s + x.valorPeriodo, 0)

  return (
    <div className="stack-2">
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

      <div className="row-wrap" style={{ gap: 10 }}>
        <div style={{ flex: '1 1 160px' }}><Indicador rotulo="Valor medido no período" valor={formatarDinheiro(totalValorPeriodo)} /></div>
        <div style={{ flex: '1 1 160px' }}><Indicador rotulo="Itens de contrato medidos" valor={String(porItem.length)} /></div>
      </div>

      {porItem.length === 0 ? (
        <div className="card-flat">
          <Vazio titulo="Nada medido nesse período" texto="Eventos com item de contrato vinculado aparecem aqui — ver o detalhe de cada marcação, na aba Plantas." />
        </div>
      ) : (
        <div className="stack-1">
          {porItem.map(({ item, quantidadePeriodo, valorPeriodo, saldo }) => (
            <div key={item.id} className="card-flat" style={{ padding: 10 }}>
              <div className="row-between" style={{ alignItems: 'flex-start' }}>
                <div style={{ maxWidth: '65%' }}>
                  <div className="t-strong" style={{ fontSize: 14 }}>{item.descricao_item}</div>
                  <div className="t-caption">Contrato {item.cod_contrato} — {item.fornecedor || 'sem fornecedor'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="t-strong" style={{ fontSize: 14 }}>{formatarDinheiro(valorPeriodo)}</div>
                  <div className="t-caption">{quantidadePeriodo.toLocaleString('pt-BR')} {item.unidade}</div>
                </div>
              </div>
              <div className="t-caption" style={{ marginTop: 6, color: saldo < 0 ? 'var(--danger)' : 'var(--text-2)' }}>
                Saldo do contrato: {saldo.toLocaleString('pt-BR')} {item.unidade}{saldo < 0 ? ' (estourado)' : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Rendimento ─────────────────────────────────────────────── */

function AbaRendimento({ dados }) {
  const hoje = hojeISO()
  const [modo, setModo] = useState('colaborador')
  const [periodoModo, setPeriodoModo] = useState('mes')
  const [periodoDia, setPeriodoDia] = useState(hoje)
  const [periodoMes, setPeriodoMes] = useState(hoje.slice(0, 7))
  const [periodoInicio, setPeriodoInicio] = useState(hoje)
  const [periodoFim, setPeriodoFim] = useState(hoje)
  const [tipoId, setTipoId] = useState('')

  /* Rendimento cruza obras (dados.eventosProducaoTodasObras, exposto
     em DadosContext) — o catálogo de serviço é da organização, então
     dá pra comparar o mesmo serviço entre obras diferentes, e a
     "base de dias trabalhados" é só o que foi lançado neste módulo
     (não cruza com presença do diário — ver seção 6 do .md). */
  const marcadorPorId = useMemo(
    () => new Map((dados.marcadoresProducaoTodasObras || []).map((m) => [m.id, m])),
    [dados.marcadoresProducaoTodasObras],
  )
  const eventosDoPeriodo = useMemo(
    () => filtrarPorPeriodo(
      dados.eventosProducaoTodasObras || [], periodoModo,
      { dia: periodoDia, mes: periodoMes, inicio: periodoInicio, fim: periodoFim },
      (e) => e.data_execucao,
    ),
    [dados.eventosProducaoTodasObras, periodoModo, periodoDia, periodoMes, periodoInicio, periodoFim],
  )
  /* Cada evento vira "de que tipo de serviço" via o marcador que ele
     pertence — precisa disso pra saber a unidade certa e pra agrupar
     por serviço (o evento em si não guarda o tipo). */
  const eventosComTipo = useMemo(
    () => eventosDoPeriodo
      .map((e) => ({ ...e, service_type_id: marcadorPorId.get(e.marker_id)?.service_type_id || null }))
      .filter((e) => e.service_type_id),
    [eventosDoPeriodo, marcadorPorId],
  )

  const tiposAtivos = (dados.tiposServico || []).filter((t) => t.ativo !== false)
  const tipoSelecionado = tiposAtivos.find((t) => t.id === tipoId)
  const unidadeDe = (t) => ROTULO_UNIDADE[t?.unidade_resultado] || t?.unidade_resultado || ''

  const eventosDoTipo = useMemo(
    () => eventosComTipo.filter((e) => e.service_type_id === tipoId),
    [eventosComTipo, tipoId],
  )
  const porColaborador = useMemo(() => {
    const mapa = new Map()
    for (const ev of eventosDoTipo) {
      if (!ev.worker_id) continue
      const atual = mapa.get(ev.worker_id) || { quantidade: 0, dias: new Set() }
      atual.quantidade += Number(ev.quantidade) || 0
      atual.dias.add(ev.data_execucao)
      mapa.set(ev.worker_id, atual)
    }
    return [...mapa.entries()]
      .map(([workerId, info]) => ({
        colaborador: dados.colaboradorPorId(workerId),
        workerId,
        quantidade: info.quantidade,
        dias: info.dias.size,
        rendimento: info.dias.size > 0 ? info.quantidade / info.dias.size : 0,
      }))
      .filter((r) => r.colaborador)
      .sort((a, b) => b.rendimento - a.rendimento)
  }, [eventosDoTipo, dados])

  const mediaDoTipo = useMemo(() => {
    if (!eventosDoTipo.length) return null
    const quantidade = eventosDoTipo.reduce((s, e) => s + (Number(e.quantidade) || 0), 0)
    const dias = new Set(eventosDoTipo.map((e) => e.data_execucao)).size
    return dias > 0 ? quantidade / dias : 0
  }, [eventosDoTipo])

  const porServico = useMemo(() => {
    const mapa = new Map()
    for (const ev of eventosComTipo) {
      const atual = mapa.get(ev.service_type_id) || { quantidade: 0, dias: new Set() }
      atual.quantidade += Number(ev.quantidade) || 0
      atual.dias.add(ev.data_execucao)
      mapa.set(ev.service_type_id, atual)
    }
    return [...mapa.entries()]
      .map(([tid, info]) => {
        const tipo = (dados.tiposServico || []).find((t) => t.id === tid)
        if (!tipo) return null
        return { tipo, quantidade: info.quantidade, dias: info.dias.size, ritmo: info.dias.size > 0 ? info.quantidade / info.dias.size : 0 }
      })
      .filter(Boolean)
      .sort((a, b) => b.ritmo - a.ritmo)
  }, [eventosComTipo, dados.tiposServico])

  return (
    <div className="stack-2">
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

      <Segmentos
        valor={modo} onChange={setModo}
        opcoes={[{ valor: 'colaborador', rotulo: 'Por colaborador' }, { valor: 'servico', rotulo: 'Por serviço' }]}
      />

      {modo === 'colaborador' ? (
        <div className="stack-2">
          <Campo label="Tipo de serviço" dica="Rendimento só compara dentro do mesmo tipo — cada um tem sua própria unidade.">
            <select className="sel" value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
              <option value="">Escolha</option>
              {tiposAtivos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </Campo>

          {!tipoId ? (
            <div className="card-flat"><Vazio titulo="Escolha um tipo de serviço" texto="Pra comparar colaboradores na mesma unidade." /></div>
          ) : porColaborador.length === 0 ? (
            <div className="card-flat"><Vazio titulo="Nada lançado nesse período" texto="Nenhum evento desse tipo, com colaborador vinculado, nesse período." /></div>
          ) : (
            <>
              {mediaDoTipo != null && (
                <div className="card-flat">
                  <div className="t-caption">Média do serviço (todos os colaboradores, nesse período)</div>
                  <div className="t-strong" style={{ fontSize: 16 }}>
                    {mediaDoTipo.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {unidadeDe(tipoSelecionado)}/dia
                  </div>
                </div>
              )}
              <div className="stack-1">
                {porColaborador.map((r) => (
                  <div key={r.workerId} className="card-flat row-between" style={{ padding: 10, alignItems: 'center' }}>
                    <div>
                      <div className="t-strong" style={{ fontSize: 14 }}>{r.colaborador.nome}</div>
                      <div className="t-caption">{r.quantidade.toLocaleString('pt-BR')} {unidadeDe(tipoSelecionado)} em {r.dias} dia{r.dias === 1 ? '' : 's'}</div>
                    </div>
                    <div className="t-strong" style={{ fontSize: 15 }}>
                      {r.rendimento.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {unidadeDe(tipoSelecionado)}/dia
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : porServico.length === 0 ? (
        <div className="card-flat"><Vazio titulo="Nada lançado nesse período" texto="" /></div>
      ) : (
        <div className="stack-1">
          {porServico.map((r) => (
            <div key={r.tipo.id} className="card-flat row-between" style={{ padding: 10, alignItems: 'center' }}>
              <div>
                <div className="t-strong" style={{ fontSize: 14 }}>{r.tipo.nome}</div>
                <div className="t-caption">{r.quantidade.toLocaleString('pt-BR')} {unidadeDe(r.tipo)} em {r.dias} dia{r.dias === 1 ? '' : 's'} · todas as obras</div>
              </div>
              <div className="t-strong" style={{ fontSize: 15 }}>
                {r.ritmo.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {unidadeDe(r.tipo)}/dia
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
