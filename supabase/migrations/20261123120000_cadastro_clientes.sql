-- ============================================================
-- CADASTRO DE CLIENTE (self-service)
--
-- Quem cria conta no Prumo passa a poder abrir a PRÓPRIA empresa e a
-- primeira obra, sozinho. Cada empresa é uma organização: o banco já
-- separa tudo por organization_id, então um cliente nunca vê outro,
-- e a Fama não vê ninguém (nem ninguém vê a Fama).
--
-- A trava protege_papel continua valendo para todo mundo. A única
-- exceção: usuário SEM organização, dentro de criar_minha_organizacao,
-- entrando na organização que a própria função acabou de criar.
-- ============================================================

-- 1) Trava com a exceção estreita do cadastro.
create or replace function private.protege_papel()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  papel_de_quem_edita text;
begin
  /* Cadastro de cliente novo: só vale se a pessoa não tinha
     organização e a função de cadastro marcou, nesta transação,
     exatamente a organização que está sendo atribuída. Quem chama
     o banco pelo app não consegue marcar isso. */
  if old.organization_id is null
     and new.organization_id is not null
     and current_setting('prumo.cadastro', true) = new.organization_id::text then
    return new;
  end if;

  select role into papel_de_quem_edita from public.profiles where id = auth.uid();

  if new.role is distinct from old.role and coalesce(papel_de_quem_edita, '') <> 'admin' then
    raise exception 'Somente um administrador pode alterar o papel de um usuário.';
  end if;
  if new.organization_id is distinct from old.organization_id and coalesce(papel_de_quem_edita, '') <> 'admin' then
    raise exception 'Somente um administrador pode mover um usuário de organização.';
  end if;
  if new.modulos_permitidos is distinct from old.modulos_permitidos and coalesce(papel_de_quem_edita, '') <> 'admin' then
    raise exception 'Somente um administrador pode alterar os módulos liberados.';
  end if;
  if new.obras_permitidas is distinct from old.obras_permitidas and coalesce(papel_de_quem_edita, '') <> 'admin' then
    raise exception 'Somente um administrador pode alterar as obras liberadas.';
  end if;
  return new;
end;
$$;

