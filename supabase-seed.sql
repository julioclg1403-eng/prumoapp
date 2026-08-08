-- ============================================================
-- SEED — dados de demonstração do Prumo.
--
-- Tudo aqui é FICTÍCIO. Nenhum nome de pessoa, empresa, obra ou
-- fornecedor deste arquivo existe (BRIEFING, seção 8, item 8).
--
-- Pode rodar quantas vezes quiser: os identificadores são
-- derivados de um texto fixo (md5(...)::uuid), então rodar de
-- novo não duplica nada.
--
-- As datas são relativas a HOJE, para a demonstração nunca
-- parecer abandonada.
--
-- E "hoje" é o hoje de SÃO PAULO, não o do servidor. O banco vive
-- em UTC: depois das 21h no Brasil o servidor já virou o dia, e
-- usar current_date faria a demonstração nascer um dia adiantada
-- — com diário de hoje já finalizado e prazos deslocados.
-- É a mesma armadilha da regra 4 do briefing, do outro lado.
-- ============================================================

-- ── Organização e obra ──────────────────────────────────────
insert into public.organizations (id, nome)
values (md5('prumo:org')::uuid, 'Empresa Exemplo')
on conflict (id) do nothing;

insert into public.worksites (id, organization_id, nome, sigla, endereco)
values (md5('prumo:obra')::uuid, md5('prumo:org')::uuid,
        'Obra Modelo', 'OM', 'Endereço de demonstração')
on conflict (id) do nothing;

