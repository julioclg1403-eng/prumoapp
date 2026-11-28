-- Acesso por link: convite restrito (o administrador define nome, e-mail, perfil e obra; quem recebe so
-- cria a senha) e troca de senha liberada pelo administrador. A funcao acesso-por-link executa os dois.

begin;

alter table public.convites add column if not exists nome   text;
alter table public.convites add column if not exists codigo text;
create unique index if not exists convite_codigo_unico on public.convites (codigo) where codigo is not null;

-- Convite novo só nasce pela função (código sempre sorteado pelo banco).
revoke insert on public.convites from authenticated;

-- 1) O administrador cria o convite (sempre para a própria empresa).
create or replace function public.criar_convite(p_nome text, p_email text, p_papel text, p_obra uuid default null)
returns table (id uuid, codigo text, expira_em timestamptz)
language plpgsql
security definer
set search_path to ''
as $$
#variable_conflict use_column
declare
  v_org   uuid := private.minha_org();
  v_nome  text := btrim(coalesce(p_nome, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_org is null or not coalesce(private.eh_admin(), false) then
    raise exception 'Somente um administrador pode convidar.';
  end if;
  if length(v_nome) < 2 or length(v_nome) > 80 then
    raise exception 'Escreva o nome da pessoa.';
  end if;
  if length(v_email) > 200 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Confira o e-mail.';
  end if;
  if p_papel is null or p_papel not in ('campo', 'gestao') then
    raise exception 'O convite vale só para Campo ou Gestão.';
  end if;
  if p_obra is not null and not exists (
    select 1 from public.worksites w where w.id = p_obra and w.organization_id = v_org) then
    raise exception 'Essa obra não é da sua empresa.';
  end if;
  -- só avisa sobre a própria empresa: não revela quem tem conta em outra
  if exists (select 1 from public.profiles p join auth.users u on u.id = p.id
             where p.organization_id = v_org and lower(u.email) = v_email) then
    raise exception 'Essa pessoa já está na sua empresa.';
  end if;

  -- convidar de novo o mesmo e-mail troca o link antigo
  delete from public.convites c where c.organization_id = v_org and c.email = v_email and c.aceito_em is null;

  return query
    insert into public.convites as c (organization_id, worksite_id, email, role, nome, codigo, criado_por, expira_em)
    values (v_org, p_obra, v_email, p_papel, v_nome,
            replace(gen_random_uuid()::text, '-', ''), auth.uid(), now() + interval '48 hours')
    returning c.id, c.codigo, c.expira_em;
end;
$$;

-- 2) Quem tem o link vê para quem é o convite. Funciona sem login.
create or replace function public.ver_convite(p_codigo text)
returns table (nome text, email text, empresa text, papel text, situacao text)
language sql
stable
security definer
set search_path to ''
as $$
  select
    case when s.situacao in ('disponivel', 'tem_conta') then c.nome end,
    case when s.situacao in ('disponivel', 'tem_conta') then c.email end,
    case when s.situacao in ('disponivel', 'tem_conta') then o.nome end,
    case when s.situacao in ('disponivel', 'tem_conta') then c.role end,
    s.situacao
  from public.convites c
  join public.organizations o on o.id = c.organization_id
  cross join lateral (select case
      when c.aceito_em is not null then 'usado'
      when c.expira_em <= now() then 'vencido'
      when exists (select 1 from auth.users u where lower(u.email) = c.email) then 'tem_conta'
      else 'disponivel' end as situacao) s
  where c.codigo is not null and c.codigo = p_codigo
$$;

-- 3) Só o servidor (função "acesso-por-link") chama: liga a conta recém-criada à empresa.
create or replace function public.concluir_convite(p_codigo text, p_usuario uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_convite public.convites;
  v_obra    uuid;
begin
  select * into v_convite from public.convites c
   where c.codigo = p_codigo and c.aceito_em is null and c.expira_em > now()
   for update;
  if not found then
    raise exception 'Convite não encontrado, vencido ou já usado.';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_usuario and lower(u.email) = v_convite.email) then
    raise exception 'A conta não é a do e-mail convidado.';
  end if;
  perform 1 from public.profiles p where p.id = p_usuario and p.organization_id is null for update;
  if not found then
    raise exception 'Essa conta já pertence a uma empresa.';
  end if;

  v_obra := coalesce(v_convite.worksite_id,
    (select w.id from public.worksites w where w.organization_id = v_convite.organization_id
      order by w.created_at limit 1));

  -- a mesma exceção estreita que o aceite de convite já usa, só dentro desta transação
  perform set_config('prumo.cadastro', v_convite.organization_id::text, true);
  update public.profiles
     set organization_id = v_convite.organization_id,
         worksite_id     = v_obra,
         role            = v_convite.role,
         nome            = coalesce(nullif(btrim(v_convite.nome), ''), nome)
   where id = p_usuario;
  perform set_config('prumo.cadastro', '', true);

  update public.convites set aceito_em = now(), aceito_por = p_usuario where id = v_convite.id;
