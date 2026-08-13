/* ============================================================
   PLANEJAMENTO SEMANAL

   O que se planeja aqui é o MESMO registro que o mestre vai
   executar no diário — não uma cópia que depois precise ser
   conferida. É por isso que o fechamento da semana não pede
   digitação nenhuma: ele lê o diário.

   Quem edita é a gestão. O campo enxerga a semana (saber o que
   vem pela frente é trabalho dele), mas não mexe — e os botões
   somem em vez de falharem em silêncio, porque gravação barrada
   pela permissão do banco não dá erro, simplesmente não acontece.
   ============================================================ */

import { useState, useMemo } from 'react'
import { useDados } from '../lib/DadosContext'
import {
  hojeISO, somarDias, formatarData, formatarDataCurta, nomeDiaSemana,
  inicioDaSemana, diasDaSemana, rotuloDaSemana, fecharSemana, SITUACAO_EXECUCAO,
  plural,
} from '../lib/dominio'
import {
  Icon, Chip, PageHeader, Sheet, Campo, Confirmar, Vazio, Indicador, useDesktop,
  RelatorioFolha, SecaoRelatorio, TabelaRelatorio,
} from '../components'

const DIAS = [
  { indice: 0, curto: 'Seg' }, { indice: 1, curto: 'Ter' }, { indice: 2, curto: 'Qua' },
  { indice: 3, curto: 'Qui' }, { indice: 4, curto: 'Sex' }, { indice: 5, curto: 'Sáb' },
  { indice: 6, curto: 'Dom' },
]

