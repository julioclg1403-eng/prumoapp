/* ============================================================
   PRODUTIVIDADE E MEDIÇÃO

   Marcação visual de execução sobre a planta (PDF): cada pino é um
   elemento (sapata, pilar...), com dimensões que viram quantidade
   pela fórmula do tipo de serviço (Catálogo, em Cadastros), e um
   histórico de eventos por estágio — cada evento com seu próprio
   colaborador, data e (opcional, caso a caso) item de contrato.
   Ver prumoapp-modulo-produtividade-medicao.md.

   3 sub-abas: Serviços (cadastro do serviço — empresa, contrato,
   time — com as plantas/locais e a marcação dentro de cada um),
   Medição (por contrato) e Rendimento (por colaborador/serviço).

   Um Serviço é cadastrado ANTES de importar qualquer planta: fixa o
   tipo (do Catálogo, em Cadastros), a empresa, o contrato e o time.
   Cada combinação empresa+contrato é o seu próprio Serviço — o app
   não tenta ligar etapas entre serviços diferentes sozinho, isso é
   manual (ex.: "Escavação — Empreiteira A" e "Concretagem —
   Empreiteira B" são dois Serviços separados, cada um com sua
   planta). Dentro de um Serviço, cada planta é um "local" (ex.: um
   pavimento) — várias plantas podem pertencer ao mesmo Serviço.
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDados } from '../lib/DadosContext'
import { hojeISO, formatarData, formatarDinheiro, diarioDaData, filtrarPorPeriodo, rotuloPeriodo, plural } from '../lib/dominio'
import { calcularQuantidade } from '../lib/formulaProducao'
import { linkTemporarioPlanta } from '../lib/plantasProducao'
import { Icon, Chip, PageHeader, Segmentos, Sheet, Campo, Confirmar, Vazio, Indicador, FiltroPeriodo, SecaoRecolhivel } from '../components'

const ROTULO_UNIDADE = { m3: 'm³', m2: 'm²', ml: 'ml', un: 'un' }

export default function Producao({ voltar, perfil }) {
  const dados = useDados()
  const [aba, setAba] = useState('servicos')
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
        <PageHeader titulo="Produtividade" sub="Serviço (empresa, contrato, time) → planta → marcação, medição por contrato e rendimento" />

        <div className="stack-2">
          <Segmentos
            valor={aba} onChange={setAba}
            opcoes={[
              { valor: 'servicos', rotulo: 'Serviços' },
              { valor: 'medicao', rotulo: 'Medição' },
              { valor: 'rendimento', rotulo: 'Rendimento' },
            ]}
          />

          {aba === 'servicos' && <AbaServicos dados={dados} perfil={perfil} podeEditar={podeEditar} />}
          {aba === 'medicao' && <AbaMedicao dados={dados} />}
          {aba === 'rendimento' && <AbaRendimento dados={dados} />}
        </div>
      </div>
    </>
  )
}

/* ── Serviços (cadastro) ───────────────────────────────────── */