-- ── Usuários de acesso ──────────────────────────────────────
-- O gatilho on_auth_user_created cria o perfil sozinho, já com
-- papel e organização, lendo o que vai em raw_user_meta_data.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000',
  md5('prumo:user:' || u.chave)::uuid,
  'authenticated', 'authenticated', u.email,
  crypt('PrumoDemo2026', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object(
    'nome', u.nome, 'cargo', u.cargo, 'role', u.papel,
    'organization_id', md5('prumo:org')::text,
    'worksite_id', md5('prumo:obra')::text
  ),
  '', '', '', ''
from (values
  ('campo',  'campo@example.com',  'Responsável de Campo',        'Mestre de obras', 'campo'),
  ('gestao', 'gestao@example.com', 'Gestor Demonstração',         'Engenharia',      'gestao'),
  ('admin',  'admin@example.com',  'Administrador Demonstração',  'Administração',   'admin')
) as u(chave, email, nome, cargo, papel)
on conflict (id) do nothing;

-- Sem a identidade, o login por e-mail e senha não fecha.
insert into auth.identities (id, user_id, identity_data, provider, provider_id,
                             last_sign_in_at, created_at, updated_at)
select
  gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email', u.id::text, now(), now(), now()
from auth.users u
where u.email in ('campo@example.com', 'gestao@example.com', 'admin@example.com')
  and not exists (
    select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
  );

-- ── Empresas ────────────────────────────────────────────────
insert into public.companies (id, organization_id, worksite_id, nome, tipo, escopo)
values
  (md5('prumo:emp:1')::uuid, md5('prumo:org')::uuid, md5('prumo:obra')::uuid, 'Equipe Própria',    'propria',     null),
  (md5('prumo:emp:2')::uuid, md5('prumo:org')::uuid, md5('prumo:obra')::uuid, 'Empresa Exemplo A', 'empreiteira', 'Alvenaria e revestimento'),
  (md5('prumo:emp:3')::uuid, md5('prumo:org')::uuid, md5('prumo:obra')::uuid, 'Empresa Exemplo B', 'empreiteira', 'Instalações')
on conflict (id) do nothing;

-- ── Colaboradores ───────────────────────────────────────────
-- Os dois provisórios são de propósito: alimentam a fila de
-- revisão da gestão, que é um dos módulos da v1.
insert into public.workers (id, organization_id, worksite_id, company_id, nome, funcao,
                            provisorio, revisado, criado_por, created_at)
select
  md5('prumo:col:' || w.n)::uuid, md5('prumo:org')::uuid, md5('prumo:obra')::uuid,
  md5('prumo:emp:' || w.emp)::uuid, w.nome, w.funcao,
  w.provisorio, not w.provisorio,
  case when w.provisorio then md5('prumo:user:campo')::uuid end,
  now() - (w.dias || ' days')::interval
from (values
  ('1',  '1', 'Colaborador A', 'Encarregado', false, 30),
  ('2',  '1', 'Colaborador B', 'Servente',    false, 30),
  ('3',  '1', 'Colaborador C', 'Almoxarife',  false, 30),
  ('4',  '2', 'Colaborador D', 'Pedreiro',    false, 30),
  ('5',  '2', 'Colaborador E', 'Pedreiro',    false, 30),
  ('6',  '2', 'Colaborador F', 'Servente',    false, 30),
  ('7',  '2', 'Colaborador G', 'Servente',    true,   2),
  ('8',  '3', 'Colaborador H', 'Eletricista', false, 30),
  ('9',  '3', 'Colaborador I', 'Encanador',   false, 30),
  ('10', '3', 'Colaborador J', 'Ajudante',    true,   1)
) as w(n, emp, nome, funcao, provisorio, dias)
on conflict (id) do nothing;

-- ── Locais ──────────────────────────────────────────────────
insert into public.locations (id, organization_id, worksite_id, nome, ordem)
select md5('prumo:loc:' || l.n)::uuid, md5('prumo:org')::uuid, md5('prumo:obra')::uuid, l.nome, l.ordem
from (values
  ('1', 'Torre 1 — 3º pavimento',     1),
  ('2', 'Torre 1 — 4º pavimento',     2),
  ('3', 'Torre 1 — 5º pavimento',     3),
  ('4', 'Térreo — área externa',      4),
  ('5', 'Subsolo — reservatório',     5)
) as l(n, nome, ordem)
on conflict (id) do nothing;

-- ── Serviços ────────────────────────────────────────────────
insert into public.services (id, organization_id, worksite_id, nome)
select md5('prumo:srv:' || s.n)::uuid, md5('prumo:org')::uuid, md5('prumo:obra')::uuid, s.nome
from (values
  ('1', 'Alvenaria de vedação'),
  ('2', 'Reboco interno'),
  ('3', 'Contrapiso'),
  ('4', 'Instalação elétrica — infraestrutura'),
  ('5', 'Instalação hidráulica — prumadas'),
  ('6', 'Impermeabilização')
) as s(n, nome)
on conflict (id) do nothing;

-- ── Tipos de ocorrência ─────────────────────────────────────
insert into public.occurrence_types (id, organization_id, worksite_id, nome, ordem)
select md5('prumo:toc:' || t.n)::uuid, md5('prumo:org')::uuid, md5('prumo:obra')::uuid, t.nome, t.ordem
from (values
  ('1', 'Condição climática',                    1),
  ('2', 'Falta de material',                     2),
  ('3', 'Ausência de mão de obra',               3),
  ('4', 'Falta ou defeito de equipamento',       4),
  ('5', 'Indisponibilidade de energia ou água',  5),
  ('6', 'Problema ou falta de projeto',          6),
  ('7', 'Falta de frente de trabalho',           7),
  ('8', 'Segurança do trabalho',                 8),
  ('9', 'Outro',                                 9)
) as t(n, nome, ordem)
on conflict (id) do nothing;

-- ── Planejamento ────────────────────────────────────────────
-- Estas são as atividades que o diário vai executar. Uma coisa
-- só, em dois momentos — não dois cadastros.
insert into public.planned_activities (id, organization_id, worksite_id, data,
                                       service_id, location_id, company_id, observacao)
select
  md5('prumo:pl:' || p.n)::uuid, md5('prumo:org')::uuid, md5('prumo:obra')::uuid,
  (now() at time zone 'America/Sao_Paulo')::date + p.deslocamento,
  md5('prumo:srv:' || p.srv)::uuid,
  md5('prumo:loc:' || p.loc)::uuid,
  md5('prumo:emp:' || p.emp)::uuid,
  nullif(p.obs, '')
from (values
  ('1',   0, '1', '3', '2', ''),
  ('2',   0, '4', '2', '3', 'Conferir prumadas antes de fechar'),
  ('3',   0, '3', '1', '1', ''),
  ('4',  -1, '1', '3', '2', ''),
  ('5',  -1, '2', '1', '2', ''),
  ('6',  -1, '5', '5', '3', ''),
  ('7',  -2, '1', '2', '2', ''),
  ('8',  -2, '6', '4', '1', ''),
  ('9',   1, '2', '3', '2', ''),
  ('10',  1, '4', '3', '3', '')
) as p(n, deslocamento, srv, loc, emp, obs)
on conflict (id) do nothing;

-- ── Diários ─────────────────────────────────────────────────
insert into public.daily_reports (id, organization_id, worksite_id, data, status,
                                  clima, observacao, autor_id)
select
  md5('prumo:dia:' || d.n)::uuid, md5('prumo:org')::uuid, md5('prumo:obra')::uuid,
  (now() at time zone 'America/Sao_Paulo')::date + d.deslocamento, 'finalizado', d.clima, nullif(d.obs, ''),
  md5('prumo:user:campo')::uuid
from (values
  ('2', -1, 'Bom',               'Dia sem intercorrência relevante.'),
  ('3', -2, 'Chuva pela manhã',  '')
) as d(n, deslocamento, clima, obs)
on conflict (id) do nothing;

-- Presenças
insert into public.daily_attendance (report_id, worker_id, company_id, presente)
select md5('prumo:dia:' || a.dia)::uuid, md5('prumo:col:' || a.col)::uuid,
       md5('prumo:emp:' || a.emp)::uuid, true
from (values
  ('2','1','1'), ('2','2','1'), ('2','3','1'),
  ('2','4','2'), ('2','5','2'), ('2','6','2'), ('2','7','2'),
  ('2','8','3'), ('2','9','3'),
  ('3','1','1'), ('3','2','1'),
  ('3','4','2'), ('3','5','2'),
  ('3','8','3')
) as a(dia, col, emp)
on conflict on constraint presenca_unica do nothing;

-- Atividades executadas
insert into public.daily_activities (id, report_id, planned_id, status, observacao, atualizado_por)
select
  md5('prumo:da:' || x.n)::uuid,
  md5('prumo:dia:' || x.dia)::uuid,
  md5('prumo:pl:' || x.pl)::uuid,
  x.status, nullif(x.obs, ''), md5('prumo:user:campo')::uuid
from (values
  ('1', '2', '4', 'concluida',    'Pano concluído'),
  ('2', '2', '5', 'em_andamento', ''),
  ('3', '2', '6', 'em_andamento', ''),
  ('4', '3', '7', 'em_andamento', ''),
  ('5', '3', '8', 'nao_iniciada', 'Não iniciada por causa da chuva')
) as x(n, dia, pl, status, obs)
on conflict (id) do nothing;

-- Quem trabalhou em cada frente
insert into public.daily_activity_workers (activity_id, worker_id)
select md5('prumo:da:' || w.da)::uuid, md5('prumo:col:' || w.col)::uuid
from (values
  ('1','4'), ('1','5'), ('1','6'),
  ('2','7'),
  ('3','8'), ('3','9'),
  ('4','4'), ('4','5')
) as w(da, col)
on conflict do nothing;

-- Ocorrências
insert into public.daily_occurrences (id, report_id, tipo_id, descricao, activity_id)
select
  md5('prumo:oc:' || o.n)::uuid,
  md5('prumo:dia:' || o.dia)::uuid,
  md5('prumo:toc:' || o.tipo)::uuid,
  o.descricao,
  md5('prumo:da:' || o.da)::uuid
from (values
  ('1', '2', '2', 'Argamassa entregue em quantidade menor que a solicitada.', '2'),
  ('2', '3', '1', 'Chuva forte até as 10h, serviço externo parado.',          '5')
) as o(n, dia, tipo, descricao, da)
on conflict (id) do nothing;

-- ── Pendências ──────────────────────────────────────────────
-- Duas já nascem vencidas, para a tela de atrasadas ter conteúdo.
insert into public.issues (id, organization_id, worksite_id, titulo, descricao,
                           responsavel_id, prioridade, prazo, status, origem, origem_id,
                           autor_id, created_at, resolvido_em)
select
  md5('prumo:pen:' || p.n)::uuid, md5('prumo:org')::uuid, md5('prumo:obra')::uuid,
  p.titulo, nullif(p.descricao, ''),
  md5('prumo:user:' || p.responsavel)::uuid,
  p.prioridade,
  case when p.prazo is null then null else (now() at time zone 'America/Sao_Paulo')::date + p.prazo end,
  p.status, p.origem,
  case when p.origem = 'diario' then md5('prumo:dia:' || p.origem_ref)::uuid end,
  md5('prumo:user:' || p.autor)::uuid,
  now() - (p.criado_ha || ' days')::interval,
  case when p.resolvido is null then null else (now() at time zone 'America/Sao_Paulo')::date + p.resolvido end
from (values
  ('1', 'Revisar detalhe de impermeabilização do reservatório',
        'O detalhe da prancha não bate com a execução no subsolo.',
        'gestao', 'alta', -3, 'aberta',    'diario', '3', 'campo',  6, null),
  ('2', 'Repor argamassa no 5º pavimento',
        'Saldo insuficiente para fechar o pano de alvenaria.',
        'gestao', 'alta', -1, 'aberta',    'diario', '2', 'campo',  1, null),
  ('3', 'Instalar guarda-corpo provisório no 4º pavimento',
        'Apontado na inspeção de segurança.',
        'campo',  'alta',  0, 'aberta',    'manual', '',  'gestao', 2, null),
  ('4', 'Conferir documentação dos colaboradores provisórios',
        'Dois cadastros feitos direto no campo aguardam conferência.',
        'gestao', 'media', 3, 'aberta',    'manual', '',  'gestao', 1, null),
  ('5', 'Definir local de estoque da cerâmica',
        '',
        'campo',  'baixa', null, 'aberta', 'manual', '',  'gestao', 4, null),
  ('6', 'Liberar frente de serviço no 3º pavimento',
        'Retirada de entulho concluída.',
        'campo',  'media', -5, 'resolvida','manual', '',  'gestao', 8, -5)
) as p(n, titulo, descricao, responsavel, prioridade, prazo, status, origem,
       origem_ref, autor, criado_ha, resolvido)
on conflict (id) do nothing;
