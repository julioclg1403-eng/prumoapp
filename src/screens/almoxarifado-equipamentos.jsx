/* ============================================================
   EQUIPAMENTOS
   BRIEFING seção 3: o campo CONSULTA equipamento; quem cadastra,
   edita e muda o status é a gestão. Diferente das outras
   "cadastros auxiliares" (empresas, colaboradores…), onde o campo
   pode criar um registro provisório — aqui ele só lê. A trava de
   verdade é a política do banco (equipment_insert/update exigem
   eh_gestao()); esconder os botões aqui evita oferecer um clique
   que a permissão recusaria em silêncio.
   ============================================================ */

import { useState, useMemo, useEffect } from 'react'
import { useDados } from '../lib/DadosContext'
import {
  STATUS_EQUIPAMENTO, ROTULO_STATUS_EQUIPAMENTO, TOM_STATUS_EQUIPAMENTO,
  pedidosEquipamentoSemCadastro, formatarData, formatarDataCurta, hojeISO, plural, normalizarParaCasar,
} from '../lib/dominio'
import {
  Icon, Chip, PageHeader, Segmentos, Sheet, Campo, Confirmar, Vazio, ItemLista, TextareaComAudio,
  CampoFotos, VisorFoto, useLinksDeFotos, RelatorioFolha, SecaoRelatorio,
} from '../components'

