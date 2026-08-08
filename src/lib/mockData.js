/* ============================================================
   DADOS DE DEMONSTRAÇÃO — 100% fictícios.
   Regra inegociável do BRIEFING (seção 8, item 8): nenhum dado
   real em seed, teste, screenshot ou commit. Nenhum nome de
   pessoa, empresa, obra ou fornecedor daqui existe.
   Os nomes de campo são os mesmos que as tabelas terão no
   Supabase — assim a Etapa 7 troca só a fonte, não as telas.
   ============================================================ */

import { hojeISO, somarDias } from './dominio'

const HOJE = hojeISO()
const d = (n) => somarDias(HOJE, n)

export const ORG = { id: 'org-demo', nome: 'Empresa Exemplo' }

export const OBRA = {
  id: 'obra-demo',
  organization_id: 'org-demo',
  nome: 'Obra Modelo',
  sigla: 'OM',
  endereco: 'Endereço de demonstração',
}

/* ── Usuários ─────────────────────────────────────────────── */

export const mockPerfis = [
  {
    id: 'u-campo',
    organization_id: 'org-demo',
    worksite_id: 'obra-demo',
    nome: 'Responsável de Campo',
    email: 'campo@example.com',
    role: 'campo',
    cargo: 'Mestre de obras',
    ativo: true,
  },
  {
    id: 'u-gestao',
    organization_id: 'org-demo',
    worksite_id: 'obra-demo',
    nome: 'Gestor Demonstração',
    email: 'gestao@example.com',
    role: 'gestao',
    cargo: 'Engenharia',
    ativo: true,
  },
  {
    id: 'u-admin',
    organization_id: 'org-demo',
    worksite_id: 'obra-demo',
    nome: 'Administrador Demonstração',
    email: 'admin@example.com',
    role: 'admin',
    cargo: 'Administração',
    ativo: true,
  },
]

/* ── Cadastros auxiliares ─────────────────────────────────── */

export const mockEmpresas = [
  { id: 'emp-1', worksite_id: 'obra-demo', nome: 'Equipe Própria', tipo: 'propria', ativo: true },
  { id: 'emp-2', worksite_id: 'obra-demo', nome: 'Empresa Exemplo A', tipo: 'empreiteira', escopo: 'Alvenaria e revestimento', ativo: true },
  { id: 'emp-3', worksite_id: 'obra-demo', nome: 'Empresa Exemplo B', tipo: 'empreiteira', escopo: 'Instalações', ativo: true },
]

export const mockColaboradores = [
  { id: 'col-1', company_id: 'emp-1', nome: 'Colaborador A', funcao: 'Encarregado', provisorio: false, revisado: true, ativo: true },
  { id: 'col-2', company_id: 'emp-1', nome: 'Colaborador B', funcao: 'Servente', provisorio: false, revisado: true, ativo: true },
  { id: 'col-3', company_id: 'emp-1', nome: 'Colaborador C', funcao: 'Almoxarife', provisorio: false, revisado: true, ativo: true },
  { id: 'col-4', company_id: 'emp-2', nome: 'Colaborador D', funcao: 'Pedreiro', provisorio: false, revisado: true, ativo: true },
  { id: 'col-5', company_id: 'emp-2', nome: 'Colaborador E', funcao: 'Pedreiro', provisorio: false, revisado: true, ativo: true },
  { id: 'col-6', company_id: 'emp-2', nome: 'Colaborador F', funcao: 'Servente', provisorio: false, revisado: true, ativo: true },
  { id: 'col-7', company_id: 'emp-2', nome: 'Colaborador G', funcao: 'Servente', provisorio: true, revisado: false, ativo: true, criado_em: d(-2), criado_por: 'u-campo' },
  { id: 'col-8', company_id: 'emp-3', nome: 'Colaborador H', funcao: 'Eletricista', provisorio: false, revisado: true, ativo: true },
  { id: 'col-9', company_id: 'emp-3', nome: 'Colaborador I', funcao: 'Encanador', provisorio: false, revisado: true, ativo: true },
  { id: 'col-10', company_id: 'emp-3', nome: 'Colaborador J', funcao: 'Ajudante', provisorio: true, revisado: false, ativo: true, criado_em: d(-1), criado_por: 'u-campo' },
]

export const mockLocais = [
  { id: 'loc-1', worksite_id: 'obra-demo', nome: 'Torre 1 — 3º pavimento', ordem: 1, ativo: true },
  { id: 'loc-2', worksite_id: 'obra-demo', nome: 'Torre 1 — 4º pavimento', ordem: 2, ativo: true },
  { id: 'loc-3', worksite_id: 'obra-demo', nome: 'Torre 1 — 5º pavimento', ordem: 3, ativo: true },
  { id: 'loc-4', worksite_id: 'obra-demo', nome: 'Térreo — área externa', ordem: 4, ativo: true },
  { id: 'loc-5', worksite_id: 'obra-demo', nome: 'Subsolo — reservatório', ordem: 5, ativo: true },
]

