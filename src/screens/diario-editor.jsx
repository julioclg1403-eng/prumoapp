/* ============================================================
   DIÁRIO DE OBRA — assistente em 4 etapas
   1. Presenças   2. Frentes de serviço   3. Ocorrências   4. Revisão

   Decisões que valem a pena entender:
   · A frente de serviço NÃO é um cadastro novo. Ela é a atividade
     PLANEJADA daquele dia, agora com status e gente. É o mesmo
     registro do planejamento — é isso que impede o app de virar
     três planilhas separadas (BRIEFING, seção 4).
   · "Concluída" não se desfaz por toque acidental: voltar exige
     confirmação explícita.
   · O diário da data já existente é sempre reaberto, nunca
     duplicado.
   ============================================================ */

import { useState, useMemo } from 'react'
import { useDados } from '../lib/DadosContext'
import {
  hojeISO, formatarData, formatarDataLonga, diarioDaData,
  ROTULO_ATIVIDADE, TOM_ATIVIDADE, situacaoDiario, plural,
} from '../lib/dominio'
import {
  Icon, Chip, Sheet, Confirmar, Campo, Vazio, Selecionavel, ItemLista,
  CampoFotos, VisorFoto, useLinksDeFotos,
  RelatorioFolha, SecaoRelatorio, TabelaRelatorio, FotosRelatorio,
} from '../components'
import { legendaAutomatica } from '../lib/fotos'

const ETAPAS = ['Presenças', 'Frentes de serviço', 'Ocorrências', 'Revisão']