-- 2) Dados de exemplo (100% fictícios), datas relativas a hoje em São Paulo.
create or replace function public.carregar_exemplo(p_org uuid, p_obra uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  k text := p_obra::text;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into companies (id, organization_id, worksite_id, nome, tipo, escopo)
  select md5(k||':emp:'||e.n)::uuid, p_org, p_obra, e.nome, e.tipo, e.escopo
  from (values (1,'Equipe Própria','propria',null),(2,'Alvenaria Exemplo Ltda','empreiteira','Alvenaria e revestimento'),(3,'Instalações Exemplo','empreiteira','Elétrica e hidráulica'),(4,'Estruturas Exemplo','empreiteira','Formas, armação e concretagem')) as e(n,nome,tipo,escopo)
  on conflict (id) do nothing;

  insert into workers (id, organization_id, worksite_id, company_id, nome, funcao, provisorio, revisado)
  select md5(k||':col:'||w.n)::uuid, p_org, p_obra, md5(k||':emp:'||w.emp)::uuid, w.nome, w.funcao, false, true
  from (values (1,1,'Carlos','Encarregado'),(2,1,'Edson','Servente'),(3,1,'Jorge','Almoxarife'),(4,2,'Marcos','Pedreiro'),(5,2,'Paulo','Pedreiro'),(6,2,'Rafael','Servente'),(7,2,'Sandro','Servente'),(8,3,'Tiago','Eletricista'),(9,3,'Valdir','Encanador'),(10,3,'Wesley','Ajudante'),(11,4,'Anderson','Carpinteiro'),(12,4,'Bruno','Armador'),(13,4,'Cláudio','Carpinteiro'),(14,4,'Diego','Armador')) as w(n,emp,nome,funcao)
  on conflict (id) do nothing;

  insert into locations (id, organization_id, worksite_id, nome, ordem)
  select md5(k||':loc:'||l.n)::uuid, p_org, p_obra, l.nome, l.n
  from (values (1,'Torre 1 — 2º pavimento'),(2,'Torre 1 — 3º pavimento'),(3,'Torre 1 — 4º pavimento'),(4,'Térreo — área externa'),(5,'Subsolo — reservatório')) as l(n,nome)
  on conflict (id) do nothing;

  insert into services (id, organization_id, worksite_id, nome)
  select md5(k||':srv:'||s.n)::uuid, p_org, p_obra, s.nome
  from (values (1,'Formas de pilares e vigas'),(2,'Armação de laje'),(3,'Concretagem de laje'),(4,'Alvenaria de vedação'),(5,'Reboco interno'),(6,'Contrapiso'),(7,'Instalação elétrica — infraestrutura'),(8,'Instalação hidráulica — prumadas'),(9,'Impermeabilização')) as s(n,nome)
  on conflict (id) do nothing;

  insert into planned_activities (id, organization_id, worksite_id, data, service_id, location_id, company_id, observacao)
  select md5(k||':pl:'||d||':'||n)::uuid, p_org, p_obra, hoje + d,
    md5(k||':srv:'||sv)::uuid, md5(k||':loc:'||(((d+6)+n)%5+1))::uuid,
    md5(k||':emp:'||(case when sv<=3 then 4 when sv<=6 then 2 else 3 end))::uuid, null
  from (select d, n, (((d+6)*3+n-1)%9+1) as sv from generate_series(-6,1) d cross join generate_series(1,3) n) x
  on conflict (id) do nothing;

  insert into daily_reports (id, organization_id, worksite_id, data, status, clima, observacao)
  select md5(k||':dia:'||d)::uuid, p_org, p_obra, hoje + d, 'finalizado',
    (array['Bom','Bom','Nublado','Chuva pela manhã','Bom','Bom'])[d+7],
    case when d=-4 then 'Chuva até 10h, serviços externos retomados à tarde.' when d=-1 then 'Dia sem intercorrência relevante.' end
  from generate_series(-6,-1) d
  on conflict (id) do nothing;

  insert into daily_attendance (report_id, worker_id, company_id, presente)
  select md5(k||':dia:'||d)::uuid, md5(k||':col:'||w.n)::uuid, md5(k||':emp:'||w.emp)::uuid, true
  from generate_series(-6,-1) d
  cross join (values (1,1),(2,1),(3,1),(4,2),(5,2),(6,2),(7,2),(8,3),(9,3),(10,3),(11,4),(12,4),(13,4),(14,4)) as w(n,emp)
  where (w.n + d + 10) % 5 <> 0
  on conflict on constraint presenca_unica do nothing;

  insert into daily_activities (id, report_id, planned_id, status, observacao)
  select md5(k||':da:'||d||':'||n)::uuid, md5(k||':dia:'||d)::uuid, md5(k||':pl:'||d||':'||n)::uuid,
    case when n=1 and abs(d)%2=0 then 'concluida' when n=3 and abs(d)%3=0 then 'concluida' when d=-4 and n=1 then 'nao_iniciada' else 'em_andamento' end,
    case when d=-4 and n=1 then 'Não iniciada por causa da chuva' end
  from generate_series(-6,-1) d cross join generate_series(1,3) n
  on conflict (id) do nothing;

  insert into daily_activity_workers (activity_id, worker_id)
  select md5(k||':da:'||d||':'||n)::uuid, wk.id
  from generate_series(-6,-1) d cross join generate_series(1,3) n
  join planned_activities p on p.id = md5(k||':pl:'||d||':'||n)::uuid
  cross join lateral (select w.id from workers w where w.company_id = p.company_id and w.worksite_id = p_obra order by w.nome limit 3) wk
  on conflict do nothing;

  insert into daily_occurrences (id, report_id, tipo_id, descricao, activity_id)
  select md5(k||':oc:'||o.n)::uuid, md5(k||':dia:'||o.dia)::uuid,
    (select t.id from occurrence_types t where t.worksite_id = p_obra order by t.ordem offset o.tipo - 1 limit 1),
    o.descricao, md5(k||':da:'||o.da)::uuid
  from (values
    (1, -4, 1, 'Chuva forte até as 10h, serviço externo parado.', '-4:1'),
    (2, -2, 2, 'Argamassa entregue em quantidade menor que a solicitada.', '-2:2')
  ) as o(n, dia, tipo, descricao, da)
  where exists (select 1 from occurrence_types t where t.worksite_id = p_obra)
  on conflict (id) do nothing;

  insert into issues (id, organization_id, worksite_id, titulo, descricao, prioridade, prazo, status, origem, created_at, resolvido_em)
  select md5(k||':pen:'||p.n)::uuid, p_org, p_obra, p.titulo, nullif(p.descricao,''), p.prio,
    case when p.prazo is null then null else hoje + p.prazo end,
    p.status, 'manual', now() - (p.ha||' days')::interval,
    case when p.status='resolvida' then hoje - 2 end
  from (values
    (1,'Revisar detalhe de impermeabilização do reservatório','O detalhe da prancha não bate com a execução no subsolo.','alta',-3,'aberta',6),
    (2,'Repor argamassa no 4º pavimento','Saldo insuficiente para fechar o pano de alvenaria.','alta',-1,'aberta',2),
    (3,'Instalar guarda-corpo provisório no 3º pavimento','Apontado na inspeção de segurança.','alta',0,'aberta',2),
    (4,'Conferir documentação dos colaboradores novos','Dois cadastros feitos direto no campo aguardam conferência.','media',3,'aberta',1),
    (5,'Definir local de estoque da cerâmica','','baixa',null,'aberta',4),
    (6,'Liberar frente de serviço no 2º pavimento','Retirada de entulho concluída.','media',-5,'resolvida',8)
  ) as p(n,titulo,descricao,prio,prazo,status,ha)
  on conflict (id) do nothing;
end;
$$;

revoke all on function public.carregar_exemplo(uuid, uuid) from public, anon, authenticated;

-- 3) Cadastro: cria a empresa, a primeira obra e liga a pessoa como administradora.
create or replace function public.criar_minha_organizacao(p_empresa text, p_obra text, p_exemplo boolean default false)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_obra uuid;
  v_atual record;
  v_emp text := btrim(coalesce(p_empresa, ''));
  v_obr text := btrim(coalesce(p_obra, ''));
