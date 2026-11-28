-- Convite por link: a pessoa pede a liberação e só o administrador da empresa do link responde.
-- Ter o link não dá acesso a nada. Cada link vale para uma pessoa.

begin;

create table if not exists public.links_convite (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  worksite_id     uuid references public.worksites (id) on delete cascade,
  role            text not null check (role in ('campo', 'gestao')),
  codigo          text not null unique default replace(gen_random_uuid()::text, '-', ''),
  criado_por      uuid,
  criado_em       timestamptz not null default now(),
  expira_em       timestamptz not null default now() + interval '7 days',
  pedido_por      uuid references auth.users (id) on delete cascade,
  pedido_em       timestamptz,
  decisao         text check (decisao in ('liberado', 'recusado')),
  decidido_por    uuid,
  decidido_em     timestamptz
);

create index if not exists links_convite_empresa on public.links_convite (organization_id);
create index if not exists links_convite_pedinte on public.links_convite (pedido_por);

alter table public.links_convite enable row level security;

-- Ninguém grava direto na tabela: criar, pedir, liberar e recusar passam pelas funções.
-- É isso que impede alguém de inventar um pedido em nome de outra pessoa.
revoke all on public.links_convite from public, anon, authenticated;
grant select, delete on public.links_convite to authenticated;

drop policy if exists links_ver on public.links_convite;
create policy links_ver on public.links_convite for select to authenticated
  using (organization_id = private.minha_org() and private.eh_admin());

drop policy if exists links_cancelar on public.links_convite;
create policy links_cancelar on public.links_convite for delete to authenticated
  using (organization_id = private.minha_org() and private.eh_admin());

-- 1) O administrador cria o link (sempre para a própria empresa).
create or replace function public.criar_link_convite(p_papel text, p_obra uuid default null)
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
    raise exception 'Somente um administrador pode convidar.';
  end if;
  if p_papel is null or p_papel not in ('campo', 'gestao') then
    raise exception 'O link vale só para Campo ou Gestão.';
  end if;
  if p_obra is not null and not exists (
    select 1 from public.worksites w where w.id = p_obra and w.organization_id = v_org) then
    raise exception 'Essa obra não é da sua empresa.';
  end if;
  return query
    insert into public.links_convite as l (organization_id, worksite_id, role, criado_por)
    values (v_org, p_obra, p_papel, auth.uid())
    returning l.id, l.codigo, l.expira_em;
end;
$$;

-- 2) Quem abriu o link vê de qual empresa é, antes de pedir.
create or replace function public.ver_link_convite(p_codigo text)
returns table (empresa text, papel text, situacao text)
language sql
stable
security definer
set search_path to ''
as $$
  select
    case when s.situacao = 'usado' then null else o.nome end,
    case when s.situacao = 'usado' then null else l.role end,
    s.situacao
  from public.links_convite l
  join public.organizations o on o.id = l.organization_id
  cross join lateral (select case
      when l.pedido_por = auth.uid() and l.decisao is null and l.expira_em > now() then 'aguardando'
      when l.pedido_por = auth.uid() and l.decisao = 'recusado' then 'recusado'
      when l.pedido_por is not null or l.decisao is not null then 'usado'
      when l.expira_em <= now() then 'vencido'
      else 'disponivel' end as situacao) s
  where auth.uid() is not null and l.codigo = p_codigo
$$;

-- 3) A própria pessoa pede para entrar. Ela ainda NÃO entra.
create or replace function public.pedir_entrada(p_codigo text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_link public.links_convite;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta primeiro.';
  end if;
  if not exists (select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null) then
    raise exception 'Confirme o seu e-mail antes de pedir a liberação.';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.organization_id is null) then
    raise exception 'Sua conta já pertence a uma empresa.';
  end if;
  select * into v_link from public.links_convite l where l.codigo = p_codigo for update;
  if not found or v_link.decisao is not null or v_link.expira_em <= now()
     or (v_link.pedido_por is not null and v_link.pedido_por <> v_uid) then
    raise exception 'Este convite não está mais disponível. Peça um novo ao administrador.';
  end if;
  if v_link.pedido_por = v_uid then
    return;
  end if;
  -- o prazo recomeça: o administrador tem 7 dias para responder
  update public.links_convite
     set pedido_por = v_uid, pedido_em = now(), expira_em = now() + interval '7 days'
   where id = v_link.id;