export default function DiarioEditor({ data, id, voltar, perfil }) {
  const dados = useDados()
  const dataAlvo = data || hojeISO()

  const existente = useMemo(
    () => (id ? dados.diarios.find((d) => d.id === id) : diarioDaData(dados.diarios, dataAlvo, dados.obra.id)),
    [id, dataAlvo, dados.diarios, dados.obra.id],
  )

  const [diario, setDiario] = useState(() => montarRascunho(existente, dataAlvo, dados.planejamento, dados.obra.id))
  const [etapa, setEtapa] = useState(0)
  const [confirmacao, setConfirmacao] = useState(null)
  const [salvo, setSalvo] = useState('')
  const [gravando, setGravando] = useState(false)
  const [enviandoFoto, setEnviandoFoto] = useState({})
  const [fotoAberta, setFotoAberta] = useState(null)

  const links = useLinksDeFotos(diario.fotos)

  const somenteLeitura = diario.status === 'finalizado'
  const sit = situacaoDiario(existente)

  const alterar = (mudanca) => setDiario((d) => ({ ...d, ...mudanca }))

  /* Agora a gravação vai até o banco e volta. O que a tela mostra
     depois é o que ficou GRAVADO, não o que ela achava que gravou:
     se o banco recusar, o diário não muda de estado e o aviso de
     erro aparece na barra vermelha. */
  const gravar = async (status) => {
    setGravando(true)
    const resultado = await dados.salvarDiario({
      ...diario, status, autor_id: diario.autor_id || perfil.id,
    })
    setGravando(false)
    if (!resultado) return null
    setDiario(resultado)
    setSalvo(status === 'finalizado' ? 'Diário finalizado.' : 'Rascunho salvo.')
    setTimeout(() => setSalvo(''), 2600)
    return resultado
  }

  /* ── Fotos ────────────────────────────────────────────────
     A foto precisa de um diário e de uma frente que já EXISTAM no
     banco, para se pendurar neles. Enquanto o lançamento é rascunho
     na tela, nada disso tem identificador ainda. Então, na primeira
     foto, o diário é salvo automaticamente antes do envio — em vez
     de mandar a pessoa "salvar antes de fotografar", que é o tipo de
     exigência que faz o mestre desistir e mandar a foto por outro
     canal qualquer. */
  const garantirSalvo = async () => {
    const faltaSalvar = !diario.id || diario.atividades.some((a) => String(a.id).startsWith('da-'))
    if (!faltaSalvar) return diario
    return await gravar('rascunho')
  }

  const enviarFotos = async (arquivos, { plannedId = null, principal = false, legenda = null }) => {
    const chave = plannedId || 'dia'
    setEnviandoFoto((e) => ({ ...e, [chave]: (e[chave] || 0) + arquivos.length }))
    try {
      const base = await garantirSalvo()
      if (!base) return
      const ativ = plannedId ? base.atividades.find((a) => a.planned_id === plannedId) : null
      const novas = []
      for (const arquivo of arquivos) {
        const f = await dados.adicionarFoto({
          arquivo,
          reportId: base.id,
          activityId: ativ ? ativ.id : null,
          legenda,
          principal,
        })
        if (f) novas.push(f)
      }
      if (novas.length) setDiario((d) => ({ ...d, fotos: [...(d.fotos || []), ...novas] }))
    } finally {
      setEnviandoFoto((e) => ({ ...e, [chave]: Math.max(0, (e[chave] || 0) - arquivos.length) }))
    }
  }

  const removerFoto = async (foto) => {
    const ok = await dados.removerFoto(foto)
    if (ok) setDiario((d) => ({ ...d, fotos: (d.fotos || []).filter((f) => f.id !== foto.id) }))
  }

  const fotos = {
    lista: diario.fotos || [],
    links,
    enviando: enviandoFoto,
    enviar: enviarFotos,
    remover: removerFoto,
    abrir: setFotoAberta,
  }

  const finalizar = () => {
    setConfirmacao({
      titulo: 'Finalizar o diário?',
      texto: `Você está fechando o diário de ${formatarData(diario.data)} com ${plural(
        totalMarcados(diario), 'pessoa', 'pessoas',
      )} e ${plural(diario.atividades.length, 'frente', 'frentes')}. Depois de finalizado ele só volta a ser editável se alguém reabrir, e isso fica registrado.`,
      rotuloOk: 'Finalizar',
      onOk: async () => { setConfirmacao(null); await gravar('finalizado'); setEtapa(3) },
    })
  }

  const reabrir = () => {
    setConfirmacao({
      titulo: 'Reabrir o diário?',
      texto: 'O diário volta para rascunho e pode ser editado. A reabertura fica registrada com seu nome e a data.',
      rotuloOk: 'Reabrir',
      onOk: async () => {
        setConfirmacao(null)
        await dados.reabrirDiario(diario.id)
        setDiario((d) => ({ ...d, status: 'rascunho' }))
      },
    })
  }

  return (
    <>
      <div className="topbar">
        <button onClick={voltar} aria-label="Voltar"><Icon name="voltar" size={22} /></button>
        <div className="grow">
          <div style={{ fontSize: 17, fontWeight: 700 }}>Diário · {formatarData(diario.data)}</div>
          <div className="sub">{formatarDataLonga(diario.data)}</div>
        </div>
        {diario.id && (
          <button onClick={() => window.print()} aria-label="Relatório do diário">
            <Icon name="relatorio" size={20} />
          </button>
        )}
        <Chip tom={sit.tom}>{somenteLeitura ? 'Finalizado' : existente ? 'Rascunho' : 'Novo'}</Chip>
      </div>

      <div className="page" style={{ paddingBottom: 96 }}>
        {/* ── Barra de etapas ── */}
        <div className="steps" style={{ marginBottom: 10 }}>
          {ETAPAS.map((_, i) => <div key={i} data-on={i <= etapa ? '1' : '0'} />)}
        </div>
        <div className="row-between" style={{ marginBottom: 16 }}>
          <div className="t-title">{ETAPAS[etapa]}</div>
          <div className="t-caption">Etapa {etapa + 1} de {ETAPAS.length}</div>
        </div>

        {somenteLeitura && (
          <div className="alert success" style={{ marginBottom: 16 }}>
            Este diário está finalizado, então está em modo leitura.{' '}
            <button
              className="btn btn-ghost btn-sm" style={{ padding: 0, height: 'auto', color: 'inherit', textDecoration: 'underline' }}
              onClick={reabrir}
            >
              Reabrir para editar
            </button>
          </div>
        )}

        {etapa === 0 && <EtapaPresencas diario={diario} alterar={alterar} bloqueado={somenteLeitura} />}
        {etapa === 1 && <EtapaFrentes diario={diario} alterar={alterar} bloqueado={somenteLeitura} pedirConfirmacao={setConfirmacao} fotos={fotos} />}
        {etapa === 2 && <EtapaOcorrencias diario={diario} alterar={alterar} bloqueado={somenteLeitura} />}
        {etapa === 3 && <EtapaRevisao diario={diario} alterar={alterar} bloqueado={somenteLeitura} irPara={setEtapa} fotos={fotos} />}
      </div>

      {/* ── Barra de ação fixa ── */}
      <div
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 45,
          background: 'var(--surface)', borderTop: '1px solid var(--border)',
          padding: '10px 16px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
        }}
      >
        {salvo && (
          <div className="t-caption" style={{ color: 'var(--success)', fontWeight: 600, marginBottom: 8 }}>
            {salvo}
          </div>
        )}
        <div className="row-flex" style={{ maxWidth: 1180, margin: '0 auto' }}>
          {etapa > 0 && (
            <button className="btn btn-secondary" onClick={() => setEtapa((e) => e - 1)}>
              <Icon name="voltar" size={18} /> Voltar
            </button>
          )}
          {!somenteLeitura && (
            <button className="btn btn-ghost btn-sm" onClick={() => gravar('rascunho')} disabled={gravando}>
              {gravando ? 'Salvando…' : 'Salvar rascunho'}
            </button>
          )}
          <div className="grow" />
          {etapa < 3 ? (
            <button className="btn btn-primary" onClick={() => setEtapa((e) => e + 1)}>
              Avançar <Icon name="avancar" size={18} />
            </button>
          ) : somenteLeitura ? (
            <button className="btn btn-secondary" onClick={voltar}>Fechar</button>
          ) : (
            <button className="btn btn-primary" onClick={finalizar} disabled={gravando}>
              <Icon name="check" size={18} /> {gravando ? 'Salvando…' : 'Finalizar diário'}
            </button>
          )}
        </div>
      </div>

      <Confirmar
        aberto={Boolean(confirmacao)}
        titulo={confirmacao?.titulo}
        texto={confirmacao?.texto}
        rotuloOk={confirmacao?.rotuloOk}
        perigo={confirmacao?.perigo}
        onOk={confirmacao?.onOk}
        onCancelar={() => setConfirmacao(null)}
      />

      <VisorFoto
        foto={fotoAberta}
        fotos={diario.fotos || []}
        links={links}
        onFechar={() => setFotoAberta(null)}
        onIr={(passo) => {
          const lista = diario.fotos || []
          const i = lista.findIndex((f) => f.id === fotoAberta.id)
          const proxima = lista[(i + passo + lista.length) % lista.length]
          if (proxima) setFotoAberta(proxima)
        }}
      />

      <RelatorioFolha
        titulo="Diário de obra" sub={formatarDataLonga(diario.data)}
        obra={dados.obra.nome} org={dados.org.nome}
      >
        <SecaoRelatorio titulo="Resumo do dia">
          <div style={{ fontSize: 13 }}>
            Na obra: <strong>{totalMarcados(diario)}</strong> ·
            Concluídas: <strong>{diario.atividades.filter((a) => a.status === 'concluida').length}</strong> ·
            Em andamento: <strong>{diario.atividades.filter((a) => a.status === 'em_andamento').length}</strong> ·
            Paradas: <strong>{diario.atividades.filter((a) => a.status === 'nao_iniciada').length}</strong> ·
            Ocorrências: <strong>{diario.ocorrencias.length}</strong>
          </div>
          {diario.clima && <div style={{ fontSize: 13, marginTop: 6 }}>Clima: {diario.clima}</div>}
          {diario.observacao && <div style={{ fontSize: 13, marginTop: 6 }}>Observação: {diario.observacao}</div>}
        </SecaoRelatorio>

        <SecaoRelatorio titulo="Efetivo por empresa">
          <TabelaRelatorio
            colunas={['Empresa', 'Presentes']}
            linhas={dados.empresas
              .map((e) => [e.nome, diario.presencas.filter((p) => p.presente && p.company_id === e.id).length])
              .filter(([, n]) => n > 0)}
          />
        </SecaoRelatorio>

        <SecaoRelatorio titulo="Frentes de serviço">
          <TabelaRelatorio
            colunas={['Serviço', 'Local', 'Empresa', 'Situação', 'Equipe', 'Observação']}
            linhas={diario.atividades.map((a) => {
              const r = dados.rotuloAtividade(a.planned_id)
              const equipe = (a.worker_ids || []).map((w) => dados.colaboradorPorId(w)?.nome).filter(Boolean).join(', ')
              return [r.servico, r.local, r.empresa, ROTULO_ATIVIDADE[a.status], equipe || '—', a.observacao || '—']
            })}
          />
        </SecaoRelatorio>

        <SecaoRelatorio titulo="Ocorrências">
          <TabelaRelatorio
            colunas={['Tipo', 'Descrição', 'Frente']}
            linhas={diario.ocorrencias.map((o) => {
              const ativ = diario.atividades.find((a) => a.id === o.activity_id)
              const r = ativ ? dados.rotuloAtividade(ativ.planned_id) : null
              return [dados.nomeDe(dados.tiposOcorrencia, o.tipo_id), o.descricao || '—', r ? `${r.servico} · ${r.local}` : '—']
            })}
          />
        </SecaoRelatorio>

        {(diario.fotos || []).length > 0 && (
          <SecaoRelatorio titulo="Fotos">
            <FotosRelatorio
              fotos={diario.fotos}
              links={links}
              legenda={(f) => {
                if (f.principal) return 'Foto principal do dia'
                const ativ = diario.atividades.find((a) => a.id === f.activity_id)
                if (!ativ) return f.legenda || '—'
                const r = dados.rotuloAtividade(ativ.planned_id)
                return `${r.servico} · ${r.local}`
              }}
            />
          </SecaoRelatorio>
        )}
      </RelatorioFolha>
    </>
  )
}

