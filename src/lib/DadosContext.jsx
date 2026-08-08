/* ============================================================
   ESTADO GLOBAL — carrega os dados uma vez e compartilha com
   todas as telas. Toda gravação passa por aqui, nunca direto na
   tela: é isso que garante que o contador do menu, o início e a
   tela de detalhe mostrem sempre o mesmo número.

   Enquanto USAR_MOCK for true, "gravar" é alterar a memória do
   navegador. Na Etapa 7 o corpo destas funções vira chamada ao
   Supabase — as telas não mudam nem uma linha.
   ============================================================ */

import { createContext, useContext, useMemo, useState, useCallback } from 'react'
import { USAR_MOCK } from './config'
import {
  OBRA, ORG,
  mockPerfis, mockEmpresas, mockColaboradores, mockLocais, mockServicos,
  mockTiposOcorrencia, mockPlanejamento, mockDiarios, mockPendencias,
} from './mockData'
import { hojeISO } from './dominio'

const Ctx = createContext(null)

const novoId = (prefixo) =>
  `${prefixo}-${(globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random())).slice(0, 8)}`

/* Substitui um item da lista pelo id, ou acrescenta se for novo. */
function upsert(lista, item) {
  const i = lista.findIndex((x) => x.id === item.id)
  if (i === -1) return [...lista, item]
  const copia = [...lista]
  copia[i] = { ...copia[i], ...item }
  return copia
}