export default function AlmoxarifadoEquipamentos({ perfil }) {
  const dados = useDados()
  const hoje = hojeISO()
  const [filtro, setFiltro] = useState('todos')
  const [buscaSuprimentos, setBuscaSuprimentos] = useState('')
  const [editando, setEditando] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [enviandoFoto, setEnviandoFoto] = useState(0)
  const [fotoAberta, setFotoAberta] = useState(null)
  const [entregando, setEntregando] = useState(null)
  const [buscaColaboradorEntrega, setBuscaColaboradorEntrega] = useState('')
  const [colaboradorEquipAberto, setColaboradorEquipAberto] = useState(null)
  const [imprimindoFichaEquip, setImprimindoFichaEquip] = useState(false)
  const [buscaColaboradorLista, setBuscaColaboradorLista] = useState('')
  const [agrupamentoColab, setAgrupamentoColab] = useState('nome')
  const [modoPeriodo, setModoPeriodo] = useState('tudo')
  const [dataDia, setDataDia] = useState(hoje)
  const [mesEscolhido, setMesEscolhido] = useState(hoje.slice(0, 7))
  const [periodoInicio, setPeriodoInicio] = useState(hoje)
  const [periodoFim, setPeriodoFim] = useState(hoje)

  const podeEditar = perfil?.role !== 'campo'
  const links = useLinksDeFotos(editando?.fotos)

  const todos = dados.equipamentos || []
  const ativos = todos.filter((e) => e.ativo !== false)
  const arquivados = todos.filter((e) => e.ativo === false)
  const lista = filtro === 'arquivados' ? arquivados
    : filtro === 'todos' ? ativos
      : ativos.filter((e) => e.status === filtro)

  const abrirNovo = (nomeSugerido = '') => setEditando({ status: 'disponivel', fotos: [], nome: nomeSugerido })

  /* Pedidos de Suprimentos marcados como Destino "Equipamentos" cujo
     insumo ainda não tem nenhum equipamento cadastrado com nome
     parecido — lembrete pra cadastrar, não é vínculo por quantidade
     (equipamento é por unidade, não por saldo). */
  const pendentesSuprimentos = useMemo(
    () => pedidosEquipamentoSemCadastro(dados.suprimentos, todos),
    [dados.suprimentos, todos],
  )
  const pendentesSuprimentosFiltrado = useMemo(() => {
    const termo = buscaSuprimentos.trim().toLowerCase()
    return termo ? pendentesSuprimentos.filter((p) => p.insumo.toLowerCase().includes(termo)) : pendentesSuprimentos
  }, [pendentesSuprimentos, buscaSuprimentos])

  const entregas = useMemo(
    () => [...(dados.entregasEquipamento || [])].sort((a, b) => (a.data < b.data ? 1 : -1)),
    [dados.entregasEquipamento],
  )
  const nomeEquipamento = (id) => todos.find((e) => e.id === id)?.nome || 'Equipamento removido'

  /* Quem está com cada equipamento agora, pra mostrar na lista
     principal — a entrega mais recente dele, não uma coluna própria
     (equipment.responsavel_id é outra coisa: o responsável da
     gestão/engenharia, não o colaborador que está usando). */
  const colaboradorAtualPorEquipamento = useMemo(() => {
    const mapa = new Map()
    for (const e of entregas) {
      if (!mapa.has(e.equipment_id)) mapa.set(e.equipment_id, e.worker_id)
    }
    return mapa
  }, [entregas])

  const abrirEntrega = (equipamento) => {
    setBuscaColaboradorEntrega('')
    setEntregando({ equipment_id: equipamento.id, worker_id: '', data: hoje, observacao: '' })
  }

  const salvarEntrega = async () => {
    if (!entregando?.equipment_id || !entregando?.worker_id || !entregando?.data) return
    setSalvando(true)
    const ok = await dados.salvarEntregaEquipamento(entregando)
    setSalvando(false)
    if (ok) setEntregando(null)
  }

  /* Recorte por período — só afeta a aba Por Colaborador. */
  const entregasNoPeriodo = useMemo(() => {
    if (modoPeriodo === 'dia') return entregas.filter((e) => e.data === dataDia)
    if (modoPeriodo === 'mes') return entregas.filter((e) => e.data.slice(0, 7) === mesEscolhido)
    if (modoPeriodo === 'periodo') {
      const ini = periodoInicio <= periodoFim ? periodoInicio : periodoFim
      const fim = periodoInicio <= periodoFim ? periodoFim : periodoInicio
      return entregas.filter((e) => e.data >= ini && e.data <= fim)
    }
    return entregas
  }, [entregas, modoPeriodo, dataDia, mesEscolhido, periodoInicio, periodoFim])

  const colaboradoresComEquipamento = useMemo(() => {
    const porColaborador = new Map()
    for (const e of entregasNoPeriodo) {
      if (!porColaborador.has(e.worker_id)) porColaborador.set(e.worker_id, [])
      porColaborador.get(e.worker_id).push(e)
    }
    const termo = buscaColaboradorLista.trim().toLowerCase()
    return dados.colaboradores
      .filter((c) => porColaborador.has(c.id))
      .filter((c) => !termo || c.nome.toLowerCase().includes(termo))
      .map((c) => ({ colaborador: c, entregas: porColaborador.get(c.id) }))
      .sort((a, b) => a.colaborador.nome.localeCompare(b.colaborador.nome, 'pt-BR'))
  }, [entregasNoPeriodo, dados.colaboradores, buscaColaboradorLista])

  const gruposColaboradoresEquip = useMemo(() => {
    if (agrupamentoColab === 'nome') return null
    const grupos = new Map()
    colaboradoresComEquipamento.forEach((item) => {
      let chave, rotuloSemDado, rotulo
      if (agrupamentoColab === 'funcao') {
        const funcao = (item.colaborador.funcao || '').trim()
        chave = funcao ? normalizarParaCasar(funcao) : ''
        rotuloSemDado = 'Sem função'
        rotulo = funcao || rotuloSemDado
      } else {
        chave = item.colaborador.company_id || ''
        rotuloSemDado = 'Sem empresa'
        rotulo = item.colaborador.company_id ? dados.nomeDe(dados.empresas, item.colaborador.company_id) : rotuloSemDado
      }
      if (!grupos.has(chave)) grupos.set(chave, { rotulo, rotuloSemDado, itens: [] })
      grupos.get(chave).itens.push(item)
    })
    return Array.from(grupos.values()).sort((a, b) => {
      if (a.rotulo === a.rotuloSemDado) return 1
      if (b.rotulo === b.rotuloSemDado) return -1
      return a.rotulo.localeCompare(b.rotulo, 'pt-BR')
    })
  }, [agrupamentoColab, colaboradoresComEquipamento, dados])

  useEffect(() => {
    if (!imprimindoFichaEquip) return
    const id = requestAnimationFrame(() => window.print())
    return () => cancelAnimationFrame(id)
  }, [imprimindoFichaEquip])

  const salvar = async () => {
    if (!editando?.nome?.trim()) return
    setSalvando(true)
    const ok = await dados.salvarCadastro('equipamentos', {
      ...editando,
      nome: editando.nome.trim(),
      tipo: (editando.tipo || '').trim() || null,
      observacao: (editando.observacao || '').trim() || null,
      responsavel_id: editando.responsavel_id || null,
    })
    setSalvando(false)
    if (ok) setEditando(null)
  }

  /* A foto precisa de um equipamento que já exista no banco, pra se
     pendurar nele. Se ainda está cadastrando um novo e já quer
     fotografar, salva primeiro — mesma saída que Pendências e o
     Diário usam, pelo mesmo motivo. */
  const garantirSalvo = async () => {
    if (editando.id) return editando
    if (!editando.nome?.trim()) return null
    const salvo = await dados.salvarCadastro('equipamentos', {
      ...editando,
      nome: editando.nome.trim(),
      tipo: (editando.tipo || '').trim() || null,
      observacao: (editando.observacao || '').trim() || null,
      responsavel_id: editando.responsavel_id || null,
    })
    if (salvo) setEditando(salvo)
    return salvo
  }

  const enviarFotosEquipamento = async (arquivos) => {
    setEnviandoFoto((n) => n + arquivos.length)
    try {
      const base = await garantirSalvo()
      if (!base) return
      const novas = []
      for (const arquivo of arquivos) {
        const f = await dados.adicionarFotoEquipamento(base.id, arquivo)
        if (f) novas.push(f)
      }
      if (novas.length) setEditando((p) => ({ ...p, fotos: [...(p.fotos || []), ...novas] }))
    } finally {
      setEnviandoFoto((n) => Math.max(0, n - arquivos.length))
    }
  }

  const removerFotoEquipamento = async (foto) => {
    const ok = await dados.removerFotoEquipamento(foto)
    if (ok) setEditando((p) => ({ ...p, fotos: (p.fotos || []).filter((f) => f.id !== foto.id) }))
  }

  const pedirArquivar = (item) => {
    const arquivando = item.ativo !== false
    setConfirmar({
      titulo: arquivando ? 'Arquivar equipamento?' : 'Reativar equipamento?',
      texto: arquivando
        ? `«${item.nome}» deixa de aparecer na lista. Nada é apagado.`
        : `«${item.nome}» volta a aparecer na lista.`,
      rotuloOk: arquivando ? 'Arquivar' : 'Reativar',
      perigo: arquivando,
      onOk: async () => { setConfirmar(null); await dados.arquivarCadastro('equipamentos', item.id) },
    })
  }

  return (
    <>
      <div className="page">
        <PageHeader
          titulo="Equipamentos"
          sub="Máquinas e ferramentas da obra, e onde cada uma está"
          acao={podeEditar && (
            <button className="btn btn-primary" onClick={() => abrirNovo()}>
              <Icon name="mais_sinal" size={18} /> Novo
            </button>
          )}
        />

        <div className="stack-2">
          {!podeEditar && (
            <div className="alert info">
              Você consulta os equipamentos aqui. Cadastrar, editar e mudar o status é com a gestão.
            </div>
          )}

          <Segmentos
            valor={filtro} onChange={setFiltro}
            opcoes={[
              { valor: 'todos', rotulo: 'Todos', contador: ativos.length },
              ...STATUS_EQUIPAMENTO.map((s) => ({
                valor: s, rotulo: ROTULO_STATUS_EQUIPAMENTO[s],
                contador: ativos.filter((e) => e.status === s).length,
              })),
              { valor: 'suprimentos', rotulo: 'Suprimentos', contador: pendentesSuprimentos.length },
              { valor: 'porColaborador', rotulo: 'Por Colaborador', contador: colaboradoresComEquipamento.length },
            ]}
          />

          {arquivados.length > 0 && filtro !== 'suprimentos' && filtro !== 'porColaborador' && (
            <button
              className={`btn btn-sm ${filtro === 'arquivados' ? 'btn-dark' : 'btn-ghost'}`}
              style={{ alignSelf: 'flex-start' }}
              onClick={() => setFiltro((f) => (f === 'arquivados' ? 'todos' : 'arquivados'))}
            >
              {filtro === 'arquivados' ? 'Ver ativos' : `Ver arquivados (${arquivados.length})`}
            </button>
          )}

          {filtro === 'porColaborador' && (
            <div className="stack-2">
              <div style={{ position: 'relative' }}>
                <Icon
                  name="busca" size={16}
                  style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}
                />
                <input
                  className="ipt" style={{ paddingLeft: 34, width: '100%' }}
                  value={buscaColaboradorLista} onChange={(e) => setBuscaColaboradorLista(e.target.value)}
                  placeholder="Buscar colaborador…"
                />
              </div>

              <Segmentos
                valor={agrupamentoColab}
                onChange={setAgrupamentoColab}
                opcoes={[
                  { valor: 'nome', rotulo: 'Por nome' },
                  { valor: 'funcao', rotulo: 'Por função' },
                  { valor: 'empresa', rotulo: 'Por empresa' },
                ]}
              />

              <Segmentos
                valor={modoPeriodo}
                onChange={setModoPeriodo}
                opcoes={[
                  { valor: 'tudo', rotulo: 'Tudo' },
                  { valor: 'dia', rotulo: 'Dia' },
                  { valor: 'mes', rotulo: 'Mês' },
                  { valor: 'periodo', rotulo: 'Período' },
                ]}
              />
              {modoPeriodo === 'dia' && (
                <input className="ipt" type="date" value={dataDia} onChange={(e) => setDataDia(e.target.value)} />
              )}
              {modoPeriodo === 'mes' && (
                <input className="ipt" type="month" value={mesEscolhido} onChange={(e) => setMesEscolhido(e.target.value)} />
              )}
              {modoPeriodo === 'periodo' && (
                <div className="row-flex">
                  <Campo label="De">
                    <input className="ipt" type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} />
                  </Campo>
                  <Campo label="Até">
                    <input className="ipt" type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} />
                  </Campo>
                </div>
              )}

              {colaboradoresComEquipamento.length === 0 ? (
                <div className="card-flat">
                  <Vazio
                    titulo={modoPeriodo === 'tudo' ? 'Nenhum equipamento entregue a colaborador ainda' : 'Nada nesse período'}
                    texto={
                      modoPeriodo === 'tudo'
                        ? 'Clique em "Entregar" num equipamento e escolha o colaborador — a entrega entra na ficha dele aqui.'
                        : 'Nenhuma entrega nesse recorte de data — troque o período.'
                    }
                  />
                </div>
              ) : gruposColaboradoresEquip ? (
                <div className="stack-3">
                  {gruposColaboradoresEquip.map(({ rotulo, itens }) => (
                    <div key={rotulo} className="stack-1">
                      <div className="t-caption" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                        {rotulo} <span style={{ opacity: 0.6, fontWeight: 400, textTransform: 'none' }}>{itens.length}</span>
                      </div>
                      {itens.map(({ colaborador, entregas: entregasDoColab }) => (
                        <ItemLista
                          key={colaborador.id}
                          titulo={colaborador.nome}
                          sub={`${plural(entregasDoColab.length, 'entrega', 'entregas')} · última em ${formatarDataCurta([...entregasDoColab].sort((a, b) => (a.data < b.data ? 1 : -1))[0].data)}`}
                          onClick={() => setColaboradorEquipAberto(colaborador)}
                          direita={<Icon name="avancar" size={16} />}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="stack-1">
                  {colaboradoresComEquipamento.map(({ colaborador, entregas: entregasDoColab }) => (
                    <ItemLista
                      key={colaborador.id}
                      titulo={colaborador.nome}
                      sub={`${plural(entregasDoColab.length, 'entrega', 'entregas')} · última em ${formatarDataCurta([...entregasDoColab].sort((a, b) => (a.data < b.data ? 1 : -1))[0].data)}`}
                      onClick={() => setColaboradorEquipAberto(colaborador)}
                      direita={<Icon name="avancar" size={16} />}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {filtro === 'suprimentos' && (
            pendentesSuprimentos.length === 0 ? (
              <div className="card-flat">
                <Vazio
                  titulo="Nada pendente"
                  texto="Todo pedido de Suprimentos marcado como Destino Equipamentos já tem um equipamento cadastrado com nome parecido — ou ainda não tem nenhum pedido assim."
                />
              </div>
            ) : (
              <div className="stack-2">
                <input
                  className="ipt" value={buscaSuprimentos} onChange={(e) => setBuscaSuprimentos(e.target.value)}
                  placeholder="Buscar insumo…"
                />
                {pendentesSuprimentosFiltrado.length === 0 ? (
                  <div className="card-flat"><Vazio titulo="Nada com esse nome" texto="Troque a busca." /></div>
                ) : (
                  <div className="stack-1">
                    {pendentesSuprimentosFiltrado.map((p) => (
                      <ItemLista
                        key={p.insumo}
                        titulo={p.insumo}
                        sub={[
                          `${plural(p.pedidos, 'pedido confirmado', 'pedidos confirmados')}`,
                          p.ultimaEntrega ? `última em ${formatarDataCurta(p.ultimaEntrega)}` : null,
                          `qtde total ${p.quantidade}`,
                        ].filter(Boolean).join(' · ')}
                        direita={podeEditar && (
                          <button className="btn btn-secondary btn-sm" onClick={() => abrirNovo(p.insumo)}>
                            Cadastrar equipamento
                          </button>
                        )}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          )}

          {filtro === 'suprimentos' || filtro === 'porColaborador' ? null : lista.length === 0 ? (
            <div className="card-flat">
              <Vazio
                titulo="Nada por aqui"
                texto={
                  filtro === 'arquivados'
                    ? 'Nada foi arquivado.'
                    : 'Nenhum equipamento neste filtro.'
                }
                acao={podeEditar && filtro !== 'arquivados' && (
                  <button className="btn btn-primary" onClick={() => abrirNovo()}>Cadastrar equipamento</button>
                )}
              />
            </div>
          ) : (
            <div className="stack-1">
              {lista.map((item) => (
                <ItemLista
                  key={item.id}
                  titulo={item.nome}
                  sub={[
                    item.tipo,
                    item.status === 'em_uso' && colaboradorAtualPorEquipamento.has(item.id)
                      ? `com ${dados.colaboradorPorId(colaboradorAtualPorEquipamento.get(item.id))?.nome || 'colaborador removido'}`
                      : null,
                  ].filter(Boolean).join(' · ')}
                  direita={
                    <div className="row-flex" style={{ gap: 4 }}>
                      <Chip tom={TOM_STATUS_EQUIPAMENTO[item.status]}>{ROTULO_STATUS_EQUIPAMENTO[item.status]}</Chip>
                      {item.ativo === false && <Chip>Arquivado</Chip>}
                      {podeEditar && item.ativo !== false && (
                        <button className="btn btn-secondary btn-sm" onClick={() => abrirEntrega(item)}>
                          Entregar
                        </button>
                      )}
                      {podeEditar && (
                        <>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setEditando({ ...item })}
                            aria-label="Editar"
                          >
                            <Icon name="editar" size={16} />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => pedirArquivar(item)}
                            aria-label={item.ativo === false ? 'Reativar' : 'Arquivar'}
                          >
                            <Icon name={item.ativo === false ? 'check' : 'x'} size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Sheet
        aberto={Boolean(editando)}
        titulo={editando?.id ? 'Editar equipamento' : 'Novo equipamento'}
        onFechar={() => setEditando(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setEditando(null)}>Cancelar</button>
            <button
              className="btn btn-primary grow" onClick={salvar}
              disabled={salvando || !editando?.nome?.trim()}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        <div className="stack-2">
          <Campo label="Nome">
            <input
              className="ipt" autoFocus value={editando?.nome || ''}
              onChange={(e) => setEditando((p) => ({ ...p, nome: e.target.value }))}
              placeholder="Betoneira 400L, andaime tubular…"
            />
          </Campo>
          <Campo label="Tipo" dica="Opcional — categoria livre, ajuda a agrupar depois.">
            <input
              className="ipt" value={editando?.tipo || ''}
              onChange={(e) => setEditando((p) => ({ ...p, tipo: e.target.value }))}
              placeholder="Máquina, ferramenta, andaime…"
            />
          </Campo>
          <Campo label="Status">
            <select
              className="sel" value={editando?.status || 'disponivel'}
              onChange={(e) => setEditando((p) => ({ ...p, status: e.target.value }))}
            >
              {STATUS_EQUIPAMENTO.map((s) => <option key={s} value={s}>{ROTULO_STATUS_EQUIPAMENTO[s]}</option>)}
            </select>
          </Campo>
          <Campo label="Responsável" dica="Quem está com o equipamento agora, se estiver em uso.">
            <select
              className="sel" value={editando?.responsavel_id || ''}
              onChange={(e) => setEditando((p) => ({ ...p, responsavel_id: e.target.value }))}
            >
              <option value="">Sem responsável</option>
              {dados.perfis.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Campo>
          <Campo label="Observação">
            <TextareaComAudio
              value={editando?.observacao || ''}
              onChange={(e) => setEditando((p) => ({ ...p, observacao: e.target.value }))}
              placeholder="Estado, particularidade, o que for útil saber."
            />
          </Campo>
          <Campo label="Fotos">
            <CampoFotos
              fotos={editando?.fotos || []}
              links={links}
              enviando={enviandoFoto}
              onAdicionar={enviarFotosEquipamento}
              onRemover={removerFotoEquipamento}
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
          const lista2 = editando?.fotos || []
          const i = lista2.findIndex((f) => f.id === fotoAberta.id)
          const prox = lista2[(i + delta + lista2.length) % lista2.length]
          if (prox) setFotoAberta(prox)
        }}
      />

      {/* ── Entregar a colaborador ── */}
      <Sheet
        aberto={Boolean(entregando)}
        titulo="Entregar equipamento"
        onFechar={() => setEntregando(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setEntregando(null)}>Cancelar</button>
            <button
              className="btn btn-primary grow" onClick={salvarEntrega}
              disabled={salvando || !entregando?.worker_id || !entregando?.data}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        {entregando && (
          <div className="stack-2">
            <div className="t-strong">{nomeEquipamento(entregando.equipment_id)}</div>
            <Campo label="Data">
              <input
                className="ipt" type="date" value={entregando.data}
                onChange={(e) => setEntregando((p) => ({ ...p, data: e.target.value }))}
              />
            </Campo>
            <Campo label="Colaborador">
              <input
                className="ipt" value={buscaColaboradorEntrega} onChange={(e) => setBuscaColaboradorEntrega(e.target.value)}
                placeholder="Buscar colaborador…" style={{ marginBottom: 8 }}
              />
              <div className="stack-1" style={{ maxHeight: 280, overflowY: 'auto' }}>
                {dados.colaboradores
                  .filter((c) => c.ativo !== false)
                  .filter((c) => !buscaColaboradorEntrega.trim() || c.nome.toLowerCase().includes(buscaColaboradorEntrega.trim().toLowerCase()))
                  .map((c) => (
                    <label
                      key={c.id} className="card-flat row-flex"
                      style={{ alignItems: 'center', gap: 10, cursor: 'pointer' }}
                    >
                      <input
                        type="radio" name="colaborador-entrega" checked={entregando.worker_id === c.id}
                        onChange={() => setEntregando((p) => ({ ...p, worker_id: c.id }))}
                      />
                      <span>{c.nome}</span>
                    </label>
                  ))}
              </div>
            </Campo>
            <Campo label="Observação" dica="Opcional">
              <TextareaComAudio
                value={entregando.observacao}
                onChange={(e) => setEntregando((p) => ({ ...p, observacao: e.target.value }))}
                placeholder="Estado do equipamento na entrega, particularidade…"
              />
            </Campo>
          </div>
        )}
      </Sheet>

      {/* ── Ficha de equipamentos por colaborador ── */}
      <Sheet
        aberto={Boolean(colaboradorEquipAberto)}
        titulo={colaboradorEquipAberto?.nome}
        onFechar={() => setColaboradorEquipAberto(null)}
        rodape={
          <button className="btn btn-primary btn-block" onClick={() => setImprimindoFichaEquip(true)}>
            <Icon name="relatorio" size={16} /> Imprimir ficha
          </button>
        }
      >
        {colaboradorEquipAberto && (
          <div className="stack-1">
            {(colaboradoresComEquipamento.find((c) => c.colaborador.id === colaboradorEquipAberto.id)?.entregas || [])
              .map((e) => (
                <div key={e.id} className="card-flat row-between" style={{ padding: 10, alignItems: 'center' }}>
                  <div>
                    <div className="t-strong" style={{ fontSize: 14 }}>{nomeEquipamento(e.equipment_id)}</div>
                    <div className="t-caption" style={{ marginTop: 2 }}>
                      {formatarDataCurta(e.data)}{e.observacao ? ` · ${e.observacao}` : ''}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </Sheet>

      {imprimindoFichaEquip && colaboradorEquipAberto && (
        <RelatorioFolha
          titulo="Ficha de entrega de equipamentos"
          sub={colaboradorEquipAberto.nome}
          obra={dados.obra.nome} org={dados.org.nome}
        >
          <SecaoRelatorio titulo="Equipamentos recebidos">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #18181B', padding: '4px 6px' }}>Data</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #18181B', padding: '4px 6px' }}>Equipamento</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #18181B', padding: '4px 6px' }}>Observação</th>
                </tr>
              </thead>
              <tbody>
                {(colaboradoresComEquipamento.find((c) => c.colaborador.id === colaboradorEquipAberto.id)?.entregas || [])
                  .map((e) => (
                    <tr key={e.id}>
                      <td style={{ padding: '4px 6px', borderBottom: '1px solid #E4E4E7' }}>{formatarData(e.data)}</td>
                      <td style={{ padding: '4px 6px', borderBottom: '1px solid #E4E4E7' }}>{nomeEquipamento(e.equipment_id)}</td>
                      <td style={{ padding: '4px 6px', borderBottom: '1px solid #E4E4E7' }}>{e.observacao || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </SecaoRelatorio>
          <div style={{ marginTop: 36, fontSize: 12, lineHeight: 1.6 }}>
            Declaro ter recebido os equipamentos acima, em perfeito estado, e me comprometo a devolvê-los
            e conservá-los adequadamente.
            <div style={{ display: 'flex', gap: 40, marginTop: 34 }}>
              <div style={{ flex: 1, borderTop: '1px solid #18181B', paddingTop: 4 }}>Assinatura do colaborador</div>
              <div style={{ width: 140, borderTop: '1px solid #18181B', paddingTop: 4 }}>Data</div>
            </div>
          </div>
        </RelatorioFolha>
      )}

      <Confirmar
        aberto={Boolean(confirmar)}
        titulo={confirmar?.titulo}
        texto={confirmar?.texto}
        rotuloOk={confirmar?.rotuloOk}
        perigo={confirmar?.perigo}
        onOk={confirmar?.onOk}
        onCancelar={() => setConfirmar(null)}
      />
    </>
  )
}
