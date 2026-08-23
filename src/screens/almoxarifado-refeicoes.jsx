/* ============================================================
   ALMOXARIFADO — REFEIÇÕES

   Modelado em cima das duas planilhas do Julio (terceirizado e
   próprio) — são a mesma coisa, data × empresa × quantidade, só que
   a de terceirizado tem uma coluna por empresa e a de próprio só
   uma. Essa distinção já existe no cadastro de empresas
   (`tipo`: 'propria'/'empreiteira'), então não virou campo novo —
   o resumo do mês só agrupa por ela.

   A quantidade continua sendo digitada à mão (é a fonte oficial —
   o restaurante cobra por ela), mas agora cada lançamento pode
   vincular quais colaboradores daquela empresa comeram, puxando de
   quem o Diário marcou como presente naquele dia (e em qual
   atividade/frente cada um estava). Quando a quantidade digitada
   não bate com quantos colaboradores estão vinculados, um aviso
   aparece — não trava o salvamento, só avisa pra conferir. */

import { useState, useMemo } from 'react'
import { useDados } from '../lib/DadosContext'
import {
  hojeISO, formatarData, formatarDataCurta, somarMeses, rotuloMes, plural, resumoRefeicoesDoMes, diarioDaData,
} from '../lib/dominio'
import {
  Icon, PageHeader, Sheet, Campo, Confirmar, Vazio, ItemLista, Selecionavel, SecaoRecolhivel,
  RelatorioFolha, SecaoRelatorio, TabelaRelatorio,
} from '../components'

/* Colaboradores da empresa escolhida que o Diário daquele dia marcou
   como presentes, com a(s) atividade/frente de cada um nesse dia —
   é a lista-fonte pra vincular quem comeu. Sem diário lançado nesse
   dia, devolve null (diferente de lista vazia: "não dá pra conferir"
   é uma situação diferente de "conferi e ninguém estava presente"). */
function presentesDaEmpresaNoDiario(dados, data, companyId) {
  if (!data || !companyId) return null
  const diario = diarioDaData(dados.diarios, data, dados.obra.id)
  if (!diario) return null
  return diario.presencas
    .filter((p) => p.presente && p.company_id === companyId)
    .map((p) => {
      const colaborador = dados.colaboradorPorId(p.worker_id)
      const atividades = diario.atividades
        .filter((a) => a.worker_ids.includes(p.worker_id))
        .map((a) => dados.rotuloAtividade(a.planned_id))
      return {
        workerId: p.worker_id,
        nome: colaborador?.nome || 'Colaborador removido',
        funcao: colaborador?.funcao || '',
        atividades,
      }
    })
    .sort((a, b) => a.nome.localeCompare(b.nome))
}

/* Relatório por período: agrupa os lançamentos por dia (pode ter
   mais de uma empresa no mesmo dia — soma a quantidade das duas) e
   lista quem foi vinculado em cada um, com o serviço/frente que a
   pessoa estava no diário daquele dia. Um dia sem ninguém vinculado
   ainda aparece no relatório (com a quantidade lançada), só sem a
   lista de nomes embaixo — não esconde lançamento nenhum do período. */
function agruparRefeicoesPorDia(dados, registros) {
  const porDia = new Map()
  for (const r of registros) {
    if (!porDia.has(r.data)) porDia.set(r.data, { data: r.data, quantidade: 0, pessoas: [] })
    const grupo = porDia.get(r.data)
    grupo.quantidade += Number(r.quantidade) || 0
    const diario = diarioDaData(dados.diarios, r.data, dados.obra.id)
    const empresa = dados.empresas?.find((e) => e.id === r.company_id)?.nome || 'Empresa removida'
    for (const workerId of r.worker_ids || []) {
      const colaborador = dados.colaboradorPorId(workerId)
      const atividades = diario
        ? diario.atividades.filter((a) => a.worker_ids.includes(workerId)).map((a) => dados.rotuloAtividade(a.planned_id))
        : []
      grupo.pessoas.push({
        nome: colaborador?.nome || 'Colaborador removido',
        empresa,
        servico: atividades.length ? atividades.map((a) => `${a.servico} · ${a.local}`).join(', ') : '—',
      })
    }
  }
  return [...porDia.values()]
    .map((g) => ({ ...g, pessoas: g.pessoas.sort((a, b) => a.nome.localeCompare(b.nome)) }))
    .sort((a, b) => (a.data < b.data ? -1 : 1))
}