end;
$$;

-- ============================================================
-- TROCA DE SENHA LIBERADA PELO ADMINISTRADOR
--   "Esqueci minha senha" cria um pedido; o administrador da empresa
--   da pessoa libera e manda o link; a própria pessoa cria a senha.
--   A senha atual continua valendo até a nova ser salva.
-- ============================================================
create table if not exists public.trocas_senha (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  usuario         uuid not null references auth.users (id) on delete cascade,
  pedido_em       timestamptz,
  codigo          text unique,
  liberado_por    uuid,
  liberado_em     timestamptz,
  expira_em       timestamptz,
  usado_em        timestamptz,
  criado_em       timestamptz not null default now()
);
create unique index if not exists troca_aberta_unica on public.trocas_senha (usuario) where usado_em is null;
alter table public.trocas_senha enable row level security;
-- ninguém lê nem grava direto: tudo passa pelas funções abaixo
revoke all on public.trocas_senha from public, anon, authenticated;

-- Pedir (sem login). A resposta é sempre a mesma, exista ou não a conta.
create or replace function public.pedir_troca_senha(p_email text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_uid   uuid;
  v_org   uuid;
begin
  select u.id, p.organization_id into v_uid, v_org
    from auth.users u join public.profiles p on p.id = u.id
   where lower(u.email) = v_email and p.organization_id is not null
   limit 1;
  if v_uid is null then
    return;
  end if;
  -- um pedido aberto por pessoa; um link liberado e ainda válido não é mexido
  insert into public.trocas_senha as t (organization_id, usuario, pedido_em)
  values (v_org, v_uid, now())
  on conflict (usuario) where usado_em is null do update
    set pedido_em = now(), organization_id = excluded.organization_id,
        codigo = null, expira_em = null, liberado_por = null, liberado_em = null
    where t.codigo is null or t.expira_em <= now() or t.organization_id <> excluded.organization_id;
end;
$$;

-- O administrador vê os pedidos e os links liberados da própria empresa.
create or replace function public.trocas_de_senha()
returns table (id uuid, usuario uuid, nome text, email text, pedido_em timestamptz, codigo text, expira_em timestamptz)
language sql
stable
security definer
set search_path to ''
as $$
  select t.id, t.usuario, p.nome, u.email::text, t.pedido_em, t.codigo, t.expira_em
  from public.trocas_senha t
  join public.profiles p on p.id = t.usuario and p.organization_id = t.organization_id
  join auth.users u on u.id = t.usuario
  where coalesce(private.eh_admin(), false)
    and t.organization_id = private.minha_org()
    and t.usado_em is null
    and ((t.codigo is null and t.pedido_em > now() - interval '7 days') or t.expira_em > now())
  order by coalesce(t.pedido_em, t.criado_em) desc
$$;

-- Liberar: gera um link novo, de 24 horas, para alguém da própria empresa.
create or replace function public.liberar_troca_senha(p_usuario uuid)
returns table (id uuid, codigo text, expira_em timestamptz)
language plpgsql
security definer
set search_path to ''
as $$
#variable_conflict use_column
declare
  v_org uuid := private.minha_org();
begin
  if v_org is null or not coalesce(private.eh_admin(), false) then
    raise exception 'Somente um administrador pode liberar a troca de senha.';
  end if;
  if p_usuario = auth.uid() then
    raise exception 'A sua própria senha precisa ser liberada por outro administrador.';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_usuario and p.organization_id = v_org) then
    raise exception 'Essa pessoa não é da sua empresa.';
  end if;
  return query
    insert into public.trocas_senha as t (organization_id, usuario, codigo, liberado_por, liberado_em, expira_em)
    values (v_org, p_usuario, replace(gen_random_uuid()::text, '-', ''), auth.uid(), now(), now() + interval '24 hours')
    on conflict (usuario) where usado_em is null do update
      set organization_id = excluded.organization_id, codigo = excluded.codigo,
          liberado_por = excluded.liberado_por, liberado_em = excluded.liberado_em, expira_em = excluded.expira_em
    returning t.id, t.codigo, t.expira_em;