export default function PlanejamentoSemanal({ goto, perfil }) {
  const dados = useDados()
  const desktop = useDesktop()
  const hoje = hojeISO()

  const [inicio, setInicio] = useState(() => inicioDaSemana(hoje))
  const [empresaId, setEmpresaId] = useState('')
  const [localId, setLocalId] = useState('')
  const [editando, setEditando] = useState(null)
  const [emLote, setEmLote] = useState(null)
  const [importandoPDF, setImportandoPDF] = useState(null)
  const [removendo, setRemovendo] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [verFechamento, setVerFechamento] = useState(false)
  const [copiado, setCopiado] = useState('')

  const podeEditar = perfil.role !== 'campo'
  const fim = somarDias(inicio, 6)
  const dias = diasDaSemana(inicio)

  const filtrado = useMemo(
    () => dados.planejamento.filter(
      (p) => (!empresaId || p.company_id === empresaId) && (!localId || p.location_id === localId),
    ),
    [dados.planejamento, empresaId, localId],
  )

  const semana = useMemo(
    () => fecharSemana(filtrado, dados.diarios, inicio, fim),
    [filtrado, dados.diarios, inicio, fim],
  )

  const porDia = useMemo(() => {
    const mapa = {}
    dias.forEach((d) => { mapa[d] = [] })
    semana.itens.forEach((i) => { (mapa[i.planejada.data] ||= []).push(i) })
    return mapa
  }, [semana, dias]) // eslint-disable-line react-hooks/exhaustive-deps

  const faltaCadastro = dados.servicos.length === 0 || dados.locais.length === 0

  /* ── Ações ─────────────────────────────────────────────── */

  const abrirNova = (data) =>
    setEditando({ data: data || hoje, service_id: '', location_id: '', company_id: '', observacao: '' })

  const salvar = async () => {
    if (!editando?.service_id || !editando?.location_id || !editando?.data) return
    setSalvando(true)
    const ok = await dados.salvarPlanejado({
      ...(editando.id ? { id: editando.id } : {}),
      data: editando.data,
      service_id: editando.service_id,
      location_id: editando.location_id,
      company_id: editando.company_id || null,
      observacao: (editando.observacao || '').trim() || null,
    })
    setSalvando(false)
    if (ok) setEditando(null)
  }

  const duplicar = (planejada) =>
    setEditando({
      data: planejada.data,
      service_id: planejada.service_id,
      location_id: planejada.location_id,
      company_id: planejada.company_id || '',
      observacao: planejada.observacao || '',
    })

  const salvarLote = async () => {
    const { service_id, location_id, company_id, observacao, diasMarcados } = emLote
    if (!service_id || !location_id || !diasMarcados?.length) return
    setSalvando(true)
    const ok = await dados.salvarPlanejadosEmLote(
      diasMarcados.map((i) => ({
        data: somarDias(inicio, i),
        service_id, location_id,
        company_id: company_id || null,
        observacao: (observacao || '').trim() || null,
      })),
    )
    setSalvando(false)
    if (ok) setEmLote(null)
  }

  /* ── Copiar semana ──────────────────────────────────────
     Mesma função de fechamento da tela: se a exportação
     recalculasse por conta própria, a planilha e o app passariam
     a discordar sobre a mesma semana. */
  const linhasDaSemana = () => {
    const cabecalho = ['Data', 'Dia', 'Serviço', 'Local', 'Empresa', 'Situação', 'Observação']
    const linhas = semana.itens.map(({ planejada, situacao }) => [
      formatarData(planejada.data),
      nomeDiaSemana(planejada.data),
      dados.nomeDe(dados.servicos, planejada.service_id),
      dados.nomeDe(dados.locais, planejada.location_id),
      dados.nomeDe(dados.empresas, planejada.company_id, '—'),
      situacao.rotulo,
      planejada.observacao || '',
    ])
    return [cabecalho, ...linhas]
  }

  const copiarSemana = async () => {
    const texto = linhasDaSemana().map((l) => l.join('\t')).join('\n')
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado('Semana copiada. Cole direto na planilha.')
    } catch {
      setCopiado('Não consegui copiar. Use o botão de baixar.')
    }
    setTimeout(() => setCopiado(''), 4000)
  }

  const baixarSemana = () => {
    /* Ponto e vírgula e BOM: é o que faz o Excel em português abrir
       o arquivo com as colunas separadas e os acentos corretos. */
    const csv = linhasDaSemana()
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `planejamento-${dados.obra.sigla || 'obra'}-${inicio}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }

  /* ── Tela ──────────────────────────────────────────────── */

  return (
    <>
      <div className="page">
        <PageHeader
          titulo="Planejamento semanal"
          sub={`${plural(semana.total, 'atividade planejada', 'atividades planejadas')} nesta semana`}
          acao={
            podeEditar && (
              <div className="row-flex">
                <button className="btn btn-secondary" onClick={() => setImportandoPDF({})}>
                  Importar PDF semanal
                </button>
                <button className="btn btn-secondary" onClick={() => setEmLote({ diasMarcados: [] })}>
                  Planejar em lote
                </button>
                <button className="btn btn-primary" onClick={() => abrirNova()}>
                  <Icon name="mais_sinal" size={18} /> Nova
                </button>
              </div>
            )
          }
        />

        <div className="stack-2">
          {/* ── Navegação da semana ── */}
          <div className="row-between" style={{ flexWrap: 'wrap' }}>
            <div className="row-flex">
              <button className="btn btn-secondary btn-sm" onClick={() => setInicio(somarDias(inicio, -7))}>
                <Icon name="voltar" size={16} />
              </button>
              <button
                className={`btn btn-sm ${inicio === inicioDaSemana(hoje) ? 'btn-dark' : 'btn-secondary'}`}
                onClick={() => setInicio(inicioDaSemana(hoje))}
              >
                Esta semana
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setInicio(somarDias(inicio, 7))}>
                <Icon name="avancar" size={16} />
              </button>
            </div>
            <div className="row-flex">
              <button className="btn btn-secondary btn-sm" onClick={copiarSemana} disabled={!semana.total}>
                Copiar
              </button>
              <button className="btn btn-secondary btn-sm" onClick={baixarSemana} disabled={!semana.total}>
                <Icon name="baixar" size={15} /> Baixar
              </button>
              {semana.total > 0 && (
                <button className="btn btn-secondary btn-sm" onClick={() => window.print()}>
                  <Icon name="relatorio" size={15} /> Relatório
                </button>
              )}
              <button
                className={`btn btn-sm ${verFechamento ? 'btn-dark' : 'btn-secondary'}`}
                onClick={() => setVerFechamento((v) => !v)}
              >
                Fechamento
              </button>
            </div>
          </div>

          {copiado && <div className="alert success">{copiado}</div>}

          {!podeEditar && (
            <div className="alert info">
              Você está vendo o planejamento da semana. Quem planeja é a gestão — o que você lançar
              no diário é que vai preencher a coluna de situação aqui.
            </div>
          )}

          {faltaCadastro && podeEditar && (
            <div className="alert danger">
              Ainda não há <strong>serviços</strong> ou <strong>locais</strong> cadastrados nesta obra.
              Sem eles não dá para planejar nada — cadastre primeiro em Cadastros.
            </div>
          )}

          {/* ── Filtros ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
            <select className="sel" style={{ height: 38 }} value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
              <option value="">Todas as empresas</option>
              {dados.empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
            <select className="sel" style={{ height: 38 }} value={localId} onChange={(e) => setLocalId(e.target.value)}>
              <option value="">Todos os locais</option>
              {dados.locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </div>

          {verFechamento && <Fechamento semana={semana} dados={dados} goto={goto} />}

          {/* ── A semana ── */}
          {semana.total === 0 ? (
            <div className="card-flat">
              <Vazio
                titulo="Semana sem planejamento"
                texto={
                  podeEditar
                    ? 'Planeje as atividades desta semana. O que você marcar aqui aparece pronto para o mestre no diário do dia.'
                    : 'A gestão ainda não planejou esta semana.'
                }
                acao={podeEditar && !faltaCadastro && (
                  <button className="btn btn-primary" onClick={() => setEmLote({ diasMarcados: [] })}>
                    Planejar em lote
                  </button>
                )}
              />
            </div>
          ) : (
            <div
              style={desktop
                ? { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8, alignItems: 'start' }
                : { display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              {dias.map((data) => (
                <ColunaDoDia
                  key={data}
                  data={data} hoje={hoje} desktop={desktop}
                  itens={porDia[data] || []}
                  dados={dados}
                  podeEditar={podeEditar}
                  onNova={() => abrirNova(data)}
                  onEditar={(p) => setEditando({ ...p, company_id: p.company_id || '', observacao: p.observacao || '' })}
                  onDuplicar={duplicar}
                  onRemover={setRemovendo}
                  onAbrirDiario={(d) => goto('diario', { data: d, id: dados.diarios.find((x) => x.data === d)?.id })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Uma atividade ── */}
      <Sheet
        aberto={Boolean(editando)}
        titulo={editando?.id ? 'Editar atividade' : 'Nova atividade planejada'}
        onFechar={() => setEditando(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setEditando(null)}>Cancelar</button>
            <button
              className="btn btn-primary grow" onClick={salvar}
              disabled={salvando || !editando?.service_id || !editando?.location_id}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      >
        <div className="stack-2">
          <Campo label="Data">
            <input
              className="ipt" type="date" value={editando?.data || ''}
              onChange={(e) => setEditando((p) => ({ ...p, data: e.target.value }))}
            />
          </Campo>
          <SelecaoServicoLocal valor={editando} onMudar={setEditando} dados={dados} />
          <Campo label="Observação">
            <input
              className="ipt" value={editando?.observacao || ''}
              onChange={(e) => setEditando((p) => ({ ...p, observacao: e.target.value }))}
              placeholder="Opcional"
            />
          </Campo>
        </div>
      </Sheet>

      {/* ── Em lote ── */}
      <Sheet
        aberto={Boolean(emLote)}
        titulo="Planejar em lote"
        onFechar={() => setEmLote(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setEmLote(null)}>Cancelar</button>
            <button
              className="btn btn-primary grow" onClick={salvarLote}
              disabled={salvando || !emLote?.service_id || !emLote?.location_id || !emLote?.diasMarcados?.length}
            >
              {salvando
                ? 'Salvando…'
                : `Planejar ${plural(emLote?.diasMarcados?.length || 0, 'dia', 'dias')}`}
            </button>
          </div>
        }
      >
        <div className="stack-2">
          <div className="t-caption" style={{ lineHeight: 1.5 }}>
            Escolha o serviço e o local uma vez, e marque em quais dias da semana de{' '}
            <strong>{rotuloDaSemana(inicio)}</strong> ele acontece.
          </div>

          <SelecaoServicoLocal valor={emLote} onMudar={setEmLote} dados={dados} />

          <Campo label="Dias da semana">
            <div className="row-wrap">
              {DIAS.map((d) => {
                const data = somarDias(inicio, d.indice)
                const marcado = (emLote?.diasMarcados || []).includes(d.indice)
                return (
                  <button
                    key={d.indice}
                    className={`btn btn-sm ${marcado ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setEmLote((x) => ({
                      ...x,
                      diasMarcados: marcado
                        ? x.diasMarcados.filter((i) => i !== d.indice)
                        : [...(x.diasMarcados || []), d.indice].sort((a, b) => a - b),
                    }))}
                    aria-pressed={marcado}
                  >
                    {d.curto} {formatarDataCurta(data).slice(0, 2)}
                  </button>
                )
              })}
            </div>
          </Campo>

          <button
            className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}
            onClick={() => setEmLote((x) => ({ ...x, diasMarcados: [0, 1, 2, 3, 4, 5] }))}
          >
            Segunda a sábado
          </button>

          <Campo label="Observação">
            <input
              className="ipt" value={emLote?.observacao || ''}
              onChange={(e) => setEmLote((x) => ({ ...x, observacao: e.target.value }))}
              placeholder="Vale para todos os dias marcados"
            />
          </Campo>
        </div>
      </Sheet>

      <Confirmar
        aberto={Boolean(removendo)}
        titulo="Tirar do planejamento?"
        texto={
          removendo
            ? `«${dados.nomeDe(dados.servicos, removendo.service_id)}» sai do planejamento de ${formatarData(removendo.data)}. Se o mestre já tiver lançado essa frente no diário, o lançamento sai junto.`
            : ''
        }
        rotuloOk="Tirar" perigo
        onOk={async () => { await dados.removerPlanejado(removendo.id); setRemovendo(null) }}
        onCancelar={() => setRemovendo(null)}
      />

      <ImportarPDFSemanal
        aberto={Boolean(importandoPDF)}
        onFechar={() => setImportandoPDF(null)}
        dados={dados}
        dias={dias}
        inicio={inicio}
      />

      <RelatorioFolha
        titulo="Planejamento semanal" sub={rotuloDaSemana(inicio)}
        obra={dados.obra.nome} org={dados.org.nome}
      >
        <SecaoRelatorio titulo="Fechamento">
          <div style={{ fontSize: 13 }}>
            Planejadas: <strong>{semana.total}</strong> · Concluídas: <strong>{semana.concluidas}</strong> ·
            Iniciadas: <strong>{semana.iniciadas}</strong> · Não executadas: <strong>{semana.naoExecutadas}</strong> ·
            Sem lançamento: <strong>{semana.semLancamento}</strong> · {semana.percentual}% concluído
          </div>
        </SecaoRelatorio>
        <SecaoRelatorio titulo="Atividades da semana">
          {/* Mesma função que monta a planilha (linhasDaSemana), sem o
              cabeçalho — TabelaRelatorio já desenha o próprio. */}
          <TabelaRelatorio
            colunas={linhasDaSemana()[0]}
            linhas={linhasDaSemana().slice(1)}
          />
        </SecaoRelatorio>
      </RelatorioFolha>
    </>
  )
}

