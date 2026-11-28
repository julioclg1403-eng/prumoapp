-- PASSO 1: cria os convites. Só ACRESCENTA: o app atual continua funcionando igual.
-- JÁ APLICADO no banco em 28/11/2026.
-- Depende de a opção "Confirm email" continuar LIGADA no Supabase: é a confirmação
-- que prova que a pessoa é dona do e-mail convidado.

begin;

create table if not exists public.convites (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  worksite_id     uuid references public.worksites (id) on delete cascade,
  email           text not null check (email = lower(btrim(email)) and position('@' in email) > 1),
  role            text not null check (role in ('campo', 'gestao', 'admin')),
  criado_por      uuid default auth.uid(),
  criado_em       timestamptz not null default now(),
  expira_em       timestamptz not null default now() + interval '7 days',
  aceito_em       timestamptz,
  aceito_por      uuid
);

create unique index if not exists convite_pendente_unico
  on public.convites (organization_id, email) where aceito_em is null;

alter table public.convites enable row level security;

revoke all on public.convites from anon, authenticated;
grant select, insert, delete on public.convites to authenticated;

-- Só o administrador, e só os convites da própria empresa.
drop policy if exists convites_ver on public.convites;
create policy convites_ver on public.convites for select to authenticated
  using (organization_id = private.minha_org() and private.eh_admin());

drop policy if exists convites_criar on public.convites;
create policy convites_criar on public.convites for insert to authenticated
  with check (
    organization_id = private.minha_org()
    and private.eh_admin()
    and criado_por = auth.uid()
    and aceito_em is null and aceito_por is null
    and expira_em <= now() + interval '8 days'
    and (worksite_id is null or exists (
      select 1 from public.worksites w
      where w.id = convites.worksite_id and w.organization_id = convites.organization_id))
  );

drop policy if exists convites_cancelar on public.convites;
create policy convites_cancelar on public.convites for delete to authenticated
  using (organization_id = private.minha_org() and private.eh_admin());

-- Os convites que esperam a pessoa que está logada (só com o e-mail confirmado e sem empresa).
create or replace function public.meus_convites()
returns table (id uuid, empresa text, papel text, expira_em timestamptz)
language sql
stable
security definer
set search_path to ''
as $$
  select c.id, o.nome, c.role, c.expira_em
  from public.convites c
  join public.organizations o on o.id = c.organization_id
  join auth.users u on u.id = auth.uid()
  where u.email_confirmed_at is not null
    and c.email = lower(u.email)
    and c.aceito_em is null
    and c.expira_em > now()
    and exists (select 1 from public.profiles p where p.id = u.id and p.organization_id is null)
  order by c.criado_em desc
$$;

-- Quem entra é quem aceita. Ninguém coloca outra pessoa numa empresa.
create or replace function public.aceitar_convite(p_convite uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_email   text;
  v_convite public.convites;
  v_obra    uuid;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta primeiro.';
  end if;
  select lower(u.email) into v_email from auth.users u
   where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is null then
    raise exception 'Confirme o seu e-mail antes de aceitar o convite.';
  end if;
  select * into v_convite from public.convites c
   where c.id = p_convite and c.email = v_email and c.aceito_em is null and c.expira_em > now()
   for update;
  if not found then
    raise exception 'Convite não encontrado ou vencido. Peça um novo ao administrador.';
  end if;
  perform 1 from public.profiles p where p.id = v_uid and p.organization_id is null for update;
  if not found then
    raise exception 'Sua conta já pertence a uma empresa.';
  end if;

  v_obra := coalesce(v_convite.worksite_id,
    (select w.id from public.worksites w where w.organization_id = v_convite.organization_id
      order by w.created_at limit 1));

  -- a mesma exceção estreita que o cadastro de empresa já usa, só dentro desta transação
  perform set_config('prumo.cadastro', v_convite.organization_id::text, true);
  update public.profiles
     set organization_id = v_convite.organization_id,
         worksite_id     = v_obra,
         role            = v_convite.role,
         nome            = coalesce(nullif(btrim(nome), ''), split_part(coalesce(email, ''), '@', 1))
   where id = v_uid;
  perform set_config('prumo.cadastro', '', true);

  update public.convites set aceito_em = now(), aceito_por = v_uid where id = v_convite.id;
end;
$$;

revoke all on function public.meus_convites(), public.aceitar_convite(uuid) from public, anon;
grant execute on function public.meus_convites(), public.aceitar_convite(uuid) to authenticated;

commit;