export default function AlmoxarifadoRefeicoes({ perfil }) {
  const dados = useDados()
  const hoje = hojeISO()
  const podeExcluir = perfil?.role !== 'campo'

  const [mes, setMes] = useState(() => hoje.slice(0, 7))
  const [editando, setEditando] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [relatorioInicio, setRelatorioInicio] = useState(() => `${hoje.slice(0, 7)}-01`)
  const [relatorioFim, setRelatorioFim] = useState(hoje)

  const empresasAtivas = useMemo(
    () => (dados.empresas || []).filter((e) => e.ativo !== false),
    [dados.empresas],
  )
  const resumo = useMemo(
    () => resumoRefeicoesDoMes(dados.refeicoes, dados.empresas, mes),
    [dados.refeicoes, dados.empresas, mes],
  )
  const registrosOrdenados = useMemo(
    () => [...resumo.registros].sort((a, b) => (a.data < b.data ? 1 : -1)),
    [resumo.registros],
  )

  const registrosDoRelatorio = useMemo(() => {
    const ini = relatorioInicio <= relatorioFim ? relatorioInicio : relatorioFim
    const fim = relatorioInicio <= relatorioFim ? relatorioFim : relatorioInicio
    return (dados.refeicoes || []).filter((r) => r.data >= ini && r.data <= fim)
  }, [dados.refeicoes, relatorioInicio, relatorioFim])
  const diasDoRelatorio = useMemo(
    () => agruparRefeicoesPorDia(dados, registrosDoRelatorio),
    [dados, registrosDoRelatorio],
  )

  const nomeEmpresa = (id) => dados.empresas?.find((e) => e.id === id)?.nome || 'Empresa removida'

  /* Ao trocar empresa ou data de um lançamento NOVO, se já dá pra
     achar presença no Diário e ainda não tem ninguém vinculado à
     mão, vincula todo mundo que estava presente — ponto de partida
     razoável, que a pessoa ajusta depois marcando/desmarcando. Num
     lançamento já existente (edição), nunca mexe sozinho: o que já
     foi vinculado antes fica do jeito que está. */
  const atualizarCampoNovo = (campo, valor) => {
    setEditando((p) => {
      const novo = { ...p, [campo]: valor }
      if (!p.id && (!p.worker_ids || p.worker_ids.length === 0)) {
        const presentes = presentesDaEmpresaNoDiario(dados, novo.data, novo.company_id)
        if (presentes && presentes.length > 0) {
          novo.worker_ids = presentes.map((c) => c.workerId)
          if (!novo.quantidade) novo.quantidade = String(presentes.length)
        }
      }
      return novo
    })
  }

  const abrirNovo = () => setEditando({ data: hoje, company_id: '', quantidade: '', fornecedor: '', worker_ids: [] })

  const salvar = async () => {
    if (!editando?.company_id || !editando?.data || !Number(editando?.quantidade)) return
    setSalvando(true)
    const ok = await dados.salvarRefeicao(editando)
    setSalvando(false)
    if (ok) setEditando(null)
  }

  const pedirExcluir = (item) => setConfirmar({
    titulo: 'Excluir lançamento?',
    texto: `«${nomeEmpresa(item.company_id)}» (${item.quantidade} refeições em ${formatarDataCurta(item.data)}) sai do histórico. Isso não tem volta.`,
    rotuloOk: 'Excluir', perigo: true,
    onOk: async () => { setConfirmar(null); await dados.excluirRefeicao(item.id) },
  })

  const presentes = editando
    ? presentesDaEmpresaNoDiario(dados, editando.data, editando.company_id)
    : null
  const vinculados = editando?.worker_ids || []
  const quantidadeNum = Number(editando?.quantidade) || 0
  const divergencia = presentes != null && quantidadeNum !== vinculados.length

  const alternarColaborador = (workerId) => {
    setEditando((p) => {
      const atual = p.worker_ids || []
      const novo = atual.includes(workerId) ? atual.filter((id) => id !== workerId) : [...atual, workerId]
      return { ...p, worker_ids: novo }
    })
  }

  return (
    <div className="page stack-2">
      <PageHeader
        titulo="Refeições"
        sub={`${plural(resumo.registros.length, 'lançamento', 'lançamentos')} em ${rotuloMes(mes).toLowerCase()}`}
        acao={
          <button className="btn btn-primary" onClick={abrirNovo}>
            <Icon name="mais_sinal" size={18} /> Nova refeição
          </button>
        }
      />

      <div className="row-between" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setMes(hoje.slice(0, 7))}>
          Este mês
        </button>
        <div className="row-flex" style={{ gap: 4 }}>
          <button className="btn btn-ghost btn-sm" aria-label="Mês anterior" onClick={() => setMes(somarMeses(mes, -1))}>
            <Icon name="voltar" size={16} />
          </button>
          <div className="t-strong" style={{ fontSize: 14, minWidth: 140, textAlign: 'center' }}>
            {rotuloMes(mes)}
          </div>
          <button className="btn btn-ghost btn-sm" aria-label="Próximo mês" onClick={() => setMes(somarMeses(mes, 1))}>
            <Icon name="avancar" size={16} />
          </button>
        </div>
      </div>

      <SecaoRecolhivel
        titulo="Relatório por período"
        resumo={`${formatarDataCurta(relatorioInicio)}–${formatarDataCurta(relatorioFim)}`}
      >
        <div className="row-flex">
          <Campo label="De">
            <input className="ipt" type="date" value={relatorioInicio} onChange={(e) => setRelatorioInicio(e.target.value)} />
          </Campo>
          <Campo label="Até">
            <input className="ipt" type="date" value={relatorioFim} onChange={(e) => setRelatorioFim(e.target.value)} />
          </Campo>
        </div>
        <button className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={() => window.print()}>
          <Icon name="relatorio" size={17} /> Gerar relatório ({plural(diasDoRelatorio.length, 'dia', 'dias')})
        </button>
      </SecaoRecolhivel>

      {resumo.totalGeral > 0 && (
        <div className="card stack-2">
          <div className="row-between">
            <div className="t-micro">Total do mês</div>
            <span className="t-num t-strong" style={{ fontSize: 20 }}>{resumo.totalGeral}</span>
          </div>

          {resumo.proprias.length > 0 && (
            <div>
              <div className="t-micro" style={{ marginBottom: 6 }}>Equipe própria</div>
              <div className="stack-1">
                {resumo.proprias.map((l) => (
                  <div key={l.companyId} className="row-between" style={{ fontSize: 13 }}>
                    <span>{l.nome}</span>
                    <span className="t-strong">{l.total}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {resumo.terceirizadas.length > 0 && (
            <div>
              <div className="t-micro" style={{ marginBottom: 6 }}>Terceirizados</div>
              <div className="stack-1">
                {resumo.terceirizadas.map((l) => (
                  <div key={l.companyId} className="row-between" style={{ fontSize: 13 }}>
                    <span>{l.nome}</span>
                    <span className="t-strong">{l.total}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {registrosOrdenados.length === 0 ? (
        <div className="card-flat">
          <Vazio
            titulo="Nenhuma refeição lançada"
            texto={`Nenhum lançamento em ${rotuloMes(mes).toLowerCase()}. Toda vez que o restaurante servir, lança aqui.`}
            acao={<button className="btn btn-primary" onClick={abrirNovo}>Nova refeição</button>}
          />
        </div>
      ) : (
        <div className="stack-1">
          {registrosOrdenados.map((r) => {
            const vinculadosDoRegistro = r.worker_ids?.length || 0
            const naoBate = vinculadosDoRegistro > 0 && vinculadosDoRegistro !== r.quantidade
            return (
              <ItemLista
                key={r.id}
                titulo={nomeEmpresa(r.company_id)}
                sub={[
                  formatarDataCurta(r.data), r.fornecedor,
                  vinculadosDoRegistro > 0 ? `${vinculadosDoRegistro} vinculado(s)` : null,
                ].filter(Boolean).join(' · ')}
                direita={
                  <div className="row-flex" style={{ gap: 4, alignItems: 'center' }}>
                    {naoBate && (
                      <span title="Quantidade não bate com os colaboradores vinculados">
                        <Icon name="alerta" size={15} style={{ color: 'var(--danger)' }} />
                      </span>
                    )}
                    <span className="t-strong" style={{ fontSize: 15 }}>{r.quantidade}</span>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setEditando({ ...r, worker_ids: r.worker_ids || [] })}
                      aria-label="Editar"
                    >
                      <Icon name="editar" size={15} />
                    </button>
                    {podeExcluir && (
                      <button className="btn btn-ghost btn-sm" onClick={() => pedirExcluir(r)} aria-label="Excluir">
                        <Icon name="x" size={15} />
                      </button>
                    )}
                  </div>
                }
              />
            )
          })}
        </div>
      )}

      <Sheet
        aberto={Boolean(editando)}
        titulo={editando?.id ? 'Editar lançamento' : 'Nova refeição'}
        onFechar={() => setEditando(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setEditando(null)}>Cancelar</button>
            <button
              className="btn btn-primary grow" onClick={salvar}
              disabled={salvando || !editando?.company_id || !editando?.data || !Number(editando?.quantidade)}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        {editando && (
          <div className="stack-2">
            <Campo label="Empresa">
              <select
                className="sel" value={editando.company_id}
                onChange={(e) => atualizarCampoNovo('company_id', e.target.value)}
              >
                <option value="">Escolha a empresa</option>
                {empresasAtivas.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nome} · {emp.tipo === 'propria' ? 'equipe própria' : 'empreiteira'}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="row-flex">
              <Campo label="Quantidade">
                <input
                  className="ipt" type="number" inputMode="numeric" min="0" step="1"
                  value={editando.quantidade}
                  onChange={(e) => setEditando((p) => ({ ...p, quantidade: e.target.value }))}
                />
              </Campo>
              <Campo label="Data">
                <input
                  className="ipt" type="date" value={editando.data}
                  onChange={(e) => atualizarCampoNovo('data', e.target.value)}
                />
              </Campo>
            </div>
            <Campo label="Fornecedor" dica="Opcional — o restaurante que serviu.">
              <input
                className="ipt" value={editando.fornecedor || ''}
                onChange={(e) => setEditando((p) => ({ ...p, fornecedor: e.target.value }))}
              />
            </Campo>

            {divergencia && (
              <div className="alert danger">
                A quantidade lançada ({quantidadeNum}) não bate com os {vinculados.length} colaborador(es)
                vinculado(s) abaixo. Revise a quantidade ou marque/desmarque quem comeu.
              </div>
            )}

            {editando.company_id && editando.data && (
              <div>
                <div className="t-micro" style={{ marginBottom: 8 }}>
                  Vincular colaboradores {presentes != null && `(${vinculados.length} de ${presentes.length})`}
                </div>
                {presentes == null ? (
                  <div className="card-flat">
                    <Vazio
                      titulo="Sem diário nesse dia"
                      texto="Não achei um diário lançado nessa data pra essa obra — não dá pra conferir automaticamente quem estava presente. A quantidade continua valendo do jeito que foi digitada."
                    />
                  </div>
                ) : presentes.length === 0 ? (
                  <div className="card-flat">
                    <Vazio
                      titulo="Ninguém dessa empresa no diário desse dia"
                      texto="O diário dessa data existe, mas nenhum colaborador dessa empresa foi marcado como presente nele."
                    />
                  </div>
                ) : (
                  <div className="stack-1">
                    {presentes.map((c) => (
                      <Selecionavel
                        key={c.workerId}
                        marcado={vinculados.includes(c.workerId)}
                        onToggle={() => alternarColaborador(c.workerId)}
                        titulo={c.nome}
                        sub={[
                          c.funcao,
                          c.atividades.length > 0
                            ? c.atividades.map((a) => `${a.servico} · ${a.local}`).join(', ')
                            : 'Sem atividade lançada no diário',
                        ].filter(Boolean).join(' — ')}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Sheet>

      <Confirmar
        aberto={Boolean(confirmar)}
        titulo={confirmar?.titulo}
        texto={confirmar?.texto}
        rotuloOk={confirmar?.rotuloOk}
        perigo={confirmar?.perigo}
        onOk={confirmar?.onOk}
        onCancelar={() => setConfirmar(null)}
      />

      <RelatorioFolha
        titulo="Refeições"
        sub={`${formatarData(relatorioInicio)} a ${formatarData(relatorioFim)}`}
        obra={dados.obra.nome} org={dados.org.nome}
      >
        {diasDoRelatorio.length === 0 ? (
          <SecaoRelatorio>
            <div style={{ fontSize: 12, color: '#71717A' }}>Nenhum lançamento nesse período.</div>
          </SecaoRelatorio>
        ) : (
          diasDoRelatorio.map((dia) => (
            <SecaoRelatorio key={dia.data} titulo={`${formatarData(dia.data)} — ${plural(dia.quantidade, 'refeição', 'refeições')}`}>
              {dia.pessoas.length === 0 ? (
                <div style={{ fontSize: 12, color: '#71717A' }}>Nenhum colaborador vinculado nesse lançamento.</div>
              ) : (
                <TabelaRelatorio
                  colunas={['Nome', 'Empresa', 'Serviço / Frente']}
                  linhas={dia.pessoas.map((p) => [p.nome, p.empresa, p.servico])}
                />
              )}
            </SecaoRelatorio>
          ))
        )}
      </RelatorioFolha>
    </div>
  )
}