export const mockServicos = [
  { id: 'srv-1', worksite_id: 'obra-demo', nome: 'Alvenaria de vedação', ativo: true },
  { id: 'srv-2', worksite_id: 'obra-demo', nome: 'Reboco interno', ativo: true },
  { id: 'srv-3', worksite_id: 'obra-demo', nome: 'Contrapiso', ativo: true },
  { id: 'srv-4', worksite_id: 'obra-demo', nome: 'Instalação elétrica — infraestrutura', ativo: true },
  { id: 'srv-5', worksite_id: 'obra-demo', nome: 'Instalação hidráulica — prumadas', ativo: true },
  { id: 'srv-6', worksite_id: 'obra-demo', nome: 'Impermeabilização', ativo: true },
]

export const mockTiposOcorrencia = [
  { id: 'toc-1', nome: 'Condição climática', ativo: true },
  { id: 'toc-2', nome: 'Falta de material', ativo: true },
  { id: 'toc-3', nome: 'Ausência de mão de obra', ativo: true },
  { id: 'toc-4', nome: 'Falta ou defeito de equipamento', ativo: true },
  { id: 'toc-5', nome: 'Indisponibilidade de energia ou água', ativo: true },
  { id: 'toc-6', nome: 'Problema ou falta de projeto', ativo: true },
  { id: 'toc-7', nome: 'Falta de frente de trabalho', ativo: true },
  { id: 'toc-8', nome: 'Segurança do trabalho', ativo: true },
  { id: 'toc-9', nome: 'Outro', ativo: true },
]

/* ── Atividades planejadas ────────────────────────────────────
   O dado central do produto. A MESMA atividade é planejada aqui,
   executada no diário e (na Fase 2) avança no cronograma.
   Se virarem cadastros separados, o app vira três planilhas.    */

export const mockPlanejamento = [
  { id: 'pl-1', worksite_id: 'obra-demo', data: d(0),  service_id: 'srv-1', location_id: 'loc-3', company_id: 'emp-2', observacao: '' },
  { id: 'pl-2', worksite_id: 'obra-demo', data: d(0),  service_id: 'srv-4', location_id: 'loc-2', company_id: 'emp-3', observacao: 'Conferir prumadas antes de fechar' },
  { id: 'pl-3', worksite_id: 'obra-demo', data: d(0),  service_id: 'srv-3', location_id: 'loc-1', company_id: 'emp-1', observacao: '' },
  { id: 'pl-4', worksite_id: 'obra-demo', data: d(-1), service_id: 'srv-1', location_id: 'loc-3', company_id: 'emp-2', observacao: '' },
  { id: 'pl-5', worksite_id: 'obra-demo', data: d(-1), service_id: 'srv-2', location_id: 'loc-1', company_id: 'emp-2', observacao: '' },
  { id: 'pl-6', worksite_id: 'obra-demo', data: d(-1), service_id: 'srv-5', location_id: 'loc-5', company_id: 'emp-3', observacao: '' },
  { id: 'pl-7', worksite_id: 'obra-demo', data: d(-2), service_id: 'srv-1', location_id: 'loc-2', company_id: 'emp-2', observacao: '' },
  { id: 'pl-8', worksite_id: 'obra-demo', data: d(-2), service_id: 'srv-6', location_id: 'loc-4', company_id: 'emp-1', observacao: '' },
  { id: 'pl-9', worksite_id: 'obra-demo', data: d(1),  service_id: 'srv-2', location_id: 'loc-3', company_id: 'emp-2', observacao: '' },
  { id: 'pl-10', worksite_id: 'obra-demo', data: d(1), service_id: 'srv-4', location_id: 'loc-3', company_id: 'emp-3', observacao: '' },
]

/* ── Diários ──────────────────────────────────────────────────
   Presenças, atividades executadas e ocorrências vivem dentro do
   diário. O efetivo (tela) é derivado daqui, nunca digitado.     */

const presenca = (ids, empresaId) =>
  ids.map((id) => ({ worker_id: id, company_id: empresaId, presente: true }))