export function DadosProvider({ perfil, children }) {
  const [perfis, setPerfis] = useState(mockPerfis)
  const [empresas, setEmpresas] = useState(mockEmpresas)
  const [colaboradores, setColaboradores] = useState(mockColaboradores)
  const [locais, setLocais] = useState(mockLocais)
  const [servicos, setServicos] = useState(mockServicos)
  const [tiposOcorrencia, setTiposOcorrencia] = useState(mockTiposOcorrencia)
  const [planejamento, setPlanejamento] = useState(mockPlanejamento)
  const [diarios, setDiarios] = useState(mockDiarios)
  const [pendencias, setPendencias] = useState(mockPendencias)

  /* ── Consultas de apoio (nome a partir do id) ───────────── */

  const nomeDe = useCallback((lista, id, vazio = '—') => {
    const item = lista.find((x) => x.id === id)
    return item ? item.nome : vazio
  }, [])

  const rotuloAtividade = useCallback(
    (plannedId) => {
      const pl = planejamento.find((p) => p.id === plannedId)
      if (!pl) return { servico: 'Atividade removida', local: '—', empresa: '—', planejada: null }
      return {
        servico: nomeDe(servicos, pl.service_id),
        local: nomeDe(locais, pl.location_id),
        empresa: nomeDe(empresas, pl.company_id),
        planejada: pl,
      }
    },
    [planejamento, servicos, locais, empresas, nomeDe],
  )

  const colaboradorPorId = useCallback(
    (id) => colaboradores.find((c) => c.id === id) || null,
    [colaboradores],
  )

  const perfilPorId = useCallback((id) => perfis.find((p) => p.id === id) || null, [perfis])

  /* ── Diário ─────────────────────────────────────────────── */

  const salvarDiario = useCallback(
    (diario) => {
      const completo = {
        worksite_id: OBRA.id,
        autor_id: diario.autor_id || perfil?.id || null,
        criado_em: diario.criado_em || hojeISO(),
        atualizado_em: hojeISO(),
        presencas: [],
        atividades: [],
        ocorrencias: [],
        ...diario,
        id: diario.id || novoId('dia'),
      }
      setDiarios((l) => upsert(l, completo))
      return completo
    },
    [perfil],
  )

  const reabrirDiario = useCallback((id) => {
    setDiarios((l) => l.map((d) => (d.id === id ? { ...d, status: 'rascunho', atualizado_em: hojeISO() } : d)))
  }, [])

  /* ── Colaboradores ──────────────────────────────────────── */

  /* Cadastro rápido feito de dentro do diário: entra provisório e
     cai na fila de revisão da gestão. Nunca some sem conferência. */
  const criarColaboradorRapido = useCallback(
    ({ nome, funcao, company_id }) => {
      const novo = {
        id: novoId('col'), nome: nome.trim(), funcao: funcao?.trim() || '',
        company_id, provisorio: true, revisado: false, ativo: true,
        criado_em: hojeISO(), criado_por: perfil?.id || null,
      }
      setColaboradores((l) => [...l, novo])
      return novo
    },
    [perfil],
  )

  const salvarColaborador = useCallback((col) => {
    const completo = { ativo: true, provisorio: false, revisado: true, ...col, id: col.id || novoId('col') }
    setColaboradores((l) => upsert(l, completo))
    return completo
  }, [])

  const revisarColaborador = useCallback((id, dados) => {
    setColaboradores((l) =>
      l.map((c) => (c.id === id ? { ...c, ...dados, revisado: true, provisorio: false } : c)),
    )
  }, [])

  /* Mesclar duplicidade: as presenças já lançadas apontam para o
     mantido; o duplicado é arquivado, nunca apagado (BRIEFING 8.5). */
  const mesclarColaborador = useCallback((idDuplicado, idMantido) => {
    setDiarios((ds) =>
      ds.map((d) => ({
        ...d,
        presencas: (d.presencas || [])
          .map((p) => (p.worker_id === idDuplicado ? { ...p, worker_id: idMantido } : p))
          .filter((p, i, arr) => arr.findIndex((x) => x.worker_id === p.worker_id) === i),
        atividades: (d.atividades || []).map((a) => ({
          ...a,
          worker_ids: [...new Set((a.worker_ids || []).map((w) => (w === idDuplicado ? idMantido : w)))],
        })),
      })),
    )
    setColaboradores((l) =>
      l.map((c) => (c.id === idDuplicado ? { ...c, ativo: false, mesclado_em: idMantido, revisado: true } : c)),
    )
  }, [])

  /* ── Pendências ─────────────────────────────────────────── */

  const salvarPendencia = useCallback(
    (p) => {
      const completo = {
        worksite_id: OBRA.id, status: 'aberta', prioridade: 'media', origem: 'manual',
        autor_id: perfil?.id || null, criado_em: hojeISO(),
        ...p, id: p.id || novoId('pen'),
      }
      setPendencias((l) => upsert(l, completo))
      return completo
    },
    [perfil],
  )

  const alternarPendencia = useCallback((id) => {
    setPendencias((l) =>
      l.map((p) =>
        p.id === id
          ? p.status === 'resolvida'
            ? { ...p, status: 'aberta', resolvido_em: null }
            : { ...p, status: 'resolvida', resolvido_em: hojeISO() }
          : p,
      ),
    )
  }, [])

  /* ── Cadastros auxiliares ───────────────────────────────── */

  const setterDe = {
    empresas: setEmpresas,
    colaboradores: setColaboradores,
    locais: setLocais,
    servicos: setServicos,
    tiposOcorrencia: setTiposOcorrencia,
  }

  const salvarCadastro = useCallback((tipo, item) => {
    const set = setterDe[tipo]
    if (!set) return null
    const completo = { ativo: true, ...item, id: item.id || novoId(tipo.slice(0, 3)) }
    set((l) => upsert(l, completo))
    return completo
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* Arquivar, nunca apagar: o registro já pode estar em um diário. */
  const arquivarCadastro = useCallback((tipo, id) => {
    const set = setterDe[tipo]
    if (!set) return
    set((l) => l.map((x) => (x.id === id ? { ...x, ativo: !(x.ativo !== false) } : x)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Planejamento ───────────────────────────────────────── */

  const salvarPlanejado = useCallback((item) => {
    const completo = { worksite_id: OBRA.id, ...item, id: item.id || novoId('pl') }
    setPlanejamento((l) => upsert(l, completo))
    return completo
  }, [])

  const removerPlanejado = useCallback((id) => {
    setPlanejamento((l) => l.filter((p) => p.id !== id))
  }, [])

  const valor = useMemo(
    () => ({
      fonte: USAR_MOCK ? 'demonstração' : 'supabase',
      org: ORG, obra: OBRA, perfil,
      perfis, empresas, colaboradores, locais, servicos, tiposOcorrencia,
      planejamento, diarios, pendencias,
      nomeDe, rotuloAtividade, colaboradorPorId, perfilPorId,
      salvarDiario, reabrirDiario,
      criarColaboradorRapido, salvarColaborador, revisarColaborador, mesclarColaborador,
      salvarPendencia, alternarPendencia,
      salvarCadastro, arquivarCadastro,
      salvarPlanejado, removerPlanejado,
      setPerfis,
    }),
    [
      perfil, perfis, empresas, colaboradores, locais, servicos, tiposOcorrencia,
      planejamento, diarios, pendencias,
      nomeDe, rotuloAtividade, colaboradorPorId, perfilPorId,
      salvarDiario, reabrirDiario,
      criarColaboradorRapido, salvarColaborador, revisarColaborador, mesclarColaborador,
      salvarPendencia, alternarPendencia, salvarCadastro, arquivarCadastro,
      salvarPlanejado, removerPlanejado,
    ],
  )

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useDados() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useDados precisa estar dentro de <DadosProvider>')
  return ctx
}