/* ============================================================
   Etapa 1 — Presenças
   ============================================================ */

function EtapaPresencas({ diario, alterar, bloqueado }) {
  const dados = useDados()
  const empresasAtivas = dados.empresas.filter((e) => e.ativo !== false)
  const [empresaId, setEmpresaId] = useState(empresasAtivas[0]?.id || null)
  const [novo, setNovo] = useState(null)

  const presentes = new Set(diario.presencas.filter((p) => p.presente).map((p) => p.worker_id))

  const alternar = (col) => {
    if (bloqueado) return
    const jaEsta = presentes.has(col.id)
    alterar({
      presencas: jaEsta
        ? diario.presencas.filter((p) => p.worker_id !== col.id)
        : [...diario.presencas, { worker_id: col.id, company_id: col.company_id, presente: true }],
      /* Tirar alguém da obra tem que tirá-lo também das frentes —
         senão sobra gente trabalhando num dia em que faltou. */
      atividades: jaEsta
        ? diario.atividades.map((a) => ({ ...a, worker_ids: (a.worker_ids || []).filter((w) => w !== col.id) }))
        : diario.atividades,
    })
  }

  const daEmpresa = dados.colaboradores.filter((c) => c.company_id === empresaId && c.ativo !== false)
  const totalEmpresa = daEmpresa.filter((c) => presentes.has(c.id)).length

  const marcarTodos = () => {
    if (bloqueado) return
    const faltando = daEmpresa.filter((c) => !presentes.has(c.id))
    alterar({
      presencas: [
        ...diario.presencas,
        ...faltando.map((c) => ({ worker_id: c.id, company_id: c.company_id, presente: true })),
      ],
    })
  }

  const salvarNovo = async () => {
    const nome = (novo.nome || '').trim()
    if (!nome) return
    const col = await dados.criarColaboradorRapido({ nome, funcao: novo.funcao, company_id: empresaId })
    if (!col) return   // o banco recusou; o aviso já apareceu
    alterar({ presencas: [...diario.presencas, { worker_id: col.id, company_id: col.company_id, presente: true }] })
    setNovo(null)
  }

  return (
    <div className="stack-3">
      <div className="row-between">
        <div className="t-caption">
          <strong className="t-num" style={{ fontSize: 20, color: 'var(--text)' }}>{presentes.size}</strong>{' '}
          {presentes.size === 1 ? 'pessoa na obra' : 'pessoas na obra'}
        </div>
        {!bloqueado && (
          <button className="btn btn-secondary btn-sm" onClick={() => setNovo({ nome: '', funcao: '' })}>
            <Icon name="mais_sinal" size={16} /> Novo colaborador
          </button>
        )}
      </div>

      <div className="row-wrap">
        {empresasAtivas.map((e) => {
          const n = dados.colaboradores.filter((c) => c.company_id === e.id && presentes.has(c.id)).length
          return (
            <button
              key={e.id}
              className={`btn btn-sm ${e.id === empresaId ? 'btn-dark' : 'btn-secondary'}`}
              onClick={() => setEmpresaId(e.id)}
            >
              {e.nome} {n > 0 && <span style={{ opacity: 0.7 }}>{n}</span>}
            </button>
          )
        })}
      </div>

      {daEmpresa.length === 0 ? (
        <div className="card-flat">
          <Vazio
            titulo="Nenhum colaborador nesta empresa"
            texto="Cadastre alguém aqui mesmo ou pelo módulo de Cadastros."
            acao={
              !bloqueado && (
                <button className="btn btn-primary" onClick={() => setNovo({ nome: '', funcao: '' })}>
                  Cadastrar colaborador
                </button>
              )
            }
          />
        </div>
      ) : (
        <div className="stack-1">
          {!bloqueado && totalEmpresa < daEmpresa.length && (
            <button className="btn btn-ghost btn-sm" onClick={marcarTodos} style={{ alignSelf: 'flex-start' }}>
              Marcar todos desta empresa
            </button>
          )}
          {daEmpresa.map((c) => (
            <Selecionavel
              key={c.id}
              marcado={presentes.has(c.id)}
              onToggle={() => alternar(c)}
              titulo={c.nome}
              sub={c.funcao}
              direita={c.provisorio && !c.revisado ? <Chip tom="info">Provisório</Chip> : null}
            />
          ))}
        </div>
      )}

      <Sheet
        aberto={Boolean(novo)}
        titulo="Novo colaborador"
        onFechar={() => setNovo(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setNovo(null)}>Cancelar</button>
            <button className="btn btn-primary grow" onClick={salvarNovo} disabled={!novo?.nome?.trim()}>
              Cadastrar e marcar presente
            </button>
          </div>
        }
      >
        <div className="stack-2">
          <div className="alert info">
            Cadastro rápido entra como <strong>provisório</strong> e aparece na fila de revisão da gestão,
            para conferirem nome e documentação depois.
          </div>
          <Campo label="Nome">
            <input
              className="ipt" autoFocus value={novo?.nome || ''}
              onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value }))}
              placeholder="Como a pessoa é chamada na obra"
            />
          </Campo>
          <Campo label="Função">
            <input
              className="ipt" value={novo?.funcao || ''}
              onChange={(e) => setNovo((n) => ({ ...n, funcao: e.target.value }))}
              placeholder="Pedreiro, servente, eletricista…"
            />
          </Campo>
          <Campo label="Empresa">
            <input className="ipt" value={dados.nomeDe(dados.empresas, empresaId)} disabled />
          </Campo>
        </div>
      </Sheet>
    </div>
  )
}