function AbaServicos({ dados, perfil, podeEditar }) {
  const hoje = hojeISO()
  const [periodoModo, setPeriodoModo] = useState('mes')
  const [periodoDia, setPeriodoDia] = useState(hoje)
  const [periodoMes, setPeriodoMes] = useState(hoje.slice(0, 7))
  const [periodoInicio, setPeriodoInicio] = useState(hoje)
  const [periodoFim, setPeriodoFim] = useState(hoje)
  const [criando, setCriando] = useState(false)
  const [servicoAberto, setServicoAberto] = useState(null)

  const servicos = (dados.servicosProducao || []).filter((s) => s.ativo !== false)
  const servicoAtual = servicoAberto && servicos.find((s) => s.id === servicoAberto.id)

  const eventosDoPeriodo = useMemo(
    () => filtrarPorPeriodo(
      dados.eventosProducao || [], periodoModo,
      { dia: periodoDia, mes: periodoMes, inicio: periodoInicio, fim: periodoFim },
      (e) => e.data_execucao,
    ),
    [dados.eventosProducao, periodoModo, periodoDia, periodoMes, periodoInicio, periodoFim],
  )

  /* Quanto cada Serviço produziu no período — soma a quantidade dos
     eventos cujo marcador pertence a uma planta deste serviço (o
     evento não guarda o serviço direto, só o marcador → planta). */
  const quantidadePorServico = useMemo(() => {
    const planPorId = new Map((dados.plantasProducao || []).map((p) => [p.id, p]))
    const marcadorPorId = new Map((dados.marcadoresProducao || []).map((m) => [m.id, m]))
    const mapa = new Map()
    for (const ev of eventosDoPeriodo) {
      const plan = planPorId.get(marcadorPorId.get(ev.marker_id)?.plan_id)
      if (!plan) continue
      mapa.set(plan.service_id, (mapa.get(plan.service_id) || 0) + (Number(ev.quantidade) || 0))
    }
    return mapa
  }, [eventosDoPeriodo, dados.plantasProducao, dados.marcadoresProducao])

  if (servicoAtual) {
    return (
      <DetalheServico
        servico={servicoAtual} dados={dados} perfil={perfil} podeEditar={podeEditar}
        voltar={() => setServicoAberto(null)}
      />
    )
  }

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

      {podeEditar && (
        <button className="btn btn-primary" onClick={() => setCriando(true)} style={{ alignSelf: 'flex-start' }}>
          <Icon name="mais_sinal" size={16} /> Novo serviço
        </button>
      )}

      {servicos.length === 0 ? (
        <div className="card-flat">
          <Vazio
            titulo="Nenhum serviço cadastrado ainda"
            texto={podeEditar ? 'Cadastre o serviço (tipo, empresa, contrato, time) antes de importar a planta.' : 'A gestão ainda não cadastrou nenhum serviço desta obra.'}
            acao={podeEditar && <button className="btn btn-primary" onClick={() => setCriando(true)}>Novo serviço</button>}
          />
        </div>
      ) : (
        <div className="stack-1">
          {servicos.map((s) => {
            const tipo = dados.tiposServico?.find((t) => t.id === s.service_type_id)
            const empresa = s.company_id ? dados.nomeDe(dados.empresas, s.company_id) : null
            const qtdePlantas = (dados.plantasProducao || []).filter((p) => p.service_id === s.id && p.ativo !== false).length
            const quantidadePeriodo = quantidadePorServico.get(s.id) || 0
            const unidade = ROTULO_UNIDADE[tipo?.unidade_resultado] || tipo?.unidade_resultado || ''
            return (
              <button key={s.id} className="card-tap" style={{ textAlign: 'left', width: '100%' }} onClick={() => setServicoAberto(s)}>
                <div className="row-between" style={{ alignItems: 'center' }}>
                  <div>
                    <div className="t-strong">{s.nome}</div>
                    <div className="t-caption">
                      {tipo?.nome || 'Tipo removido'}
                      {empresa && ` · ${empresa}`}
                      {s.cod_contrato && ` · Contrato ${s.cod_contrato}`}
                      {` · ${plural(qtdePlantas, 'planta', 'plantas')}`}
                    </div>
                  </div>
                  <div className="row-flex" style={{ gap: 8, alignItems: 'center' }}>
                    {quantidadePeriodo > 0 && (
                      <span className="t-caption">{quantidadePeriodo.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {unidade} no período</span>
                    )}
                    <Icon name="avancar" size={16} />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {criando && <ServicoSheet dados={dados} onFechar={() => setCriando(false)} />}
    </div>
  )
}

function ServicoSheet({ dados, servico, onFechar }) {
  const [nome, setNome] = useState(servico?.nome || '')
  const [tipoId, setTipoId] = useState(servico?.service_type_id || '')
  const [companyId, setCompanyId] = useState(servico?.company_id || '')
  const [codContrato, setCodContrato] = useState(servico?.cod_contrato || '')
  const [funcionariosIds, setFuncionariosIds] = useState(servico?.funcionarios_ids || [])
  const [salvando, setSalvando] = useState(false)
  const [confirmarArquivar, setConfirmarArquivar] = useState(false)

  const tiposAtivos = (dados.tiposServico || []).filter((t) => t.ativo !== false)
  const empresasAtivas = (dados.empresas || []).filter((e) => e.ativo !== false)
  /* Contratos vinculados à empresa escolhida — reaproveita o
     company_id que já foi ligado ao contrato lá em Contratos. Um
     contrato tem vários itens (contract_items); aqui só interessa o
     código, um por linha. */
  const contratosDaEmpresa = useMemo(() => {
    const porCodigo = new Map()
    for (const item of (dados.contratos || [])) {
      if (companyId && item.company_id !== companyId) continue
      if (!porCodigo.has(item.cod_contrato)) porCodigo.set(item.cod_contrato, item)
    }
    return [...porCodigo.values()]
  }, [dados.contratos, companyId])

  const podeSalvar = nome.trim() && tipoId

  const salvar = async () => {
    setSalvando(true)
    const ok = await dados.salvarServico({
      id: servico?.id, nome: nome.trim(), service_type_id: tipoId,
      company_id: companyId || null, cod_contrato: codContrato || null,
      funcionarios_ids: funcionariosIds,
    })
    setSalvando(false)
    if (ok) onFechar()
  }

  return (
    <Sheet
      aberto titulo={servico ? 'Editar serviço' : 'Novo serviço'} onFechar={onFechar}
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
        <Campo label="Nome do serviço" dica='Ex.: "Escavação de sapatas — Empreiteira A"'>
          <input className="ipt" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>

        <Campo label="Tipo de serviço" dica="Define a fórmula, as dimensões e os estágios (Cadastros → Catálogo de Serviços).">
          <select className="sel" value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
            <option value="">Escolha</option>
            {tiposAtivos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          {tiposAtivos.length === 0 && (
            <div className="t-caption" style={{ marginTop: 4 }}>
              Nenhum tipo cadastrado ainda — cadastre em Cadastros → Catálogo de Serviços.
            </div>
          )}
        </Campo>

        <Campo label="Empresa responsável" dica="Opcional.">
          <select className="sel" value={companyId} onChange={(e) => { setCompanyId(e.target.value); setCodContrato('') }}>
            <option value="">Sem empresa vinculada</option>
            {empresasAtivas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </Campo>

        <Campo label="Contrato" dica="Opcional — lista os contratos já vinculados à empresa escolhida acima (em Contratos).">
          <select className="sel" value={codContrato} onChange={(e) => setCodContrato(e.target.value)} disabled={!companyId}>
            <option value="">Sem contrato vinculado</option>
            {contratosDaEmpresa.map((c) => (
              <option key={c.cod_contrato} value={c.cod_contrato}>Contrato {c.cod_contrato} — {c.objeto_contrato || c.fornecedor}</option>
            ))}
          </select>
          {companyId && contratosDaEmpresa.length === 0 && (
            <div className="t-caption" style={{ marginTop: 4 }}>
              Nenhum contrato vinculado a essa empresa ainda — vincule em Contratos.
            </div>
          )}
        </Campo>

        <Campo label="Funcionários" dica="Time deste serviço — só eles aparecem pra escolher em cada marcação, pra manter o controle.">
          <BuscarColaboradoresMultiplo dados={dados} companyId={companyId} valores={funcionariosIds} onMudar={setFuncionariosIds} />
        </Campo>

        {servico && (
          <button className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)', alignSelf: 'flex-start' }} onClick={() => setConfirmarArquivar(true)}>
            <Icon name="x" size={13} /> Arquivar serviço
          </button>
        )}
      </div>

      {servico && (
        <Confirmar
          aberto={confirmarArquivar}
          titulo="Arquivar serviço?"
          texto="As plantas e marcações continuam guardadas, só o serviço some da lista. Nada é apagado."
          rotuloOk="Arquivar" perigo
          onOk={async () => { setConfirmarArquivar(false); await dados.arquivarServico(servico.id); onFechar() }}
          onCancelar={() => setConfirmarArquivar(false)}
        />
      )}
    </Sheet>
  )
}

function BuscarColaboradoresMultiplo({ dados, companyId, valores, onMudar }) {
  const [busca, setBusca] = useState('')

  const disponiveis = useMemo(() => {
    const base = (dados.colaboradores || []).filter((c) => c.ativo !== false)
    return companyId ? base.filter((c) => c.company_id === companyId) : base
  }, [dados.colaboradores, companyId])

  const resultados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return []
    const jaEscolhidos = new Set(valores)
    return disponiveis.filter((c) => !jaEscolhidos.has(c.id) && c.nome.toLowerCase().includes(termo)).slice(0, 8)
  }, [busca, disponiveis, valores])

  return (
    <div className="stack-1">
      {valores.length > 0 && (
        <div className="row-wrap" style={{ gap: 6 }}>
          {valores.map((id) => (
            <Chip key={id}>
              {dados.colaboradorPorId(id)?.nome || '—'}
              <button
                onClick={() => onMudar(valores.filter((x) => x !== id))} aria-label="Remover"
                style={{ border: 0, background: 'none', cursor: 'pointer', marginLeft: 4, padding: 0, display: 'inline-flex' }}
              >
                <Icon name="x" size={12} />
              </button>
            </Chip>
          ))}
        </div>
      )}
      <input
        className="ipt" value={busca} onChange={(e) => setBusca(e.target.value)}
        placeholder={companyId ? 'Buscar na empresa…' : 'Buscar colaborador…'}
      />
      {resultados.length > 0 && (
        <div className="stack-1">
          {resultados.map((c) => (
            <button
              key={c.id} type="button" className="btn btn-secondary btn-sm" style={{ justifyContent: 'flex-start' }}
              onClick={() => { onMudar([...valores, c.id]); setBusca('') }}
            >
              {c.nome}
            </button>
          ))}
        </div>
      )}
      {busca.trim() && resultados.length === 0 && <div className="t-caption">Ninguém com esse nome.</div>}
    </div>
  )
}

/* ── Detalhe do serviço: dados + plantas (locais) dentro dele ─ */

function DetalheServico({ servico, dados, perfil, podeEditar, voltar }) {
  const [enviando, setEnviando] = useState(false)
  const [editando, setEditando] = useState(false)
  const [plantaAberta, setPlantaAberta] = useState(null)
  /* Editar/excluir o Serviço mexe em empresa e contrato — coisa mais
     sensível que marcar na planta, então fica só pro admin, mesmo que
     o resto do módulo já libere pra gestão. */
  const ehAdmin = perfil.role === 'admin'

  const plantas = (dados.plantasProducao || []).filter((p) => p.service_id === servico.id && p.ativo !== false)
  const plantaAtual = plantaAberta && plantas.find((p) => p.id === plantaAberta.id)
  const tipo = dados.tiposServico?.find((t) => t.id === servico.service_type_id)

  if (plantaAtual) {
    return (
      <VisualizarPlanta
        planta={plantaAtual} servico={servico} tipo={tipo} dados={dados} perfil={perfil} podeEditar={podeEditar}
        voltar={() => setPlantaAberta(null)}
      />
    )
  }

  return (
    <div className="stack-2">
      <button className="btn btn-ghost btn-sm" onClick={voltar} style={{ alignSelf: 'flex-start' }}>
        <Icon name="voltar" size={16} /> Serviços
      </button>

      <div className="card-flat stack-1">
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="t-strong" style={{ fontSize: 16 }}>{servico.nome}</div>
            <div className="t-caption">{tipo?.nome || 'Tipo removido'}</div>
          </div>
          {ehAdmin && (
            <button className="btn btn-ghost btn-sm" onClick={() => setEditando(true)}>
              <Icon name="editar" size={13} /> Editar
            </button>
          )}
        </div>
        <div className="row-wrap" style={{ gap: 6 }}>
          {servico.company_id && <Chip>{dados.nomeDe(dados.empresas, servico.company_id)}</Chip>}
          {servico.cod_contrato && <Chip tom="info">Contrato {servico.cod_contrato}</Chip>}
          <Chip tom="success">{plural(servico.funcionarios_ids?.length || 0, 'funcionário', 'funcionários')}</Chip>
        </div>
      </div>

      {podeEditar && (
        <button className="btn btn-primary" onClick={() => setEnviando(true)} style={{ alignSelf: 'flex-start' }}>
          <Icon name="baixar" size={16} style={{ transform: 'rotate(180deg)' }} /> Importar local (planta)
        </button>
      )}

      {plantas.length === 0 ? (
        <div className="card-flat">
          <Vazio
            titulo="Nenhum local importado ainda"
            texto={podeEditar ? 'Importe o PDF de cada local (ex.: um por pavimento) pra começar a marcar.' : 'A gestão ainda não importou nenhum local deste serviço.'}
            acao={podeEditar && <button className="btn btn-primary" onClick={() => setEnviando(true)}>Importar local</button>}
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
                    <div className="t-caption">{plural(qtdeMarcadores, 'marcação', 'marcações')} · enviada {formatarData(p.created_at.slice(0, 10))}</div>
                  </div>
                  <Icon name="avancar" size={16} />
                </div>
              </button>
            )
          })}
        </div>
      )}

      <EnviarPlantaSheet aberto={enviando} onFechar={() => setEnviando(false)} dados={dados} servico={servico} />
      {editando && <ServicoSheet dados={dados} servico={servico} onFechar={() => setEditando(false)} />}
    </div>
  )
}

function EnviarPlantaSheet({ aberto, onFechar, dados, servico }) {
  const [nome, setNome] = useState('')
  const [arquivo, setArquivo] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const fechar = () => { setNome(''); setArquivo(null); setErro(''); onFechar() }

  const enviar = async () => {
    if (!arquivo) return
    setEnviando(true)
    setErro('')
    const r = await dados.enviarPlanta({ arquivo, nome: nome.trim() || arquivo.name, serviceId: servico.id })
    setEnviando(false)
    if (r) fechar()
    else setErro('Não consegui enviar a planta. Tente de novo.')
  }

  return (
    <Sheet
      aberto={aberto} titulo="Importar local (planta)" onFechar={fechar}
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
        <Campo label="Nome do local" dica='Opcional — ex.: "3º pavimento". Se deixar em branco, usa o nome do arquivo.'>
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

const ZOOM_MIN = 0.5
const ZOOM_MAX = 4
const ZOOM_PASSO = 0.25

function VisualizarPlanta({ planta, servico, tipo, dados, perfil, podeEditar, voltar }) {
  const [pdfDoc, setPdfDoc] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [pagina, setPagina] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [alturaRenderizada, setAlturaRenderizada] = useState(0)
  const [larguraRenderizada, setLarguraRenderizada] = useState(0)
  /* "marcar" (padrão): clique na planta abre nova marcação. "mao":
     clique-e-arrasta pan, igual mãozinha de CAD — pedido explícito
     do Julio ("tipo um pan, mãozinha, zoom, mexer como AutoCAD"),
     porque sem isso as duas coisas (marcar um ponto vs. só navegar
     pela planta) disputavam o mesmo clique. */
  const [ferramenta, setFerramenta] = useState('marcar')
  /* Dentro de "marcar": pino (um ponto) ou área (retângulo) — pedido
     do Julio pra rastrear elementos que são área de verdade (parede,
     sapata inteira), não só um ponto. O tamanho do retângulo é só
     visual/rastreabilidade — a quantidade continua vindo dos campos
     de dimensão digitados, igual o pino. */
  const [formaMarcacao, setFormaMarcacao] = useState('ponto')
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const viewportRef = useRef(null)
  const arrastoRef = useRef(null)
  const desenhandoAreaRef = useRef(false)
  const renderTaskRef = useRef(null)
  const [novoPonto, setNovoPonto] = useState(null)
  const [areaEmDesenho, setAreaEmDesenho] = useState(null)
  const [marcadorAberto, setMarcadorAberto] = useState(null)

  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    setErro('')
    setPdfDoc(null)
    setZoom(1)
    ;(async () => {
      const url = await linkTemporarioPlanta(planta.caminho)
      if (!url) { if (vivo) { setErro('Não consegui abrir esta planta.'); setCarregando(false) }; return }
      try {
        const { carregarDocumentoPDF } = await import('../lib/pdfRender')
        const doc = await carregarDocumentoPDF(url)
        if (vivo) { setPdfDoc(doc); setPagina(1); setCarregando(false) }
      } catch (e) {
        /* Quase sempre é rede instável (obra sem sinal bom) — o
           navegador some com o erro de verdade num `catch {}` mudo,
           então loga aqui pra dar pra investigar se acontecer nas
           ferramentas do navegador, e deixa a pessoa tentar de novo
           sem precisar sair da tela e voltar. */
        console.error('[Prumo] carregar a planta:', e)
        if (vivo) { setErro('Não consegui ler o PDF desta planta. Pode ser a conexão — toque em "Tentar de novo".'); setCarregando(false) }
      }
    })()
    return () => { vivo = false }
  }, [planta.id, planta.caminho, tentativa])

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !viewportRef.current) return
    let vivo = true
    ;(async () => {
      const larguraBase = viewportRef.current.clientWidth
      const largura = larguraBase * zoom
      try {
        const { renderizarPaginaPDF } = await import('../lib/pdfRender')
        const altura = await renderizarPaginaPDF(pdfDoc, pagina, canvasRef.current, largura, renderTaskRef)
        if (vivo) { setLarguraRenderizada(largura); setAlturaRenderizada(altura); setErro('') }
      } catch (e) {
        console.error('[Prumo] desenhar a planta:', e)
        if (vivo) setErro('Não consegui desenhar esta página.')
      }
    })()
    return () => { vivo = false }
  }, [pdfDoc, pagina, zoom])

  const marcadoresDaPagina = useMemo(
    () => (dados.marcadoresProducao || []).filter((m) => m.plan_id === planta.id && m.pagina === pagina && m.ativo !== false),
    [dados.marcadoresProducao, planta.id, pagina],
  )

  const coordsPercentual = (clientX, clientY) => {
    const rect = containerRef.current.getBoundingClientRect()
    return { x: ((clientX - rect.left) / rect.width) * 100, y: ((clientY - rect.top) / rect.height) * 100 }
  }

  const aoClicarNaPlanta = (e) => {
    if (!podeEditar || ferramenta !== 'marcar' || formaMarcacao !== 'ponto' || !containerRef.current) return
    const { x, y } = coordsPercentual(e.clientX, e.clientY)
    setNovoPonto({ forma: 'ponto', x, y, pagina })
  }

  /* Área: arrasta um retângulo em vez de um clique só. Ignora
     arrastos minúsculos (menos de meio ponto percentual) — evita
     abrir o formulário sozinho num clique tremido. */
  const aoIniciarArea = (clientX, clientY) => {
    if (!podeEditar || ferramenta !== 'marcar' || formaMarcacao !== 'area' || !containerRef.current) return
    const { x, y } = coordsPercentual(clientX, clientY)
    desenhandoAreaRef.current = true
    setAreaEmDesenho({ x1: x, y1: y, x2: x, y2: y })
  }
  const aoMoverArea = (clientX, clientY) => {
    if (!desenhandoAreaRef.current || !containerRef.current) return
    const { x, y } = coordsPercentual(clientX, clientY)
    setAreaEmDesenho((a) => a && { ...a, x2: x, y2: y })
  }
  const aoFinalizarArea = () => {
    if (!desenhandoAreaRef.current) return
    desenhandoAreaRef.current = false
    setAreaEmDesenho((a) => {
      if (a && Math.abs(a.x2 - a.x1) > 0.5 && Math.abs(a.y2 - a.y1) > 0.5) {
        setNovoPonto({
          forma: 'area', pagina,
          x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2),
          x2: Math.max(a.x1, a.x2), y2: Math.max(a.y1, a.y2),
        })
      }
      return null
    })
  }

  /* Arrastar com a mãozinha rola o viewport na mão — mais direto que
     caçar a barra de rolagem, principalmente no celular. Funciona a
     dedo (touch) e com o mouse. */
  const iniciarArrasto = (clientX, clientY) => {
    if (ferramenta !== 'mao' || !viewportRef.current) return
    arrastoRef.current = { x: clientX, y: clientY, scrollLeft: viewportRef.current.scrollLeft, scrollTop: viewportRef.current.scrollTop }
  }
  const moverArrasto = (clientX, clientY) => {
    if (!arrastoRef.current || !viewportRef.current) return
    viewportRef.current.scrollLeft = arrastoRef.current.scrollLeft - (clientX - arrastoRef.current.x)
    viewportRef.current.scrollTop = arrastoRef.current.scrollTop - (clientY - arrastoRef.current.y)
  }
  const pararArrasto = () => { arrastoRef.current = null }

  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_PASSO) * 100) / 100))
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_PASSO) * 100) / 100))

  /* Roda do mouse dá zoom quando a mãozinha está ativa — pedido do
     Julio, igual CAD. Só nesse modo: fora dele a roda continua
     rolando a página normal, sem surpresa. Precisa de listener nativo
     (não `onWheel` do JSX) com `passive: false` pra `preventDefault`
     funcionar de verdade e não rolar o viewport junto do zoom. */
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const aoRodarRoda = (e) => {
      if (ferramenta !== 'mao') return
      e.preventDefault()
      if (e.deltaY < 0) zoomIn()
      else if (e.deltaY > 0) zoomOut()
    }
    el.addEventListener('wheel', aoRodarRoda, { passive: false })
    return () => el.removeEventListener('wheel', aoRodarRoda)
  }, [ferramenta])

  return (
    <div className="stack-2">
      <div className="row-between" style={{ alignItems: 'center' }}>
        <button className="btn btn-ghost btn-sm" onClick={voltar}><Icon name="voltar" size={16} /> {servico.nome}</button>
        <div className="t-strong" style={{ fontSize: 14 }}>{planta.nome}</div>
        {pdfDoc && pdfDoc.numPages > 1 ? (
          <div className="row-flex" style={{ gap: 6, alignItems: 'center' }}>
            <button className="btn btn-ghost btn-sm" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>‹</button>
            <span className="t-caption">{pagina}/{pdfDoc.numPages}</span>
            <button className="btn btn-ghost btn-sm" disabled={pagina >= pdfDoc.numPages} onClick={() => setPagina((p) => p + 1)}>›</button>
          </div>
        ) : <span />}
      </div>

      {erro && (
        <div className="alert danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span>{erro}</span>
          <button className="btn btn-secondary btn-sm" style={{ flex: 'none' }} onClick={() => setTentativa((t) => t + 1)}>
            Tentar de novo
          </button>
        </div>
      )}
      {carregando && <div className="t-caption">Carregando planta…</div>}

      {!carregando && !erro && (
        <div className="row-between" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div className="row-flex" style={{ gap: 4 }}>
            <button
              className={`btn btn-sm ${ferramenta === 'marcar' ? 'btn-dark' : 'btn-secondary'}`}
              onClick={() => setFerramenta('marcar')}
              title="Marcar um elemento"
            >
              <Icon name="mais_sinal" size={14} /> Marcar
            </button>
            <button
              className={`btn btn-sm ${ferramenta === 'mao' ? 'btn-dark' : 'btn-secondary'}`}
              onClick={() => setFerramenta('mao')}
              title="Mãozinha — arrastar pra navegar"
            >
              ✋ Mão
            </button>
          </div>
          {ferramenta === 'marcar' && (
            <div className="row-flex" style={{ gap: 4 }}>
              <button
                className={`btn btn-sm ${formaMarcacao === 'ponto' ? 'btn-dark' : 'btn-secondary'}`}
                onClick={() => setFormaMarcacao('ponto')}
                title="Marcar um ponto"
              >
                📍 Ponto
              </button>
              <button
                className={`btn btn-sm ${formaMarcacao === 'area' ? 'btn-dark' : 'btn-secondary'}`}
                onClick={() => setFormaMarcacao('area')}
                title="Marcar uma área (arraste um retângulo)"
              >
                ▭ Área
              </button>
            </div>
          )}
          <div className="row-flex" style={{ gap: 4, alignItems: 'center' }}>
            <button className="btn btn-ghost btn-sm" onClick={zoomOut} disabled={zoom <= ZOOM_MIN} aria-label="Diminuir zoom">−</button>
            <span className="t-caption" style={{ minWidth: 42, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
            <button className="btn btn-ghost btn-sm" onClick={zoomIn} disabled={zoom >= ZOOM_MAX} aria-label="Aumentar zoom">+</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setZoom(1)} disabled={zoom === 1}>Ajustar</button>
          </div>
        </div>
      )}
      {!carregando && !erro && podeEditar && (
        <div className="t-caption">
          {ferramenta !== 'marcar'
            ? 'Arraste pra navegar pela planta — a roda do mouse dá zoom.'
            : formaMarcacao === 'ponto'
              ? 'Toque num ponto vazio da planta pra marcar um elemento novo.'
              : 'Arraste um retângulo na planta pra marcar uma área.'}
        </div>
      )}

      <div
        ref={viewportRef}
        style={{ overflow: 'auto', maxHeight: '70vh', border: '1px solid var(--border)', borderRadius: 8 }}
        onMouseDown={(e) => iniciarArrasto(e.clientX, e.clientY)}
        onMouseMove={(e) => moverArrasto(e.clientX, e.clientY)}
        onMouseUp={pararArrasto}
        onMouseLeave={pararArrasto}
        onTouchStart={(e) => iniciarArrasto(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={(e) => moverArrasto(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={pararArrasto}
      >
        <div
          ref={containerRef}
          onClick={aoClicarNaPlanta}
          onMouseDown={(e) => aoIniciarArea(e.clientX, e.clientY)}
          onMouseMove={(e) => aoMoverArea(e.clientX, e.clientY)}
          onMouseUp={aoFinalizarArea}
          onTouchStart={(e) => aoIniciarArea(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={(e) => aoMoverArea(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={aoFinalizarArea}
          style={{
            position: 'relative', lineHeight: 0,
            width: larguraRenderizada || '100%', height: alturaRenderizada || 'auto',
            cursor: ferramenta === 'mao' ? 'grab' : (podeEditar ? 'crosshair' : 'default'),
          }}
        >
          <canvas ref={canvasRef} style={{ width: '100%', display: 'block' }} />
          {marcadoresDaPagina.map((m) => {
            const etapaInfo = tipo?.etapas?.find((e) => e.chave === m.etapa_atual)
            const cor = etapaInfo?.cor
            if (m.forma === 'area') {
              return (
                <button
                  key={m.id}
                  onClick={(e) => { e.stopPropagation(); setMarcadorAberto(m) }}
                  aria-label={m.elemento}
                  style={{
                    position: 'absolute',
                    left: `${m.x}%`, top: `${m.y}%`,
                    width: `${Math.max(0.5, (m.x2 ?? m.x) - m.x)}%`, height: `${Math.max(0.5, (m.y2 ?? m.y) - m.y)}%`,
                    padding: 0, border: `2px solid ${cor ? `var(--${cor})` : 'var(--text-3)'}`,
                    background: cor ? `var(--${cor})` : 'var(--text-3)', opacity: 0.4, cursor: 'pointer',
                  }}
                />
              )
            }
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
          {areaEmDesenho && (
            <div
              style={{
                position: 'absolute', pointerEvents: 'none',
                left: `${Math.min(areaEmDesenho.x1, areaEmDesenho.x2)}%`,
                top: `${Math.min(areaEmDesenho.y1, areaEmDesenho.y2)}%`,
                width: `${Math.abs(areaEmDesenho.x2 - areaEmDesenho.x1)}%`,
                height: `${Math.abs(areaEmDesenho.y2 - areaEmDesenho.y1)}%`,
                border: '2px dashed var(--text-2)', background: 'rgba(0,0,0,.08)',
              }}
            />
          )}
        </div>
      </div>

      {novoPonto && (
        <MarcadorSheet
          ponto={novoPonto} planta={planta} servico={servico} tipo={tipo} dados={dados}
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

function BuscarColaborador({ dados, diarioDoDia, servico, valor, onEscolher }) {
  const [busca, setBusca] = useState('')
  const selecionado = valor ? dados.colaboradorPorId(valor) : null

  /* Time do Serviço tem prioridade — é pra isso que ele existe
     ("controle" do Julio: só quem tá registrado no serviço aparece).
     Sem time registrado mas com empresa vinculada, já vale só puxar
     os colaboradores daquela empresa (não faz sentido oferecer gente
     de outras empreiteiras). Sem nada disso, cai pro efetivo do dia,
     e sem diário ainda, todo mundo ativo. */
  const disponiveis = useMemo(() => {
    const ativos = (dados.colaboradores || []).filter((c) => c.ativo !== false)
    if (servico?.funcionarios_ids?.length) {
      const permitidos = new Set(servico.funcionarios_ids)
      return ativos.filter((c) => permitidos.has(c.id))
    }
    if (servico?.company_id) {
      return ativos.filter((c) => c.company_id === servico.company_id)
    }
    if (diarioDoDia) {
      const presentes = new Set((diarioDoDia.presencas || []).filter((p) => p.presente).map((p) => p.worker_id))
      return ativos.filter((c) => presentes.has(c.id))
    }
    return ativos
  }, [diarioDoDia, dados.colaboradores, servico])

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
            placeholder={
              servico?.funcionarios_ids?.length ? 'Buscar no time do serviço…'
                : servico?.company_id ? 'Buscar na empresa do serviço…'
                  : diarioDoDia ? 'Buscar no efetivo do dia…' : 'Buscar colaborador…'
            }
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

function BuscarItemContrato({ dados, servico, valor, onEscolher }) {
  const [busca, setBusca] = useState('')
  const selecionado = valor ? (dados.contratos || []).find((i) => i.id === valor) : null

  /* Contrato já vem fixo do Serviço (o Julio vincula na hora de
     cadastrar) — aqui só resta escolher QUAL item daquele contrato,
     já que um contrato tem vários. */
  const baseContratos = useMemo(() => {
    const todos = dados.contratos || []
    return servico?.cod_contrato ? todos.filter((i) => i.cod_contrato === servico.cod_contrato) : todos
  }, [dados.contratos, servico])

  const resultados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return []
    return baseContratos
      .filter((i) => i.descricao_item.toLowerCase().includes(termo) || String(i.cod_contrato).includes(termo))
      .slice(0, 8)
  }, [busca, baseContratos])

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

function MarcadorSheet({ ponto, planta, servico, tipo, dados, onFechar }) {
  const hoje = hojeISO()
  const [elemento, setElemento] = useState('')
  const [dimensoes, setDimensoes] = useState(() => Object.fromEntries((tipo?.campos_dimensao || []).map((c) => [c.chave, ''])))
  const [etapa, setEtapa] = useState(tipo?.etapas?.[0]?.chave || '')
  const [workerId, setWorkerId] = useState('')
  const [dataExecucao, setDataExecucao] = useState(hoje)
  const [contractItemId, setContractItemId] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)

  const quantidadeCalculada = tipo ? calcularQuantidade(tipo.formula, dimensoes) : null
  const diarioDoDia = dataExecucao ? diarioDaData(dados.diarios || [], dataExecucao, dados.obra.id) : null
  const contratoSelecionado = contractItemId ? (dados.contratos || []).find((i) => i.id === contractItemId) : null
  const quantidadeEvento = quantidade === '' ? quantidadeCalculada : Number(quantidade)

  const podeSalvar = elemento.trim() && etapa && dataExecucao && quantidadeCalculada != null

  const salvar = async () => {
    setSalvando(true)
    const ok = await dados.salvarMarcador({
      plan_id: planta.id, service_type_id: tipo.id, elemento: elemento.trim(),
      forma: ponto.forma, x: ponto.x, y: ponto.y, x2: ponto.x2, y2: ponto.y2, pagina: ponto.pagina,
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
      aberto titulo={ponto.forma === 'area' ? 'Nova marcação (área)' : 'Nova marcação'} onFechar={onFechar}
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
        <div className="t-caption">{servico.nome} · {tipo?.nome}</div>

        <Campo label="Identificação do elemento" dica='Ex.: "Sapata N12"'>
          <input className="ipt" autoFocus value={elemento} onChange={(e) => setElemento(e.target.value)} placeholder="Sapata N12" />
        </Campo>

        <Campo label="Dimensões">
          <div className="row-wrap" style={{ gap: 8 }}>
            {(tipo?.campos_dimensao || []).map((c) => (
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
            Quantidade calculada: <strong>{quantidadeCalculada != null ? `${quantidadeCalculada.toLocaleString('pt-BR')} ${ROTULO_UNIDADE[tipo?.unidade_resultado] || tipo?.unidade_resultado || ''}` : '—'}</strong>
          </div>
        </Campo>

        <Campo label="Estágio atual">
          <select className="sel" value={etapa} onChange={(e) => setEtapa(e.target.value)}>
            {(tipo?.etapas || []).map((e) => <option key={e.chave} value={e.chave}>{e.rotulo}</option>)}
          </select>
        </Campo>

        <Campo label="Data de execução">
          <input className="ipt" type="date" value={dataExecucao} onChange={(e) => setDataExecucao(e.target.value)} />
          {dataExecucao && !diarioDoDia && !servico.funcionarios_ids?.length && !servico.company_id && (
            <div className="t-caption" style={{ marginTop: 4 }}>
              Ainda não existe diário desse dia — a lista de colaboradores abaixo mostra todo mundo ativo da obra, e isto entra como lançamento a posteriori.
            </div>
          )}
        </Campo>

        <Campo label="Colaborador" dica="Opcional.">
          <BuscarColaborador dados={dados} diarioDoDia={diarioDoDia} servico={servico} valor={workerId} onEscolher={setWorkerId} />
        </Campo>

        <Campo label="Item de contrato" dica="Opcional — pode vincular depois, no detalhe da marcação.">
          <BuscarItemContrato dados={dados} servico={servico} valor={contractItemId} onEscolher={setContractItemId} />
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
      </div>
    </Sheet>
  )
}

/* ── Detalhe do marcador: estágio atual + histórico + novo evento ── */

function DetalheMarcadorSheet({ marcador: marcadorInicial, dados, podeEditar, onFechar }) {
  const [novoEvento, setNovoEvento] = useState(false)
  const [editando, setEditando] = useState(false)
  const [confirmarArquivar, setConfirmarArquivar] = useState(false)

  /* `marcadorInicial` é o que estava na hora do clique no pino — um
     "novo evento" muda o etapa_atual no banco, e sem reler daqui o
     cabeçalho ficava preso no estágio antigo até fechar e reabrir a
     folha. */
  const marcador = dados.marcadoresProducao?.find((m) => m.id === marcadorInicial.id) || marcadorInicial

  const tipo = dados.tiposServico?.find((t) => t.id === marcador.service_type_id)
  const planta = dados.plantasProducao?.find((p) => p.id === marcador.plan_id)
  const servico = dados.servicosProducao?.find((s) => s.id === planta?.service_id)
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
          <div className="row-between" style={{ alignItems: 'center' }}>
            <div className="t-micro">Dimensões</div>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditando(true)}>
              <Icon name="editar" size={13} /> Editar
            </button>
          </div>
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
        <NovoEventoSheet marcador={marcador} tipo={tipo} servico={servico} dados={dados} onFechar={() => setNovoEvento(false)} />
      )}
      {editando && (
        <EditarMarcadorSheet marcador={marcador} tipo={tipo} dados={dados} onFechar={() => setEditando(false)} />
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

/* Corrige nome/dimensões do pino já marcado — não muda estágio nem
   mexe no histórico de eventos, só os dados do próprio elemento.
   Aberto pra gestão e campo: quem marcou errado em obra é quem
   melhor sabe corrigir, sem precisar arquivar e marcar de novo. */
function EditarMarcadorSheet({ marcador, tipo, dados, onFechar }) {
  const [elemento, setElemento] = useState(marcador.elemento)
  const [dimensoes, setDimensoes] = useState(() => ({ ...(marcador.dimensoes || {}) }))
  const [salvando, setSalvando] = useState(false)

  const quantidadeCalculada = tipo ? calcularQuantidade(tipo.formula, dimensoes) : marcador.quantidade_calculada
  const podeSalvar = elemento.trim() && quantidadeCalculada != null

  const salvar = async () => {
    setSalvando(true)
    const ok = await dados.editarMarcador(marcador.id, {
      elemento: elemento.trim(),
      dimensoes: Object.fromEntries(Object.entries(dimensoes).map(([k, v]) => [k, Number(v) || 0])),
      quantidade_calculada: quantidadeCalculada,
    })
    setSalvando(false)
    if (ok) onFechar()
  }

  return (
    <Sheet
      aberto titulo="Editar marcação" onFechar={onFechar}
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
        <Campo label="Identificação do elemento" dica='Ex.: "Sapata N12"'>
          <input className="ipt" autoFocus value={elemento} onChange={(e) => setElemento(e.target.value)} placeholder="Sapata N12" />
        </Campo>

        <Campo label="Dimensões">
          <div className="row-wrap" style={{ gap: 8 }}>
            {(tipo?.campos_dimensao || []).map((c) => (
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
            Quantidade calculada: <strong>{quantidadeCalculada != null ? `${quantidadeCalculada.toLocaleString('pt-BR')} ${ROTULO_UNIDADE[tipo?.unidade_resultado] || tipo?.unidade_resultado || ''}` : '—'}</strong>
          </div>
        </Campo>
      </div>
    </Sheet>
  )
}

function NovoEventoSheet({ marcador, tipo, servico, dados, onFechar }) {
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
          <BuscarColaborador dados={dados} diarioDoDia={diarioDoDia} servico={servico} valor={workerId} onEscolher={setWorkerId} />
        </Campo>

        <Campo label="Item de contrato" dica="Opcional — caso a caso: este estágio pode ser de um contrato diferente do estágio anterior.">
          <BuscarItemContrato dados={dados} servico={servico} valor={contractItemId} onEscolher={setContractItemId} />
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

  /* Serviço arquivado some da medição — mesma regra do Rendimento. */
  const marcadoresDeServicoArquivado = useMemo(() => {
    const planPorId = new Map((dados.plantasProducao || []).map((p) => [p.id, p]))
    const servicoPorId = new Map((dados.servicosProducao || []).map((s) => [s.id, s]))
    const excluidos = new Set()
    for (const m of (dados.marcadoresProducao || [])) {
      const servico = servicoPorId.get(planPorId.get(m.plan_id)?.service_id)
      if (servico?.ativo === false) excluidos.add(m.id)
    }
    return excluidos
  }, [dados.plantasProducao, dados.servicosProducao, dados.marcadoresProducao])

  /* Só evento com item de contrato vinculado vira medição — o
     "caso a caso" da conversa: nem todo evento precisa medir contra
     um contrato (ver MarcadorSheet/NovoEventoSheet, campo opcional). */
  const eventosComContrato = useMemo(
    () => (dados.eventosProducao || []).filter((e) => e.contract_item_id && !marcadoresDeServicoArquivado.has(e.marker_id)),
    [dados.eventosProducao, marcadoresDeServicoArquivado],
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
  /* Serviço arquivado some dos índices — mesma regra do resto do
     app (arquivar não é o mesmo que apagar, mas some da contagem
     ativa). Marcador → planta → serviço, porque o evento em si não
     guarda o serviço. */
  const marcadoresDeServicoArquivado = useMemo(() => {
    const planPorId = new Map((dados.plantasProducaoTodasObras || []).map((p) => [p.id, p]))
    const servicoPorId = new Map((dados.servicosProducaoTodasObras || []).map((s) => [s.id, s]))
    const excluidos = new Set()
    for (const m of (dados.marcadoresProducaoTodasObras || [])) {
      const servico = servicoPorId.get(planPorId.get(m.plan_id)?.service_id)
      if (servico?.ativo === false) excluidos.add(m.id)
    }
    return excluidos
  }, [dados.plantasProducaoTodasObras, dados.servicosProducaoTodasObras, dados.marcadoresProducaoTodasObras])
  const eventosDoPeriodo = useMemo(
    () => filtrarPorPeriodo(
      (dados.eventosProducaoTodasObras || []).filter((e) => !marcadoresDeServicoArquivado.has(e.marker_id)),
      periodoModo,
      { dia: periodoDia, mes: periodoMes, inicio: periodoInicio, fim: periodoFim },
      (e) => e.data_execucao,
    ),
    [dados.eventosProducaoTodasObras, marcadoresDeServicoArquivado, periodoModo, periodoDia, periodoMes, periodoInicio, periodoFim],
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
