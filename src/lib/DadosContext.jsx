/* ============================================================
   ESTADO GLOBAL — agora falando com o Supabase.

   Continua valendo a regra que sustenta o app: NENHUMA tela grava
   sozinha. Tudo passa por aqui. É isso que garante que o contador
   do menu, o painel e a tela de detalhe mostrem sempre o mesmo
   número, e é o motivo de a troca do mock para o banco ter sido
   um arquivo só em vez de dez.

   Duas coisas importantes sobre o Supabase:
   1. Ele NÃO estoura erro. Devolve { data, error }. Um try/catch
      sem olhar o `error` não pega nada — o app segue achando que
      salvou. Por isso todo acesso aqui passa por checar().
   2. Uma gravação barrada pela permissão do banco não dá erro:
      ela simplesmente afeta ZERO linhas, em silêncio. Onde isso
      pode acontecer (cadastros, para o perfil de campo), a tela
      esconde o botão em vez de deixar o usuário clicar no nada.
   ============================================================ */

import { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { hojeISO } from './dominio'

const Ctx = createContext(null)

/* Nome do cadastro na tela -> nome da tabela no banco */
const TABELA = {
  empresas: 'companies',
  colaboradores: 'workers',
  locais: 'locations',
  servicos: 'services',
  tiposOcorrencia: 'occurrence_types',
}

const SELECT_DIARIO = `
  id, worksite_id, data, status, clima, observacao, autor_id, atualizado_em,
  presencas:daily_attendance ( worker_id, company_id, presente ),
  atividades:daily_activities (
    id, planned_id, status, observacao, atualizado_via, atualizado_por, atualizado_em,
    equipe:daily_activity_workers ( worker_id )
  ),
  ocorrencias:daily_occurrences ( id, tipo_id, descricao, activity_id )
`

/* O banco devolve a equipe como lista de objetos; as telas esperam
   uma lista de ids. Normaliza aqui, num lugar só. */
function normalizarDiario(d) {
  return {
    ...d,
    presencas: d.presencas || [],
    ocorrencias: d.ocorrencias || [],
    atividades: (d.atividades || []).map((a) => ({
      ...a,
      worker_ids: (a.equipe || []).map((e) => e.worker_id),
    })),
  }
}

export function DadosProvider({ perfil, children }) {
  const [tudo, setTudo] = useState(null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  /* Marca se o componente ainda está na tela, para não tentar
     atualizar o estado de algo que já saiu.
     ATENÇÃO: religar no corpo do efeito é obrigatório. O React
     monta, desmonta e remonta cada componente em desenvolvimento
     justamente para achar descuido aqui — sem a linha de cima,
     o desmonte falso apagava o marcador para sempre e TODA carga
     de dados era descartada em silêncio. */
  const vivo = useRef(true)

  useEffect(() => {
    vivo.current = true
    return () => { vivo.current = false }
  }, [])

  const avisarErro = useCallback((mensagem) => {
    setErro(mensagem)
    setTimeout(() => vivo.current && setErro(''), 6000)
  }, [])

  /* Todo acesso ao banco passa por aqui. Sem isto, um erro de
     permissão ou de rede vira silêncio. */
  const checar = useCallback((resposta, oQue) => {
    if (resposta.error) {
      console.error(`[Prumo] ${oQue}:`, resposta.error)
      avisarErro(`Não consegui ${oQue}. ${resposta.error.message}`)
      return null
    }
    return resposta.data
  }, [avisarErro])

  // ── Carga inicial ─────────────────────────────────────────
  const recarregar = useCallback(async () => {
    const [
      org, obra, perfis, empresas, colaboradores, locais, servicos,
      tiposOcorrencia, planejamento, diarios, pendencias,
    ] = await Promise.all([
      supabase.from('organizations').select('*').limit(1).maybeSingle(),
      supabase.from('worksites').select('*').order('nome'),
      supabase.from('profiles').select('*').order('nome'),
      supabase.from('companies').select('*').order('nome'),
      supabase.from('workers').select('*').order('nome'),
      supabase.from('locations').select('*').order('ordem'),
      supabase.from('services').select('*').order('nome'),
      supabase.from('occurrence_types').select('*').order('ordem'),
      supabase.from('planned_activities').select('*').order('data', { ascending: false }),
      supabase.from('daily_reports').select(SELECT_DIARIO).order('data', { ascending: false }),
      supabase.from('issues').select('*').order('prazo', { nullsFirst: false }),
    ])

    const falhou = [org, obra, perfis, empresas, colaboradores, locais, servicos,
      tiposOcorrencia, planejamento, diarios, pendencias].find((r) => r.error)
    if (falhou) {
      console.error('[Prumo] carregar dados:', falhou.error)
      avisarErro(`Não consegui carregar os dados. ${falhou.error.message}`)
    }

    if (!vivo.current) return

    const obras = obra.data || []
    setTudo({
      org: org.data || { id: null, nome: '' },
      /* Uma obra por enquanto — a do perfil, ou a primeira que ele
         enxerga. Várias obras é assunto de outra fase. */
      obra: obras.find((o) => o.id === perfil.worksite_id) || obras[0] || { id: null, nome: 'Sem obra' },
      obras,
      perfis: perfis.data || [],
      empresas: empresas.data || [],
      colaboradores: (colaboradores.data || []).map((c) => ({ ...c, criado_em: c.created_at })),
      locais: locais.data || [],
      servicos: servicos.data || [],
      tiposOcorrencia: tiposOcorrencia.data || [],
      planejamento: planejamento.data || [],
      diarios: (diarios.data || []).map(normalizarDiario),
      pendencias: pendencias.data || [],
    })
  }, [perfil.worksite_id, avisarErro])

  useEffect(() => { recarregar() }, [recarregar])

  // ── Consultas de apoio ────────────────────────────────────
  const nomeDe = useCallback((lista, id, vazio = '—') => {
    const item = (lista || []).find((x) => x.id === id)
    return item ? item.nome : vazio
  }, [])

  const rotuloAtividade = useCallback(
    (plannedId) => {
      if (!tudo) return { servico: '…', local: '…', empresa: '…', planejada: null }
      const pl = tudo.planejamento.find((p) => p.id === plannedId)
      if (!pl) return { servico: 'Atividade removida', local: '—', empresa: '—', planejada: null }
      return {
        servico: nomeDe(tudo.servicos, pl.service_id),
        local: nomeDe(tudo.locais, pl.location_id),
        empresa: nomeDe(tudo.empresas, pl.company_id),
        planejada: pl,
      }
    },
    [tudo, nomeDe],
  )

  const colaboradorPorId = useCallback(
    (id) => (tudo ? tudo.colaboradores.find((c) => c.id === id) || null : null), [tudo],
  )
  const perfilPorId = useCallback(
    (id) => (tudo ? tudo.perfis.find((p) => p.id === id) || null : null), [tudo],
  )

  const escopo = useCallback(
    () => ({ organization_id: perfil.organization_id, worksite_id: tudo?.obra?.id }),
    [perfil.organization_id, tudo],
  )

  // ── Diário ────────────────────────────────────────────────
  /* Salva o diário inteiro: cabeçalho, presenças, frentes, quem
     trabalhou em cada frente e ocorrências.

     O detalhe que exige cuidado: enquanto o diário é rascunho na
     tela, as frentes ainda não têm identificador do banco. Elas
     são identificadas pela atividade planejada. Por isso o passo 3
     grava por (diário + atividade planejada) e devolve os
     identificadores reais, que o passo 5 usa para amarrar cada
     ocorrência à frente certa. */
  const salvarDiario = useCallback(
    async (diario) => {
      setSalvando(true)
      try {
        const { organization_id, worksite_id } = escopo()
        const agora = new Date().toISOString()

        // 1. Cabeçalho. onConflict na obra+data é a garantia de que
        //    nunca nascem dois diários para o mesmo dia.
        const cabecalho = {
          organization_id, worksite_id,
          data: diario.data,
          status: diario.status || 'rascunho',
          clima: diario.clima || null,
          observacao: diario.observacao || null,
          autor_id: diario.autor_id || perfil.id,
          atualizado_por: perfil.id,
          atualizado_em: agora,
        }
        if (diario.id) cabecalho.id = diario.id

        const salvo = checar(
          await supabase.from('daily_reports')
            .upsert(cabecalho, { onConflict: 'worksite_id,data' })
            .select('id').single(),
          'salvar o diário',
        )
        if (!salvo) return null
        const reportId = salvo.id

        // 2. Presenças: troca a lista inteira. São poucas linhas e
        //    reconciliar item a item traria mais risco que ganho.
        const apagou = await supabase.from('daily_attendance').delete().eq('report_id', reportId)
        if (apagou.error) { checar(apagou, 'atualizar as presenças'); return null }

        const presencas = (diario.presencas || []).filter((p) => p.presente)
        if (presencas.length) {
          const r = await supabase.from('daily_attendance').insert(
            presencas.map((p) => ({
              report_id: reportId, worker_id: p.worker_id,
              company_id: p.company_id, presente: true,
            })),
          )
          if (r.error) { checar(r, 'salvar as presenças'); return null }
        }

        // 3. Frentes de serviço
        let frentesSalvas = []
        if ((diario.atividades || []).length) {
          const dados = checar(
            await supabase.from('daily_activities').upsert(
              diario.atividades.map((a) => ({
                report_id: reportId,
                planned_id: a.planned_id,
                status: a.status,
                observacao: a.observacao || null,
                atualizado_por: perfil.id,
                atualizado_em: agora,
                atualizado_via: 'app',
              })),
              { onConflict: 'report_id,planned_id' },
            ).select('id, planned_id'),
            'salvar as frentes de serviço',
          )
          if (!dados) return null
          frentesSalvas = dados
        }

        // Da identificação provisória da tela para a do banco
        const idReal = {}
        diario.atividades.forEach((a) => {
          const real = frentesSalvas.find((f) => f.planned_id === a.planned_id)
          if (real) idReal[a.id] = real.id
        })

        // 4. Quem trabalhou em cada frente
        if (frentesSalvas.length) {
          const r = await supabase.from('daily_activity_workers')
            .delete().in('activity_id', frentesSalvas.map((f) => f.id))
          if (r.error) { checar(r, 'atualizar a equipe das frentes'); return null }
        }
        const equipe = (diario.atividades || []).flatMap((a) =>
          (a.worker_ids || []).map((w) => ({ activity_id: idReal[a.id], worker_id: w })),
        ).filter((e) => e.activity_id)
        if (equipe.length) {
          const r = await supabase.from('daily_activity_workers').insert(equipe)
          if (r.error) { checar(r, 'salvar a equipe das frentes'); return null }
        }

        // 5. Ocorrências
        const r = await supabase.from('daily_occurrences').delete().eq('report_id', reportId)
        if (r.error) { checar(r, 'atualizar as ocorrências'); return null }
        const ocorrencias = (diario.ocorrencias || []).filter((o) => o.tipo_id)
        if (ocorrencias.length) {
          const ins = await supabase.from('daily_occurrences').insert(
            ocorrencias.map((o) => ({
              report_id: reportId,
              tipo_id: o.tipo_id,
              descricao: o.descricao || null,
              activity_id: idReal[o.activity_id] || (o.activity_id || null),
            })),
          )
          if (ins.error) { checar(ins, 'salvar as ocorrências'); return null }
        }

        // 6. Relê do banco: o que a tela mostra a seguir é o que
        //    ficou gravado, não o que ela achava que gravou.
        const fresco = checar(
          await supabase.from('daily_reports').select(SELECT_DIARIO).eq('id', reportId).single(),
          'reler o diário',
        )
        if (!fresco) return null
        const normalizado = normalizarDiario(fresco)

        setTudo((t) => t && ({
          ...t,
          diarios: [
            normalizado,
            ...t.diarios.filter((d) => d.id !== reportId),
          ].sort((a, b) => (a.data < b.data ? 1 : -1)),
        }))
        return normalizado
      } finally {
        if (vivo.current) setSalvando(false)
      }
    },
    [perfil.id, escopo, checar],
  )

  const reabrirDiario = useCallback(
    async (id) => {
      const r = await supabase.from('daily_reports')
        .update({ status: 'rascunho', atualizado_por: perfil.id, atualizado_em: new Date().toISOString() })
        .eq('id', id)
      if (r.error) { checar(r, 'reabrir o diário'); return }
      setTudo((t) => t && ({
        ...t,
        diarios: t.diarios.map((d) => (d.id === id ? { ...d, status: 'rascunho' } : d)),
      }))
    },
    [perfil.id, checar],
  )

  // ── Colaboradores ─────────────────────────────────────────
  const criarColaboradorRapido = useCallback(
    async ({ nome, funcao, company_id }) => {
      const { organization_id, worksite_id } = escopo()
      const novo = checar(
        await supabase.from('workers').insert({
          organization_id, worksite_id, company_id,
          nome: nome.trim(), funcao: (funcao || '').trim() || null,
          provisorio: true, revisado: false, criado_por: perfil.id,
        }).select('*').single(),
        'cadastrar o colaborador',
      )
      if (!novo) return null
      const comData = { ...novo, criado_em: novo.created_at }
      setTudo((t) => t && ({ ...t, colaboradores: [...t.colaboradores, comData] }))
      return comData
    },
    [perfil.id, escopo, checar],
  )

  const revisarColaborador = useCallback(
    async (id, dados) => {
      const atualizado = checar(
        await supabase.from('workers')
          .update({ ...dados, revisado: true, provisorio: false })
          .eq('id', id).select('*').single(),
        'aprovar o colaborador',
      )
      if (!atualizado) return
      setTudo((t) => t && ({
        ...t,
        colaboradores: t.colaboradores.map((c) =>
          c.id === id ? { ...atualizado, criado_em: atualizado.created_at } : c),
      }))
    },
    [checar],
  )

  /* Mexe em três tabelas — vai inteira para o banco, numa função
     que roda em transação. Ou faz tudo, ou não faz nada. */
  const mesclarColaborador = useCallback(
    async (idDuplicado, idMantido) => {
      const r = await supabase.rpc('mesclar_colaborador', {
        duplicado: idDuplicado, mantido: idMantido,
      })
      if (r.error) { checar(r, 'mesclar os cadastros'); return }
      await recarregar()
    },
    [checar, recarregar],
  )

  // ── Pendências ────────────────────────────────────────────
  const salvarPendencia = useCallback(
    async (p) => {
      const { organization_id, worksite_id } = escopo()
      const linha = {
        organization_id, worksite_id,
        titulo: p.titulo,
        descricao: p.descricao || null,
        responsavel_id: p.responsavel_id || null,
        prioridade: p.prioridade || 'media',
        prazo: p.prazo || null,
        status: p.status || 'aberta',
        origem: p.origem || 'manual',
        origem_id: p.origem_id || null,
        autor_id: p.autor_id || perfil.id,
      }
      if (p.id) linha.id = p.id

      const salva = checar(
        await supabase.from('issues').upsert(linha).select('*').single(),
        'salvar a pendência',
      )
      if (!salva) return null
      setTudo((t) => t && ({
        ...t,
        pendencias: t.pendencias.some((x) => x.id === salva.id)
          ? t.pendencias.map((x) => (x.id === salva.id ? salva : x))
          : [...t.pendencias, salva],
      }))
      return salva
    },
    [perfil.id, escopo, checar],
  )

  const alternarPendencia = useCallback(
    async (id) => {
      const atual = tudo?.pendencias.find((p) => p.id === id)
      if (!atual) return
      const virando = atual.status === 'resolvida'
        ? { status: 'aberta', resolvido_em: null }
        : { status: 'resolvida', resolvido_em: hojeISO() }

      // Muda na tela na hora; se o banco recusar, volta atrás.
      setTudo((t) => t && ({
        ...t,
        pendencias: t.pendencias.map((p) => (p.id === id ? { ...p, ...virando } : p)),
      }))

      const r = await supabase.from('issues').update(virando).eq('id', id)
      if (r.error) {
        checar(r, 'atualizar a pendência')
        setTudo((t) => t && ({
          ...t, pendencias: t.pendencias.map((p) => (p.id === id ? atual : p)),
        }))
      }
    },
    [tudo, checar],
  )

  // ── Cadastros auxiliares ──────────────────────────────────
  const salvarCadastro = useCallback(
    async (tipo, item) => {
      const tabela = TABELA[tipo]
      if (!tabela) return null
      const { organization_id, worksite_id } = escopo()
      const { criado_em, created_at, ...limpo } = item // eslint-disable-line no-unused-vars
      const linha = { ...limpo, organization_id, worksite_id }

      const salvo = checar(
        await supabase.from(tabela).upsert(linha).select('*').single(),
        `salvar o cadastro`,
      )
      if (!salvo) return null
      const comData = tipo === 'colaboradores' ? { ...salvo, criado_em: salvo.created_at } : salvo
      setTudo((t) => t && ({
        ...t,
        [tipo]: t[tipo].some((x) => x.id === comData.id)
          ? t[tipo].map((x) => (x.id === comData.id ? comData : x))
          : [...t[tipo], comData],
      }))
      return comData
    },
    [escopo, checar],
  )

  /* Arquivar, nunca apagar: o registro já pode estar num diário
     de três meses atrás. Só inverte o campo `ativo`. */
  const arquivarCadastro = useCallback(
    async (tipo, id) => {
      const tabela = TABELA[tipo]
      if (!tabela) return
      const atual = tudo?.[tipo]?.find((x) => x.id === id)
      if (!atual) return
      const novoValor = !(atual.ativo !== false)

      const r = await supabase.from(tabela).update({ ativo: novoValor }).eq('id', id).select('id')
      if (r.error) { checar(r, 'arquivar o cadastro'); return }
      if (!r.data || r.data.length === 0) {
        avisarErro('Seu perfil não tem permissão para arquivar cadastros. Peça à gestão.')
        return
      }
      setTudo((t) => t && ({
        ...t, [tipo]: t[tipo].map((x) => (x.id === id ? { ...x, ativo: novoValor } : x)),
      }))
    },
    [tudo, checar, avisarErro],
  )

  // ── Planejamento ──────────────────────────────────────────
  const salvarPlanejado = useCallback(
    async (item) => {
      const { organization_id, worksite_id } = escopo()
      const salvo = checar(
        await supabase.from('planned_activities')
          .upsert({ ...item, organization_id, worksite_id })
          .select('*').single(),
        'salvar a frente de serviço',
      )
      if (!salvo) return null
      setTudo((t) => t && ({
        ...t,
        planejamento: t.planejamento.some((p) => p.id === salvo.id)
          ? t.planejamento.map((p) => (p.id === salvo.id ? salvo : p))
          : [...t.planejamento, salvo],
      }))
      return salvo
    },
    [escopo, checar],
  )

  const removerPlanejado = useCallback(
    async (id) => {
      const r = await supabase.from('planned_activities').delete().eq('id', id)
      if (r.error) { checar(r, 'remover do planejamento'); return }
      setTudo((t) => t && ({ ...t, planejamento: t.planejamento.filter((p) => p.id !== id) }))
    },
    [checar],
  )

  // ── Usuários (só o admin chega aqui) ──────────────────────
  const definirPapel = useCallback(
    async (usuarioId, papel) => {
      const alvo = tudo?.perfis.find((p) => p.id === usuarioId)
      const mudanca = { role: papel }
      /* Quem se cadastrou sozinho ainda não tem organização nem
         obra. Liberar o acesso é justamente colocá-lo nelas. */
      if (alvo && !alvo.organization_id) {
        mudanca.organization_id = perfil.organization_id
        mudanca.worksite_id = tudo?.obra?.id || perfil.worksite_id
      }
      const atualizado = checar(
        await supabase.from('profiles').update(mudanca).eq('id', usuarioId).select('*').single(),
        'alterar o perfil de acesso',
      )
      if (!atualizado) return
      setTudo((t) => t && ({
        ...t, perfis: t.perfis.map((p) => (p.id === usuarioId ? atualizado : p)),
      }))
    },
    [tudo, perfil, checar],
  )

  const valor = useMemo(
    () => tudo && ({
      fonte: 'supabase',
      ...tudo,
      perfil, erro, salvando, avisarErro, recarregar,
      nomeDe, rotuloAtividade, colaboradorPorId, perfilPorId,
      salvarDiario, reabrirDiario,
      criarColaboradorRapido, revisarColaborador, mesclarColaborador,
      salvarPendencia, alternarPendencia,
      salvarCadastro, arquivarCadastro,
      salvarPlanejado, removerPlanejado,
      definirPapel,
    }),
    [
      tudo, perfil, erro, salvando, avisarErro, recarregar,
      nomeDe, rotuloAtividade, colaboradorPorId, perfilPorId,
      salvarDiario, reabrirDiario, criarColaboradorRapido, revisarColaborador,
      mesclarColaborador, salvarPendencia, alternarPendencia,
      salvarCadastro, arquivarCadastro, salvarPlanejado, removerPlanejado, definirPapel,
    ],
  )

  if (!valor) {
    return (
      <div className="app">
        <div className="empty" style={{ paddingTop: 120 }}>
          Carregando os dados da obra…
          {erro && <div className="alert danger" style={{ marginTop: 20, textAlign: 'left' }}>{erro}</div>}
        </div>
      </div>
    )
  }

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useDados() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useDados precisa estar dentro de <DadosProvider>')
  return ctx
}