/* ============================================================
   Etapa 2 — Frentes de serviço
   ============================================================ */

function EtapaFrentes({ diario, alterar, bloqueado, pedirConfirmacao, fotos }) {
  const dados = useDados()
  const [equipeDe, setEquipeDe] = useState(null)   // atividade cuja equipe está sendo escolhida
  const [nova, setNova] = useState(null)

  const presentes = diario.presencas.filter((p) => p.presente)

  const trocarStatus = (ativ, status) => {
    if (bloqueado) return
    const aplicar = () =>
      alterar({
        atividades: diario.atividades.map((a) =>
          a.id === ativ.id
            ? { ...a, status, atualizado_via: 'app', atualizado_por: diario.autor_id }
            : a,
        ),
      })

    /* Sair de "concluída" é a única transição que pede confirmação:
       o toque acidental aqui apaga trabalho já registrado. */
    if (ativ.status === 'concluida' && status !== 'concluida') {
      pedirConfirmacao({
        titulo: 'Desmarcar concluída?',
        texto: 'Esta frente está registrada como concluída. Quer mesmo voltar o status?',
        rotuloOk: 'Voltar o status', perigo: true,
        onOk: () => { pedirConfirmacao(null); aplicar() },
      })
      return
    }
    aplicar()
  }

  const alternarPessoa = (ativId, workerId) => {
    alterar({
      atividades: diario.atividades.map((a) => {
        if (a.id !== ativId) return a
        const atual = a.worker_ids || []
        return {
          ...a,
          worker_ids: atual.includes(workerId) ? atual.filter((w) => w !== workerId) : [...atual, workerId],
        }
      }),
    })
  }

  const criarFrente = async () => {
    if (!nova?.service_id || !nova?.location_id) return
    const pl = await dados.salvarPlanejado({
      data: diario.data,
      service_id: nova.service_id,
      location_id: nova.location_id,
      company_id: nova.company_id || null,
      observacao: null,
    })
    if (!pl) return
    alterar({
      atividades: [
        ...diario.atividades,
        { id: `da-${pl.id}`, planned_id: pl.id, status: 'em_andamento', worker_ids: [], observacao: '', atualizado_via: 'app' },
      ],
    })
    setNova(null)
  }

  const ativAtual = diario.atividades.find((a) => a.id === equipeDe) || null

  return (
    <div className="stack-3">
      <div className="row-between">
        <div className="t-caption">
          {plural(diario.atividades.length, 'frente aberta', 'frentes abertas')} ·{' '}
          {diario.atividades.filter((a) => a.status === 'concluida').length} concluída(s)
        </div>
        {!bloqueado && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setNova({ service_id: '', location_id: '', company_id: '' })}
          >
            <Icon name="mais_sinal" size={16} /> Nova frente
          </button>
        )}
      </div>

      {presentes.length === 0 && !bloqueado && (
        <div className="alert info">
          Ninguém foi marcado presente na etapa anterior. Dá para registrar o status das frentes mesmo
          assim, mas você não vai conseguir dizer quem trabalhou em cada uma.
        </div>
      )}

      {diario.atividades.length === 0 ? (
        <div className="card-flat">
          <Vazio
            titulo="Nenhuma frente para este dia"
            texto="Não havia atividade planejada para esta data. Adicione as frentes que realmente aconteceram."
            acao={
              !bloqueado && (
                <button
                  className="btn btn-primary"
                  onClick={() => setNova({ service_id: '', location_id: '', company_id: '' })}
                >
                  Adicionar frente
                </button>
              )
            }
          />
        </div>
      ) : (
        <div className="stack-2">
          {diario.atividades.map((a) => {
            const r = dados.rotuloAtividade(a.planned_id)
            const equipe = (a.worker_ids || []).map((w) => dados.colaboradorPorId(w)).filter(Boolean)
            return (
              <div key={a.id} className="card">
                <div className="row-between" style={{ alignItems: 'flex-start', marginBottom: 12 }}>
                  <div className="grow">
                    <div className="t-strong" style={{ fontSize: 15 }}>{r.servico}</div>
                    <div className="t-caption" style={{ marginTop: 2 }}>
                      {r.local} · {r.empresa}
                    </div>
                  </div>
                  <Chip tom={TOM_ATIVIDADE[a.status]}>{ROTULO_ATIVIDADE[a.status]}</Chip>
                </div>

                <div className="row-wrap" style={{ marginBottom: 12 }}>
                  {['nao_iniciada', 'em_andamento', 'concluida'].map((s) => (
                    <button
                      key={s}
                      className={`btn btn-sm ${a.status === s ? 'btn-dark' : 'btn-secondary'}`}
                      onClick={() => trocarStatus(a, s)}
                      disabled={bloqueado}
                      aria-pressed={a.status === s}
                    >
                      {ROTULO_ATIVIDADE[s]}
                    </button>
                  ))}
                </div>

                <button
                  className="btn btn-secondary btn-block btn-sm"
                  style={{ justifyContent: 'space-between' }}
                  onClick={() => setEquipeDe(a.id)}
                  disabled={bloqueado || presentes.length === 0}
                >
                  <span>
                    {equipe.length === 0 ? 'Quem trabalhou aqui?' : equipe.map((c) => c.nome).join(', ')}
                  </span>
                  <span className="t-num" style={{ opacity: 0.7 }}>{equipe.length}</span>
                </button>

                <textarea
                  className="txt" style={{ marginTop: 10, minHeight: 60 }}
                  placeholder="Observação desta frente (opcional)"
                  value={a.observacao || ''}
                  disabled={bloqueado}
                  onChange={(e) =>
                    alterar({
                      atividades: diario.atividades.map((x) =>
                        x.id === a.id ? { ...x, observacao: e.target.value } : x,
                      ),
                    })
                  }
                />

                {/* Fotos desta frente. A legenda já nasce com serviço,
                    local e data — foto de obra sem contexto não serve
                    para nada três meses depois. */}
                <div style={{ marginTop: 12 }}>
                  <div className="t-micro" style={{ marginBottom: 8 }}>Fotos desta frente</div>
                  <CampoFotos
                    fotos={fotos.lista.filter((f) => f.activity_id === a.id)}
                    links={fotos.links}
                    enviando={fotos.enviando[a.planned_id] || 0}
                    bloqueado={bloqueado}
                    onAbrir={fotos.abrir}
                    onRemover={fotos.remover}
                    onAdicionar={(arquivos) =>
                      fotos.enviar(arquivos, {
                        plannedId: a.planned_id,
                        legenda: legendaAutomatica({
                          servico: r.servico, local: r.local, data: diario.data,
                        }),
                      })
                    }
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Escolher quem trabalhou na frente ── */}
      <Sheet
        aberto={Boolean(ativAtual)}
        titulo="Quem trabalhou nesta frente"
        onFechar={() => setEquipeDe(null)}
        rodape={
          <button className="btn btn-primary btn-block" onClick={() => setEquipeDe(null)}>Pronto</button>
        }
      >
        <div className="t-caption" style={{ marginBottom: 12 }}>
          Só aparece quem foi marcado presente na etapa 1.
        </div>
        <div className="stack-1">
          {presentes.map((p) => {
            const col = dados.colaboradorPorId(p.worker_id)
            if (!col) return null
            return (
              <Selecionavel
                key={col.id}
                marcado={(ativAtual?.worker_ids || []).includes(col.id)}
                onToggle={() => alternarPessoa(ativAtual.id, col.id)}
                titulo={col.nome}
                sub={`${col.funcao || '—'} · ${dados.nomeDe(dados.empresas, col.company_id)}`}
              />
            )
          })}
        </div>
      </Sheet>

      {/* ── Nova frente ── */}
      <Sheet
        aberto={Boolean(nova)}
        titulo="Nova frente de serviço"
        onFechar={() => setNova(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setNova(null)}>Cancelar</button>
            <button
              className="btn btn-primary grow" onClick={criarFrente}
              disabled={!nova?.service_id || !nova?.location_id}
            >
              Adicionar
            </button>
          </div>
        }
      >
        <div className="stack-2">
          <div className="alert info">
            A frente adicionada aqui também entra no planejamento desta data — é o mesmo registro,
            não uma cópia.
          </div>
          <Campo label="Serviço">
            <select
              className="sel" value={nova?.service_id || ''}
              onChange={(e) => setNova((n) => ({ ...n, service_id: e.target.value }))}
            >
              <option value="">Escolha o serviço</option>
              {dados.servicos.filter((s) => s.ativo !== false).map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Local">
            <select
              className="sel" value={nova?.location_id || ''}
              onChange={(e) => setNova((n) => ({ ...n, location_id: e.target.value }))}
            >
              <option value="">Escolha o local</option>
              {dados.locais.filter((l) => l.ativo !== false).map((l) => (
                <option key={l.id} value={l.id}>{l.nome}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Empresa responsável">
            <select
              className="sel" value={nova?.company_id || ''}
              onChange={(e) => setNova((n) => ({ ...n, company_id: e.target.value }))}
            >
              <option value="">Não definida</option>
              {dados.empresas.filter((e) => e.ativo !== false).map((e) => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </select>
          </Campo>
        </div>
      </Sheet>
    </div>
  )
}

/* ============================================================
   Etapa 3 — Ocorrências
   ============================================================ */

function EtapaOcorrencias({ diario, alterar, bloqueado }) {
  const dados = useDados()
  const [nova, setNova] = useState(null)

  const salvar = () => {
    if (!nova?.tipo_id) return
    const item = {
      id: nova.id || `oc-${Date.now()}`,
      tipo_id: nova.tipo_id,
      descricao: (nova.descricao || '').trim(),
      activity_id: nova.activity_id || null,
    }
    const existe = diario.ocorrencias.some((o) => o.id === item.id)
    alterar({
      ocorrencias: existe
        ? diario.ocorrencias.map((o) => (o.id === item.id ? item : o))
        : [...diario.ocorrencias, item],
    })
    setNova(null)
  }

  const remover = (id) => alterar({ ocorrencias: diario.ocorrencias.filter((o) => o.id !== id) })

  return (
    <div className="stack-3">
      <div className="row-between">
        <div className="t-caption">
          {diario.ocorrencias.length === 0
            ? 'Nenhum imprevisto registrado'
            : plural(diario.ocorrencias.length, 'ocorrência', 'ocorrências')}
        </div>
        {!bloqueado && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setNova({ tipo_id: '', descricao: '', activity_id: '' })}
          >
            <Icon name="mais_sinal" size={16} /> Registrar
          </button>
        )}
      </div>

      {diario.ocorrencias.length === 0 ? (
        <div className="card-flat">
          <Vazio
            titulo="Dia sem imprevisto"
            texto="Chuva, falta de material, falta de projeto, problema de segurança — o que atrapalhou o dia entra aqui e vira histórico."
            acao={
              !bloqueado && (
                <button
                  className="btn btn-primary"
                  onClick={() => setNova({ tipo_id: '', descricao: '', activity_id: '' })}
                >
                  Registrar ocorrência
                </button>
              )
            }
          />
        </div>
      ) : (
        <div className="stack-1">
          {diario.ocorrencias.map((o) => {
            const ativ = diario.atividades.find((a) => a.id === o.activity_id)
            const r = ativ ? dados.rotuloAtividade(ativ.planned_id) : null
            return (
              <div key={o.id} className="card-flat" style={{ borderLeft: '4px solid var(--danger)' }}>
                <div className="row-between" style={{ alignItems: 'flex-start' }}>
                  <div className="grow">
                    <div className="t-strong" style={{ fontSize: 15 }}>
                      {dados.nomeDe(dados.tiposOcorrencia, o.tipo_id)}
                    </div>
                    {o.descricao && (
                      <div className="t-caption" style={{ marginTop: 4, lineHeight: 1.5 }}>{o.descricao}</div>
                    )}
                    {r && (
                      <div className="t-caption" style={{ marginTop: 6, color: 'var(--text-3)' }}>
                        Frente: {r.servico} · {r.local}
                      </div>
                    )}
                  </div>
                  {!bloqueado && (
                    <div className="row-flex" style={{ gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setNova(o)} aria-label="Editar">
                        <Icon name="editar" size={16} />
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => remover(o.id)} aria-label="Remover">
                        <Icon name="x" size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Sheet
        aberto={Boolean(nova)}
        titulo={nova?.id ? 'Editar ocorrência' : 'Registrar ocorrência'}
        onFechar={() => setNova(null)}
        rodape={
          <div className="row-flex">
            <button className="btn btn-secondary grow" onClick={() => setNova(null)}>Cancelar</button>
            <button className="btn btn-primary grow" onClick={salvar} disabled={!nova?.tipo_id}>Salvar</button>
          </div>
        }
      >
        <div className="stack-2">
          <Campo label="Tipo">
            <select
              className="sel" value={nova?.tipo_id || ''}
              onChange={(e) => setNova((n) => ({ ...n, tipo_id: e.target.value }))}
            >
              <option value="">Escolha o tipo</option>
              {dados.tiposOcorrencia.filter((t) => t.ativo !== false).map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </Campo>
          <Campo label="O que aconteceu">
            <textarea
              className="txt" value={nova?.descricao || ''}
              onChange={(e) => setNova((n) => ({ ...n, descricao: e.target.value }))}
              placeholder="Descreva o suficiente para alguém entender daqui a um mês."
            />
          </Campo>
          <Campo label="Frente afetada" dica="Opcional. Vincular ajuda a explicar por que a frente não avançou.">
            <select
              className="sel" value={nova?.activity_id || ''}
              onChange={(e) => setNova((n) => ({ ...n, activity_id: e.target.value }))}
            >
              <option value="">Nenhuma em específico</option>
              {diario.atividades.map((a) => {
                const r = dados.rotuloAtividade(a.planned_id)
                return <option key={a.id} value={a.id}>{r.servico} · {r.local}</option>
              })}
            </select>
          </Campo>
        </div>
      </Sheet>
    </div>
  )
}

/* ============================================================
   Etapa 4 — Revisão
   ============================================================ */

function EtapaRevisao({ diario, alterar, bloqueado, irPara, fotos }) {
  const dados = useDados()
  const principal = fotos.lista.find((f) => f.principal) || null
  const concluidas = diario.atividades.filter((a) => a.status === 'concluida').length
  const andamento = diario.atividades.filter((a) => a.status === 'em_andamento').length
  const paradas = diario.atividades.filter((a) => a.status === 'nao_iniciada').length

  const porEmpresa = dados.empresas
    .map((e) => ({
      empresa: e,
      n: diario.presencas.filter((p) => p.presente && p.company_id === e.id).length,
    }))
    .filter((x) => x.n > 0)

  return (
    <div className="stack-3">
      <div className="card">
        <div className="t-micro" style={{ marginBottom: 12 }}>Resumo do dia</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 12 }}>
          <Numero rotulo="Na obra" valor={totalMarcados(diario)} />
          <Numero rotulo="Concluídas" valor={concluidas} cor="var(--success)" />
          <Numero rotulo="Em andamento" valor={andamento} cor="var(--info)" />
          <Numero rotulo="Paradas" valor={paradas} cor={paradas ? 'var(--danger)' : undefined} />
          <Numero rotulo="Ocorrências" valor={diario.ocorrencias.length} cor={diario.ocorrencias.length ? 'var(--danger)' : undefined} />
        </div>
      </div>

      {/* A foto principal é UMA só: é a que representa o dia no
          histórico e nos relatórios. Por isso o botão de adicionar
          some assim que existe uma — escolher "a foto do dia" entre
          seis é decisão que ninguém quer tomar depois. */}
      <div className="card">
        <div className="row-between" style={{ marginBottom: 10 }}>
          <div className="t-micro">Foto principal do dia</div>
          {principal && <Chip tom="success">Definida</Chip>}
        </div>
        <div style={{ maxWidth: 200 }}>
          <CampoFotos
            fotos={principal ? [principal] : []}
            links={fotos.links}
            enviando={fotos.enviando.dia || 0}
            bloqueado={bloqueado || Boolean(principal)}
            rotulo="Foto do dia"
            onAbrir={fotos.abrir}
            onRemover={fotos.remover}
            onAdicionar={(arquivos) =>
              fotos.enviar(arquivos.slice(0, 1), {
                principal: true,
                legenda: legendaAutomatica({
                  servico: 'Resumo do dia', local: dados.obra.nome, data: diario.data,
                }),
              })
            }
          />
        </div>
        {!principal && !bloqueado && (
          <div className="t-caption" style={{ marginTop: 10, lineHeight: 1.5 }}>
            Opcional, mas é a foto que aparece no histórico e nos relatórios do dia.
          </div>
        )}
      </div>

      <div className="card stack-2">
        <Campo label="Clima do dia">
          <input
            className="ipt" value={diario.clima || ''} disabled={bloqueado}
            onChange={(e) => alterar({ clima: e.target.value })}
            placeholder="Bom, chuva pela manhã, calor forte…"
          />
        </Campo>
        <Campo label="Observação geral">
          <textarea
            className="txt" value={diario.observacao || ''} disabled={bloqueado}
            onChange={(e) => alterar({ observacao: e.target.value })}
            placeholder="O que mais precisa ficar registrado sobre este dia."
          />
        </Campo>
      </div>

      <div className="card-flat">
        <div className="row-between" style={{ marginBottom: 10 }}>
          <div className="t-micro">Efetivo por empresa</div>
          <button className="btn btn-ghost btn-sm" onClick={() => irPara(0)}>Corrigir</button>
        </div>
        {porEmpresa.length === 0 ? (
          <div className="t-caption">Ninguém marcado presente.</div>
        ) : (
          <div className="stack-1">
            {porEmpresa.map(({ empresa, n }) => (
              <div key={empresa.id} className="row-between">
                <span style={{ fontSize: 14 }}>{empresa.nome}</span>
                <span className="t-num t-strong">{n}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card-flat">
        <div className="row-between" style={{ marginBottom: 10 }}>
          <div className="t-micro">Frentes</div>
          <button className="btn btn-ghost btn-sm" onClick={() => irPara(1)}>Corrigir</button>
        </div>
        {diario.atividades.length === 0 ? (
          <div className="t-caption">Nenhuma frente registrada.</div>
        ) : (
          <div className="stack-1">
            {diario.atividades.map((a) => {
              const r = dados.rotuloAtividade(a.planned_id)
              return (
                <ItemLista
                  key={a.id}
                  titulo={r.servico}
                  sub={`${r.local} · ${plural((a.worker_ids || []).length, 'pessoa', 'pessoas')}`}
                  direita={<Chip tom={TOM_ATIVIDADE[a.status]}>{ROTULO_ATIVIDADE[a.status]}</Chip>}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Numero({ rotulo, valor, cor }) {
  return (
    <div>
      <div className="t-num" style={{ fontSize: 24, fontWeight: 700, color: cor || 'var(--text)', lineHeight: 1 }}>
        {valor}
      </div>
      <div className="t-caption" style={{ marginTop: 3 }}>{rotulo}</div>
    </div>
  )
}

/* ============================================================
   Montagem do rascunho
   ============================================================ */

function totalMarcados(diario) {
  return diario.presencas.filter((p) => p.presente).length
}

/* Junta o diário existente (se houver) com as atividades planejadas
   da data. Assim, uma frente planejada DEPOIS de o rascunho ter sido
   salvo ainda aparece — sem duplicar as que já estavam lá. */
function montarRascunho(existente, data, planejamento, obraId) {
  const planejadasDoDia = planejamento.filter((p) => p.data === data && p.worksite_id === obraId)

  const base = existente
    ? {
        ...existente,
        presencas: [...(existente.presencas || [])],
        atividades: [...(existente.atividades || [])],
        ocorrencias: [...(existente.ocorrencias || [])],
      }
    : {
        id: null, worksite_id: obraId, data, status: 'rascunho', clima: '', observacao: '',
        presencas: [], atividades: [], ocorrencias: [],
      }

  const jaTem = new Set(base.atividades.map((a) => a.planned_id))
  const novas = planejadasDoDia
    .filter((p) => !jaTem.has(p.id))
    .map((p) => ({
      id: `da-${p.id}`, planned_id: p.id, status: 'nao_iniciada',
      worker_ids: [], observacao: '', atualizado_via: 'app',
    }))

  return { ...base, atividades: [...base.atividades, ...novas] }
}
