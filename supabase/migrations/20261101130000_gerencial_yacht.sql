-- Gerencial Yacht: painel da obra Yacht (fluxo, orçamento, cronograma, medição Caixa)
-- dentro do Prumo. O painel vai criptografado (public/gerencial-yacht/obra-yacht.enc);
-- a chave fica aqui e só sai pelo RPC abaixo, pra quem é da gestão e tem o módulo
-- "gerencial" liberado (admin sempre; sem lista de módulos = sem restrição).
-- A chave em si é inserida à parte (scripts/gerencial-yacht-criptografar.mjs gera o SQL).

create table if not exists private.gerencial_arquivos (
  nome text primary key,
  chave text not null,
  iv text not null,
  atualizado_em timestamptz not null default now()
);

-- RLS ligada e SEM políticas: ninguém lê a tabela direto, só o RPC (security definer).
alter table private.gerencial_arquivos enable row level security;

create or replace function public.gerencial_yacht_chave(p_nome text default 'obra-yacht')
returns table (chave text, iv text)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_role text;
  v_mods text[];
begin
  if auth.uid() is null or not private.eh_gestao() then
    raise exception 'sem acesso' using errcode = '42501';
  end if;

  select p.role::text, p.modulos_permitidos
    into v_role, v_mods
    from public.profiles p
   where p.id = auth.uid();

  if v_role is distinct from 'admin' and v_mods is not null and not ('gerencial' = any (v_mods)) then
    raise exception 'módulo não liberado' using errcode = '42501';
  end if;

  return query
    select g.chave, g.iv
      from private.gerencial_arquivos g
     where g.nome = p_nome;
end;
$$;

revoke all on function public.gerencial_yacht_chave(text) from public, anon;
grant execute on function public.gerencial_yacht_chave(text) to authenticated;