end;
$$;

create or replace function public.cancelar_troca_senha(p_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not coalesce(private.eh_admin(), false) then
    raise exception 'Somente um administrador pode cancelar.';
  end if;
  delete from public.trocas_senha t
   where t.id = p_id and t.organization_id = private.minha_org() and t.usado_em is null;
end;
$$;

-- Quem tem o link vê de quem é a troca. Funciona sem login.
create or replace function public.ver_troca_senha(p_codigo text)
returns table (nome text, email text, empresa text, situacao text)
language sql
stable
security definer
set search_path to ''
as $$
  select
    case when s.situacao = 'disponivel' then p.nome end,
    case when s.situacao = 'disponivel' then u.email::text end,
    case when s.situacao = 'disponivel' then o.nome end,
    s.situacao
  from public.trocas_senha t
  join public.organizations o on o.id = t.organization_id
  join auth.users u on u.id = t.usuario
  join public.profiles p on p.id = t.usuario
  cross join lateral (select case
      when t.usado_em is not null then 'usado'
      when t.expira_em <= now() then 'vencido'
      when p.organization_id is distinct from t.organization_id then 'invalido'
      else 'disponivel' end as situacao) s
  where t.codigo is not null and t.codigo = p_codigo
$$;

-- Só o servidor: gasta o link ANTES de trocar a senha (dois toques não passam)...
create or replace function public.reservar_troca_senha(p_codigo text)
returns table (id uuid, usuario uuid, email text)
language sql
security definer
set search_path to ''
as $$
  update public.trocas_senha t
     set usado_em = now()
    from public.profiles p, auth.users u
   where t.codigo = p_codigo and t.usado_em is null and t.expira_em > now()
     and p.id = t.usuario and p.organization_id = t.organization_id
     and u.id = t.usuario
  returning t.id, t.usuario, u.email::text
$$;

-- ...e devolve o link se a troca não der certo.
create or replace function public.devolver_troca_senha(p_id uuid)
returns void
language sql
security definer
set search_path to ''
as $$
  update public.trocas_senha t set usado_em = null
   where t.id = p_id
     and not exists (select 1 from public.trocas_senha o where o.usuario = t.usuario and o.usado_em is null)
$$;

revoke all on function public.pedir_troca_senha(text), public.trocas_de_senha(), public.liberar_troca_senha(uuid),
  public.cancelar_troca_senha(uuid), public.ver_troca_senha(text), public.reservar_troca_senha(text),
  public.devolver_troca_senha(uuid) from public, anon, authenticated;
grant execute on function public.pedir_troca_senha(text) to anon, authenticated;
grant execute on function public.ver_troca_senha(text) to anon, authenticated, service_role;
grant execute on function public.trocas_de_senha(), public.liberar_troca_senha(uuid), public.cancelar_troca_senha(uuid) to authenticated;
grant execute on function public.reservar_troca_senha(text), public.devolver_troca_senha(uuid) to service_role;

revoke all on function public.criar_convite(text, text, text, uuid), public.ver_convite(text),
  public.concluir_convite(text, uuid) from public, anon, authenticated;
grant execute on function public.criar_convite(text, text, text, uuid) to authenticated;
grant execute on function public.ver_convite(text) to anon, authenticated, service_role;
grant execute on function public.concluir_convite(text, uuid) to service_role;

commit;