end;
$$;

-- Os pedidos da pessoa logada (para a tela de espera).
create or replace function public.meus_pedidos()
returns table (id uuid, empresa text, papel text, pedido_em timestamptz, situacao text)
language sql
stable
security definer
set search_path to ''
as $$
  select l.id, o.nome, l.role, l.pedido_em,
    case when l.decisao = 'recusado' then 'recusado'
         when l.expira_em <= now() then 'vencido'
         else 'aguardando' end
  from public.links_convite l
  join public.organizations o on o.id = l.organization_id
  where l.pedido_por = auth.uid()
    and l.decisao is distinct from 'liberado'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.organization_id is null)
  order by l.pedido_em desc
$$;

-- 4) O administrador vê quem pediu para entrar NA EMPRESA DELE, pelo link que ela criou.
create or replace function public.pedidos_de_entrada()
returns table (id uuid, nome text, email text, papel text, worksite_id uuid, pedido_em timestamptz)
language sql
stable
security definer
set search_path to ''
as $$
  select l.id, p.nome, u.email::text, l.role, l.worksite_id, l.pedido_em
  from public.links_convite l
  join auth.users u on u.id = l.pedido_por
  join public.profiles p on p.id = l.pedido_por
  where coalesce(private.eh_admin(), false)
    and l.organization_id = private.minha_org()
    and l.decisao is null
    and l.expira_em > now()
    and p.organization_id is null
  order by l.pedido_em
$$;

-- 5) Liberar: é o único momento em que a pessoa entra na empresa.
create or replace function public.liberar_pedido(p_link uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_org  uuid := private.minha_org();
  v_link public.links_convite;
  v_obra uuid;
begin
  if v_org is null or not coalesce(private.eh_admin(), false) then
    raise exception 'Somente um administrador pode liberar.';
  end if;
  select * into v_link from public.links_convite l
   where l.id = p_link and l.organization_id = v_org
     and l.pedido_por is not null and l.decisao is null and l.expira_em > now()
   for update;
  if not found then
    raise exception 'Pedido não encontrado ou vencido.';
  end if;
  perform 1 from public.profiles p where p.id = v_link.pedido_por and p.organization_id is null for update;
  if not found then
    raise exception 'Essa conta já pertence a uma empresa.';
  end if;

  v_obra := coalesce(v_link.worksite_id,
    (select w.id from public.worksites w where w.organization_id = v_org order by w.created_at limit 1));

  -- a mesma exceção estreita do cadastro de empresa e do convite, só dentro desta transação
  perform set_config('prumo.cadastro', v_org::text, true);
  update public.profiles
     set organization_id = v_org,
         worksite_id     = v_obra,
         role            = v_link.role,
         nome            = coalesce(nullif(btrim(nome), ''), split_part(coalesce(email, ''), '@', 1))
   where id = v_link.pedido_por;
  perform set_config('prumo.cadastro', '', true);

  update public.links_convite
     set decisao = 'liberado', decidido_por = auth.uid(), decidido_em = now()
   where id = v_link.id;
end;
$$;

create or replace function public.recusar_pedido(p_link uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not coalesce(private.eh_admin(), false) then
    raise exception 'Somente um administrador pode recusar.';
  end if;
  update public.links_convite
     set decisao = 'recusado', decidido_por = auth.uid(), decidido_em = now()
   where id = p_link and organization_id = private.minha_org()
     and pedido_por is not null and decisao is null;
  if not found then
    raise exception 'Pedido não encontrado.';
  end if;
end;
$$;

revoke all on function
  public.criar_link_convite(text, uuid), public.ver_link_convite(text), public.pedir_entrada(text),
  public.meus_pedidos(), public.pedidos_de_entrada(), public.liberar_pedido(uuid), public.recusar_pedido(uuid)
  from public, anon;
grant execute on function
  public.criar_link_convite(text, uuid), public.ver_link_convite(text), public.pedir_entrada(text),
  public.meus_pedidos(), public.pedidos_de_entrada(), public.liberar_pedido(uuid), public.recusar_pedido(uuid)
  to authenticated;

commit;