begin
  if v_uid is null then
    raise exception 'Entre na sua conta primeiro.';
  end if;
  select * into v_atual from profiles where id = v_uid;
  if not found then
    raise exception 'Perfil não encontrado.';
  end if;
  if v_atual.organization_id is not null then
    raise exception 'Sua conta já pertence a uma empresa.';
  end if;
  if char_length(v_emp) < 2 or char_length(v_emp) > 80 then
    raise exception 'Escreva o nome da empresa (de 2 a 80 letras).';
  end if;
  if char_length(v_obr) < 2 or char_length(v_obr) > 80 then
    raise exception 'Escreva o nome da obra (de 2 a 80 letras).';
  end if;

  insert into organizations (nome) values (v_emp) returning id into v_org;
  insert into worksites (organization_id, nome, sigla)
  values (v_org, v_obr, nullif(upper(left(regexp_replace(v_obr, '[^A-Za-z0-9]', '', 'g'), 8)), ''))
  returning id into v_obra;

  perform set_config('prumo.cadastro', v_org::text, true);
  update profiles
     set organization_id = v_org, worksite_id = v_obra, role = 'admin',
         nome = coalesce(nullif(btrim(nome), ''), split_part(coalesce(email, ''), '@', 1))
   where id = v_uid;
  perform set_config('prumo.cadastro', '', true);

  insert into occurrence_types (organization_id, worksite_id, nome, ordem)
  select v_org, v_obra, t.nome, t.n
  from (values (1,'Condição climática'),(2,'Falta de material'),(3,'Ausência de mão de obra'),(4,'Falta ou defeito de equipamento'),(5,'Indisponibilidade de energia ou água'),(6,'Problema ou falta de projeto'),(7,'Falta de frente de trabalho'),(8,'Segurança do trabalho'),(9,'Outro')) as t(n, nome);

  if p_exemplo then
    perform public.carregar_exemplo(v_org, v_obra);
  end if;
  return v_obra;
end;
$$;

revoke all on function public.criar_minha_organizacao(text, text, boolean) from public, anon;
grant execute on function public.criar_minha_organizacao(text, text, boolean) to authenticated;