/* ── Importação do PDF semanal ────────────────────────────
   O relatório semanal é o mesmo relatório operacional mensal,
   filtrado para os dias daquela janela. Reaproveita o leitor do
   Cronograma (mesma tabela, já testada) e cruza cada atividade
   com os 7 dias da semana que a TELA está mostrando no momento —
   por isso não precisa ler a grade de dias do PDF, que às vezes
   marca por cor de célula, não por texto. */

function ImportarPDFSemanal({ aberto, onFechar, dados, dias, inicio }) {
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
      const { lerPlanejamentoDoPDF } = await import('../lib/pdfPlanejamento')
      const lido = await lerPlanejamentoDoPDF(arquivo, {
        servicos: dados.servicos, locais: dados.locais, diasDaSemana: dias,
      })
      setResultado(lido)
    } catch (err) {
      setResultado({ itens: [], erroGeral: `Não consegui ler este arquivo. ${err.message}` })
    } finally {
      setLendo(false)
    }
  }

  const validos = (resultado?.itens || []).filter((i) => i.valido)

  /* Quantos dias-de-planejamento novos isso realmente cria — um
     pacote pode estar ativo em vários dias da semana, e alguns
     desses dias já podem estar planejados (reimportação). */
  const diasNovosPorItem = useMemo(() => {
    return validos.map((it) => ({
      item: it,
      // Serviço novo (it.servico === null) nunca pode já estar
      // planejado — ele ainda nem existe no cadastro. Só compara
      // por id quando o serviço já existia de antes.
      novos: it.diasAtivos.filter((dia) => !(it.servico && dados.planejamento.some(
        (p) => p.data === dia && p.location_id === it.local.id && p.service_id === it.servico.id,
      ))),
    }))
  }, [validos, dados]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalDiasNovos = diasNovosPorItem.reduce((s, x) => s + x.novos.length, 0)
  const servicosNovos = [...new Set(validos.filter((i) => !i.servico).map((i) => i.servicoTexto))]

  const confirmar = async () => {
    setImportando(true)
    try {
      // 1) Cria os serviços que ainda não existem — um por nome distinto.
      const idPorNomeServico = {}
      for (const nome of servicosNovos) {
        const criado = await dados.salvarCadastro('servicos', { nome })
        if (criado) idPorNomeServico[nome.toLowerCase()] = criado.id
      }

      // 2) Monta a lista final (pacote × dia novo) já com os ids reais.
      const itensParaCriar = []
      for (const { item, novos } of diasNovosPorItem) {
        const serviceId = item.servico?.id || idPorNomeServico[item.servicoTexto.toLowerCase()]
        if (!serviceId) continue
        for (const dia of novos) {
          itensParaCriar.push({
            data: dia, service_id: serviceId, location_id: item.local.id,
            company_id: null, observacao: null,
          })
        }
      }

      const salvos = itensParaCriar.length ? await dados.salvarPlanejadosEmLote(itensParaCriar) : []

      /* Serviço novo pode já ter etapa esperando por ele no cronograma
         (o PDF de cronograma costuma entrar primeiro) — casa pelo nome
         agora, sem exigir que alguém abra Cadastros pra ligar na mão. */
      if (servicosNovos.length) await dados.vincularServicosAutomaticamente()

      setFeito({
        criados: salvos?.length || 0,
        jaExistiam: totalDiasNovos - (salvos?.length || 0),
        servicosNovos: servicosNovos.length,
      })
    } finally {
      setImportando(false)
    }
  }

  return (
    <Sheet aberto={aberto} titulo="Importar PDF semanal" onFechar={fechar}>
      <div className="stack-2">
        {feito ? (
          <>
            <div className="alert success">
              {plural(feito.criados, 'dia de planejamento criado', 'dias de planejamento criados')}.
              {feito.servicosNovos > 0 && ` ${plural(feito.servicosNovos, 'serviço novo cadastrado', 'serviços novos cadastrados')}.`}
              {feito.jaExistiam > 0 && ` ${plural(feito.jaExistiam, 'dia já estava planejado', 'dias já estavam planejados')} e não foram repetidos.`}
            </div>
            <button className="btn btn-primary btn-block" onClick={fechar}>Fechar</button>
          </>
        ) : (
          <>
            <div className="t-caption" style={{ lineHeight: 1.5 }}>
              O relatório semanal, do mesmo jeito que o setor de planejamento manda. Cada atividade
              entra nos dias da semana de <strong>{rotuloDaSemana(inicio)}</strong> em que ela está
              ativa — troque a semana na tela antes de importar, se for outro período.
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
                  {plural(totalDiasNovos, 'dia de planejamento novo', 'dias de planejamento novos')}
                  {servicosNovos.length > 0 && ` · ${plural(servicosNovos.length, 'serviço novo', 'serviços novos')}`}
                  {resultado.itens.length > validos.length
                    ? ` · ${plural(resultado.itens.length - validos.length, 'pacote com problema', 'pacotes com problema')} (não entram)`
                    : ''}.
                </div>

                <div style={{ maxHeight: 320, overflowY: 'auto' }} className="stack-1">
                  {resultado.itens.map((it) => (
                    <div
                      key={it.linha}
                      style={{
                        fontSize: 12, padding: 8, borderRadius: 8,
                        border: `1px solid ${it.valido ? 'var(--border)' : 'var(--danger)'}`,
                        background: it.valido ? 'var(--surface)' : 'var(--danger-tint)',
                      }}
                    >
                      <strong>{it.descricao}</strong>
                      {it.valido ? (
                        <div style={{ marginTop: 4 }}>
                          <div>
                            Serviço:{' '}
                            {it.servico
                              ? it.servico.nome
                              : <span style={{ color: 'var(--info)', fontWeight: 600 }}>{it.servicoTexto} (novo)</span>}
                          </div>
                          <div>Local: {it.local.nome}</div>
                          <div style={{ marginTop: 2 }}>
                            Dias desta semana:{' '}
                            {DIAS.filter((d) => it.diasAtivos.includes(somarDias(inicio, d.indice)))
                              .map((d) => d.curto).join(', ') || '—'}
                          </div>
                        </div>
                      ) : (
                        <div style={{ marginTop: 4 }}>— {it.problemas.join(', ')}</div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="row-flex">
                  <button className="btn btn-secondary grow" onClick={() => setResultado(null)}>Corrigir</button>
                  <button
                    className="btn btn-primary grow" onClick={confirmar}
                    disabled={!totalDiasNovos || importando}
                  >
                    {importando ? 'Importando…' : `Importar ${plural(totalDiasNovos, 'dia', 'dias')}`}
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

/* ── Escolha de serviço, local e empresa ─────────────────── */

function SelecaoServicoLocal({ valor, onMudar, dados }) {
  const temEtapa = (servicoId) => dados.servicosCronograma.some((v) => v.service_id === servicoId)

  return (
    <>
      <Campo
        label="Serviço"
        dica={
          valor?.service_id && !temEtapa(valor.service_id)
            ? 'Este serviço ainda não está ligado a nenhuma etapa do cronograma — o avanço dele não entra na curva física. Ligue em Cadastros → Serviços.'
            : undefined
        }
      >
        <select
          className="sel" value={valor?.service_id || ''}
          onChange={(e) => onMudar((p) => ({ ...p, service_id: e.target.value }))}
        >
          <option value="">Escolha o serviço</option>
          {dados.servicos.filter((s) => s.ativo !== false).map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}{temEtapa(s.id) ? '' : '  ·  sem etapa no cronograma'}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="Local">
        <select
          className="sel" value={valor?.location_id || ''}
          onChange={(e) => onMudar((p) => ({ ...p, location_id: e.target.value }))}
        >
          <option value="">Escolha o local</option>
          {dados.locais.filter((l) => l.ativo !== false).map((l) => (
            <option key={l.id} value={l.id}>{l.nome}</option>
          ))}
        </select>
      </Campo>
      <Campo label="Empresa responsável">
        <select
          className="sel" value={valor?.company_id || ''}
          onChange={(e) => onMudar((p) => ({ ...p, company_id: e.target.value }))}
        >
          <option value="">Não definida</option>
          {dados.empresas.filter((e) => e.ativo !== false).map((e) => (
            <option key={e.id} value={e.id}>{e.nome}</option>
          ))}
        </select>
      </Campo>
    </>
  )
}

/* ── Um dia da semana ────────────────────────────────────── */

function ColunaDoDia({ data, hoje, desktop, itens, dados, podeEditar, onNova, onEditar, onDuplicar, onRemover, onAbrirDiario }) {
  const ehHoje = data === hoje
  const passado = data < hoje

  return (
    <div
      className="card-flat"
      style={{
        padding: 10,
        borderColor: ehHoje ? 'var(--primary)' : undefined,
        borderWidth: ehHoje ? 2 : 1,
        background: passado && !ehHoje ? 'var(--surface-2)' : 'var(--surface)',
      }}
    >
      <div className="row-between" style={{ marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'capitalize',
                        color: ehHoje ? 'var(--primary)' : 'var(--text)' }}>
            {nomeDiaSemana(data)}
          </div>
          <div className="t-caption" style={{ fontSize: 11 }}>{formatarDataCurta(data)}</div>
        </div>
        {podeEditar && (
          <button className="btn btn-ghost btn-sm" onClick={onNova} aria-label="Adicionar neste dia"
                  style={{ padding: 4, height: 'auto' }}>
            <Icon name="mais_sinal" size={16} />
          </button>
        )}
      </div>

      {itens.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-3)', padding: '6px 0' }}>—</div>
      ) : (
        <div className="stack-1">
          {itens.map(({ planejada, situacao }) => {
            const semCronograma = !dados.servicosCronograma.some((v) => v.service_id === planejada.service_id)
            return (
            <div
              key={planejada.id}
              style={{
                border: '1px solid var(--border)', borderRadius: 8, padding: 8,
                borderLeft: `3px solid ${
                  situacao.chave === 'concluida' ? 'var(--success)'
                  : situacao.chave === 'iniciada' ? 'var(--info)'
                  : situacao.chave === 'nao_executada' ? 'var(--danger)'
                  : 'var(--border-strong)'}`,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>
                {dados.nomeDe(dados.servicos, planejada.service_id)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
                {dados.nomeDe(dados.locais, planejada.location_id)}
              </div>
              {planejada.company_id && (
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
                  {dados.nomeDe(dados.empresas, planejada.company_id)}
                </div>
              )}

              <div className="row-wrap" style={{ marginTop: 6, gap: 4 }}>
                <Chip tom={situacao.tom}>{situacao.rotulo}</Chip>
                {semCronograma && (
                  <span title="Este serviço não está ligado a nenhuma etapa do cronograma">
                    <Chip tom="danger">
                      <Icon name="alerta" size={11} /> Sem cronograma
                    </Chip>
                  </span>
                )}
              </div>

              <div className="row-flex" style={{ gap: 2, marginTop: 6, flexWrap: 'wrap' }}>
                {situacao.diario && (
                  <button className="btn btn-ghost btn-sm" style={{ padding: '0 6px', height: 26, fontSize: 11 }}
                          onClick={() => onAbrirDiario(planejada.data)}>
                    Diário
                  </button>
                )}
                {podeEditar && (
                  <>
                    <button className="btn btn-ghost btn-sm" style={{ padding: 4, height: 26 }}
                            onClick={() => onEditar(planejada)} aria-label="Editar">
                      <Icon name="editar" size={13} />
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ padding: 4, height: 26 }}
                            onClick={() => onDuplicar(planejada)} aria-label="Duplicar">
                      <Icon name="mais_sinal" size={13} />
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ padding: 4, height: 26 }}
                            onClick={() => onRemover(planejada)} aria-label="Remover">
                      <Icon name="x" size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── Fechamento da semana ────────────────────────────────── */

function Fechamento({ semana, dados, goto }) {
  return (
    <div className="card stack-2">
      <div className="row-between">
        <div className="t-micro">Fechamento da semana</div>
        <span className="t-num t-strong" style={{ fontSize: 20, color: 'var(--success)' }}>
          {semana.percentual}%
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8 }}>
        <Indicador rotulo="Planejadas" valor={semana.total} />
        <Indicador rotulo="Concluídas" valor={semana.concluidas} tom={semana.concluidas ? 'success' : undefined} />
        <Indicador rotulo="Iniciadas" valor={semana.iniciadas} tom={semana.iniciadas ? 'info' : undefined} />
        <Indicador rotulo="Não executadas" valor={semana.naoExecutadas} tom={semana.naoExecutadas ? 'danger' : undefined} />
        <Indicador rotulo="Sem lançamento" valor={semana.semLancamento} />
      </div>

      {semana.semLancamento > 0 && (
        <div className="alert danger">
          {plural(semana.semLancamento, 'atividade está', 'atividades estão')} sem diário lançado no
          dia. Isso não é o mesmo que não ter sido executada — é a falta do registro, e some do
          percentual acima como se fosse atraso.
        </div>
      )}

      <div className="t-caption" style={{ lineHeight: 1.5 }}>
        A situação de cada atividade vem do diário, não de digitação. O percentual conta as
        concluídas sobre tudo o que foi planejado, inclusive o que ficou sem lançamento.
      </div>

      {semana.naoExecutadas > 0 && (
        <div>
          <div className="t-micro" style={{ marginBottom: 8 }}>Planejado e não executado</div>
          <div className="stack-1">
            {semana.itens.filter((i) => i.situacao.chave === 'nao_executada').map(({ planejada, situacao }) => (
              <button
                key={planejada.id} className="card-tap" style={{ padding: 10 }}
                onClick={() => goto('diario', { data: planejada.data, id: situacao.diario?.id })}
              >
                <div className="row-between">
                  <div className="grow">
                    <div className="t-strong" style={{ fontSize: 13 }}>
                      {dados.nomeDe(dados.servicos, planejada.service_id)}
                    </div>
                    <div className="t-caption">
                      {dados.nomeDe(dados.locais, planejada.location_id)} · {formatarData(planejada.data)}
                    </div>
                  </div>
                  <Icon name="avancar" size={16} style={{ color: 'var(--text-3)' }} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