export const mockDiarios = [
  {
    id: 'dia-2',
    worksite_id: 'obra-demo',
    data: d(-1),
    status: 'finalizado',
    clima: 'Bom',
    autor_id: 'u-campo',
    criado_em: d(-1),
    atualizado_em: d(-1),
    observacao: 'Dia sem intercorrência relevante.',
    presencas: [
      ...presenca(['col-1', 'col-2', 'col-3'], 'emp-1'),
      ...presenca(['col-4', 'col-5', 'col-6', 'col-7'], 'emp-2'),
      ...presenca(['col-8', 'col-9'], 'emp-3'),
    ],
    atividades: [
      { id: 'da-1', planned_id: 'pl-4', status: 'concluida', worker_ids: ['col-4', 'col-5', 'col-6'], observacao: 'Pano concluído', atualizado_via: 'app', atualizado_por: 'u-campo' },
      { id: 'da-2', planned_id: 'pl-5', status: 'em_andamento', worker_ids: ['col-7'], observacao: '', atualizado_via: 'app', atualizado_por: 'u-campo' },
      { id: 'da-3', planned_id: 'pl-6', status: 'em_andamento', worker_ids: ['col-8', 'col-9'], observacao: '', atualizado_via: 'app', atualizado_por: 'u-campo' },
    ],
    ocorrencias: [
      { id: 'oc-1', tipo_id: 'toc-2', descricao: 'Argamassa entregue em quantidade menor que a solicitada.', activity_id: 'da-2' },
    ],
  },
  {
    id: 'dia-3',
    worksite_id: 'obra-demo',
    data: d(-2),
    status: 'finalizado',
    clima: 'Chuva pela manhã',
    autor_id: 'u-campo',
    criado_em: d(-2),
    atualizado_em: d(-2),
    observacao: '',
    presencas: [
      ...presenca(['col-1', 'col-2'], 'emp-1'),
      ...presenca(['col-4', 'col-5'], 'emp-2'),
      ...presenca(['col-8'], 'emp-3'),
    ],
    atividades: [
      { id: 'da-4', planned_id: 'pl-7', status: 'em_andamento', worker_ids: ['col-4', 'col-5'], observacao: '', atualizado_via: 'app', atualizado_por: 'u-campo' },
      { id: 'da-5', planned_id: 'pl-8', status: 'nao_iniciada', worker_ids: [], observacao: 'Não iniciada por causa da chuva', atualizado_via: 'app', atualizado_por: 'u-campo' },
    ],
    ocorrencias: [
      { id: 'oc-2', tipo_id: 'toc-1', descricao: 'Chuva forte até as 10h, serviço externo parado.', activity_id: 'da-5' },
    ],
  },
]

/* ── Pendências ───────────────────────────────────────────── */

export const mockPendencias = [
  {
    id: 'pen-1', worksite_id: 'obra-demo',
    titulo: 'Revisar detalhe de impermeabilização do reservatório',
    descricao: 'O detalhe da prancha não bate com a execução no subsolo.',
    responsavel_id: 'u-gestao', prioridade: 'alta', prazo: d(-3), status: 'aberta',
    origem: 'diario', origem_id: 'dia-3', autor_id: 'u-campo', criado_em: d(-6),
  },
  {
    id: 'pen-2', worksite_id: 'obra-demo',
    titulo: 'Repor argamassa no 5º pavimento',
    descricao: 'Saldo insuficiente para fechar o pano de alvenaria.',
    responsavel_id: 'u-gestao', prioridade: 'alta', prazo: d(-1), status: 'aberta',
    origem: 'diario', origem_id: 'dia-2', autor_id: 'u-campo', criado_em: d(-1),
  },
  {
    id: 'pen-3', worksite_id: 'obra-demo',
    titulo: 'Instalar guarda-corpo provisório no 4º pavimento',
    descricao: 'Apontado na inspeção de segurança.',
    responsavel_id: 'u-campo', prioridade: 'alta', prazo: d(0), status: 'aberta',
    origem: 'manual', autor_id: 'u-gestao', criado_em: d(-2),
  },
  {
    id: 'pen-4', worksite_id: 'obra-demo',
    titulo: 'Conferir documentação dos colaboradores provisórios',
    descricao: 'Dois cadastros feitos direto no campo aguardam conferência.',
    responsavel_id: 'u-gestao', prioridade: 'media', prazo: d(3), status: 'aberta',
    origem: 'manual', autor_id: 'u-gestao', criado_em: d(-1),
  },
  {
    id: 'pen-5', worksite_id: 'obra-demo',
    titulo: 'Definir local de estoque da cerâmica',
    descricao: '',
    responsavel_id: 'u-campo', prioridade: 'baixa', prazo: null, status: 'aberta',
    origem: 'manual', autor_id: 'u-gestao', criado_em: d(-4),
  },
  {
    id: 'pen-6', worksite_id: 'obra-demo',
    titulo: 'Liberar frente de serviço no 3º pavimento',
    descricao: 'Retirada de entulho concluída.',
    responsavel_id: 'u-campo', prioridade: 'media', prazo: d(-5), status: 'resolvida',
    origem: 'manual', autor_id: 'u-gestao', criado_em: d(-8), resolvido_em: d(-5),
  },
]
